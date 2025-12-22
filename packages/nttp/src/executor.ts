/**
 * Query execution, SQL generation, and schema inference.
 * Main orchestration pipeline for NTTP.
 */

import type { Knex } from 'knex';
import type { Intent, SchemaDefinition } from './types.js';
import {
  SQLGenerationError,
  SQLExecutionError,
  LLMError,
} from './errors.js';
import type { LLMService } from './llm.js';
import type { SchemaCache } from './cache.js';

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
}

export interface ExecuteResult {
  query: string;
  data: Record<string, any>[];
  schemaId: string;
  cacheHit: boolean;
  intent: Intent;
  sql?: string;
  params?: any[];
}

/**
 * Service for executing queries and managing SQL generation.
 */
export class QueryExecutor {
  private defaultLimit: number = 100;

  constructor(
    private db: Knex,
    private llm: LLMService,
    private cache: SchemaCache
  ) {}

  /**
   * Execute query with caching.
   */
  async execute(options: ExecuteOptions): Promise<ExecuteResult> {
    const { query, intent, useCache, forceNewSchema } = options;

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
    const { sql, params } = await this.generateSql(intent);
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
  async generateSql(intent: Intent): Promise<{ sql: string; params: any[] }> {
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

      const schemaDescription = await this.getSchemaDescription();
      const systemPrompt = SQL_GENERATION_SYSTEM_PROMPT.replace(
        '{schema}',
        schemaDescription
      );

      // Call LLM to generate SQL
      const result = await this.llm.callStructured<{
        sql: string;
        params: any[];
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
    params: any[] = []
  ): Promise<Record<string, any>[]> {
    try {
      const result = await this.db.raw(sql, params);

      // Normalize different dialect return formats
      if (Array.isArray(result)) {
        return result;
      }
      if (result.rows) return result.rows; // PostgreSQL
      if (Array.isArray(result[0])) return result[0]; // MySQL
      if (result.recordset) return result.recordset; // SQL Server

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
    results: any[]
  ): Record<string, { type: string }> {
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
   * Get schema description for LLM.
   */
  private async getSchemaDescription(): Promise<string> {
    const tables = await this.db
      .select('name')
      .from('sqlite_master')
      .where('type', 'table')
      .andWhere('name', 'not like', 'sqlite_%');

    const lines: string[] = ['Database schema:'];

    for (const { name } of tables) {
      const columns = await this.db(name).columnInfo();
      const columnNames = Object.keys(columns).join(', ');
      lines.push(`- ${name} (${columnNames})`);
    }

    return lines.join('\n');
  }

  /**
   * Generate schema ID from intent (SHA256 hash).
   */
  private generateSchemaId(intent: Intent): string {
    const crypto = require('crypto');
    const hash = crypto
      .createHash('sha256')
      .update(intent.normalized_text)
      .digest('hex');
    return hash.substring(0, 16);
  }
}
