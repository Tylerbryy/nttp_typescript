/**
 * Intent parsing and normalization for cache key generation.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { callLLMStructured } from './llm.js';
import { Intent } from '../types/models.js';
import { IntentParseError, LLMError } from '../types/errors.js';
import { getSchemaDescription } from './database.js';
import { logger } from '../utils/logger.js';
import { isSortSpec, type SortSpec } from '../types/utils.js';

/**
 * Zod Schema for intent parsing (for structured outputs).
 * Schema-agnostic: works with any database schema.
 */
const IntentSchema = z.object({
  entity: z
    .string()
    .describe('Target table name'),
  operation: z
    .enum(['list', 'count', 'aggregate', 'filter'])
    .describe('Operation type'),
  filters: z
    .array(
      z.object({
        field: z.string().describe('Field name to filter on'),
        value: z.string().describe('Value to filter by as string'),
      })
    )
    .optional()
    .default([])
    .describe('Filter conditions as array of field-value pairs'),
  limit: z.number().int().nullable().optional().describe('Result limit, or null for default'),
  fields: z
    .array(z.string())
    .nullable()
    .optional()
    .describe('Specific fields to return, or null for all fields'),
  sort: z
    .string()
    .nullable()
    .optional()
    .describe("Sort specification (e.g., 'created_at:desc'), or null"),
});

/**
 * System prompt for intent parsing.
 */
const INTENT_PARSE_SYSTEM_PROMPT = `You are an expert at parsing natural language database queries.

Context:
- You are the first stage in a natural language to SQL pipeline
- Your output feeds into a SQL generation stage that trusts your intent parsing
- Accuracy is critical - the SQL generator relies on your structured output
- Users range from technical to non-technical backgrounds
- Queries will be cached based on normalized intent for performance

{schema}

Your task is to parse a natural language database query into structured intent.

Instructions (follow sequentially):
1. Identify the target table from the schema (entity)
2. Determine the operation type (list/count/aggregate/filter)
3. Extract ALL filter conditions as field-value pairs
4. Identify any limit specification (or null for default)
5. Note any specific fields requested (or null for all fields)
6. Detect sort specifications in field:direction format (or null)
7. Return ONLY the JSON structure, no additional text

JSON Structure:
{
  "entity": "<table_name>",
  "operation": "<list|count|aggregate|filter>",
  "filters": [{"field": "<field_name>", "value": "<value>"}],
  "limit": <number or null>,
  "fields": [<field names>] or null,
  "sort": "<field:asc|desc>" or null
}

<example>
Query: "get all active users"
Output: {"entity": "users", "operation": "list", "filters": [{"field": "status", "value": "active"}], "limit": null, "fields": null, "sort": null}
</example>

<example>
Query: "show me 10 products"
Output: {"entity": "products", "operation": "list", "filters": [], "limit": 10, "fields": null, "sort": null}
</example>

<example>
Query: "count pending orders"
Output: {"entity": "orders", "operation": "count", "filters": [{"field": "status", "value": "pending"}], "limit": null, "fields": null, "sort": null}
</example>

<example>
Query: "how many pending orders from California?"
Output: {"entity": "orders", "operation": "count", "filters": [{"field": "status", "value": "pending"}, {"field": "state", "value": "California"}], "limit": null, "fields": null, "sort": null}
</example>

<example>
Query: "list user emails and names sorted by created date descending"
Output: {"entity": "users", "operation": "list", "filters": [], "limit": null, "fields": ["email", "name"], "sort": "created_at:desc"}
</example>

<example>
Query: "show top 5 expensive products in electronics category"
Output: {"entity": "products", "operation": "list", "filters": [{"field": "category", "value": "electronics"}], "limit": 5, "fields": null, "sort": "price:desc"}
</example>

<example>
Query: "find all orders above 100 dollars"
Output: {"entity": "orders", "operation": "list", "filters": [{"field": "amount", "value": ">100"}], "limit": null, "fields": null, "sort": null}
</example>

<example>
Query: "show products under 50 dollars"
Output: {"entity": "products", "operation": "list", "filters": [{"field": "price", "value": "<50"}], "limit": null, "fields": null, "sort": null}
</example>

<example>
Query: "find orders between 50 and 200 dollars"
Output: {"entity": "orders", "operation": "list", "filters": [{"field": "total", "value": "50-200"}], "limit": null, "fields": null, "sort": null}
</example>

<example>
Query: "show users with active or pending status"
Output: {"entity": "users", "operation": "list", "filters": [{"field": "status", "value": "active,pending"}], "limit": null, "fields": null, "sort": null}
</example>

Special cases:
- Comparison operators: Include operator prefix in value
  - "above/over/greater than X" → value: ">X"
  - "below/under/less than X" → value: "<X"
  - "at least X" → value: ">=X"
  - "at most X" → value: "<=X"
- Range queries: Use hyphen format
  - "between X and Y" → value: "X-Y"
- Multiple values: Use comma-separated format
  - "A or B" → value: "A,B"
  - "A and B" (same field) → value: "A,B"
- Date references: Use ISO 8601 format (YYYY-MM-DD) when possible
- Empty results: Return empty filters array [], not null
- Ambiguous terms: Default to most common interpretation
- Field name variations: Match to actual schema column names exactly
`;

/**
 * Parse natural language query into structured intent.
 *
 * @param query Natural language query
 * @returns Structured Intent object
 * @throws IntentParseError if parsing fails
 */
export async function parseIntent(query: string): Promise<Intent> {
  try {
    // Get schema description
    const schema = getSchemaDescription();
    const systemPrompt = INTENT_PARSE_SYSTEM_PROMPT.replace(
      '{schema}',
      schema
    );

    // Call LLM to parse intent with structured outputs (guaranteed schema compliance)
    const result = await callLLMStructured(
      query,
      systemPrompt,
      IntentSchema,
      0.0
    );

    // Convert filters array to object format
    // Handle duplicate fields by merging values with comma separation
    const filtersObject: Record<string, any> = {};
    if (result.filters && Array.isArray(result.filters)) {
      for (const filter of result.filters) {
        if (Object.prototype.hasOwnProperty.call(filtersObject, filter.field)) {
          // Duplicate field detected - merge values
          filtersObject[filter.field] = `${filtersObject[filter.field]},${filter.value}`;
        } else {
          filtersObject[filter.field] = filter.value;
        }
      }
    }

    // Generate normalized text for cache key
    const normalizedData = {
      ...result,
      filters: filtersObject,
    };
    const normalized = normalizeIntentDict(normalizedData);

    // Validate and cast sort field if present
    let sortField: SortSpec | undefined = undefined;
    if (result.sort && typeof result.sort === 'string') {
      if (!isSortSpec(result.sort)) {
        throw new IntentParseError(
          `Invalid sort format: ${result.sort}. Expected format: field:asc or field:desc`
        );
      }
      sortField = result.sort;
    }

    // Create Intent object
    const intent: Intent = {
      entity: result.entity,
      operation: result.operation,
      filters: filtersObject,
      limit: result.limit ?? undefined,
      fields: result.fields ?? undefined,
      sort: sortField,
      normalized_text: normalized,
    };

    logger.info(
      `Parsed intent: ${intent.entity}.${intent.operation} with ${Object.keys(intent.filters).length} filters`
    );
    return intent;
  } catch (error) {
    if (error instanceof LLMError) {
      logger.error(`LLM failed to parse intent: ${error}`);
      throw new IntentParseError(`Failed to understand query: ${error}`);
    }
    logger.error(`Unexpected error parsing intent: ${error}`);
    throw new IntentParseError(`Failed to parse query: ${error}`);
  }
}

/**
 * Normalize intent dictionary to canonical form for cache key generation.
 *
 * CRITICAL: This algorithm must match Python exactly to ensure
 * cache key compatibility between implementations.
 *
 * @param intentData Intent dictionary from LLM
 * @returns Normalized string representation
 */
export function normalizeIntentDict(intentData: Record<string, any>): string {
  // Validate input
  if (!intentData || typeof intentData !== 'object') {
    throw new Error('Invalid intentData: must be a non-null object');
  }

  // Extract key components with safe defaults
  const entity = (intentData.entity || '').toLowerCase().trim();
  const operation = (intentData.operation || '').toLowerCase().trim();
  const filters = intentData.filters || {};
  const limit = intentData.limit;
  const fields = intentData.fields || [];
  const sort = intentData.sort;

  // Normalize filters: sort keys and convert values to lowercase strings
  const normalizedFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    const keyClean = key.toLowerCase().trim();
    const valueClean =
      typeof value === 'string' ? value.toLowerCase().trim() : String(value);
    normalizedFilters[keyClean] = valueClean;
  }

  // Sort filter keys for consistency (using ASCII sort to match Python default)
  const sortedFilters = Object.entries(normalizedFilters).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
  );

  // Build normalized representation
  const parts: string[] = [`entity:${entity}`, `operation:${operation}`];

  if (sortedFilters.length > 0) {
    const filtersStr = sortedFilters.map(([k, v]) => `${k}=${v}`).join(',');
    parts.push(`filters:${filtersStr}`);
  }

  // Check for null/undefined, not truthiness (0 is a valid limit)
  if (limit !== null && limit !== undefined) {
    parts.push(`limit:${limit}`);
  }

  if (fields && fields.length > 0) {
    const fieldsStr = fields
      .map((f: any) => String(f).toLowerCase())
      .sort()
      .join(',');
    parts.push(`fields:${fieldsStr}`);
  }

  if (sort) {
    parts.push(`sort:${String(sort).toLowerCase()}`);
  }

  return parts.join('|');
}

/**
 * Normalize Intent object to canonical form.
 *
 * @param intent Intent object
 * @returns Normalized string representation
 */
export function normalizeIntent(intent: Intent): string {
  return intent.normalized_text;
}

/**
 * Generate unique schema ID from normalized intent.
 *
 * CRITICAL: Must use exact same algorithm as Python (SHA256, first 16 chars)
 * to ensure cache compatibility.
 *
 * @param intent Intent object
 * @returns Schema ID (16-char hash)
 */
export function generateSchemaId(intent: Intent): string {
  const normalized = normalizeIntent(intent);
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return hash.substring(0, 16);
}

/**
 * Remove common articles from text for normalization.
 *
 * @param text Input text
 * @returns Text with articles removed
 */
export function removeArticles(text: string): string {
  // Remove common articles (a, an, the)
  text = text.replace(/\b(a|an|the)\b/gi, '');
  // Remove extra whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Extract keywords from query text.
 *
 * @param text Query text
 * @returns List of keywords
 */
export function extractKeywords(text: string): string[] {
  // Remove articles
  text = removeArticles(text);

  // Split into words
  const words = text.toLowerCase().split(/\s+/);

  // Filter out common words
  const stopWords = new Set([
    'get',
    'show',
    'list',
    'all',
    'me',
    'my',
    'the',
    'a',
    'an',
    'of',
    'for',
    'to',
    'in',
    'on',
  ]);
  const keywords = words.filter((w) => !stopWords.has(w) && w.length > 2);

  return keywords;
}
