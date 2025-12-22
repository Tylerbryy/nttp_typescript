# @nttp/fastify

Fastify plugin for NTTP - add natural language database queries to your Fastify app.

## Installation

```bash
npm install @nttp/fastify nttp
```

Plus a database driver:

```bash
npm install pg  # or better-sqlite3, mysql2, mssql
```

## Quick Start

```typescript
import Fastify from 'fastify';
import nttpPlugin from '@nttp/fastify';

const fastify = Fastify({ logger: true });

await fastify.register(nttpPlugin, {
  database: {
    client: 'pg',
    connection: process.env.DATABASE_URL
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY
  }
});

await fastify.listen({ port: 3000 });
// 🚀 API ready at http://localhost:3000
```

## API Endpoints

The plugin adds these routes (default prefix `/nttp`):

### `POST /nttp/query`

Execute natural language query.

**Request:**
```json
{
  "query": "get all active users",
  "useCache": true,
  "forceNewSchema": false
}
```

**Response:**
```json
{
  "query": "get all active users",
  "data": [...],
  "schemaId": "abc123",
  "cacheHit": true,
  "executionTimeMs": 42,
  "intent": {...}
}
```

### `GET /nttp/query?q=...`

Convenience endpoint for simple queries.

```bash
curl "http://localhost:3000/nttp/query?q=show+products+under+$50"
```

### `POST /nttp/explain`

Explain SQL generation without executing.

**Request:**
```json
{
  "query": "top 10 customers by revenue"
}
```

**Response:**
```json
{
  "query": "...",
  "intent": {...},
  "sql": "SELECT ...",
  "params": [],
  "schemaId": "xyz789",
  "cachedSchema": {...}
}
```

### Schema Management

- `GET /nttp/schemas` - List all schemas
- `GET /nttp/schemas/:id` - Get specific schema
- `DELETE /nttp/schemas/:id` - Delete schema
- `PUT /nttp/schemas/:id/pin` - Pin schema
- `PUT /nttp/schemas/:id/unpin` - Unpin schema

### `GET /nttp/stats`

Get cache statistics and database info.

## Configuration

```typescript
await fastify.register(nttpPlugin, {
  // REQUIRED: Database config
  database: {
    client: 'pg',
    connection: process.env.DATABASE_URL
  },

  // REQUIRED: Anthropic config
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5-20250929',  // optional
    maxTokens: 2048  // optional
  },

  // OPTIONAL: Route prefix (default: '/nttp')
  prefix: '/api/query',

  // OPTIONAL: Enable Swagger (default: true)
  swagger: true,

  // OPTIONAL: Query limits
  limits: {
    maxQueryLength: 500,
    defaultLimit: 100,
    maxLimit: 1000
  }
});
```

## Accessing NTTP Instance

The plugin decorates Fastify with the NTTP instance:

```typescript
fastify.nttp.query("get all users");
fastify.nttp.explain("show orders");
fastify.nttp.listSchemas();
```

## Swagger Documentation

When `swagger: true` (default), all endpoints are documented:

```typescript
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

// Register Swagger first
await fastify.register(swagger, {
  openapi: {
    info: {
      title: 'My API',
      version: '1.0.0'
    }
  }
});

await fastify.register(swaggerUi, {
  routePrefix: '/docs'
});

// Then register NTTP
await fastify.register(nttpPlugin, {...});

// Docs at http://localhost:3000/docs
```

## Examples

### With CORS

```typescript
import cors from '@fastify/cors';

await fastify.register(cors);
await fastify.register(nttpPlugin, {...});
```

### Custom Prefix

```typescript
await fastify.register(nttpPlugin, {
  prefix: '/api/nl-query',
  database: {...},
  anthropic: {...}
});

// POST /api/nl-query/query
```

### Multiple Databases

```typescript
// Different NTTP instances for different routes
await fastify.register(async (instance) => {
  await instance.register(nttpPlugin, {
    prefix: '/postgres',
    database: { client: 'pg', connection: pgUrl },
    anthropic: { apiKey }
  });
});

await fastify.register(async (instance) => {
  await instance.register(nttpPlugin, {
    prefix: '/mysql',
    database: { client: 'mysql2', connection: mysqlUrl },
    anthropic: { apiKey }
  });
});
```

## TypeScript

Full TypeScript support with type augmentation:

```typescript
import type { FastifyInstance } from 'fastify';
import type { NTTP } from 'nttp';

// fastify.nttp is fully typed!
declare module 'fastify' {
  interface FastifyInstance {
    nttp: NTTP;
  }
}
```

## Error Handling

```typescript
fastify.setErrorHandler((error, request, reply) => {
  if (error.name === 'IntentParseError') {
    reply.code(400).send({
      error: 'Could not parse query',
      suggestion: 'Try rephrasing your query'
    });
  }
  // ... handle other NTTP errors
});
```

## License

MIT
