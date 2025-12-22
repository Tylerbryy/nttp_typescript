/**
 * Database service using Knex.js for multi-database support.
 * Supports PostgreSQL, MySQL, SQLite, and SQL Server.
 */

import knex, { Knex } from 'knex';
import { SchemaInspector } from 'knex-schema-inspector';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Global Knex instance.
 */
let db: Knex | null = null;

/**
 * Global schema inspector instance.
 */
let inspector: ReturnType<typeof SchemaInspector> | null = null;

/**
 * Schema information cache.
 */
interface TableSchema {
  columns: string[];
  description: string;
}

interface ForeignKey {
  table: string;
  column: string;
  foreign_key_table: string;
  foreign_key_column: string;
}

let schemaInfo: Record<string, TableSchema> = {};
let foreignKeys: ForeignKey[] = [];

/**
 * Get the current Knex instance.
 */
export function getDb(): Knex {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

/**
 * Initialize database connection.
 */
export async function initDb(): Promise<void> {
  // Create Knex instance based on configuration
  db = knex(config.KNEX_CONFIG);

  // Create schema inspector
  inspector = SchemaInspector(db);

  // Test connection
  try {
    await db.raw('SELECT 1');
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to database');
    throw error;
  }

  // Build schema info cache
  await buildSchemaInfo();

  logger.info(`Database initialized: ${config.KNEX_CONFIG.client}`);
}

/**
 * Execute a raw SELECT query and return results.
 * Knex handles parameter binding safely across all database dialects.
 */
export async function executeQuery(
  sql: string,
  params: any[] = []
): Promise<Record<string, any>[]> {
  const result = await getDb().raw(sql, params);

  // Knex returns different result structures per dialect
  // Order matters: check more specific structures first

  // PostgreSQL: returns { rows: [...] }
  if (result.rows) {
    return result.rows;
  }

  // MySQL: returns [[rows], [fields]] - check for nested array
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) {
    return result[0];
  }

  // SQLite: returns array of rows directly
  if (Array.isArray(result)) {
    return result;
  }

  // SQL Server: returns { recordset: [...] }
  if (result.recordset) {
    return result.recordset;
  }

  return [];
}

/**
 * Execute an INSERT/UPDATE/DELETE query.
 * Returns the number of affected rows or insert ID.
 */
export async function executeWrite(
  sql: string,
  params: any[] = []
): Promise<number> {
  const result = await getDb().raw(sql, params);

  // Extract affected rows based on dialect
  if (result.rowCount !== undefined) {
    return result.rowCount; // PostgreSQL
  }

  if (Array.isArray(result) && result[0]) {
    const info = result[0];
    return info.insertId || info.affectedRows || 0; // MySQL
  }

  if (result.changes !== undefined) {
    return result.changes; // SQLite
  }

  if (result.rowsAffected) {
    return result.rowsAffected[0] || 0; // SQL Server
  }

  return 0;
}

/**
 * Get all table names using schema inspector.
 */
export async function getAllTables(): Promise<string[]> {
  if (!inspector) {
    throw new Error('Schema inspector not initialized');
  }

  const tables = await inspector.tables();
  return tables;
}

/**
 * Get schema for a specific table using schema inspector.
 */
export async function getTableSchema(
  tableName: string
): Promise<Record<string, any>[]> {
  if (!inspector) {
    throw new Error('Schema inspector not initialized');
  }

  const columns = await inspector.columnInfo(tableName);

  return columns.map((col: any) => ({
    column_name: col.name,
    data_type: col.data_type,
    is_nullable: col.is_nullable ? 'YES' : 'NO',
  }));
}

/**
 * Get formatted schema description for LLM prompts.
 */
export function getSchemaDescription(): string {
  const lines: string[] = [
    `Database schema (${config.KNEX_CONFIG.client}):`,
    ``,
    `Available tables and their columns:`,
  ];

  for (const [table, info] of Object.entries(schemaInfo)) {
    const columns = info.columns.join(', ');
    lines.push(`- ${table}: ${columns}`);
  }

  // Add foreign key relationships if available
  if (foreignKeys.length > 0) {
    lines.push(``);
    lines.push(`Table Relationships (Foreign Keys):`);
    for (const fk of foreignKeys) {
      lines.push(
        `- ${fk.table}.${fk.column} → ${fk.foreign_key_table}.${fk.foreign_key_column}`
      );
    }
    lines.push(``);
    lines.push(`Note: Use JOINs when querying across related tables. Use LEFT JOIN to include records without matches.`);
  }

  lines.push(``);
  lines.push(`Instructions: Use actual column names exactly as shown above.`);

  return lines.join('\n');
}

/**
 * Build schema information cache for all tables.
 * Fetches schemas and foreign keys in parallel for better performance.
 */
async function buildSchemaInfo(): Promise<void> {
  if (!inspector) {
    throw new Error('Schema inspector not initialized');
  }

  const tables = await getAllTables();

  // Fetch all table schemas in parallel
  const schemaPromises = tables.map(async (table) => {
    const schema = await getTableSchema(table);
    const columns = schema.map((col: any) => col.column_name);
    return { table, columns };
  });

  const results = await Promise.all(schemaPromises);

  // Populate schema info
  for (const { table, columns } of results) {
    schemaInfo[table] = {
      columns,
      description: '',
    };
  }

  // Fetch foreign keys for all tables
  try {
    foreignKeys = [];
    for (const table of tables) {
      const fks = await inspector.foreignKeys(table);
      for (const fk of fks) {
        foreignKeys.push({
          table: fk.table,
          column: fk.column,
          foreign_key_table: fk.foreign_key_table,
          foreign_key_column: fk.foreign_key_column,
        });
      }
    }
    logger.info(`Detected ${foreignKeys.length} foreign key relationships`);
  } catch (error) {
    // Foreign keys might not be supported in all databases
    logger.warn(`Could not fetch foreign keys: ${error}`);
    foreignKeys = [];
  }

  logger.info(`Cached schema for ${tables.length} tables`);
}

/**
 * Close database connection.
 */
export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
    inspector = null;
    schemaInfo = {};
    foreignKeys = [];
    logger.info('Database connection closed');
  }
}
