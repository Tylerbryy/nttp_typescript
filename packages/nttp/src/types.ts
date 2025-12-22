/**
 * TypeScript types for NTTP
 */

import type { Knex } from 'knex';

/**
 * NTTP configuration
 */
export interface NTTPConfig {
  /**
   * Database configuration (Knex.js config)
   */
  database: Knex.Config;

  /**
   * Anthropic API configuration
   */
  anthropic: {
    /**
     * Anthropic API key
     */
    apiKey: string;

    /**
     * Claude model to use
     * @default "claude-sonnet-4-5-20250929"
     */
    model?: string;

    /**
     * Maximum tokens for LLM responses
     * @default 2048
     */
    maxTokens?: number;
  };

  /**
   * Query limits
   */
  limits?: {
    /**
     * Maximum query length
     * @default 500
     */
    maxQueryLength?: number;

    /**
     * Default result limit
     * @default 100
     */
    defaultLimit?: number;

    /**
     * Maximum result limit
     * @default 1000
     */
    maxLimit?: number;
  };
}

/**
 * Options for query execution
 */
export interface QueryOptions {
  /**
   * Use schema cache
   * @default true
   */
  useCache?: boolean;

  /**
   * Force generation of new schema
   * @default false
   */
  forceNewSchema?: boolean;
}

/**
 * Query result
 */
export interface QueryResult {
  /**
   * Original query string
   */
  query: string;

  /**
   * Query results
   */
  data: Record<string, any>[];

  /**
   * Schema ID for caching
   */
  schemaId: string;

  /**
   * Whether result came from cache
   */
  cacheHit: boolean;

  /**
   * Execution time in milliseconds
   */
  executionTimeMs: number;

  /**
   * Parsed intent
   */
  intent: Intent;

  /**
   * Generated SQL (for debugging)
   */
  sql?: string;

  /**
   * SQL parameters (for debugging)
   */
  params?: any[];
}

/**
 * Parsed intent from natural language
 */
export interface Intent {
  /**
   * Database entity (table name)
   */
  entity: string;

  /**
   * Operation type
   */
  operation: 'list' | 'count' | 'aggregate' | 'filter';

  /**
   * Filter conditions
   */
  filters?: Record<string, any>;

  /**
   * Result limit
   */
  limit?: number | null;

  /**
   * Fields to select
   */
  fields?: string[] | null;

  /**
   * Sort configuration
   */
  sort?: string | null;

  /**
   * Normalized intent string
   */
  normalized_text: string;
}

/**
 * Cached schema definition
 */
export interface SchemaDefinition {
  /**
   * Unique schema ID
   */
  schema_id: string;

  /**
   * Intent pattern this schema represents
   */
  intent_pattern: string;

  /**
   * Generated SQL query
   */
  generated_sql: string;

  /**
   * SQL query parameters
   */
  sql_params: any[];

  /**
   * JSON schema for results
   */
  result_schema: Record<string, any>;

  /**
   * Number of times this schema was used
   */
  use_count: number;

  /**
   * Whether schema is pinned
   */
  pinned: boolean;

  /**
   * Example queries that use this schema
   */
  example_queries: string[];

  /**
   * When schema was created
   */
  created_at: Date;

  /**
   * When schema was last used
   */
  last_used_at: Date;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /**
   * Total number of cached schemas
   */
  total_schemas: number;

  /**
   * Number of pinned schemas
   */
  pinned_schemas: number;

  /**
   * Total uses across all schemas
   */
  total_uses: number;

  /**
   * Average uses per schema
   */
  average_uses: number;
}
