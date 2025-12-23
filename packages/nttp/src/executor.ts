/**
 * Query execution, SQL generation, and schema inference.
 * Main orchestration pipeline for NTTP.
 */

import crypto from 'crypto';
import type { Knex } from 'knex';
import type {
	Intent,
	SchemaDefinition,
	QueryResultMeta,
	L1CacheMeta,
	L2CacheMeta,
	L3CacheMeta,
} from './types.js';
import {
	SQLGenerationError,
	SQLExecutionError,
	LLMError,
} from './errors.js';
import type { LLMService } from './llm.js';
import type { SchemaCache } from './cache.js';
import type { ExactCache, RedisExactCache, SemanticCache } from './cache/index.js';
import type { CachedResult } from './cache/types.js';
import type { JsonObject, JsonValue } from './utils.js';

/**
 * JSON Schema for SQL generation (for structured outputs).
 */
const SQL_GENERATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    sql: {
      type: 'string',
      description: 'The SQL query to execute',
    },
    params: {
      type: 'array',
      items: {
        type: ['string', 'integer', 'number', 'boolean', 'null'],
      },
      description: 'Parameters for the SQL query',
    },
  },
  required: ['sql', 'params'],
  additionalProperties: false,
};

/**
 * System prompt for SQL generation.
 */
const SQL_GENERATION_SYSTEM_PROMPT = `You are an expert SQL generator.
Generate safe, read-only SQL queries from structured intents.

{schema}

Rules:
- Use parameterized queries with ? placeholders for values
- Add LIMIT clause (max 1000)
- Only SELECT queries - no UPDATE, DELETE, DROP, ALTER, INSERT
- Use proper JOINs for relationships between tables
- Handle filters intelligently (e.g., status='active', created_at > date)

Return JSON:
{
  "sql": "SELECT ... FROM ... WHERE ... LIMIT ?",
  "params": [value1, value2, ...]
}

Examples:
Intent: {"entity": "users", "operation": "list", "filters": {"status": "active"}, "limit": 10}
Response: {"sql": "SELECT * FROM users WHERE status = ? LIMIT ?", "params": ["active", 10]}

Intent: {"entity": "orders", "operation": "count", "filters": {"status": "pending"}}
Response: {"sql": "SELECT COUNT(*) as count FROM orders WHERE status = ?", "params": ["pending"]}
`;

export interface ExecuteOptions {
	query: string;
	intent: Intent;
	useCache: boolean;
	forceNewSchema: boolean;
	schemaDescription: string;
}

/**
 * Result from query execution with type-safe cache metadata.
 * Uses discriminated union to ensure layer-specific fields are correctly typed.
 */
export interface ExecuteResult {
	query: string;
	data: JsonObject[];
	schemaId: string;
	cacheHit: boolean;
	intent: Intent;
	sql?: string;
	params?: JsonValue[];
	meta?: QueryResultMeta;
}

/**
 * Service for executing queries and managing SQL generation.
 */
export class QueryExecutor {
  private defaultLimit: number = 100;

  constructor(
    private db: Knex,
    private llm: LLMService,
    private cache: SchemaCache,
    private l1Cache?: ExactCache | RedisExactCache,
    private l2Cache?: SemanticCache
  ) {}

  /**
   * Execute query with v2 3-layer caching.
   */
  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const startTime = Date.now();
    const { query, intent, useCache, forceNewSchema, schemaDescription } = options;

    // If v2 not enabled, fall back to v1 behavior
    if (!this.l1Cache && !this.l2Cache) {
      return this.executeV1(options);
    }

    // ─────────────────────────────────────────────────────────
    // L1: EXACT MATCH (hash-based cache)
    // Cost: $0.00 | Latency: <1ms (in-memory) or ~5ms (Redis)
    // ─────────────────────────────────────────────────────────
    if (this.l1Cache && useCache && !forceNewSchema) {
      const l1Hit = await this.l1Cache.get(query);
      if (l1Hit) {
        const data = await this.executeRaw(l1Hit.sql, l1Hit.params);
        const meta: L1CacheMeta = {
          cacheLayer: 1,
          cost: 0,
          latency: Date.now() - startTime,
        };
        return {
          query,
          data,
          schemaId: l1Hit.schemaId,
          cacheHit: true,
          intent,
          sql: l1Hit.sql,
          params: l1Hit.params,
          meta,
        };
      }
    }

    // ─────────────────────────────────────────────────────────
    // L2: SEMANTIC MATCH (embedding-based similarity)
    // Cost: ~$0.0001 | Latency: 50-100ms
    // ─────────────────────────────────────────────────────────
    let l2Embedding: number[] | undefined;
    if (this.l2Cache && useCache && !forceNewSchema) {
      const { match, embedding } = await this.l2Cache.find(query);
      l2Embedding = embedding; // Save for L3 if needed

      if (match) {
        const data = await this.executeRaw(
          match.result.sql,
          match.result.params
        );

        // Promote to L1 for future exact matches
        if (this.l1Cache) {
          await this.l1Cache.set(query, match.result);
        }

        const meta: L2CacheMeta = {
          cacheLayer: 2,
          cost: 0.0001,
          latency: Date.now() - startTime,
          similarity: match.similarity,
        };
        return {
          query,
          data,
          schemaId: match.result.schemaId,
          cacheHit: true,
          intent,
          sql: match.result.sql,
          params: match.result.params,
          meta,
        };
      }
      // L2 miss - embedding saved for reuse in L3 to prevent double API billing
    }

    // ─────────────────────────────────────────────────────────
    // L3: LLM FALLBACK (full pipeline)
    // Cost: ~$0.01 | Latency: 2-3s
    // ─────────────────────────────────────────────────────────
    const schemaId = this.generateSchemaId(intent);
    const { sql, params } = await this.generateSql(intent, schemaDescription);
    const data = await this.executeRaw(sql, params);

    const result: CachedResult = {
      schemaId,
      sql,
      params,
      hitCount: 1,
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };

    // Populate both L1 and L2 caches
    if (this.l1Cache) {
      await this.l1Cache.set(query, result);
    }

    if (this.l2Cache) {
      // Reuse embedding from L2 miss to prevent double API billing
      if (l2Embedding) {
        this.l2Cache.addWithEmbedding(query, l2Embedding, result);
      } else {
        // L2 not checked (cache disabled or forced new schema)
        await this.l2Cache.add(query, result);
      }
    }

    // Also populate v1 schema cache (for backward compat)
    const resultSchema = this.inferSchemaFromResults(data);
    const schemaDefinition: SchemaDefinition = {
      schema_id: schemaId,
      intent_pattern: intent.normalized_text,
      generated_sql: sql,
      sql_params: params,
      result_schema: resultSchema,
      use_count: 1,
      created_at: new Date(),
      last_used_at: new Date(),
      example_queries: [query],
      pinned: false,
    };
    await this.cache.set(schemaId, schemaDefinition);

    const meta: L3CacheMeta = {
      cacheLayer: 3,
      cost: 0.01,
      latency: Date.now() - startTime,
    };
    return {
      query,
      data,
      schemaId,
      cacheHit: false,
      intent,
      sql,
      params,
      meta,
    };
  }

  /**
   * Execute query with v1 caching (legacy).
   */
  async executeV1(options: ExecuteOptions): Promise<ExecuteResult> {
    const { query, intent, useCache, forceNewSchema, schemaDescription } = options;

    // Generate schema ID from intent
    const schemaId = this.generateSchemaId(intent);

    // Check cache if enabled and not forcing new schema
    if (useCache && !forceNewSchema) {
      const cachedSchema = await this.cache.get(schemaId);
      if (cachedSchema) {
        // Cache hit - use cached SQL
        const data = await this.executeRaw(
          cachedSchema.generated_sql,
          cachedSchema.sql_params
        );

        // Update cache usage
        await this.cache.updateUsage(schemaId);
        await this.cache.addExampleQuery(schemaId, query);

        return {
          query,
          data,
          schemaId,
          cacheHit: true,
          intent,
          sql: cachedSchema.generated_sql,
          params: cachedSchema.sql_params,
        };
      }
    }

    // Cache miss - generate and execute SQL
    const { sql, params } = await this.generateSql(intent, schemaDescription);
    const data = await this.executeRaw(sql, params);

    // Infer schema from results
    const resultSchema = this.inferSchemaFromResults(data);

    // Store in cache
    const schemaDefinition: SchemaDefinition = {
      schema_id: schemaId,
      intent_pattern: intent.normalized_text,
      generated_sql: sql,
      sql_params: params,
      result_schema: resultSchema,
      use_count: 1,
      created_at: new Date(),
      last_used_at: new Date(),
      example_queries: [query],
      pinned: false,
    };

    await this.cache.set(schemaId, schemaDefinition);

    return {
      query,
      data,
      schemaId,
      cacheHit: false,
      intent,
      sql,
      params,
    };
  }

  /**
   * Generate SQL query from intent.
   */
  async generateSql(
    intent: Intent,
    schemaDescription: string
  ): Promise<{ sql: string; params: JsonValue[] }> {
    try {
      // Prepare intent for LLM
      const intentDict = {
        entity: intent.entity,
        operation: intent.operation,
        filters: intent.filters,
        limit: intent.limit || this.defaultLimit,
        fields: intent.fields,
        sort: intent.sort,
      };

      const systemPrompt = SQL_GENERATION_SYSTEM_PROMPT.replace(
        '{schema}',
        schemaDescription
      );

      // Call LLM to generate SQL
      const result = await this.llm.callStructured<{
        sql: string;
        params: JsonValue[];
      }>(
        `Generate SQL for this intent:\n${JSON.stringify(intentDict, null, 2)}`,
        systemPrompt,
        SQL_GENERATION_JSON_SCHEMA,
        0.0
      );

      // Validate SQL safety
      this.validateSqlSafety(result.sql);

      return result;
    } catch (error) {
      if (error instanceof LLMError) {
        throw new SQLGenerationError(`Failed to generate SQL: ${error}`);
      }
      throw new SQLGenerationError(`SQL generation failed: ${error}`);
    }
  }

  /**
   * Execute raw SQL query.
   */
  private async executeRaw(
    sql: string,
    params: JsonValue[] = []
  ): Promise<JsonObject[]> {
    try {
      const result = await this.db.raw(sql, params);

      // Normalize different dialect return formats
      if (Array.isArray(result)) {
        return result as JsonObject[];
      }
      if (result.rows) return result.rows as JsonObject[]; // PostgreSQL
      if (Array.isArray(result[0])) return result[0] as JsonObject[]; // MySQL
      if (result.recordset) return result.recordset as JsonObject[]; // SQL Server

      return [];
    } catch (error) {
      throw new SQLExecutionError(`Query failed: ${error}`);
    }
  }

  /**
   * Validate SQL safety (read-only).
   */
  private validateSqlSafety(sql: string): void {
    const dangerous = [
      /\bUPDATE\b/i,
      /\bDELETE\b/i,
      /\bDROP\b/i,
      /\bALTER\b/i,
      /\bINSERT\b/i,
      /\bCREATE\b/i,
    ];

    for (const pattern of dangerous) {
      if (pattern.test(sql)) {
        throw new SQLGenerationError(
          `Dangerous SQL operation detected: ${pattern.source}`
        );
      }
    }

    if (!sql.trim().match(/^(SELECT|WITH)\b/i)) {
      throw new SQLGenerationError('SQL must start with SELECT or WITH');
    }
  }

  /**
   * Infer JSON schema from query results.
   */
  private inferSchemaFromResults(
    results: JsonObject[]
  ): JsonObject {
    if (results.length === 0) {
      return {};
    }

    const schema: Record<string, { type: string }> = {};
    const sample = results[0];

    for (const [key, value] of Object.entries(sample)) {
      schema[key] = { type: this.inferFieldType(value) };
    }

    return schema;
  }

  /**
   * Infer type of a field value.
   */
  private inferFieldType(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    if (typeof value === 'string') {
      // Detect dates
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return 'string'; // Keep as string, but could be 'date'
      }
      return 'string';
    }
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }

  /**
   * Generate schema ID from intent (SHA256 hash).
   */
  private generateSchemaId(intent: Intent): string {
    const hash = crypto
      .createHash('sha256')
      .update(intent.normalized_text)
      .digest('hex');
    return hash.substring(0, 16);
  }
}
