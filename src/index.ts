/**
 * NTTP TypeScript Server - Main Entry Point
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { initDb, closeDb } from './services/database.js';
import { logger, loggerConfig } from './utils/logger.js';
import { queryRoutes } from './routes/query.js';
import { schemaRoutes } from './routes/schemas.js';
import { utilityRoutes } from './routes/utility.js';
import {
  IntentParseError,
  SQLGenerationError,
  SQLExecutionError,
  LLMError,
  CacheError,
} from './types/errors.js';

/**
 * Create and configure Fastify server.
 */
const fastify = Fastify({
  logger: loggerConfig,
});

/**
 * Register CORS plugin.
 */
await fastify.register(cors, {
  origin: '*',
});

/**
 * Register Swagger documentation.
 */
await fastify.register(swagger, {
  openapi: {
    info: {
      title: 'NTTP API',
      description:
        'Natural Text Transfer Protocol - Query databases with natural language',
      version: '1.0.0',
    },
  },
});

await fastify.register(swaggerUi, {
  routePrefix: '/docs',
});

/**
 * Register route handlers.
 */
await fastify.register(queryRoutes);
await fastify.register(schemaRoutes);
await fastify.register(utilityRoutes);

/**
 * Global error handler matching Python exception handlers.
 */
fastify.setErrorHandler((error, _request, reply) => {
  if (error instanceof IntentParseError) {
    reply.status(400).send({
      error: 'IntentParseError',
      message: error.message,
      suggestion: 'Try rephrasing your query with clearer intent',
    });
  } else if (error instanceof SQLGenerationError) {
    reply.status(400).send({
      error: 'SQLGenerationError',
      message: error.message,
      suggestion: 'The query could not be translated to SQL',
    });
  } else if (error instanceof SQLExecutionError) {
    reply.status(500).send({
      error: 'SQLExecutionError',
      message: error.message,
    });
  } else if (error instanceof LLMError) {
    reply.status(502).send({
      error: 'LLMError',
      message: 'Language model service unavailable',
      detail: error.message,
    });
  } else if (error instanceof CacheError) {
    reply.status(400).send({
      error: 'CacheError',
      message: error.message,
    });
  } else {
    reply.status(500).send({
      error: 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * Lifecycle hooks.
 */
fastify.addHook('onReady', async () => {
  logger.info('Starting NTTP API server...');
  await initDb();
  logger.info('Database initialized');
});

fastify.addHook('onClose', async () => {
  logger.info('Shutting down NTTP API server...');
  closeDb();
});

/**
 * Start the server.
 */
const start = async () => {
  try {
    await fastify.listen({ port: 8000, host: '0.0.0.0' });
    logger.info('Server running at http://localhost:8000');
    logger.info('API docs at http://localhost:8000/docs');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
