/**
 * @nttp/fastify - Fastify plugin for NTTP
 * Adds natural language database query endpoints to your Fastify app
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { NTTP, type NTTPConfig, type QueryOptions } from 'nttp';
import fp from 'fastify-plugin';

export interface NTTPPluginOptions extends NTTPConfig {
  /**
   * Route prefix for NTTP endpoints
   * @default "/nttp"
   */
  prefix?: string;

  /**
   * Enable Swagger documentation
   * @default true
   */
  swagger?: boolean;
}

interface QueryBody {
  query: string;
  useCache?: boolean;
  forceNewSchema?: boolean;
}

interface QueryParams {
  q: string;
  use_cache?: boolean;
  force_new_schema?: boolean;
}

const nttpPlugin: FastifyPluginAsync<NTTPPluginOptions> = async (
  fastify,
  options
) => {
  const { prefix = '/nttp', swagger = true, ...nttpConfig } = options;

  // Initialize NTTP
  const nttp = new NTTP(nttpConfig);
  await nttp.init();

  // Decorate Fastify instance with NTTP
  fastify.decorate('nttp', nttp);

  // Add lifecycle hook to close NTTP on shutdown
  fastify.addHook('onClose', async () => {
    await nttp.close();
  });

  // POST /query - Execute natural language query
  fastify.post<{ Body: QueryBody }>(
    `${prefix}/query`,
    {
      schema: (swagger ? {
        description: 'Execute a natural language database query',
        tags: ['NTTP'],
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query: {
              type: 'string',
              description: 'Natural language query',
              examples: ['get all active users', 'show products under $50'],
            },
            useCache: {
              type: 'boolean',
              description: 'Use schema cache',
              default: true,
            },
            forceNewSchema: {
              type: 'boolean',
              description: 'Force generation of new schema',
              default: false,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              data: { type: 'array' },
              schemaId: { type: 'string' },
              cacheHit: { type: 'boolean' },
              executionTimeMs: { type: 'number' },
              intent: { type: 'object' },
            },
          },
        },
      } : undefined) as any,
    },
    async (request, _reply) => {
      const result = await nttp.query(request.body.query, {
        useCache: request.body.useCache,
        forceNewSchema: request.body.forceNewSchema,
      });
      return result;
    }
  );

  // GET /query - Convenience endpoint
  fastify.get<{ Querystring: QueryParams }>(
    `${prefix}/query`,
    {
      schema: (swagger ? {
        description: 'Execute a natural language query via GET',
        tags: ['NTTP'],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: {
              type: 'string',
              description: 'Natural language query',
            },
            use_cache: {
              type: 'boolean',
              default: true,
            },
            force_new_schema: {
              type: 'boolean',
              default: false,
            },
          },
        },
      } : undefined) as any,
    },
    async (request, _reply) => {
      const result = await nttp.query(request.query.q, {
        useCache: request.query.use_cache,
        forceNewSchema: request.query.force_new_schema,
      });
      return result;
    }
  );

  // POST /explain - Explain query without executing
  fastify.post<{ Body: { query: string } }>(
    `${prefix}/explain`,
    {
      schema: (swagger ? {
        description: 'Explain what SQL would be generated without executing',
        tags: ['NTTP'],
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string' },
          },
        },
      } : undefined) as any,
    },
    async (request, _reply) => {
      const explanation = await nttp.explain(request.body.query);
      return explanation;
    }
  );

  // GET /schemas - List all cached schemas
  fastify.get(
    `${prefix}/schemas`,
    {
      schema: (swagger ? {
        description: 'List all cached query schemas',
        tags: ['NTTP'],
      } : undefined) as any,
    },
    async (_request, _reply) => {
      const schemas = await nttp.listSchemas();
      return { schemas, total: schemas.length };
    }
  );

  // GET /schemas/:id - Get specific schema
  fastify.get<{ Params: { id: string } }>(
    `${prefix}/schemas/:id`,
    {
      schema: (swagger ? {
        description: 'Get a specific cached schema',
        tags: ['NTTP'],
      } : undefined) as any,
    },
    async (request, reply) => {
      const schema = await nttp.getSchema(request.params.id);
      if (!schema) {
        reply.code(404).send({ error: 'Schema not found' });
        return;
      }
      return schema;
    }
  );

  // DELETE /schemas/:id - Delete schema
  fastify.delete<{ Params: { id: string } }>(
    `${prefix}/schemas/:id`,
    {
      schema: (swagger ? {
        description: 'Delete a cached schema',
        tags: ['NTTP'],
      } : undefined) as any,
    },
    async (request, _reply) => {
      await nttp.deleteSchema(request.params.id);
      return { message: 'Schema deleted' };
    }
  );

  // PUT /schemas/:id/pin - Pin schema
  fastify.put<{ Params: { id: string } }>(
    `${prefix}/schemas/:id/pin`,
    {
      schema: (swagger ? {
        description: 'Pin a schema to prevent eviction',
        tags: ['NTTP'],
      } : undefined) as any,
    },
    async (request, _reply) => {
      await nttp.pinSchema(request.params.id);
      return { message: 'Schema pinned' };
    }
  );

  // PUT /schemas/:id/unpin - Unpin schema
  fastify.put<{ Params: { id: string } }>(
    `${prefix}/schemas/:id/unpin`,
    {
      schema: (swagger ? {
        description: 'Unpin a schema',
        tags: ['NTTP'],
      } : undefined) as any,
    },
    async (request, _reply) => {
      await nttp.unpinSchema(request.params.id);
      return { message: 'Schema unpinned' };
    }
  );

  // GET /stats - Get cache statistics
  fastify.get(
    `${prefix}/stats`,
    {
      schema: (swagger ? {
        description: 'Get NTTP cache statistics',
        tags: ['NTTP'],
      } : undefined) as any,
    },
    async (_request, _reply) => {
      const stats = await nttp.getCacheStats();
      const tables = await nttp.getTables();
      return {
        cache: stats,
        database: { tables },
      };
    }
  );
};

// Export as Fastify plugin
export default fp(nttpPlugin, {
  fastify: '4.x',
  name: '@nttp/fastify',
});

// Type augmentation for TypeScript
declare module 'fastify' {
  interface FastifyInstance {
    nttp: NTTP;
  }
}
