/**
 * L2 Semantic Cache
 * Embedding-based similarity matching using AI SDK
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
   */
  private async loadEmbeddingModel(): Promise<any> {
    switch (this.config.provider) {
      case 'openai': {
        // Set API key if provided
        if (this.config.apiKey) {
          process.env.OPENAI_API_KEY = this.config.apiKey;
        }
        const { openai } = await import('@ai-sdk/openai');
        this.model = openai.textEmbeddingModel(this.config.model);
        return this.model;
      }

      case 'cohere': {
        // Set API key if provided
        if (this.config.apiKey) {
          process.env.COHERE_API_KEY = this.config.apiKey;
        }
        // @ts-expect-error - Optional peer dependency
        const { cohere } = await import('@ai-sdk/cohere');
        this.model = cohere.embedding(this.config.model);
        return this.model;
      }

      case 'mistral': {
        // Set API key if provided
        if (this.config.apiKey) {
          process.env.MISTRAL_API_KEY = this.config.apiKey;
        }
        // @ts-expect-error - Optional peer dependency
        const { mistral } = await import('@ai-sdk/mistral');
        this.model = mistral.embedding(this.config.model);
        return this.model;
      }

      case 'google': {
        // Set API key if provided
        if (this.config.apiKey) {
          process.env.GOOGLE_API_KEY = this.config.apiKey;
        }
        // @ts-expect-error - Optional peer dependency
        const { google } = await import('@ai-sdk/google-vertex');
        this.model = google.textEmbeddingModel(this.config.model);
        return this.model;
      }

      default: {
        // Default to OpenAI for backward compatibility
        if (this.config.apiKey) {
          process.env.OPENAI_API_KEY = this.config.apiKey;
        }
        const { openai } = await import('@ai-sdk/openai');
        this.model = openai.textEmbeddingModel(this.config.model);
        return this.model;
      }
    }
  }

  /**
   * Find semantically similar cached query
   * Returns the embedding for reuse in case of miss
   */
  async find(query: string): Promise<SemanticMatch | null> {
    // Initialize model if needed
    const model = await this.initializeModel();

    // Generate embedding for the query
    const { embedding } = await embed({
      model,
      value: query,
    });

    // Search for best match above threshold
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
        result: bestMatch.result,
        similarity: bestScore,
        originalQuery: bestMatch.query,
        embedding,  // Return for reuse
      };
    }

    this.misses++;
    return null;
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
   */
  private evictLRU(): void {
    let oldestIndex = 0;
    let oldestTime = this.entries[0]?.result.lastUsedAt ?? new Date();

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
