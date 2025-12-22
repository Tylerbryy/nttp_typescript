/**
 * L2 Semantic Cache
 * Embedding-based similarity matching using AI SDK
 *
 * PERFORMANCE NOTE: This implementation uses O(N) linear scan for similarity search.
 * For large caches (>10,000 entries), consider using a vector database like:
 * - Pinecone
 * - Weaviate
 * - FAISS (via Node.js bindings)
 * - Qdrant
 *
 * These provide approximate nearest neighbor (ANN) search in O(log N) time.
 */

import { embed, cosineSimilarity } from 'ai';
import type {
  CachedResult,
  SemanticMatch,
  SemanticCacheConfig,
  LayerStats
} from './types.js';

/**
 * Internal cache entry with embedding
 */
interface SemanticEntry {
  query: string;
  embedding: number[];
  result: CachedResult;
}

/**
 * L2 semantic similarity cache using embeddings
 */
export class SemanticCache {
  private entries: SemanticEntry[] = [];
  private threshold: number;
  private maxSize: number;
  private model: any;
  private modelPromise: Promise<any> | null = null;
  private config: SemanticCacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config: SemanticCacheConfig) {
    this.threshold = config.threshold ?? 0.85;
    this.maxSize = config.maxSize ?? 500;
    this.config = config;
  }

  /**
   * Lazy initialization of embedding model
   * Supports multiple providers with dynamic imports
   */
  private async initializeModel(): Promise<any> {
    if (this.model) {
      return this.model;
    }

    if (this.modelPromise) {
      return this.modelPromise;
    }

    this.modelPromise = this.loadEmbeddingModel();
    return this.modelPromise;
  }

  /**
   * Load the embedding model based on provider configuration
   * Passes API keys directly to avoid process.env race conditions
   */
  private async loadEmbeddingModel(): Promise<any> {
    switch (this.config.provider) {
      case 'openai': {
        try {
          const { createOpenAI } = await import('@ai-sdk/openai');
          const openai = createOpenAI({
            apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
          });
          this.model = openai.textEmbeddingModel(this.config.model);
          return this.model;
        } catch (error) {
          throw new Error(
            `Failed to load @ai-sdk/openai. Install it with: npm install @ai-sdk/openai\nOriginal error: ${error}`
          );
        }
      }

      case 'cohere': {
        try {
          // @ts-expect-error - Optional peer dependency
          const { createCohere } = await import('@ai-sdk/cohere');
          const cohere = createCohere({
            apiKey: this.config.apiKey || process.env.COHERE_API_KEY,
          });
          this.model = cohere.embedding(this.config.model);
          return this.model;
        } catch (error) {
          throw new Error(
            `Failed to load @ai-sdk/cohere. Install it with: npm install @ai-sdk/cohere\nOriginal error: ${error}`
          );
        }
      }

      case 'mistral': {
        try {
          // @ts-expect-error - Optional peer dependency
          const { createMistral } = await import('@ai-sdk/mistral');
          const mistral = createMistral({
            apiKey: this.config.apiKey || process.env.MISTRAL_API_KEY,
          });
          this.model = mistral.embedding(this.config.model);
          return this.model;
        } catch (error) {
          throw new Error(
            `Failed to load @ai-sdk/mistral. Install it with: npm install @ai-sdk/mistral\nOriginal error: ${error}`
          );
        }
      }

      case 'google': {
        try {
          // @ts-expect-error - Optional peer dependency
          const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
          const google = createGoogleGenerativeAI({
            apiKey: this.config.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
          });
          this.model = google.textEmbeddingModel(this.config.model);
          return this.model;
        } catch (error) {
          throw new Error(
            `Failed to load @ai-sdk/google. Install it with: npm install @ai-sdk/google\nOriginal error: ${error}`
          );
        }
      }

      default: {
        // Default to OpenAI for backward compatibility
        try {
          const { createOpenAI } = await import('@ai-sdk/openai');
          const openai = createOpenAI({
            apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
          });
          this.model = openai.textEmbeddingModel(this.config.model);
          return this.model;
        } catch (error) {
          throw new Error(
            `Failed to load @ai-sdk/openai. Install it with: npm install @ai-sdk/openai\nOriginal error: ${error}`
          );
        }
      }
    }
  }

  /**
   * Find semantically similar cached query
   * ALWAYS returns the embedding to prevent double API billing on cache miss
   *
   * Usage pattern:
   * const { match, embedding } = await cache.find(query);
   * if (match) {
   *   // Cache hit - use match.result
   * } else {
   *   // Cache miss - generate result and use addWithEmbedding(query, embedding, result)
   * }
   */
  async find(query: string): Promise<{ match: SemanticMatch | null; embedding: number[] }> {
    // Initialize model if needed
    const model = await this.initializeModel();

    // Generate embedding for the query (COST: 1 API call)
    const { embedding } = await embed({
      model,
      value: query,
    });

    // Search for best match above threshold (O(N) linear scan)
    let bestMatch: SemanticEntry | null = null;
    let bestScore = 0;

    for (const entry of this.entries) {
      const score = cosineSimilarity(embedding, entry.embedding);

      if (score >= this.threshold && score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      // Update hit count and access time
      bestMatch.result.hitCount++;
      bestMatch.result.lastUsedAt = new Date();
      this.hits++;

      return {
        match: {
          result: bestMatch.result,
          similarity: bestScore,
          originalQuery: bestMatch.query,
        },
        embedding,  // Return embedding for potential reuse
      };
    }

    this.misses++;
    return {
      match: null,
      embedding,  // CRITICAL: Return embedding so caller can use addWithEmbedding()
    };
  }

  /**
   * Add new entry to cache with embedding generation
   */
  async add(query: string, result: CachedResult): Promise<void> {
    // Initialize model if needed
    const model = await this.initializeModel();

    const { embedding } = await embed({
      model,
      value: query,
    });

    this.addWithEmbedding(query, embedding, result);
  }

  /**
   * Add new entry with pre-computed embedding
   * Used when embedding was already computed during find()
   */
  addWithEmbedding(query: string, embedding: number[], result: CachedResult): void {
    // Evict if at max size
    if (this.entries.length >= this.maxSize) {
      this.evictLRU();
    }

    this.entries.push({
      query,
      embedding,
      result,
    });
  }

  /**
   * Clear all cached results
   */
  clear(): void {
    this.entries = [];
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): LayerStats {
    return {
      size: this.entries.length,
      hits: this.hits,
      misses: this.misses,
    };
  }

  /**
   * Evict least recently used entry
   *
   * NOTE: Minor race condition possible with concurrent adds in async code.
   * Multiple parallel add() calls might all pass the size check before any
   * eviction completes, temporarily exceeding maxSize by a few entries.
   * This is acceptable for most use cases. For strict size limits, consider
   * using a mutex/semaphore around the add operation.
   */
  private evictLRU(): void {
    if (this.entries.length === 0) {
      return;
    }

    let oldestIndex = 0;
    let oldestTime = this.entries[0].result.lastUsedAt;

    for (let i = 1; i < this.entries.length; i++) {
      const entryTime = this.entries[i].result.lastUsedAt;
      if (entryTime < oldestTime) {
        oldestTime = entryTime;
        oldestIndex = i;
      }
    }

    this.entries.splice(oldestIndex, 1);
  }
}
