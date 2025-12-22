/**
 * Main NTTP class - provides programmatic API for natural language database queries.
 */

import { Knex, knex } from 'knex';
import { SchemaInspector } from 'knex-schema-inspector';
import type {
  NTTPConfig,
  QueryOptions,
  QueryResult,
  Intent,
  SchemaDefinition,
  CacheStats,
} from './types.js';
import { SchemaCache } from './cache.js';
import { LLMService } from './llm.js';
import { IntentParser } from './intent.js';
import { QueryExecutor } from './executor.js';

/**
 * NTTP - Natural Text Transfer Protocol
 *
 * @example
 * ```typescript
 * const nttp = new NTTP({
 *   database: {
 *     client: 'pg',
 *     connection: process.env.DATABASE_URL
 *   },
 *   anthropic: {
 *     apiKey: process.env.ANTHROPIC_API_KEY
 *   }
 * });
 *
 * const users = await nttp.query("get all active users");
 * ```
 */
export class NTTP {
  private db: Knex;
  private inspector: ReturnType<typeof SchemaInspector>;
  private cache: SchemaCache;
  private llm: LLMService;
  private intentParser: IntentParser;
  private executor: QueryExecutor;
  private schemaInfo: Record<string, { columns: string[]; description: string }> = {};

  constructor(private config: NTTPConfig) {
    // Initialize Knex
    this.db = knex(config.database);

    // Initialize schema inspector
    this.inspector = SchemaInspector(this.db);

    // Initialize services
    this.cache = new SchemaCache();
    this.llm = new LLMService(config.anthropic);
    this.intentParser = new IntentParser(this.llm);
    this.executor = new QueryExecutor(this.db, this.llm, this.cache);
  }

  /**
   * Initialize NTTP - must be called before using.
   */
  async init(): Promise<void> {
    // Test database connection
    await this.db.raw('SELECT 1');

    // Build schema cache
    await this.buildSchemaInfo();
  }

  /**
   * Execute a natural language query.
   *
   * @example
   * ```typescript
   * const result = await nttp.query("get top 10 products by price");
   * console.log(result.data); // Array of products
   * ```
   */
  async query(query: string, options: QueryOptions = {}): Promise<QueryResult> {
    const startTime = Date.now();

    // Parse intent from natural language
    const intent = await this.intentParser.parse(query, this.getSchemaDescription());

    // Execute query with caching
    const result = await this.executor.execute({
      query,
      intent,
      useCache: options.useCache ?? true,
      forceNewSchema: options.forceNewSchema ?? false,
    });

    return {
      ...result,
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Explain what SQL would be generated without executing.
   *
   * @example
   * ```typescript
   * const explanation = await nttp.explain("show pending orders");
   * console.log(explanation.sql); // Generated SQL
   * console.log(explanation.intent); // Parsed intent
   * ```
   */
  async explain(query: string): Promise<{
    query: string;
    intent: Intent;
    sql: string;
    params: any[];
    schemaId: string;
    cachedSchema: SchemaDefinition | null;
  }> {
    const intent = await this.intentParser.parse(query, this.getSchemaDescription());
    const schemaId = this.intentParser.generateSchemaId(intent);
    const cached = await this.cache.get(schemaId);

    // Generate SQL without executing
    const { sql, params } = await this.executor.generateSql(intent);

    return {
      query,
      intent,
      sql,
      params,
      schemaId,
      cachedSchema: cached || null,
    };
  }

  /**
   * Get all cached schemas.
   */
  async listSchemas(): Promise<SchemaDefinition[]> {
    return this.cache.listAll();
  }

  /**
   * Get a specific cached schema.
   */
  async getSchema(schemaId: string): Promise<SchemaDefinition | undefined> {
    return this.cache.get(schemaId);
  }

  /**
   * Delete a cached schema.
   */
  async deleteSchema(schemaId: string): Promise<void> {
    await this.cache.delete(schemaId);
  }

  /**
   * Pin a schema to prevent eviction.
   */
  async pinSchema(schemaId: string): Promise<void> {
    await this.cache.pin(schemaId);
  }

  /**
   * Unpin a schema.
   */
  async unpinSchema(schemaId: string): Promise<void> {
    await this.cache.unpin(schemaId);
  }

  /**
   * Get cache statistics.
   */
  async getCacheStats(): Promise<CacheStats> {
    return this.cache.getStats();
  }

  /**
   * Get list of all database tables.
   */
  async getTables(): Promise<string[]> {
    return this.inspector.tables();
  }

  /**
   * Get schema for a specific table.
   */
  async getTableSchema(tableName: string): Promise<any[]> {
    return this.inspector.columnInfo(tableName);
  }

  /**
   * Get formatted schema description for LLM prompts.
   */
  getSchemaDescription(): string {
    const lines: string[] = [`Database schema (${this.config.database.client}):`];

    for (const [table, info] of Object.entries(this.schemaInfo)) {
      const columns = info.columns.join(', ');
      lines.push(`- ${table} (${columns})`);
    }

    return lines.join('\n');
  }

  /**
   * Close database connection and cleanup.
   */
  async close(): Promise<void> {
    await this.db.destroy();
  }

  /**
   * Build schema information cache.
   */
  private async buildSchemaInfo(): Promise<void> {
    const tables = await this.getTables();

    for (const table of tables) {
      const columns = await this.inspector.columnInfo(table);
      this.schemaInfo[table] = {
        columns: columns.map((col: any) => col.name),
        description: `Table: ${table}`,
      };
    }
  }
}
