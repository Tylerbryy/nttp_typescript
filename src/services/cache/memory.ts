/**
 * In-Memory Cache Implementation (Default / Fallback)
 *
 * Adapted from the original SchemaCache class.
 * Used when Redis is not configured or unavailable.
 */

import { SchemaDefinition, CacheStats } from '../../types/models.js';
import { logger } from '../../utils/logger.js';
import { CacheError } from '../../types/errors.js';
import { CacheProvider } from './types.js';

export class MemoryCache implements CacheProvider {
  private cache: Map<string, SchemaDefinition> = new Map();
  private readonly MAX_SIZE = 1000;

  getType(): string {
    return 'memory';
  }

  async get(schemaId: string): Promise<SchemaDefinition | undefined> {
    const item = this.cache.get(schemaId);
    if (item) {
      // LRU Promotion
      this.cache.delete(schemaId);
      this.cache.set(schemaId, item);
      return structuredClone(item);
    }
    return undefined;
  }

  async set(schemaId: string, schema: SchemaDefinition): Promise<void> {
    // Eviction Logic
    if (this.cache.size >= this.MAX_SIZE && !this.cache.has(schemaId)) {
      let evicted = false;
      for (const [key, val] of this.cache.entries()) {
        if (!val.pinned) {
          this.cache.delete(key);
          logger.debug(`[Memory] Evicted schema: ${key}`);
          evicted = true;
          break;
        }
      }
      if (!evicted) {
        // Fallback: evict oldest pinned if absolutely full
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
    }
    this.cache.set(schemaId, schema);
  }

  async exists(schemaId: string): Promise<boolean> {
    return this.cache.has(schemaId);
  }

  async delete(schemaId: string): Promise<boolean> {
    const schema = this.cache.get(schemaId);
    if (!schema) return false;
    if (schema.pinned) {
      throw new CacheError(`Cannot delete pinned schema: ${schemaId}`);
    }
    return this.cache.delete(schemaId);
  }

  async listAll(): Promise<SchemaDefinition[]> {
    return Array.from(this.cache.values());
  }

  async updateUsage(schemaId: string): Promise<void> {
    const schema = this.cache.get(schemaId);
    if (schema) {
      schema.use_count += 1;
      schema.last_used_at = new Date();
      // LRU Promotion
      this.cache.delete(schemaId);
      this.cache.set(schemaId, schema);
    }
  }

  async pin(schemaId: string): Promise<boolean> {
    const schema = this.cache.get(schemaId);
    if (schema) {
      schema.pinned = true;
      return true;
    }
    return false;
  }

  async unpin(schemaId: string): Promise<boolean> {
    const schema = this.cache.get(schemaId);
    if (schema) {
      schema.pinned = false;
      return true;
    }
    return false;
  }

  async addExampleQuery(schemaId: string, query: string): Promise<void> {
    const schema = this.cache.get(schemaId);
    if (schema) {
      if (!schema.example_queries.includes(query)) {
        schema.example_queries.push(query);
        schema.example_queries = schema.example_queries.slice(-10);
      }
    }
  }

  async clear(): Promise<number> {
    const initialCount = this.cache.size;
    for (const [id, s] of this.cache.entries()) {
      if (!s.pinned) this.cache.delete(id);
    }
    return initialCount - this.cache.size;
  }

  async getStats(): Promise<CacheStats> {
    const schemas = Array.from(this.cache.values());
    const total = schemas.length;
    const pinned = schemas.filter((s) => s.pinned).length;
    const totalUses = schemas.reduce((sum, s) => sum + s.use_count, 0);

    return {
      total_schemas: total,
      pinned_schemas: pinned,
      total_uses: totalUses,
      average_uses: total > 0 ? totalUses / total : 0,
    };
  }
}
