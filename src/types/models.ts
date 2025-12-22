/**
 * Type definitions and Zod schemas for type-safe data validation.
 * Mirrors Python Pydantic models for API compatibility.
 */

import { z } from 'zod';

/**
 * Structured representation of parsed user intent.
 */
export const IntentSchema = z.object({
  entity: z
    .string()
    .describe('Target table (users, products, orders, order_items)'),
  operation: z
    .string()
    .describe('Operation type (list, count, aggregate, filter)'),
  filters: z.record(z.any()).default({}).describe('Filter conditions'),
  limit: z.number().int().optional().describe('Result limit'),
  fields: z.array(z.string()).optional().describe('Specific fields to return'),
  sort: z
    .string()
    .optional()
    .describe("Sort specification (e.g., 'created_at:desc')"),
  normalized_text: z
    .string()
    .describe('Normalized intent for cache key generation'),
});
export type Intent = z.infer<typeof IntentSchema>;

/**
 * Request model for natural language queries.
 */
export const QueryRequestSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe('Natural language query'),
  use_cache: z.boolean().default(true).describe('Whether to use schema cache'),
  force_new_schema: z
    .boolean()
    .default(false)
    .describe('Force schema re-inference'),
});
export type QueryRequest = z.infer<typeof QueryRequestSchema>;

/**
 * Response model for query results.
 */
export const QueryResponseSchema = z.object({
  data: z.any().describe('Query results'),
  schema_id: z.string().describe('Schema identifier'),
  cache_hit: z.boolean().describe('Whether schema was from cache'),
  execution_time_ms: z.number().describe('Total execution time in milliseconds'),
  generated_sql: z
    .string()
    .optional()
    .describe('Generated SQL query (for debugging)'),
  intent: z.string().optional().describe('Normalized intent (for debugging)'),
});
export type QueryResponse = z.infer<typeof QueryResponseSchema>;

/**
 * Cached schema definition.
 */
export const SchemaDefinitionSchema = z.object({
  schema_id: z.string().describe('Unique schema identifier'),
  intent_pattern: z.string().describe('Normalized intent pattern'),
  json_schema: z.record(z.any()).describe('JSON schema for response structure'),
  pinned: z
    .boolean()
    .default(false)
    .describe('Whether schema is pinned (prevent eviction)'),
  created_at: z.date().describe('Schema creation time'),
  last_used_at: z.date().describe('Last usage time'),
  use_count: z
    .number()
    .int()
    .default(0)
    .describe('Number of times schema has been used'),
  example_queries: z
    .array(z.string())
    .default([])
    .describe('Example queries using this schema'),
});
export type SchemaDefinition = z.infer<typeof SchemaDefinitionSchema>;

/**
 * Response model for listing schemas.
 */
export const SchemaListResponseSchema = z.object({
  schemas: z.array(z.record(z.any())).describe('List of schema metadata'),
  total: z.number().int().describe('Total number of schemas'),
});
export type SchemaListResponse = z.infer<typeof SchemaListResponseSchema>;

/**
 * Response model for listing intents.
 */
export const IntentListResponseSchema = z.object({
  intents: z.array(z.record(z.any())).describe('List of intent patterns'),
  total: z.number().int().describe('Total number of intents'),
});
export type IntentListResponse = z.infer<typeof IntentListResponseSchema>;

/**
 * Response model for query explanation.
 */
export const ExplainResponseSchema = z.object({
  query: z.string().describe('Original query'),
  intent: z.record(z.any()).describe('Parsed intent'),
  sql: z.string().describe('Generated SQL'),
  params: z.array(z.any()).describe('SQL parameters'),
  schema_id: z.string().describe('Schema ID that would be used'),
  cached_schema: z
    .record(z.any())
    .optional()
    .describe('Existing cached schema if available'),
});
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;

/**
 * Response model for errors.
 */
export const ErrorResponseSchema = z.object({
  error: z.string().describe('Error type'),
  message: z.string().describe('Error message'),
  suggestion: z.string().optional().describe('Suggestion for fixing the error'),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Result from SQL generation.
 */
export const SQLGenerationResultSchema = z.object({
  sql: z.string().describe('Generated SQL query'),
  params: z.array(z.any()).describe('Query parameters'),
});
export type SQLGenerationResult = z.infer<typeof SQLGenerationResultSchema>;

/**
 * Result from schema inference.
 */
export const SchemaInferenceResultSchema = z.object({
  json_schema: z.record(z.any()).describe('Inferred JSON schema'),
  sample_data: z.any().optional().describe('Sample data used for inference'),
});
export type SchemaInferenceResult = z.infer<
  typeof SchemaInferenceResultSchema
>;

/**
 * Cache statistics.
 */
export const CacheStatsSchema = z.object({
  total_schemas: z.number().int().describe('Total number of cached schemas'),
  pinned_schemas: z.number().int().describe('Number of pinned schemas'),
  total_uses: z.number().int().describe('Total cache hits across all schemas'),
  average_uses: z.number().describe('Average uses per schema'),
});
export type CacheStats = z.infer<typeof CacheStatsSchema>;
