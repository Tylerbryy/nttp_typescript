/**
 * Query endpoints for natural language database queries.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QueryRequest } from '../types/models.js';
import { executeQueryWithCache } from '../services/executor.js';

export async function queryRoutes(fastify: FastifyInstance) {
  // POST /query - Main query endpoint
  fastify.post<{ Body: QueryRequest }>(
    '/query',
    {
      schema: {
        description: 'Execute natural language query',
        body: {
          type: 'object',
          properties: {
            query: { type: 'string', minLength: 1, maxLength: 500 },
            use_cache: { type: 'boolean', default: true },
            force_new_schema: { type: 'boolean', default: false },
          },
          required: ['query'],
        },
      },
    },
    async (request: FastifyRequest<{ Body: QueryRequest }>, _reply: FastifyReply) => {
      const result = await executeQueryWithCache(request.body);
      return result;
    }
  );

  // GET /query - Convenience endpoint
  fastify.get<{
    Querystring: { q: string; use_cache?: string | boolean; force_new_schema?: string | boolean };
  }>(
    '/query',
    {
      schema: {
        description: 'Execute natural language query (GET)',
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            use_cache: { type: 'boolean', default: true },
            force_new_schema: { type: 'boolean', default: false },
          },
          required: ['q'],
        },
      },
    },
    async (request, _reply) => {
      // Explicit type coercion for query strings (they arrive as strings)
      const useCache = request.query.use_cache === false ||
                       request.query.use_cache === 'false' ? false : true;
      const forceNewSchema = request.query.force_new_schema === true ||
                            request.query.force_new_schema === 'true' ? true : false;

      const result = await executeQueryWithCache({
        query: request.query.q,
        use_cache: useCache,
        force_new_schema: forceNewSchema,
      });
      return result;
    }
  );
}
