/**
 * Utility endpoints (health, intents, explain).
 */

import { FastifyInstance } from 'fastify';
import { cache } from '../services/schema-cache.js';
import { parseIntent, generateSchemaId } from '../services/intent.js';
import { generateSql } from '../services/executor.js';
import { getAllTables } from '../services/database.js';
import { config } from '../config.js';
import { QueryRequest } from '../types/models.js';

export async function utilityRoutes(fastify: FastifyInstance) {
  // GET /intents - List intent patterns
  fastify.get('/intents', async () => {
    const schemas = await cache.listAll();
    const sorted = schemas.sort((a, b) => b.use_count - a.use_count);
    return {
      intents: sorted.map((s) => ({
        pattern: s.intent_pattern,
        schema_id: s.schema_id,
        use_count: s.use_count,
        example_queries: s.example_queries,
      })),
      total: sorted.length,
    };
  });

  // POST /explain - Explain query without executing
  fastify.post<{ Body: QueryRequest }>('/explain', async (request) => {
    const intent = await parseIntent(request.body.query);
    const schemaId = generateSchemaId(intent);
    const cached = await cache.get(schemaId);
    const sqlResult = await generateSql(intent);

    return {
      query: request.body.query,
      intent: intent,
      sql: sqlResult.sql,
      params: sqlResult.params,
      schema_id: schemaId,
      cached_schema: cached || null,
    };
  });

  // GET /health - Health check
  fastify.get('/health', async () => {
    const stats = await cache.getStats();
    const tables = await getAllTables();
    return {
      status: 'ok',
      cache: stats,
      database: {
        client: config.KNEX_CONFIG.client,
        tables: tables,
      },
    };
  });

  // GET / - Root endpoint
  fastify.get('/', async () => {
    return {
      name: 'NTTP API',
      version: '1.0.0',
      description: 'Natural Text Transfer Protocol - TypeScript',
      docs: '/docs',
    };
  });
}
