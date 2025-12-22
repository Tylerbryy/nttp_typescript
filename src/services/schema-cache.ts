/**
 * In-memory schema cache for NTTP.
 * Provides async-safe operations for storing and retrieving schemas.
 */

import { SchemaDefinition, CacheStats } from '../types/models.js';
import { logger } from '../utils/logger.js';
import { CacheError } from '../types/errors.js';

/**
 * In-memory cache for schema definitions with LRU eviction.
 *
 * Node.js is single-threaded, so no mutex needed for basic operations.
 * Async signatures maintained for API compatibility with Python version.
 */
class SchemaCache {
  private cache: Map<string, SchemaDefinition> = new Map();
  private readonly MAX_SIZE = 1000; // Prevent unbounded memory growth

  /**
   * Get schema by ID.
   * Promotes item to most recently used (LRU).
   */
  async get(schemaId: string): Promise<SchemaDefinition | undefined> {
    const item = this.cache.get(schemaId);
    if (item) {
      // LRU Promotion: Delete and re-add to move to end of Map
      this.cache.delete(schemaId);
      this.cache.set(schemaId, item);
      // Return a clone to prevent external mutation
      return structuredClone(item);
    }
    return undefined;
  }

  /**
   * Store schema in cache with LRU eviction.
   */
  async set(schemaId: string, schema: SchemaDefinition): Promise<void> {
    // If cache is at max size and this is a new key, evict oldest non-pinned item
    if (this.cache.size >= this.MAX_SIZE && !this.cache.has(schemaId)) {
      let evicted = false;
      // Map iterates in insertion order (oldest first)
      for (const [key, val] of this.cache.entries()) {
        if (!val.pinned) {
          this.cache.delete(key);
          logger.info(`Evicted schema to make space: ${key}`);
          evicted = true;
          break; // Only evict one
        }
      }

      // Edge case: Cache full of only pinned items
      if (!evicted) {
        logger.warn(
          'Cache full of pinned items! Forcing eviction of oldest pinned item'
        );
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          this.cache.delete(firstKey);
        }
      }
    }

    this.cache.set(schemaId, schema);
    logger.info(`Cached schema: ${schemaId}`);
  }

  /**
   * Check if schema exists in cache.
   */
  async exists(schemaId: string): Promise<boolean> {
    return this.cache.has(schemaId);
  }

  /**
   * Delete schema from cache.
   * Throws error if schema is pinned.
   */
  async delete(schemaId: string): Promise<boolean> {
    const schema = this.cache.get(schemaId);
    if (!schema) {
      return false;
    }

    // Block deletion of pinned schemas
    if (schema.pinned) {
      throw new CacheError(
        `Cannot delete pinned schema: ${schemaId}. Unpin it first.`
      );
    }

    const deleted = this.cache.delete(schemaId);
    if (deleted) {
      logger.info(`Deleted schema: ${schemaId}`);
    }
    return deleted;
  }

  /**
   * List all cached schemas.
   */
  async listAll(): Promise<SchemaDefinition[]> {
    return Array.from(this.cache.values());
  }

  /**
   * Update usage statistics for a schema.
   * Promotes item to most recently used (LRU).
   */
  async updateUsage(schemaId: string): Promise<void> {
    const schema = this.cache.get(schemaId);
    if (schema) {
      schema.use_count += 1;
      schema.last_used_at = new Date();
      // LRU Promotion: Delete and re-add to move to end of Map
      this.cache.delete(schemaId);
      this.cache.set(schemaId, schema);
      logger.debug(
        `Updated usage for schema ${schemaId}: ${schema.use_count} uses`
      );
    }
  }

  /**
   * Pin schema to prevent eviction.
   */
  async pin(schemaId: string): Promise<boolean> {
    const schema = this.cache.get(schemaId);
    if (schema) {
      schema.pinned = true;
      logger.info(`Pinned schema: ${schemaId}`);
      return true;
    }
    return false;
  }

  /**
   * Unpin schema to allow eviction.
   */
  async unpin(schemaId: string): Promise<boolean> {
    const schema = this.cache.get(schemaId);
    if (schema) {
      schema.pinned = false;
      logger.info(`Unpinned schema: ${schemaId}`);
      return true;
    }
    return false;
  }

  /**
   * Add an example query to a schema.
   * Keeps only the last 10 examples.
   */
  async addExampleQuery(schemaId: string, query: string): Promise<void> {
    const schema = this.cache.get(schemaId);
    if (schema) {
      if (!schema.example_queries.includes(query)) {
        schema.example_queries.push(query);
        // Keep only last 10 examples
        schema.example_queries = schema.example_queries.slice(-10);
      }
    }
  }

  /**
   * Clear all non-pinned schemas from cache.
   * Returns number of schemas cleared.
   */
  async clear(): Promise<number> {
    const initialCount = this.cache.size;

    // Keep only pinned schemas
    for (const [schemaId, schema] of this.cache.entries()) {
      if (!schema.pinned) {
        this.cache.delete(schemaId);
      }
    }

    const cleared = initialCount - this.cache.size;
    if (cleared > 0) {
      logger.info(`Cleared ${cleared} non-pinned schemas`);
    }
    return cleared;
  }

  /**
   * Get cache statistics.
   */
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

/**
 * Global cache instance.
 */
export const cache = new SchemaCache();
