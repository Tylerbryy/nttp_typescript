/**
 * Type definitions and Zod schemas for type-safe data validation.
 * Mirrors Python Pydantic models for API compatibility.
 */

import { z } from 'zod';
import type {
	JsonValue,
	JsonObject,
	FilterConditions,
	SortSpec,
	OperationType,
} from './utils.js';

// ============================================================================
// DISCRIMINATED UNIONS FOR CACHE METADATA
// ============================================================================

/**
 * L1 Cache metadata (exact match, no cost).
 */
export interface L1CacheMeta {
	readonly cacheLayer: 1;
	readonly cost: 0;
	readonly latency: number;
}

/**
 * L2 Cache metadata (semantic match with similarity score).
 */
export interface L2CacheMeta {
	readonly cacheLayer: 2;
	readonly cost: number;
	readonly latency: number;
	readonly similarity: number;
}

/**
 * L3 Cache metadata (LLM generation, highest cost).
 */
export interface L3CacheMeta {
	readonly cacheLayer: 3;
	readonly cost: number;
	readonly latency: number;
}

/**
 * Discriminated union for query result metadata.
 * Ensures type-safe access to layer-specific fields.
 */
export type QueryResultMeta = L1CacheMeta | L2CacheMeta | L3CacheMeta;

// ============================================================================
// ZOD SCHEMAS WITH STRICT VALIDATION
// ============================================================================

/**
 * Zod schema for filter values.
 * Supports primitives and arrays for IN clauses.
 */
const FilterValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.array(z.union([z.string(), z.number()])),
]);

/**
 * Structured representation of parsed user intent.
 */
export const IntentSchema = z.object({
	entity: z
		.string()
		.describe('Target table (users, products, orders, order_items)'),
	operation: z
		.enum(['list', 'count', 'aggregate', 'filter'])
		.describe('Operation type'),
	filters: z
		.record(FilterValueSchema)
		.default({})
		.describe('Filter conditions'),
	limit: z.number().int().optional().describe('Result limit'),
	fields: z.array(z.string()).optional().describe('Specific fields to return'),
	sort: z
		.string()
		.regex(/^[\w_]+:(asc|desc)$/)
		.optional()
		.describe("Sort specification (e.g., 'created_at:desc')"),
	normalized_text: z
		.string()
		.describe('Normalized intent for cache key generation'),
});

/**
 * TypeScript type for Intent with stricter typing than Zod inference.
 */
export interface Intent {
	entity: string;
	operation: OperationType;
	filters: FilterConditions;
	limit?: number;
	fields?: string[];
	sort?: SortSpec;
	normalized_text: string;
}

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
 * Zod schema for cache metadata (used in responses).
 */
const CacheMetaSchema = z.object({
	cacheLayer: z.union([z.literal(1), z.literal(2), z.literal(3)]),
	cost: z.number(),
	latency: z.number(),
	similarity: z.number().optional(),
});

/**
 * Response model for query results.
 */
export const QueryResponseSchema = z.object({
	data: z.array(z.record(z.unknown())).describe('Query results'),
	schema_id: z.string().describe('Schema identifier'),
	cache_hit: z.boolean().describe('Whether schema was from cache'),
	execution_time_ms: z.number().describe('Total execution time in milliseconds'),
	generated_sql: z
		.string()
		.optional()
		.describe('Generated SQL query (for debugging)'),
	intent: z.string().optional().describe('Normalized intent (for debugging)'),
	meta: CacheMetaSchema
		.optional()
		.describe('Metadata about cache performance'),
});

/**
 * TypeScript type for QueryResponse with discriminated union metadata.
 */
export interface QueryResponse {
	data: JsonObject[];
	schema_id: string;
	cache_hit: boolean;
	execution_time_ms: number;
	generated_sql?: string;
	intent?: string;
	meta?: QueryResultMeta;
}

/**
 * Cached schema definition.
 */
export const SchemaDefinitionSchema = z.object({
	schema_id: z.string().describe('Unique schema identifier'),
	intent_pattern: z.string().describe('Normalized intent pattern'),
	json_schema: z.record(z.unknown()).describe('JSON schema for response structure'),
	sql: z.string().describe('Cached SQL query'),
	params: z.array(z.unknown()).describe('Cached SQL parameters'),
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

/**
 * TypeScript type for SchemaDefinition with stricter typing.
 */
export interface SchemaDefinition {
	schema_id: string;
	intent_pattern: string;
	json_schema: JsonObject;
	sql: string;
	params: JsonValue[];
	pinned: boolean;
	created_at: Date;
	last_used_at: Date;
	use_count: number;
	example_queries: string[];
}

/**
 * Response model for listing schemas.
 */
export const SchemaListResponseSchema = z.object({
	schemas: z.array(z.record(z.unknown())).describe('List of schema metadata'),
	total: z.number().int().describe('Total number of schemas'),
});

export interface SchemaListResponse {
	schemas: JsonObject[];
	total: number;
}

/**
 * Response model for listing intents.
 */
export const IntentListResponseSchema = z.object({
	intents: z.array(z.record(z.unknown())).describe('List of intent patterns'),
	total: z.number().int().describe('Total number of intents'),
});

export interface IntentListResponse {
	intents: JsonObject[];
	total: number;
}

/**
 * Response model for query explanation.
 */
export const ExplainResponseSchema = z.object({
	query: z.string().describe('Original query'),
	intent: z.record(z.unknown()).describe('Parsed intent'),
	sql: z.string().describe('Generated SQL'),
	params: z.array(z.unknown()).describe('SQL parameters'),
	schema_id: z.string().describe('Schema ID that would be used'),
	cached_schema: z
		.record(z.unknown())
		.optional()
		.describe('Existing cached schema if available'),
});

export interface ExplainResponse {
	query: string;
	intent: JsonObject;
	sql: string;
	params: JsonValue[];
	schema_id: string;
	cached_schema?: JsonObject;
}

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
	params: z.array(z.unknown()).describe('Query parameters'),
});

export interface SQLGenerationResult {
	sql: string;
	params: JsonValue[];
}

/**
 * Result from schema inference.
 */
export const SchemaInferenceResultSchema = z.object({
	json_schema: z.record(z.unknown()).describe('Inferred JSON schema'),
	sample_data: z.unknown().optional().describe('Sample data used for inference'),
});

export interface SchemaInferenceResult {
	json_schema: JsonObject;
	sample_data?: JsonValue;
}

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
