/**
 * In-memory schema cache for nttp.
 * Provides async-safe operations for storing and retrieving schemas.
 */

import type { SchemaDefinition } from './types.js';
import { CacheError } from './errors.js';

/**
 * Schema cache statistics
 */
export interface SchemaStats {
  total_schemas: number;
  pinned_schemas: number;
  total_uses: number;
  average_uses: number;
}

/**
 * In-memory cache for schema definitions.
 *
 * Node.js is single-threaded, so no mutex needed for basic operations.
 * Async signatures maintained for API compatibility with Python version.
 */
export class SchemaCache {
  private cache: Map<string, SchemaDefinition> = new Map();

  /**
   * Get schema by ID.
   */
  async get(schemaId: string): Promise<SchemaDefinition | undefined> {
    return this.cache.get(schemaId);
  }

  /**
   * Store schema in cache.
   */
  async set(schemaId: string, schema: SchemaDefinition): Promise<void> {
    this.cache.set(schemaId, schema);
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

    return this.cache.delete(schemaId);
  }

  /**
   * List all cached schemas.
   */
  async listAll(): Promise<SchemaDefinition[]> {
    return Array.from(this.cache.values());
  }

  /**
   * Update usage statistics for a schema.
   */
  async updateUsage(schemaId: string): Promise<void> {
    const schema = this.cache.get(schemaId);
    if (schema) {
      schema.use_count += 1;
      schema.last_used_at = new Date();
    }
  }

  /**
   * Pin schema to prevent eviction.
   */
  async pin(schemaId: string): Promise<boolean> {
    const schema = this.cache.get(schemaId);
    if (schema) {
      schema.pinned = true;
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

    return initialCount - this.cache.size;
  }

  /**
   * Get cache statistics.
   */
  async getStats(): Promise<SchemaStats> {
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
