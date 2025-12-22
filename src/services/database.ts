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
let schemaInfo: Record<string, { columns: string[]; description: string }> = {};

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
  // This normalizes them to always return an array of rows
  if (Array.isArray(result)) {
    return result;
  }

  // PostgreSQL and SQLite return { rows: [...] }
  if (result.rows) {
    return result.rows;
  }

  // MySQL returns [rows, fields]
  if (Array.isArray(result[0])) {
    return result[0];
  }

  // SQL Server returns recordset
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
  const lines: string[] = [`Database schema (${config.KNEX_CONFIG.client}):`];

  for (const [table, info] of Object.entries(schemaInfo)) {
    const columns = info.columns.join(', ');
    lines.push(`- ${table} (${columns})`);
    if (info.description) {
      lines.push(`  ${info.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build schema information cache for all tables.
 */
async function buildSchemaInfo(): Promise<void> {
  const tables = await getAllTables();

  for (const table of tables) {
    const schema = await getTableSchema(table);
    const columns = schema.map((col: any) => col.column_name);

    schemaInfo[table] = {
      columns,
      description: `Table: ${table}`,
    };
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
    logger.info('Database connection closed');
  }
}
