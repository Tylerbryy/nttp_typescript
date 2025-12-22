/**
 * L1 Exact Match Cache
 * Fast hash-based cache for identical queries
 */

import { createHash } from 'crypto';
import type { CachedResult, LayerStats } from './types.js';

/**
 * L1 exact match cache using Map with LRU eviction
 */
export class ExactCache {
  private cache = new Map<string, CachedResult>();
  private accessOrder = new Map<string, number>();
  private accessCounter = 0;
  private maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Get cached result for a query
   */
  get(query: string): CachedResult | null {
    const key = this.normalizeQuery(query);
    const result = this.cache.get(key);

    if (result) {
      // Update hit count and access time
      result.hitCount++;
      result.lastUsedAt = new Date();
      this.accessOrder.set(key, ++this.accessCounter);
      this.hits++;
      return result;
    }

    this.misses++;
    return null;
  }

  /**
   * Set cached result for a query
   */
  set(query: string, result: CachedResult): void {
    const key = this.normalizeQuery(query);

    // Evict if at max size
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, result);
    this.accessOrder.set(key, ++this.accessCounter);
  }

  /**
   * Clear all cached results
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): LayerStats {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
    };
  }

  /**
   * Normalize query string for consistent cache keys
   * - Convert to lowercase
   * - Trim whitespace
   * - Collapse multiple spaces
   * - Hash to fixed-length key
   */
  private normalizeQuery(query: string): string {
    const normalized = query
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');

    // Use SHA-256 hash for cache key
    return createHash('sha256')
      .update(normalized)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }
}
