/**
 * Query execution, SQL generation, and schema inference.
 * Main orchestration pipeline for NTTP with 3-layer caching.
 */

import { z } from 'zod';
import { callLLMStructured } from './llm.js';
import {
  Intent,
  QueryRequest,
  QueryResponse,
  SchemaDefinition,
  SQLGenerationResult,
} from '../types/models.js';
import { executeQuery, getSchemaDescription } from './database.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import {
  SQLGenerationError,
  SQLExecutionError,
  LLMError,
} from '../types/errors.js';
import { cache } from './cache/index.js';
import { parseIntent, generateSchemaId } from './intent.js';
import { generateEmbedding } from './embedding.js';

/**
 * L2 Semantic Cache - In-memory store for query embeddings
 */
interface SemanticCacheEntry {
  query: string;
  embedding: number[];
  schemaId: string;
  sql: string;
  params: any[];
}

const semanticCache: SemanticCacheEntry[] = [];
const MAX_SEMANTIC_CACHE_SIZE = config.L2_CACHE_SIZE || 500;

// Track L2 cache hits/misses for stats
let l2CacheHits = 0;
let l2CacheMisses = 0;

/**
 * Get L2 semantic cache statistics.
 */
export function getSemanticCacheStats() {
  return {
    size: semanticCache.length,
    maxSize: MAX_SEMANTIC_CACHE_SIZE,
    hits: l2CacheHits,
    misses: l2CacheMisses,
  };
}

/**
 * Find similar query in semantic cache without allocating new array.
 * Optimized to avoid GC pressure on hot path.
 */
function findSimilarInCache(
  queryEmbedding: number[],
  threshold: number
): { similarity: number; entry: SemanticCacheEntry } | null {
  let bestMatch: { similarity: number; entry: SemanticCacheEntry } | null = null;

  for (const entry of semanticCache) {
    // Inline cosine similarity calculation to avoid function call overhead
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < queryEmbedding.length; i++) {
      dotProduct += queryEmbedding[i] * entry.embedding[i];
      magnitudeA += queryEmbedding[i] * queryEmbedding[i];
      magnitudeB += entry.embedding[i] * entry.embedding[i];
    }

    const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
    const similarity = magnitude === 0 ? 0 : dotProduct / magnitude;

    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { similarity, entry };
    }
  }

  return bestMatch;
}

/**
 * Zod Schema for SQL generation (for structured outputs).
 */
const SQLGenerationSchema = z.object({
  sql: z.string().describe('The SQL query to execute'),
  params: z
    .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .describe('Parameters for the SQL query'),
});

/**
 * System prompt for SQL generation.
 */
const SQL_GENERATION_SYSTEM_PROMPT = `You are an expert SQL generator for database systems.

Context:
- You are generating read-only SQL queries for a multi-database system
- Input is pre-validated structured intent from the intent parser
- Query will be executed via parameterized prepared statements
- Database dialect is: {dialect}
- Safety is paramount - only SELECT queries allowed
- ALL values MUST use ? placeholders (parameterized)

{schema}

Your task is to generate a safe, efficient SQL query from structured intent.

Instructions (follow sequentially):
1. Start with SELECT and specify requested fields (or * for all)
2. Add FROM clause with the entity table name
3. Build WHERE clause from filters object:
   - String values: Use = operator for equality
   - Numeric-looking values: Infer comparison operator from context
   - Pattern-like values (%, _): Use LIKE operator
   - Multiple values for same field: Use IN operator
4. Add ORDER BY clause if sort is specified
5. Add LIMIT clause (required for list operations, max {max_limit})
6. ALL values go in params array in order of appearance
7. Return ONLY the JSON with sql and params

JSON Structure:
{
  "sql": "SELECT ... FROM ... WHERE ... ORDER BY ... LIMIT ?",
  "params": [value1, value2, ...]
}

<example>
Intent: {"entity": "users", "operation": "list", "filters": {"status": "active"}, "limit": 10, "fields": null, "sort": null}
Output: {"sql": "SELECT * FROM users WHERE status = ? LIMIT ?", "params": ["active", 10]}
</example>

<example>
Intent: {"entity": "orders", "operation": "count", "filters": {"status": "pending"}, "limit": null, "fields": null, "sort": null}
Output: {"sql": "SELECT COUNT(*) as count FROM orders WHERE status = ?", "params": ["pending"]}
</example>

<example>
Intent: {"entity": "products", "operation": "list", "filters": {"price": ">100", "category": "electronics"}, "limit": 20, "fields": null, "sort": "price:desc"}
Output: {"sql": "SELECT * FROM products WHERE price > ? AND category = ? ORDER BY price DESC LIMIT ?", "params": ["100", "electronics", 20]}
</example>

<example>
Intent: {"entity": "users", "operation": "list", "filters": {}, "limit": 5, "fields": ["email", "name"], "sort": "created_at:desc"}
Output: {"sql": "SELECT email, name FROM users ORDER BY created_at DESC LIMIT ?", "params": [5]}
</example>

<example>
Intent: {"entity": "orders", "operation": "list", "filters": {"created_at": ">=2025-01-01"}, "limit": 100, "fields": null, "sort": null}
Output: {"sql": "SELECT * FROM orders WHERE created_at >= ? LIMIT ?", "params": ["2025-01-01", 100]}
</example>

<example>
Intent: {"entity": "products", "operation": "list", "filters": {"name": "widget%"}, "limit": 50, "fields": null, "sort": null}
Output: {"sql": "SELECT * FROM products WHERE name LIKE ? LIMIT ?", "params": ["widget%", 50]}
</example>

<example>
Intent: {"entity": "users", "operation": "count", "filters": {}, "limit": null, "fields": null, "sort": null}
Output: {"sql": "SELECT COUNT(*) as count FROM users", "params": []}
</example>

<example>
Intent: {"entity": "products", "operation": "list", "filters": {"price": "<50"}, "limit": 100, "fields": null, "sort": null}
Output: {"sql": "SELECT * FROM products WHERE price < ? LIMIT ?", "params": ["50", 100]}
</example>

<example>
Intent: {"entity": "orders", "operation": "list", "filters": {"total": "50-200"}, "limit": 100, "fields": null, "sort": null}
Output: {"sql": "SELECT * FROM orders WHERE total BETWEEN ? AND ? LIMIT ?", "params": ["50", "200", 100]}
</example>

<example>
Intent: {"entity": "users", "operation": "list", "filters": {"status": "active,pending"}, "limit": 100, "fields": null, "sort": null}
Output: {"sql": "SELECT * FROM users WHERE status IN (?, ?) LIMIT ?", "params": ["active", "pending", 100]}
</example>

JOIN Query Examples (for cross-table queries):

<example>
Intent: {"entity": "users", "operation": "list", "filters": {}, "limit": 10, "fields": null, "sort": "total_spent:desc"}
Output: {"sql": "SELECT u.*, COALESCE(SUM(o.total), 0) as total_spent FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id ORDER BY total_spent DESC LIMIT ?", "params": [10]}
</example>

<example>
Intent: {"entity": "products", "operation": "list", "filters": {}, "limit": 10, "fields": null, "sort": "order_count:desc"}
Output: {"sql": "SELECT p.*, COUNT(DISTINCT oi.order_id) as order_count FROM products p LEFT JOIN order_items oi ON p.id = oi.product_id GROUP BY p.id ORDER BY order_count DESC LIMIT ?", "params": [10]}
</example>

<example>
Intent: {"entity": "orders", "operation": "list", "filters": {}, "limit": 10, "fields": ["id", "total", "user_name"], "sort": null}
Output: {"sql": "SELECT o.id, o.total, u.name as user_name FROM orders o JOIN users u ON o.user_id = u.id LIMIT ?", "params": [10]}
</example>

Operator and pattern detection rules:
CRITICAL: Check for these patterns in filter values BEFORE defaulting to equality:

1. Comparison operators (>, >=, <, <=):
   - If value starts with >, >=, <, or <=, extract operator and use it
   - Examples: ">100" → WHERE field > ?, "<50" → WHERE field < ?
   - Strip operator from value before adding to params

2. Range patterns (BETWEEN):
   - If value contains hyphen (X-Y format), use BETWEEN
   - Example: "50-200" → WHERE field BETWEEN ? AND ?
   - Split on hyphen and add both values to params

3. Multiple values (IN):
   - If value contains comma, use IN operator
   - Example: "active,pending" → WHERE field IN (?, ?)
   - Split on comma and add each value to params

4. Wildcards (LIKE):
   - If value contains % or _ wildcards, use LIKE
   - Example: "widget%" → WHERE field LIKE ?

5. Equality (=):
   - Default for simple string/number matches
   - Example: "active" → WHERE field = ?

Value extraction:
- For operators (>, <, etc.): Strip operator prefix before adding to params
- For ranges (X-Y): Split on hyphen, add both values to params
- For lists (A,B,C): Split on comma, add each value to params
- For others: Use value as-is

Safety requirements:
- NEVER use UPDATE, DELETE, DROP, ALTER, INSERT, CREATE, TRUNCATE, REPLACE
- ALWAYS use parameterized queries (? placeholders)
- ALWAYS include LIMIT for list operations (except count/aggregate)
- ALWAYS check filter values for special patterns BEFORE defaulting to = operator
`;

/**
 * Generate SQL query from structured intent.
 *
 * @param intent Parsed intent object
 * @returns SQLGenerationResult with SQL and parameters
 * @throws SQLGenerationError if SQL generation fails
 */
export async function generateSql(
  intent: Intent
): Promise<SQLGenerationResult> {
  try {
    // Prepare intent for LLM
    const intentDict = {
      entity: intent.entity,
      operation: intent.operation,
      filters: intent.filters,
      limit: intent.limit || config.DEFAULT_LIMIT,
      fields: intent.fields,
      sort: intent.sort,
    };

    const schema = getSchemaDescription();
    const dialect = typeof config.KNEX_CONFIG.client === 'string'
      ? config.KNEX_CONFIG.client
      : config.KNEX_CONFIG.client?.name || 'SQLite';
    const systemPrompt = SQL_GENERATION_SYSTEM_PROMPT.replace(
      '{schema}',
      schema
    )
      .replace('{max_limit}', String(config.MAX_LIMIT))
      .replace('{dialect}', dialect);

    // Call LLM to generate SQL with structured outputs (guaranteed schema compliance)
    const result = await callLLMStructured(
      JSON.stringify(intentDict),
      systemPrompt,
      SQLGenerationSchema,
      0.0
    );

    const sql = result.sql;
    const params = result.params;

    // Safety validation
    if (!validateSqlSafety(sql)) {
      throw new SQLGenerationError('Generated SQL failed safety validation');
    }

    // Validate parameter count matches placeholder count
    const placeholderCount = (sql.match(/\?/g) || []).length;
    if (params.length !== placeholderCount) {
      throw new SQLGenerationError(
        `Parameter mismatch: SQL has ${placeholderCount} placeholders but ${params.length} params`
      );
    }

    logger.info(`Generated SQL: ${sql}`);
    return {
      sql,
      params,
    };
  } catch (error) {
    if (error instanceof LLMError) {
      logger.error(`LLM failed to generate SQL: ${error}`);
      throw new SQLGenerationError(`Failed to generate SQL: ${error}`);
    }
    logger.error(`Unexpected error generating SQL: ${error}`);
    throw new SQLGenerationError(`Failed to generate SQL: ${error}`);
  }
}

/**
 * Validate that SQL is safe (read-only).
 *
 * @param sql SQL query string
 * @returns True if safe, False otherwise
 */
export function validateSqlSafety(sql: string): boolean {
  // Convert to uppercase for checking
  const sqlUpper = sql.toUpperCase().trim();

  // Block dangerous operations
  const dangerousKeywords = [
    'UPDATE',
    'DELETE',
    'DROP',
    'ALTER',
    'INSERT',
    'CREATE',
    'TRUNCATE',
    'REPLACE',
    'PRAGMA',
    'ATTACH',
    'DETACH',
  ];

  for (const keyword of dangerousKeywords) {
    // Check for keyword as whole word (not part of another word)
    const pattern = new RegExp(`\\b${keyword}\\b`);
    if (pattern.test(sqlUpper)) {
      logger.warn(`Blocked unsafe SQL containing: ${keyword}`);
      return false;
    }
  }

  // Must start with SELECT or WITH (for CTEs)
  if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) {
    logger.warn('SQL must start with SELECT or WITH');
    return false;
  }

  // Should have a LIMIT clause (unless it's an aggregate query)
  const isAggregate = /SELECT\s+(COUNT|SUM|AVG|MIN|MAX)\(/i.test(sqlUpper);
  if (!isAggregate && !sqlUpper.includes('LIMIT')) {
    logger.warn('SQL missing LIMIT clause');
    // This is a warning, not a blocker - LLM might have added it via params
    // return false;
  }

  return true;
}

/**
 * Infer JSON schema from query results.
 *
 * @param results Query results as array of objects
 * @returns JSON schema dictionary
 */
export async function inferSchemaFromResults(
  results: Record<string, any>[]
): Promise<Record<string, any>> {
  if (!results || results.length === 0) {
    // Empty result set - return schema for empty array
    return {
      type: 'array',
      items: { type: 'object' },
      description: 'Empty result set',
    };
  }

  // Determine if this is a single object or array
  const isArray = Array.isArray(results) && results.length > 0;

  // Get first row to infer structure
  const sample = isArray ? results[0] : results;

  // Infer field types from sample
  const properties: Record<string, any> = {};
  const requiredFields: string[] = [];

  for (const [key, value] of Object.entries(sample)) {
    properties[key] = inferFieldType(value);
    requiredFields.push(key);
  }

  // Build schema
  const itemSchema = {
    type: 'object',
    properties,
    required: requiredFields,
  };

  if (isArray) {
    return {
      type: 'array',
      items: itemSchema,
    };
  } else {
    return itemSchema;
  }
}

/**
 * Infer JSON schema type from JavaScript value.
 *
 * @param value JavaScript value
 * @returns JSON schema type string or object with format
 */
export function inferFieldType(value: unknown): any {
  // Null values should be typed as nullable string (most permissive)
  if (value === null || value === undefined) {
    return { type: ['string', 'null'] };
  } else if (typeof value === 'boolean') {
    return { type: 'boolean' };
  } else if (typeof value === 'number') {
    return { type: Number.isInteger(value) ? 'integer' : 'number' };
  } else if (typeof value === 'string') {
    // Check if it looks like a date
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return { type: 'string', format: 'date' };
    }
    return { type: 'string' };
  } else if (Array.isArray(value)) {
    return { type: 'array' };
  } else if (typeof value === 'object') {
    return { type: 'object' };
  } else {
    return { type: 'string' };
  }
}

/**
 * Execute natural language query with schema caching.
 *
 * This is the main orchestration function that:
 * 1. Parses intent from natural language
 * 2. Checks cache for schema
 * 3. Generates SQL if needed
 * 4. Executes query
 * 5. Infers and caches schema on cache miss
 * 6. Returns formatted response
 *
 * @param request Query request with options
 * @returns QueryResponse with data and metadata
 * @throws IntentParseError if intent parsing fails
 * @throws SQLGenerationError if SQL generation fails
 * @throws SQLExecutionError if query execution fails
 */
export async function executeQueryWithCache(
  request: QueryRequest
): Promise<QueryResponse> {
  const startTime = Date.now();

  try {
    // Parse intent from natural language
    logger.info(`Parsing query: ${request.query}`);
    const intent = await parseIntent(request.query);
    const schemaId = generateSchemaId(intent);

    // ─────────────────────────────────────────────────────────
    // L1: EXACT MATCH (hash-based schema cache)
    // Cost: $0.00 | Latency: <1ms
    // ─────────────────────────────────────────────────────────
    if (request.use_cache && !request.force_new_schema) {
      const cachedSchema = await cache.get(schemaId);

      if (cachedSchema) {
        logger.info(`L1 Cache HIT for schema: ${schemaId}`);

        // Execute query using cached SQL
        const results = await executeQuery(cachedSchema.sql, cachedSchema.params);

        // Update cache usage stats
        await cache.updateUsage(schemaId);
        await cache.addExampleQuery(schemaId, request.query);

        const executionTimeMs = Date.now() - startTime;

        return {
          data: results,
          schema_id: schemaId,
          cache_hit: true,
          execution_time_ms: executionTimeMs,
          generated_sql: cachedSchema.sql,
          intent: intent.normalized_text,
          meta: {
            cacheLayer: 1,
            cost: 0,
            latency: executionTimeMs,
          },
        };
      }
    }

    // ─────────────────────────────────────────────────────────
    // L2: SEMANTIC MATCH (embedding-based similarity)
    // Cost: ~$0.0001 | Latency: 50-100ms
    // ─────────────────────────────────────────────────────────
    let queryEmbedding: number[] | undefined;

    if (request.use_cache && !request.force_new_schema && semanticCache.length > 0) {
      logger.info('Checking L2 semantic cache...');

      // Generate embedding for query
      queryEmbedding = await generateEmbedding(request.query);

      // FIX 2: Search without allocating new array (zero GC pressure)
      const threshold = config.SIMILARITY_THRESHOLD || 0.85;
      const match = findSimilarInCache(queryEmbedding, threshold);

      if (match) {
        l2CacheHits++;
        logger.info(
          `L2 Cache HIT with similarity ${match.similarity.toFixed(3)} for query: "${match.entry.query}"`
        );

        // FIX 1: LRU Promotion - Move hit entry to end (most recently used)
        const hitIndex = semanticCache.findIndex((e) => e === match.entry);
        if (hitIndex > -1) {
          semanticCache.splice(hitIndex, 1);
          semanticCache.push(match.entry);
        }

        // Execute query using semantically matched SQL
        const results = await executeQuery(match.entry.sql, match.entry.params);

        // FIX 3: L1 Resurrection - Repopulate L1 if it was evicted
        const cachedSchema = await cache.get(match.entry.schemaId);
        if (cachedSchema) {
          await cache.updateUsage(match.entry.schemaId);
          await cache.addExampleQuery(match.entry.schemaId, request.query);
        } else {
          // L1 was evicted but L2 still has it - resurrect into L1
          logger.info(`Resurrecting schema ${match.entry.schemaId} into L1 from L2 hit`);
          await cache.set(match.entry.schemaId, {
            schema_id: match.entry.schemaId,
            intent_pattern: intent.normalized_text,
            json_schema: {}, // Minimal resurrection - schema not critical for execution
            sql: match.entry.sql,
            params: match.entry.params,
            pinned: false,
            created_at: new Date(),
            last_used_at: new Date(),
            use_count: 1,
            example_queries: [request.query],
          });
        }

        const executionTimeMs = Date.now() - startTime;

        return {
          data: results,
          schema_id: match.entry.schemaId,
          cache_hit: true,
          execution_time_ms: executionTimeMs,
          generated_sql: match.entry.sql,
          intent: intent.normalized_text,
          meta: {
            cacheLayer: 2,
            cost: 0.0001, // Embedding generation cost
            latency: executionTimeMs,
            similarity: match.similarity,
          },
        };
      }

      l2CacheMisses++;
      logger.info('L2 Cache MISS - proceeding to L3');
    }

    // ─────────────────────────────────────────────────────────
    // L3: LLM FALLBACK (full pipeline)
    // Cost: ~$0.01 | Latency: 2-3s
    // ─────────────────────────────────────────────────────────
    logger.info(`L3 Fallback - generating SQL for schema: ${schemaId}`);

    // Generate SQL from intent
    const sqlResult = await generateSql(intent);

    // Execute query
    let results: Record<string, any>[];
      try {
        results = await executeQuery(sqlResult.sql, sqlResult.params);
      } catch (error) {
        logger.error(`SQL execution failed: ${error}`);
        throw new SQLExecutionError(`Query execution failed: ${error}`);
      }

      // Infer schema from results
      const jsonSchema = await inferSchemaFromResults(results);

      // Store in L1 cache (exact match)
      const schemaDef: SchemaDefinition = {
        schema_id: schemaId,
        intent_pattern: intent.normalized_text,
        json_schema: jsonSchema,
        sql: sqlResult.sql,
        params: sqlResult.params,
        pinned: false,
        created_at: new Date(),
        last_used_at: new Date(),
        use_count: 1,
        example_queries: [request.query],
      };
      await cache.set(schemaId, schemaDef);

      // Store in L2 semantic cache with embedding (reuse if already generated)
      if (!queryEmbedding) {
        queryEmbedding = await generateEmbedding(request.query);
      }

      // Add to semantic cache with LRU eviction
      if (semanticCache.length >= MAX_SEMANTIC_CACHE_SIZE) {
        semanticCache.shift(); // Remove oldest entry
      }

      semanticCache.push({
        query: request.query,
        embedding: queryEmbedding,
        schemaId: schemaId,
        sql: sqlResult.sql,
        params: sqlResult.params,
      });

      logger.info(
        `Populated L1 and L2 caches. L2 cache size: ${semanticCache.length}/${MAX_SEMANTIC_CACHE_SIZE}`
      );

      // Calculate execution time
      const executionTimeMs = Date.now() - startTime;

      // Return response with L3 fallback metadata
      return {
        data: results,
        schema_id: schemaId,
        cache_hit: false,
        execution_time_ms: executionTimeMs,
        generated_sql: sqlResult.sql,
        intent: intent.normalized_text,
        meta: {
          cacheLayer: 3, // L3 LLM fallback (full pipeline)
          cost: 0.01, // Estimated cost for intent parsing + SQL generation
          latency: executionTimeMs,
        },
      };
  } catch (error) {
    // Log error and re-raise
    logger.error(`Query execution failed: ${error}`);
    throw error;
  }
}
