/**
 * Schema management endpoints.
 */

import { FastifyInstance } from 'fastify';
import { cache } from '../services/schema-cache.js';

export async function schemaRoutes(fastify: FastifyInstance) {
  // GET /schemas - List all schemas
  fastify.get('/schemas', async () => {
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
  });

  // GET /schemas/:id - Get specific schema
  fastify.get<{ Params: { schema_id: string } }>(
    '/schemas/:schema_id',
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
    async (request) => {
      await cache.delete(request.params.schema_id);
      return { message: 'Schema deleted' };
    }
  );

  // PUT /schemas/:id/pin - Pin schema
  fastify.put<{ Params: { schema_id: string } }>(
    '/schemas/:schema_id/pin',
    async (request) => {
      await cache.pin(request.params.schema_id);
      return { message: 'Schema pinned' };
    }
  );

  // PUT /schemas/:id/unpin - Unpin schema
  fastify.put<{ Params: { schema_id: string } }>(
    '/schemas/:schema_id/unpin',
    async (request) => {
      await cache.unpin(request.params.schema_id);
      return { message: 'Schema unpinned' };
    }
  );
}
