/**
 * Intent parsing and normalization for cache key generation.
 */

import crypto from 'crypto';
import { callClaudeStructured } from './llm.js';
import { Intent } from '../types/models.js';
import { IntentParseError, LLMError } from '../types/errors.js';
import { getSchemaDescription } from './database.js';
import { logger } from '../utils/logger.js';

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
      properties: {
        status: { type: 'string' },
        category: { type: 'string' },
        in_stock: { type: 'boolean' },
        created_at: { type: 'string' },
        user_id: { type: 'integer' },
        order_id: { type: 'integer' },
        product_id: { type: 'integer' },
      },
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
- entity must be one of: users, products, orders, order_items
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
    const result = await callClaudeStructured<any>(
      query,
      systemPrompt,
      INTENT_JSON_SCHEMA,
      0.0
    );

    // Ensure filters is a dict (guaranteed by schema, but defensive programming)
    if (!result.filters) {
      result.filters = {};
    }

    // Generate normalized text for cache key
    const normalized = normalizeIntentDict(result);

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
