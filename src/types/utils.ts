/**
 * Core type utilities for NTTP.
 * These types replace 'any' usage and provide strict type safety.
 */

/**
 * Primitive JSON values.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Recursive JSON value type.
 * Replaces 'any' for data that must be serializable.
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * JSON object type - strictly typed alternative to Record<string, any>
 */
export interface JsonObject {
	[key: string]: JsonValue;
}

/**
 * JSON array type
 */
export interface JsonArray extends Array<JsonValue> {}

/**
 * Specific type for database filter values.
 * Supports primitives and arrays of primitives for IN clauses.
 */
export type FilterValue = JsonPrimitive | JsonPrimitive[];

/**
 * Database filter conditions.
 * Replaces Record<string, any> in intent parsing.
 */
export type FilterConditions = Record<string, FilterValue>;

/**
 * Sort direction for query results.
 */
export type SortDirection = "asc" | "desc";

/**
 * Sort specification in format "field:direction"
 * Template literal type ensures compile-time validation.
 * @example "created_at:desc" | "name:asc"
 */
export type SortSpec = `${string}:${SortDirection}`;

/**
 * Database operation types.
 */
export type OperationType = "list" | "count" | "aggregate" | "filter";

/**
 * Validates if a string matches the SortSpec format at runtime.
 * Use this as a type guard or in Zod schemas.
 */
export function isSortSpec(value: string): value is SortSpec {
	return /^[\w_]+:(asc|desc)$/.test(value);
}

/**
 * Parses a sort specification into its components.
 */
export function parseSortSpec(spec: SortSpec): {
	field: string;
	direction: SortDirection;
} {
	const [field, direction] = spec.split(":") as [string, SortDirection];
	return { field, direction };
}
