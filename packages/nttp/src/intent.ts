/**
 * Intent parsing and normalization for cache key generation.
 */

import crypto from 'crypto';
import type { Intent, OperationType } from './types.js';
import { IntentParseError, LLMError } from './errors.js';
import type { LLMService } from './llm.js';
import type { JsonObject, JsonValue, FilterConditions, SortSpec } from './utils.js';

/**
 * JSON Schema for intent parsing (for structured outputs).
 */
const INTENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    entity: {
      type: 'string',
      description:
        'Target table name (users, products, orders, or order_items)',
    },
    operation: {
      type: 'string',
      enum: ['list', 'count', 'aggregate', 'filter'],
      description: 'Operation type',
    },
    filters: {
      type: 'object',
      description: 'Filter conditions as key-value pairs',
      additionalProperties: false,
    },
    limit: {
      type: ['integer', 'null'],
      description: 'Result limit, or null for default',
    },
    fields: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description: 'Specific fields to return, or null for all fields',
    },
    sort: {
      type: ['string', 'null'],
      description: "Sort specification (e.g., 'created_at:desc'), or null",
    },
  },
  required: ['entity', 'operation'],
  additionalProperties: false,
};

/**
 * Raw intent response from LLM before normalization.
 */
interface RawIntent {
	entity: string;
	operation: OperationType;
	filters?: FilterConditions;
	limit?: number | null;
	fields?: string[] | null;
	sort?: SortSpec | null;
}

/**
 * System prompt for intent parsing.
 */
const INTENT_PARSE_SYSTEM_PROMPT = `You are an expert at parsing natural language database queries.
Extract structured intent from user queries about an e-commerce database.

{schema}

Return JSON with this exact structure:
{
  "entity": "<table_name>",
  "operation": "<list|count|aggregate|filter>",
  "filters": {"<field>": "<value>"},
  "limit": <number or null>,
  "fields": [<field names>] or null,
  "sort": "<field:asc|desc>" or null
}

Rules:
- entity must be a valid table name from the schema above
- operation: "list" for SELECT, "count" for COUNT, "aggregate" for SUM/AVG/etc
- filters: extract conditions (e.g., "active users" -> {"status": "active"})
- limit: extract limit if specified, otherwise null
- fields: specific fields requested, or null for all fields
- sort: sorting specification if mentioned

Examples:
- "get all active users" -> {"entity": "users", "operation": "list", "filters": {"status": "active"}, "limit": null}
- "show me 10 products" -> {"entity": "products", "operation": "list", "filters": {}, "limit": 10}
- "count pending orders" -> {"entity": "orders", "operation": "count", "filters": {"status": "pending"}, "limit": null}
`;

/**
 * Service for parsing natural language into structured intents.
 */
export class IntentParser {
  constructor(private llm: LLMService) {}

  /**
   * Parse natural language query into structured intent.
   *
   * @param query Natural language query
   * @param schemaDescription Database schema description
   * @returns Structured Intent object
   * @throws IntentParseError if parsing fails
   */
  async parse(query: string, schemaDescription: string): Promise<Intent> {
    try {
      // Prepare system prompt with schema
      const systemPrompt = INTENT_PARSE_SYSTEM_PROMPT.replace(
        '{schema}',
        schemaDescription
      );

      // Call LLM to parse intent with structured outputs (guaranteed schema compliance)
      const result = await this.llm.callStructured<JsonValue>(
        query,
        systemPrompt,
        INTENT_JSON_SCHEMA as JsonObject,
        0.0
      ) as unknown as RawIntent;

      // Ensure filters is a dict (guaranteed by schema, but defensive programming)
      if (!result.filters) {
        result.filters = {};
      }

      // Generate normalized text for cache key
      const normalized = this.normalizeIntentDict(result);

      // Create Intent object
      const intent: Intent = {
        entity: result.entity,
        operation: result.operation,
        filters: result.filters || {},
        limit: result.limit,
        fields: result.fields,
        sort: result.sort,
        normalized_text: normalized,
      };

      return intent;
    } catch (error) {
      if (error instanceof LLMError) {
        throw new IntentParseError(`Failed to understand query: ${error}`);
      }
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
  normalizeIntentDict(intentData: RawIntent): string {
    // Extract key components
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

    // Sort filter keys for consistency
    const sortedFilters = Object.entries(normalizedFilters).sort(
      ([a], [b]) => a.localeCompare(b)
    );

    // Build normalized representation
    const parts: string[] = [`entity:${entity}`, `operation:${operation}`];

    if (sortedFilters.length > 0) {
      const filtersStr = sortedFilters.map(([k, v]) => `${k}=${v}`).join(',');
      parts.push(`filters:${filtersStr}`);
    }

    if (limit) {
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
   * Generate unique schema ID from intent.
   *
   * CRITICAL: Must use exact same algorithm as Python (SHA256, first 16 chars)
   * to ensure cache compatibility.
   *
   * @param intent Intent object
   * @returns Schema ID (16-char hash)
   */
  generateSchemaId(intent: Intent): string {
    const normalized = intent.normalized_text;
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    return hash.substring(0, 16);
  }
}
