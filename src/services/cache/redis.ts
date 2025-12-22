/**
 * Redis Cache Implementation (Production)
 *
 * Uses ioredis for robust connection handling.
 * Automatically handles serialization/deserialization.
 */

import { Redis } from 'ioredis';
import { SchemaDefinition, CacheStats } from '../../types/models.js';
import { logger } from '../../utils/logger.js';
import { CacheError } from '../../types/errors.js';
import { CacheProvider } from './types.js';

export class RedisCache implements CacheProvider {
  private redis: Redis;
  private readonly TTL_SECONDS = 86400 * 7; // 1 week default retention
  private readonly PREFIX = 'nttp:schema:';

  constructor(connectionString: string) {
    // Lazy connect is handled by ioredis, but we set retry strategy
    this.redis = new Redis(connectionString, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        // If Redis is down, don't crash loop forever, just warn
        if (times > 5) {
          logger.warn('Redis connection unstable. Retrying...');
          return 5000; // 5s delay
        }
        return Math.min(times * 50, 2000);
      },
    });

    this.redis.on('error', (err: Error) => {
      // Don't crash process on redis error
      logger.error(`Redis Error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      logger.info('✅ Redis connected');
    });
  }

  getType(): string {
    return 'redis';
  }

  private key(id: string): string {
    return `${this.PREFIX}${id}`;
  }

  async get(schemaId: string): Promise<SchemaDefinition | undefined> {
    try {
      const data = await this.redis.get(this.key(schemaId));
      if (!data) return undefined;

      const schema = JSON.parse(data);
      // Refresh TTL on read (LRU-like behavior)
      await this.redis.expire(this.key(schemaId), this.TTL_SECONDS);

      // Fix Date strings back to Date objects
      schema.created_at = new Date(schema.created_at);
      schema.last_used_at = new Date(schema.last_used_at);
      return schema;
    } catch (e) {
      logger.error(`Redis get error: ${e}`);
      return undefined;
    }
  }

  async set(schemaId: string, schema: SchemaDefinition): Promise<void> {
    try {
      const data = JSON.stringify(schema);
      // Use setex to enforce TTL
      await this.redis.setex(this.key(schemaId), this.TTL_SECONDS, data);
    } catch (e) {
      logger.error(`Redis set error: ${e}`);
    }
  }

  async exists(schemaId: string): Promise<boolean> {
    const result = await this.redis.exists(this.key(schemaId));
    return result === 1;
  }

  async delete(schemaId: string): Promise<boolean> {
    // Check pinned status first
    const schema = await this.get(schemaId);
    if (!schema) return false;

    if (schema.pinned) {
      throw new CacheError(`Cannot delete pinned schema: ${schemaId}`);
    }

    const result = await this.redis.del(this.key(schemaId));
    return result > 0;
  }

  async listAll(): Promise<SchemaDefinition[]> {
    // WARNING: KEYS is expensive in production redis.
    // For scale, use SCAN. For this scope, keys is okay if <10k keys.
    const keys = await this.redis.keys(`${this.PREFIX}*`);
    if (keys.length === 0) return [];

    const values = await this.redis.mget(keys);
    return values
      .filter((v): v is string => v !== null)
      .map((v: string) => {
        const s = JSON.parse(v) as SchemaDefinition;
        s.created_at = new Date(s.created_at);
        s.last_used_at = new Date(s.last_used_at);
        return s;
      });
  }

  async updateUsage(schemaId: string): Promise<void> {
    const schema = await this.get(schemaId);
    if (schema) {
      schema.use_count += 1;
      schema.last_used_at = new Date();
      await this.set(schemaId, schema);
    }
  }

  async pin(schemaId: string): Promise<boolean> {
    const schema = await this.get(schemaId);
    if (schema) {
      schema.pinned = true;
      await this.set(schemaId, schema);
      return true;
    }
    return false;
  }

  async unpin(schemaId: string): Promise<boolean> {
    const schema = await this.get(schemaId);
    if (schema) {
      schema.pinned = false;
      await this.set(schemaId, schema);
      return true;
    }
    return false;
  }

  async addExampleQuery(schemaId: string, query: string): Promise<void> {
    const schema = await this.get(schemaId);
    if (schema) {
      if (!schema.example_queries.includes(query)) {
        schema.example_queries.push(query);
        schema.example_queries = schema.example_queries.slice(-10);
        await this.set(schemaId, schema);
      }
    }
  }

  async clear(): Promise<number> {
    const all = await this.listAll();
    let count = 0;
    const pipeline = this.redis.pipeline();

    for (const schema of all) {
      if (!schema.pinned) {
        pipeline.del(this.key(schema.schema_id));
        count++;
      }
    }
    await pipeline.exec();
    return count;
  }

  async getStats(): Promise<CacheStats> {
    const all = await this.listAll();
    const total = all.length;
    const pinned = all.filter((s) => s.pinned).length;
    const totalUses = all.reduce((sum, s) => sum + s.use_count, 0);

    return {
      total_schemas: total,
      pinned_schemas: pinned,
      total_uses: totalUses,
      average_uses: total > 0 ? totalUses / total : 0,
    };
  }
}
