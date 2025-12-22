/**
 * Cache Factory (Auto-Detect Logic)
 *
 * Determines which cache provider to use based on environment.
 * Implements "Progressive Enhancement" DX.
 */

import { logger } from '../../utils/logger.js';
import { CacheProvider } from './types.js';
import { MemoryCache } from './memory.js';
import { RedisCache } from './redis.js';

let cacheInstance: CacheProvider | null = null;

export function getCache(): CacheProvider {
  if (cacheInstance) return cacheInstance;

  // 1. Check for Redis Config
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    logger.info('🚀 REDIS_URL detected. Initializing Redis L1 Cache...');
    try {
      // We return Redis cache immediately.
      // The class handles connection errors internally without crashing.
      cacheInstance = new RedisCache(redisUrl);
      return cacheInstance;
    } catch (error) {
      logger.warn('Failed to initialize Redis client. Falling back to Memory.');
      // Fall through to memory
    }
  } else {
    logger.info('ℹ️  No REDIS_URL found. Using In-Memory L1 Cache.');
  }

  // 2. Default to Memory
  cacheInstance = new MemoryCache();
  return cacheInstance;
}

// Export singleton for easy import
export const cache = getCache();

// Re-export types for convenience
export type { CacheProvider } from './types.js';
