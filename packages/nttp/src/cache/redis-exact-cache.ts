/**
 * L1 Exact Cache with Redis persistence
 * Persists across CLI invocations
 */

import Redis from 'ioredis';
import type { CachedResult, LayerStats } from './types.js';

export class RedisExactCache {
  private redis: Redis;
  private prefix = 'nttp:l1:';
  private ttl = 86400; // 24 hours in seconds
  private hits = 0;
  private misses = 0;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  /**
   * Get cached result by exact query match
   */
  async get(query: string): Promise<CachedResult | null> {
    const key = this.prefix + query;
    const cached = await this.redis.get(key);

    if (!cached) {
      this.misses++;
      return null;
    }

    try {
      const result = JSON.parse(cached) as CachedResult;

      // Update last used time
      result.lastUsedAt = new Date();
      result.hitCount++;

      // Save updated result back to Redis
      await this.redis.setex(key, this.ttl, JSON.stringify(result));

      this.hits++;
      return result;
    } catch (error) {
      console.error('Failed to parse cached result:', error);
      this.misses++;
      return null;
    }
  }

  /**
   * Store result in cache
   */
  async set(query: string, result: CachedResult): Promise<void> {
    const key = this.prefix + query;
    await this.redis.setex(key, this.ttl, JSON.stringify(result));
  }

  /**
   * Clear all cached results
   */
  async clear(): Promise<void> {
    const keys = await this.redis.keys(this.prefix + '*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<LayerStats> {
    const keys = await this.redis.keys(this.prefix + '*');
    return {
      size: keys.length,
      hits: this.hits,
      misses: this.misses,
    };
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
