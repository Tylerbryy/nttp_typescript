/**
 * Schema management endpoints.
 */

import { FastifyInstance } from 'fastify';
import { cache } from '../services/cache/index.js';

export async function schemaRoutes(fastify: FastifyInstance) {
  // Common params schema for Swagger documentation
  const ParamsSchema = {
    type: 'object',
    properties: {
      schema_id: { type: 'string', description: 'Schema identifier' },
    },
    required: ['schema_id'],
  };

  // GET /schemas - List all schemas
  fastify.get(
    '/schemas',
    {
      schema: {
        description: 'List all cached schemas',
        tags: ['Schemas'],
        response: {
          200: {
            type: 'object',
            properties: {
              schemas: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    schema_id: { type: 'string' },
                    intent_pattern: { type: 'string' },
                    use_count: { type: 'number' },
                    pinned: { type: 'boolean' },
                    created_at: { type: 'string', format: 'date-time' },
                    last_used_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
              total: { type: 'number' },
            },
          },
        },
      },
    },
    async () => {
      const schemas = await cache.listAll();
      return {
        schemas: schemas.map((s) => ({
          schema_id: s.schema_id,
          intent_pattern: s.intent_pattern,
          use_count: s.use_count,
          pinned: s.pinned,
          created_at: s.created_at,
          last_used_at: s.last_used_at,
        })),
        total: schemas.length,
      };
    }
  );

  // GET /schemas/:id - Get specific schema
  fastify.get<{ Params: { schema_id: string } }>(
    '/schemas/:schema_id',
    {
      schema: {
        description: 'Get schema details by ID',
        tags: ['Schemas'],
        params: ParamsSchema,
        response: {
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const schema = await cache.get(request.params.schema_id);
      if (!schema) {
        reply.status(404).send({ error: 'Schema not found' });
        return;
      }
      return schema;
    }
  );

  // DELETE /schemas/:id - Delete schema
  fastify.delete<{ Params: { schema_id: string } }>(
    '/schemas/:schema_id',
    {
      schema: {
        description: 'Delete a cached schema (fails if pinned)',
        tags: ['Schemas'],
        params: ParamsSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // cache.delete returns boolean: true if deleted, false if not found
      // throws CacheError if schema is pinned (caught by global error handler)
      const deleted = await cache.delete(request.params.schema_id);

      if (!deleted) {
        reply.status(404).send({ error: 'Schema not found' });
        return;
      }

      return { message: 'Schema deleted' };
    }
  );

  // PUT /schemas/:id/pin - Pin schema
  fastify.put<{ Params: { schema_id: string } }>(
    '/schemas/:schema_id/pin',
    {
      schema: {
        description: 'Pin a schema to prevent eviction',
        tags: ['Schemas'],
        params: ParamsSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // cache.pin returns boolean: true if pinned, false if not found
      const success = await cache.pin(request.params.schema_id);

      if (!success) {
        reply.status(404).send({ error: 'Schema not found' });
        return;
      }

      return { message: 'Schema pinned' };
    }
  );

  // PUT /schemas/:id/unpin - Unpin schema
  fastify.put<{ Params: { schema_id: string } }>(
    '/schemas/:schema_id/unpin',
    {
      schema: {
        description: 'Unpin a schema to allow eviction',
        tags: ['Schemas'],
        params: ParamsSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // cache.unpin returns boolean: true if unpinned, false if not found
      const success = await cache.unpin(request.params.schema_id);

      if (!success) {
        reply.status(404).send({ error: 'Schema not found' });
        return;
      }

      return { message: 'Schema unpinned' };
    }
  );
}
