# NTTP - Natural Text Transfer Protocol

Query databases with natural language using an LLM.

## Installation

```bash
npm install nttp
```

## Quick Start with CLI (Recommended)

The easiest way to get started is with our **interactive setup wizard** (powered by [Ink](https://github.com/vadimdemedes/ink) for a beautiful CLI experience):

```bash
npx nttp setup
```

This will:
- ✅ Guide you through database configuration
- ✅ Help you choose an LLM provider
- ✅ Automatically install required dependencies
- ✅ Create your `.env` file
- ✅ Generate example code

Then query your database:

```bash
npx nttp query "show me 5 users"
```

Or use in your code:

```typescript
import { NTTP } from 'nttp';

// Load configuration from .env automatically
const nttp = await NTTP.fromEnv();
const result = await nttp.query("show me users");
await nttp.close();
```

## Manual Setup (Advanced)

```typescript
import { NTTP } from 'nttp';

const nttp = new NTTP({
  database: {
    client: 'pg',
    connection: process.env.DATABASE_URL
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    apiKey: process.env.ANTHROPIC_API_KEY
  }
});

// Initialize (connects to database, builds schema cache)
await nttp.init();

// Query naturally!
const users = await nttp.query("get all active users");
console.log(users.data); // Array of users

// Close when done
await nttp.close();
```

## API Reference

### `new NTTP(config)`

Create a new NTTP instance.

**Config:**
```typescript
{
  database: {
    client: 'pg' | 'mysql2' | 'better-sqlite3' | 'mssql',
    connection: string | object  // Knex connection config
  },
  llm: {
    provider: 'anthropic' | 'openai' | 'cohere' | 'mistral' | 'google',
    model: string,  // e.g., 'claude-sonnet-4-5-20250929', 'gpt-4o'
    apiKey: string,
    maxTokens?: number  // Default: 2048
  },
  cache?: {
    l1?: {
      enabled?: boolean,  // Default: true
      maxSize?: number    // Default: 1000
    },
    l2?: {
      enabled?: boolean,  // Default: false
      provider?: 'openai',
      model?: string,     // e.g., 'text-embedding-3-small'
      apiKey?: string,
      maxSize?: number,   // Default: 500
      similarityThreshold?: number  // Default: 0.85
    },
    redis?: {
      url: string  // Redis connection URL for L1 cache persistence
    }
  },
  limits?: {
    maxQueryLength?: number,  // Default: 500
    defaultLimit?: number,  // Default: 100
    maxLimit?: number  // Default: 1000
  }
}
```

### `nttp.init()`

Initialize NTTP. Must be called before querying.

```typescript
await nttp.init();
```

### `nttp.query(query, options?)`

Execute a natural language query.

```typescript
const result = await nttp.query("show pending orders over $500");

// Result structure:
{
  query: string,           // Original query
  data: any[],            // Query results
  schemaId: string,       // Cache key
  cacheHit: boolean,      // Was cached?
  executionTimeMs: number, // Execution time
  intent: {...},          // Parsed intent
  sql?: string,           // Generated SQL (debug)
  params?: any[]          // SQL parameters (debug)
}
```

**Options:**
```typescript
{
  useCache?: boolean,       // Use cache (default: true)
  forceNewSchema?: boolean  // Force new schema (default: false)
}
```

### `nttp.explain(query)`

Explain what SQL would be generated without executing.

```typescript
const explanation = await nttp.explain("top 10 customers by revenue");

// Returns:
{
  query: string,
  intent: {...},
  sql: string,
  params: any[],
  schemaId: string,
  cachedSchema: SchemaDefinition | null
}
```

### Schema Management

```typescript
// List all cached schemas
const schemas = await nttp.listSchemas();

// Get specific schema
const schema = await nttp.getSchema(schemaId);

// Delete schema
await nttp.deleteSchema(schemaId);

// Pin schema (prevent eviction)
await nttp.pinSchema(schemaId);

// Unpin schema
await nttp.unpinSchema(schemaId);

// Get cache statistics
const stats = await nttp.getCacheStats();
```

### Database Inspection

```typescript
// Get all tables
const tables = await nttp.getTables();

// Get table schema
const schema = await nttp.getTableSchema('users');

// Get schema description (for LLM)
const description = nttp.getSchemaDescription();
```

## Example Queries

```typescript
// Simple queries
await nttp.query("get all users");
await nttp.query("show products");
await nttp.query("list orders");

// Filtered queries
await nttp.query("active users only");
await nttp.query("products in Electronics category");
await nttp.query("pending orders");

// With limits
await nttp.query("top 10 products by price");
await nttp.query("show me 5 recent orders");

// Aggregations
await nttp.query("count all users");
await nttp.query("total revenue by category");
await nttp.query("average order value");

// Complex conditions
await nttp.query("products with 4+ star rating under $100");
await nttp.query("orders from California in the last 30 days");
await nttp.query("users who joined this year");
```

## Database Support

NTTP works with any SQL database supported by Knex.js:

- **PostgreSQL** - Recommended for production
- **MySQL** - Widely supported
- **SQLite** - Perfect for development
- **SQL Server** - Enterprise-ready

## Performance

- **Cache Hit**: <50ms average
- **Cache Miss**: ~2-3s (LLM call)
- **Throughput**: >10,000 req/s (cached)

## Cache Persistence with Redis

By default, L1 cache uses in-memory storage that resets on each process restart. For production deployments or CLI usage, enable Redis to persist cache across invocations:

```typescript
const nttp = new NTTP({
  database: {
    client: 'pg',
    connection: process.env.DATABASE_URL
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  cache: {
    redis: {
      url: 'redis://localhost:6379'
    }
  }
});
```

Or via environment variables with `NTTP.fromEnv()`:

```bash
# .env file
REDIS_URL=redis://localhost:6379
```

**Benefits:**
- ✅ Cache persists across CLI invocations
- ✅ Shared cache in multi-instance deployments
- ✅ Reduced cold-start latency
- ✅ 24-hour TTL for cached entries

**Performance with Redis:**
- L1 cache hit: ~5ms (vs <1ms in-memory)
- Still 400x faster than LLM call
- Negligible latency increase for significant persistence benefits

## CLI Commands

### `npx nttp setup`

Beautiful interactive setup wizard (powered by Ink) with Vercel-inspired DX:

- Choose database type (PostgreSQL, MySQL, SQLite, SQL Server)
- Configure connection details
- Select LLM provider (Anthropic, OpenAI, Cohere, Mistral, Google)
- Optional: Enable Redis cache (L1 persistence)
- Optional: Enable semantic caching (L2 cache)
- Automatically installs dependencies
- Creates `.env` file
- Generates example code

### `npx nttp init`

Alias for `npx nttp setup`. Quick project initialization.

### `npx nttp query <text>`

Execute a natural language query from the command line:

```bash
npx nttp query "show me 5 products"
npx nttp query "count active users"
npx nttp query "top 10 customers by revenue" --format json
```

Options:
- `--format <type>` - Output format: `table` (default) or `json`

## Error Handling

```typescript
import { IntentParseError, SQLGenerationError, SQLExecutionError } from 'nttp';

try {
  const result = await nttp.query("ambiguous query");
} catch (error) {
  if (error instanceof IntentParseError) {
    console.error('Could not understand query');
  } else if (error instanceof SQLGenerationError) {
    console.error('Could not generate SQL');
  } else if (error instanceof SQLExecutionError) {
    console.error('SQL execution failed');
  }
}
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  NTTPConfig,
  QueryResult,
  Intent,
  SchemaDefinition,
  CacheStats
} from 'nttp';
```

## License

MIT
