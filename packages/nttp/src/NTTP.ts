/**
 * Main nttp class - provides programmatic API for natural language database queries.
 */

import knexLib, { Knex } from 'knex';
const knex = knexLib.default || knexLib;
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
import { ExactCache, SemanticCache } from './cache/index.js';

/**
 * nttp - natural text to query
 *
 * @example
 * ```typescript
 * const nttp = new NTTP({
 *   database: {
 *     client: 'pg',
 *     connection: process.env.DATABASE_URL
 *   },
 *   llm: {
 *     provider: 'anthropic',
 *     model: 'claude-sonnet-4-5-20250929',
 *     apiKey: process.env.ANTHROPIC_API_KEY
 *   },
 *   cache: {
 *     l2: {
 *       provider: 'openai',
 *       model: 'text-embedding-3-small',
 *       apiKey: process.env.OPENAI_API_KEY
 *     }
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

  // 3-layer caches
  private l1Cache?: ExactCache;
  private l2Cache?: SemanticCache;

  constructor(private config: NTTPConfig) {
    // Initialize Knex
    this.db = knex(config.database);

    // Initialize schema inspector
    this.inspector = SchemaInspector(this.db);

    // Initialize services
    this.cache = new SchemaCache();
    this.llm = new LLMService(config.llm);
    this.intentParser = new IntentParser(this.llm);

    // Initialize 3-layer caches
    if (config.cache?.l1?.enabled !== false) {
      this.l1Cache = new ExactCache(config.cache?.l1?.maxSize);
    }
    if (config.cache?.l2?.enabled !== false && config.cache?.l2) {
      this.l2Cache = new SemanticCache(config.cache.l2);
    }

    // Initialize executor with caches
    this.executor = new QueryExecutor(
      this.db,
      this.llm,
      this.cache,
      this.l1Cache,
      this.l2Cache
    );
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
      schemaDescription: this.getSchemaDescription(),
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
    const schemaDescription = this.getSchemaDescription();
    const intent = await this.intentParser.parse(query, schemaDescription);
    const schemaId = this.intentParser.generateSchemaId(intent);
    const cached = await this.cache.get(schemaId);

    // Generate SQL without executing
    const { sql, params } = await this.executor.generateSql(intent, schemaDescription);

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
    const l1Stats = this.l1Cache?.getStats() ?? { size: 0, hits: 0, misses: 0 };
    const l2Stats = this.l2Cache?.getStats() ?? { size: 0, hits: 0, misses: 0 };

    const totalQueries = l1Stats.hits + l1Stats.misses;
    const l1Hits = l1Stats.hits;
    const l2Hits = l2Stats.hits;
    const l3Calls = l2Stats.misses;

    // Calculate cost savings
    // L1 saves $0.01 per hit
    // L2 saves $0.01 - $0.0001 = $0.0099 per hit
    const estimatedCostSaved = l1Hits * 0.01 + l2Hits * 0.0099;

    return {
      l1: l1Stats,
      l2: l2Stats,
      l3: { calls: l3Calls },
      totalQueries,
      hitRates: {
        l1: totalQueries > 0 ? l1Hits / totalQueries : 0,
        l2: totalQueries > 0 ? l2Hits / totalQueries : 0,
        l3: totalQueries > 0 ? l3Calls / totalQueries : 0,
      },
      estimatedCostSaved,
    };
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
