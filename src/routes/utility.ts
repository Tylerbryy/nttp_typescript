/**
 * Utility endpoints (health, intents, explain).
 */

import { FastifyInstance } from 'fastify';
import { cache } from '../services/schema-cache.js';
import { parseIntent, generateSchemaId } from '../services/intent.js';
import { generateSql, getSemanticCacheStats } from '../services/executor.js';
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
  // Uses same logic as /query to ensure consistency
  fastify.post<{ Body: QueryRequest }>('/explain', async (request) => {
    const intent = await parseIntent(request.body.query);
    const schemaId = generateSchemaId(intent);
    const cached = await cache.get(schemaId);

    let sql: string;
    let params: any[];
    let cacheHit: boolean;

    if (cached && (request.body.use_cache ?? true)) {
      // Use cached SQL (same as /query endpoint)
      sql = cached.sql;
      params = cached.params;
      cacheHit = true;
    } else {
      // Generate new SQL (cache miss or bypass)
      const sqlResult = await generateSql(intent);
      sql = sqlResult.sql;
      params = sqlResult.params;
      cacheHit = false;
    }

    return {
      query: request.body.query,
      intent: intent,
      sql: sql,
      params: params,
      schema_id: schemaId,
      cache_hit: cacheHit,
      cached_schema: cached ? {
        intent_pattern: cached.intent_pattern,
        use_count: cached.use_count,
        pinned: cached.pinned,
      } : null,
    };
  });

  // GET /stats - Cache statistics (for CLI)
  fastify.get('/stats', async () => {
    const l1Stats = await cache.getStats();
    const l2Stats = getSemanticCacheStats();

    // Calculate total queries and hits across all layers
    const l1Hits = l1Stats.total_uses;
    const l2Hits = l2Stats.hits;
    const l3Calls = l2Stats.misses; // L3 is called when L2 misses

    const totalQueries = l1Hits + l2Hits + l3Calls;

    return {
      cache: {
        l1: {
          total_schemas: l1Stats.total_schemas,
          pinned_schemas: l1Stats.pinned_schemas,
          hit_count: l1Hits,
        },
        l2: {
          size: l2Stats.size,
          max_size: l2Stats.maxSize,
          hit_count: l2Hits,
          miss_count: l2Stats.misses,
        },
        l3: {
          call_count: l3Calls,
        },
      },
      hitRates: {
        l1: totalQueries > 0 ? (l1Hits / totalQueries) * 100 : 0,
        l2: totalQueries > 0 ? (l2Hits / totalQueries) * 100 : 0,
        l3: totalQueries > 0 ? (l3Calls / totalQueries) * 100 : 0,
        overall: totalQueries > 0 ? ((l1Hits + l2Hits) / totalQueries) * 100 : 0,
      },
      costSaved: l1Hits * 0.01 + l2Hits * 0.0099, // L1 saves $0.01, L2 saves $0.0099 (still pays for embedding)
      totalQueries: totalQueries,
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
