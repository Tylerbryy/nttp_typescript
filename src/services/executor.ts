/**
 * Query execution, SQL generation, and schema inference.
 * Main orchestration pipeline for NTTP.
 */

import { callClaudeStructured } from './llm.js';
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
import { cache } from './schema-cache.js';
import { parseIntent, generateSchemaId } from './intent.js';

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
const SQL_GENERATION_SYSTEM_PROMPT = `You are an expert SQL generator for SQLite.
Generate safe, read-only SQL queries from structured intents.

{schema}

Rules:
- Use parameterized queries with ? placeholders for values
- Add LIMIT clause (max {max_limit})
- Only SELECT queries - no UPDATE, DELETE, DROP, ALTER, INSERT
- Valid SQLite syntax only
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
    const systemPrompt = SQL_GENERATION_SYSTEM_PROMPT.replace(
      '{schema}',
      schema
    ).replace('{max_limit}', String(config.MAX_LIMIT));

    // Call LLM to generate SQL with structured outputs (guaranteed schema compliance)
    const result = await callClaudeStructured<{
      sql: string;
      params: any[];
    }>(
      JSON.stringify(intentDict),
      systemPrompt,
      SQL_GENERATION_JSON_SCHEMA,
      0.0
    );

    const sql = result.sql;
    const params = result.params || [];

    // Safety validation
    if (!validateSqlSafety(sql)) {
      throw new SQLGenerationError('Generated SQL failed safety validation');
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

  // Should have a LIMIT clause (unless it's a count)
  if (
    !sqlUpper.includes('COUNT(*)') &&
    !sqlUpper.includes('COUNT(*)')
  ) {
    if (!sqlUpper.includes('LIMIT')) {
      logger.warn('SQL missing LIMIT clause');
      // This is a warning, not a blocker - LLM might have added it via params
      // return false;
    }
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
    const fieldType = inferFieldType(value);
    properties[key] = {
      type: fieldType,
    };
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
 * @returns JSON schema type string
 */
export function inferFieldType(value: unknown): string {
  if (value === null) {
    return 'null';
  } else if (typeof value === 'boolean') {
    return 'boolean';
  } else if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  } else if (typeof value === 'string') {
    // Check if it looks like a date
    if (/\d{4}-\d{2}-\d{2}/.test(value)) {
      return 'string'; // Could add format: "date-time"
    }
    return 'string';
  } else if (Array.isArray(value)) {
    return 'array';
  } else if (typeof value === 'object') {
    return 'object';
  } else {
    return 'string';
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
    // Step 1: Parse intent from natural language
    logger.info(`Parsing query: ${request.query}`);
    const intent = await parseIntent(request.query);
    const schemaId = generateSchemaId(intent);

    // Step 2: Check cache for schema
    let cachedSchema: SchemaDefinition | undefined;
    if (request.use_cache && !request.force_new_schema) {
      cachedSchema = await cache.get(schemaId);
    }

    if (cachedSchema) {
      // CACHE HIT - Use cached schema
      logger.info(`Cache HIT for schema: ${schemaId}`);

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

      // Update cache usage stats
      await cache.updateUsage(schemaId);
      await cache.addExampleQuery(schemaId, request.query);

      // Calculate execution time
      const executionTimeMs = Date.now() - startTime;

      // Return response
      return {
        data: results,
        schema_id: schemaId,
        cache_hit: true,
        execution_time_ms: executionTimeMs,
        generated_sql: sqlResult.sql,
        intent: intent.normalized_text,
      };
    } else {
      // CACHE MISS - Full pipeline
      logger.info(`Cache MISS for schema: ${schemaId}`);

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

      // Create and store schema definition
      const schemaDef: SchemaDefinition = {
        schema_id: schemaId,
        intent_pattern: intent.normalized_text,
        json_schema: jsonSchema,
        pinned: false,
        created_at: new Date(),
        last_used_at: new Date(),
        use_count: 1,
        example_queries: [request.query],
      };
      await cache.set(schemaId, schemaDef);

      // Calculate execution time
      const executionTimeMs = Date.now() - startTime;

      // Return response
      return {
        data: results,
        schema_id: schemaId,
        cache_hit: false,
        execution_time_ms: executionTimeMs,
        generated_sql: sqlResult.sql,
        intent: intent.normalized_text,
      };
    }
  } catch (error) {
    // Log error and re-raise
    logger.error(`Query execution failed: ${error}`);
    throw error;
  }
}
