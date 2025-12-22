/**
 * TypeScript types for nttp
 */

import type { Knex } from 'knex';

/**
 * nttp configuration
 */
export interface NTTPConfig {
  /**
   * Database configuration (Knex.js config)
   */
  database: Knex.Config;

  /**
   * LLM configuration
   */
  llm: {
    /**
     * LLM provider
     */
    provider: 'anthropic' | 'openai' | 'cohere' | 'mistral' | 'google';

    /**
     * Model name
     * @example "claude-sonnet-4-5-20250929"
     * @example "gpt-4o"
     * @example "command-r-plus"
     */
    model: string;

    /**
     * API key for the provider
     */
    apiKey: string;

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

  /**
   * 3-layer cache configuration
   */
  cache?: {
    /**
     * L1 exact match cache configuration
     */
    l1?: {
      /**
       * Enable L1 cache
       * @default true
       */
      enabled?: boolean;

      /**
       * Maximum cache size
       * @default 1000
       */
      maxSize?: number;
    };

    /**
     * L2 semantic cache configuration
     */
    l2?: {
      /**
       * Enable L2 cache
       * @default true
       */
      enabled?: boolean;

      /**
       * Embedding provider
       */
      provider: 'openai' | 'cohere' | 'mistral' | 'google';

      /**
       * Embedding model name
       */
      model: string;

      /**
       * Similarity threshold (0-1)
       * @default 0.85
       */
      threshold?: number;

      /**
       * Maximum cache size
       * @default 500
       */
      maxSize?: number;

      /**
       * API key for embedding provider
       */
      apiKey?: string;
    };
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

  /**
   * Cache metadata (optional)
   */
  meta?: {
    /**
     * Which cache layer served this query (1, 2, or 3)
     */
    cacheLayer: 1 | 2 | 3;

    /**
     * Estimated cost in USD
     */
    cost: number;

    /**
     * Latency in milliseconds
     */
    latency: number;

    /**
     * Similarity score for L2 hits (0-1)
     */
    similarity?: number;
  };
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

// Re-export cache types
export type { CacheStats } from './cache/types.js';
