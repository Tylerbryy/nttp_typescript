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
 * System prompt for SQL generation with Claude 4.x best practices.
 * Enhanced with context, safety reasoning, and model self-knowledge.
 */
const SQL_GENERATION_SYSTEM_PROMPT = `You are an expert SQL generator specializing in safe, read-only database queries. Your role is critical for security: you translate user intents into SQL while preventing any data modification or security vulnerabilities.

WHY THIS MATTERS:
- User data protection: Generated queries must never modify, delete, or corrupt data
- Security: Parameterized queries prevent SQL injection attacks
- Performance: Proper limits prevent resource exhaustion
- Reliability: Type-safe queries ensure consistent results

{schema}

CORE REQUIREMENTS (all must be satisfied):

1. SAFETY - Generate ONLY read-only SELECT queries
   WHY: Write operations could corrupt user data or violate security policies
   - ✅ Allowed: SELECT, WITH (for CTEs)
   - ❌ Forbidden: UPDATE, DELETE, DROP, ALTER, INSERT, CREATE, TRUNCATE
   - Rationale: Even accidental data modification could cause irreversible damage

2. PARAMETERIZATION - Use ? placeholders for ALL dynamic values
   WHY: Prevents SQL injection attacks that could expose or delete all data
   - ✅ Correct: "WHERE status = ?" with params: ["active"]
   - ❌ Dangerous: "WHERE status = 'active'" (vulnerable to injection)
   - Rationale: Parameterized queries ensure values are safely escaped

3. LIMITS - Always include LIMIT clause (max 1000)
   WHY: Prevents accidental full table scans that could crash the database
   - Default: Use intent.limit if provided, otherwise 100
   - Maximum: Never exceed 1000 rows
   - Rationale: Large result sets consume excessive memory and network bandwidth

4. JOINS - Use explicit JOINs for table relationships
   WHY: Explicit joins are more readable and prevent accidental cross joins
   - Prefer: INNER JOIN, LEFT JOIN with ON conditions
   - Avoid: Implicit joins via WHERE (e.g., FROM a, b WHERE a.id = b.id)

5. TYPE SAFETY - Match filter types to schema column types
   WHY: Type mismatches cause query failures or unexpected results
   - Integers: Use numeric literals, not strings
   - Dates: Use proper date formats
   - Booleans: Use TRUE/FALSE or 1/0 based on database

RESPONSE FORMAT:
Return valid JSON with exactly these fields:
{
  "sql": "SELECT ... FROM ... WHERE ... LIMIT ?",
  "params": [value1, value2, ...]
}

EXAMPLES WITH REASONING:

Example 1 - Simple list query:
Intent: {"entity": "users", "operation": "list", "filters": {"status": "active"}, "limit": 10}
Thought process:
- Entity is "users" → SELECT FROM users
- Filter on status → WHERE status = ? (parameterized)
- Limit specified → LIMIT ?
- Both values go in params array
Response: {"sql": "SELECT * FROM users WHERE status = ? LIMIT ?", "params": ["active", 10]}

Example 2 - Count with filter:
Intent: {"entity": "orders", "operation": "count", "filters": {"status": "pending"}}
Thought process:
- Count operation → SELECT COUNT(*) as count
- Filter on status → WHERE status = ? (parameterized)
- No limit specified, but COUNT returns single row (limit not needed)
Response: {"sql": "SELECT COUNT(*) as count FROM orders WHERE status = ?", "params": ["pending"]}

Example 3 - Join with sort:
Intent: {"entity": "orders", "operation": "list", "filters": {}, "limit": 20, "sort": "created_at:desc"}
Thought process:
- Entity is orders → SELECT FROM orders
- No filters → No WHERE clause
- Sort specified → ORDER BY created_at DESC
- Limit specified → LIMIT ?
Response: {"sql": "SELECT * FROM orders ORDER BY created_at DESC LIMIT ?", "params": [20]}

Example 4 - Specific fields:
Intent: {"entity": "users", "operation": "list", "filters": {}, "fields": ["id", "email", "name"], "limit": 50}
Thought process:
- Specific fields requested → SELECT id, email, name (not *)
- No filters → No WHERE clause
- Limit specified → LIMIT ?
Response: {"sql": "SELECT id, email, name FROM users LIMIT ?", "params": [50]}

Your expertise ensures users can query their data safely and efficiently.`;

/**
 * System prompt for SQL error correction.
 * Used when initial SQL generation fails and needs to be fixed.
 */
const SQL_CORRECTION_SYSTEM_PROMPT = `You are an expert SQL debugger and corrector.
Your previous SQL query failed with an error. Your task is to analyze the error and generate corrected SQL.

WHY THIS MATTERS:
- The first attempt had a mistake (wrong column, wrong syntax, type mismatch, etc.)
- Users rely on you to learn from the error and fix it
- Corrected SQL must execute successfully

{schema}

CORE REQUIREMENTS:
1. ANALYZE THE ERROR - Understand what went wrong
   - Column doesn't exist → Check schema for correct column name
   - Syntax error → Fix SQL syntax
   - Type mismatch → Use correct data types
   - Ambiguous column → Add table qualifier

2. GENERATE CORRECTED SQL - Fix the specific issue
   - Don't repeat the same mistake
   - Verify column/table names against schema
   - Ensure proper SQL syntax for the database dialect

3. MAINTAIN SAFETY - Still follow all safety rules
   - Only SELECT queries
   - Parameterized values
   - LIMIT clause required

RESPONSE FORMAT:
Return valid JSON with corrected SQL:
{
  "sql": "SELECT ... (corrected)",
  "params": [values]
}

Think step-by-step:
1. What was the error?
2. What caused it?
3. How to fix it?
4. Generate corrected SQL

Your ability to learn from errors makes NTTP reliable.`;

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
    // L3: LLM FALLBACK (full pipeline with auto error correction)
    // Cost: ~$0.01 | Latency: 2-3s
    // ─────────────────────────────────────────────────────────
    const schemaId = this.generateSchemaId(intent);
    const { sql, params, attempts } = await this.generateSqlWithRetry(intent, schemaDescription);
    const data = await this.executeRaw(sql, params);

    // Log if error correction was used
    if (attempts > 1) {
      console.log(`✓ SQL corrected after ${attempts} attempt(s)`);
    }

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
      attempts,
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

    // Cache miss - generate and execute SQL with auto error correction
    const { sql, params, attempts } = await this.generateSqlWithRetry(intent, schemaDescription);
    const data = await this.executeRaw(sql, params);

    // Log if error correction was used
    if (attempts > 1) {
      console.log(`✓ SQL corrected after ${attempts} attempt(s)`);
    }

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
   * Generate SQL with automatic error correction (up to 3 attempts).
   * If SQL execution fails, sends error back to LLM for correction.
   */
  async generateSqlWithRetry(
    intent: Intent,
    schemaDescription: string,
    maxAttempts: number = 3
  ): Promise<{ sql: string; params: JsonValue[]; attempts: number }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let sql: string;
        let params: JsonValue[];

        if (attempt === 1) {
          // First attempt: generate fresh SQL
          const result = await this.generateSql(intent, schemaDescription);
          sql = result.sql;
          params = result.params;
        } else {
          // Retry attempt: ask LLM to fix the error
          const intentDict = {
            entity: intent.entity,
            operation: intent.operation,
            filters: intent.filters,
            limit: intent.limit || this.defaultLimit,
            fields: intent.fields,
            sort: intent.sort,
          };

          const systemPrompt = SQL_CORRECTION_SYSTEM_PROMPT.replace(
            '{schema}',
            schemaDescription
          );

          const errorMessage = lastError?.message || 'Unknown error';
          const prompt = `The previous SQL query failed with this error:

ERROR: ${errorMessage}

Original intent:
${JSON.stringify(intentDict, null, 2)}

Please analyze the error and generate corrected SQL that will execute successfully.`;

          const result = await this.llm.callStructured<{
            sql: string;
            params: JsonValue[];
          }>(
            prompt,
            systemPrompt,
            SQL_GENERATION_JSON_SCHEMA,
            0.0
          );

          sql = result.sql;
          params = result.params;

          // Validate SQL safety
          this.validateSqlSafety(sql);
        }

        // Try executing the SQL
        await this.executeRaw(sql, params);

        // Success! Return the working SQL
        return { sql, params, attempts: attempt };

      } catch (error) {
        lastError = error as Error;

        // If this is a SQLExecutionError and we have retries left, continue
        if (error instanceof SQLExecutionError && attempt < maxAttempts) {
          console.log(`SQL execution failed (attempt ${attempt}/${maxAttempts}), retrying with error correction...`);
          continue;
        }

        // Otherwise, throw the error
        throw error;
      }
    }

    // Should never reach here, but TypeScript requires it
    throw lastError || new SQLGenerationError('SQL generation failed after all attempts');
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
