/**
 * Cache Interface Definitions
 * Defines the contract for L1 Cache providers (Memory, Redis, etc.)
 */

import { SchemaDefinition, CacheStats } from '../../types/models.js';

export interface CacheProvider {
  /**
   * Get schema by ID.
   */
  get(schemaId: string): Promise<SchemaDefinition | undefined>;

  /**
   * Store schema in cache.
   */
  set(schemaId: string, schema: SchemaDefinition): Promise<void>;

  /**
   * Check if schema exists.
   */
  exists(schemaId: string): Promise<boolean>;

  /**
   * Delete schema from cache.
   */
  delete(schemaId: string): Promise<boolean>;

  /**
   * List all schemas.
   */
  listAll(): Promise<SchemaDefinition[]>;

  /**
   * Update usage statistics.
   */
  updateUsage(schemaId: string): Promise<void>;

  /**
   * Pin a schema (prevent eviction).
   */
  pin(schemaId: string): Promise<boolean>;

  /**
   * Unpin a schema.
   */
  unpin(schemaId: string): Promise<boolean>;

  /**
   * Add example query.
   */
  addExampleQuery(schemaId: string, query: string): Promise<void>;

  /**
   * Clear non-pinned schemas.
   */
  clear(): Promise<number>;

  /**
   * Get cache statistics.
   */
  getStats(): Promise<CacheStats>;

  /**
   * Returns 'memory' or 'redis' for diagnostics.
   */
  getType(): string;
}
