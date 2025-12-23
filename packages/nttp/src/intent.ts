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
 * System prompt for intent parsing with Claude 4.x best practices.
 * Enhanced with context, reasoning guidance, and model self-knowledge.
 */
const INTENT_PARSE_SYSTEM_PROMPT = `You are an expert natural language understanding system specializing in database query intent extraction. Your role is to bridge human communication and database operations by accurately interpreting user requests.

WHY THIS MATTERS:
- Accuracy: Incorrect intent parsing leads to wrong results or failed queries
- User trust: Users rely on you to understand their natural phrasing
- Efficiency: Proper normalization enables intelligent caching
- Data safety: Correct entity identification prevents accessing wrong tables

{schema}

YOUR TASK:
Parse natural language queries into structured intents that can be safely converted to SQL. You excel at:
- Understanding implicit information (e.g., "active users" implies status filter)
- Normalizing different phrasings to the same intent (e.g., "get users" = "show users")
- Extracting numeric limits and sorting preferences
- Identifying aggregation operations (count, sum, average)

RESPONSE STRUCTURE:
Return JSON matching this exact schema:
{
  "entity": "<table_name>",
  "operation": "<list|count|aggregate|filter>",
  "filters": {"<field>": "<value>"},
  "limit": <number or null>,
  "fields": [<field names>] or null,
  "sort": "<field:asc|desc>" or null
}

FIELD REQUIREMENTS:

1. entity (string, required)
   WHY: Determines which database table to query
   - Must be a valid table name from the schema above
   - Use singular or plural form as defined in schema
   - Common variations: users/user, products/product, orders/order

2. operation (string, required)
   WHY: Determines the type of SQL query to generate
   - "list": Retrieve rows (SELECT * FROM ...)
   - "count": Count rows (SELECT COUNT(*) FROM ...)
   - "aggregate": Sum, average, min, max operations
   - "filter": Same as list, but emphasizes filtering focus

3. filters (object, optional, default: {})
   WHY: Extracts conditions to narrow results
   - Key: field name from schema
   - Value: expected value (as string)
   - Implicit filters: "active users" → {"status": "active"}
   - Explicit filters: "users from California" → {"state": "California"}
   - Multiple filters: "active users from NY" → {"status": "active", "state": "NY"}

4. limit (integer or null, optional)
   WHY: Controls result set size for performance
   - Extract explicit numbers: "5 users", "top 10 products"
   - Common phrases: "top N" = N, "first N" = N
   - null if not specified (system will apply default)

5. fields (array of strings or null, optional)
   WHY: Allows selecting specific columns instead of all
   - null means "all fields" (SELECT *)
   - Array means specific fields (SELECT field1, field2)
   - Example: "show user emails" → ["email"]

6. sort (string or null, optional)
   WHY: Specifies result ordering
   - Format: "field:direction" where direction is "asc" or "desc"
   - Extract from phrases: "newest first" → "created_at:desc"
   - "highest price" → "price:desc", "alphabetically" → "name:asc"
   - null if not mentioned

EXAMPLES WITH REASONING:

Example 1 - Simple with implicit filter:
Query: "get all active users"
Reasoning:
- "users" → entity: "users"
- "get all" → operation: "list" (retrieve rows)
- "active" → implicit filter on status field
- No limit mentioned → limit: null
- No specific fields → fields: null
- No sorting → sort: null
Result: {"entity": "users", "operation": "list", "filters": {"status": "active"}, "limit": null, "fields": null, "sort": null}

Example 2 - With explicit limit:
Query: "show me 10 products"
Reasoning:
- "products" → entity: "products"
- "show me" → operation: "list"
- "10" → explicit limit
- No filters → filters: {}
Result: {"entity": "products", "operation": "list", "filters": {}, "limit": 10, "fields": null, "sort": null}

Example 3 - Count operation:
Query: "count pending orders"
Reasoning:
- "orders" → entity: "orders"
- "count" → operation: "count" (aggregation)
- "pending" → implicit filter on status
- Count operations don't need limit
Result: {"entity": "orders", "operation": "count", "filters": {"status": "pending"}, "limit": null, "fields": null, "sort": null}

Example 4 - Sorting and limit:
Query: "top 5 most expensive products"
Reasoning:
- "products" → entity: "products"
- "top 5" → limit: 5
- "most expensive" → sort by price descending
- operation: "list" (retrieving rows)
Result: {"entity": "products", "operation": "list", "filters": {}, "limit": 5, "fields": null, "sort": "price:desc"}

Example 5 - Specific fields:
Query: "show user emails and names"
Reasoning:
- "user" → entity: "users"
- "show" → operation: "list"
- "emails and names" → specific fields requested
Result: {"entity": "users", "operation": "list", "filters": {}, "limit": null, "fields": ["email", "name"], "sort": null}

Example 6 - Complex with multiple filters:
Query: "active premium users from California"
Reasoning:
- "users" → entity: "users"
- "active" → filter: status = "active"
- "premium" → filter: tier = "premium" (or subscription_type)
- "from California" → filter: state = "California"
Result: {"entity": "users", "operation": "list", "filters": {"status": "active", "tier": "premium", "state": "California"}, "limit": null, "fields": null, "sort": null}

IMPORTANT GUIDELINES:
- When uncertain about a filter field name, use the most obvious choice from schema
- Normalize different phrasings: "get", "show", "list", "retrieve" all mean operation: "list"
- Be generous with implicit filters: common adjectives often map to status fields
- Always return valid JSON with all required fields
- Use null for optional fields when not specified, don't omit them

Your expertise in natural language understanding makes database queries accessible to everyone.`;

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
