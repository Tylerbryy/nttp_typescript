/**
 * Types for nttp caching system
 */

import type { JsonValue } from '../utils.js';

/**
 * Cached query result with metadata
 */
export interface CachedResult {
  /**
   * Schema ID for this query pattern
   */
  readonly schemaId: string;

  /**
   * Generated SQL query
   */
  readonly sql: string;

  /**
   * SQL query parameters
   */
  readonly params: JsonValue[];

  /**
   * Number of times this cache entry was hit (mutable)
   */
  hitCount: number;

  /**
   * When this cache entry was created
   */
  readonly createdAt: Date;

  /**
   * When this cache entry was last used (mutable)
   */
  lastUsedAt: Date;
}

/**
 * Semantic match result from L2 cache
 * Note: Embedding is returned separately from find() to prevent double API billing
 */
export interface SemanticMatch {
  /**
   * The cached result
   */
  result: CachedResult;

  /**
   * Cosine similarity score (0-1)
   */
  similarity: number;

  /**
   * Original query that was cached
   */
  originalQuery: string;
}

/**
 * Statistics for a single cache layer
 */
export interface LayerStats {
  /**
   * Current size of the cache
   */
  size: number;

  /**
   * Number of cache hits
   */
  hits: number;

  /**
   * Number of cache misses
   */
  misses: number;
}

/**
 * Aggregate cache statistics
 */
export interface CacheStats {
  /**
   * L1 exact match cache stats
   */
  l1: LayerStats;

  /**
   * L2 semantic cache stats
   */
  l2: LayerStats;

  /**
   * L3 LLM fallback stats
   */
  l3: {
    /**
     * Number of LLM calls made
     */
    calls: number;
  };

  /**
   * Total queries processed
   */
  totalQueries: number;

  /**
   * Hit rates for each layer
   */
  hitRates: {
    l1: number;
    l2: number;
    l3: number;
  };

  /**
   * Estimated cost saved (USD)
   */
  estimatedCostSaved: number;
}

/**
 * Configuration for L2 semantic cache
 */
export interface SemanticCacheConfig {
  /**
   * Embedding provider
   */
  provider: 'openai' | 'cohere' | 'mistral' | 'google';

  /**
   * Embedding model name
   */
  model: string;

  /**
   * Similarity threshold for matches (0-1)
   * Recommended: 0.80-0.85 for natural language queries
   * @default 0.85
   */
  threshold?: number;

  /**
   * Maximum cache size
   * @default 500
   */
  maxSize?: number;

  /**
   * API key for embedding provider (if needed)
   */
  apiKey?: string;
}
