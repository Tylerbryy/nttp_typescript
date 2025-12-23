# NTTP - Natural Text Transfer Protocol

> Query databases with natural language using an LLM

```bash
npx nttp setup
npx nttp query "show me 5 users"
```

## Quick Start

### 1. Install

```bash
npm install nttp
```

### 2. Setup

**Interactive (recommended):**

```bash
npx nttp setup
```

**Non-interactive (for agents/CI):**

```bash
npx nttp setup --non-interactive \
  --database-type=pg \
  --database-url=postgresql://user:pass@localhost:5432/db \
  --llm-provider=anthropic \
  --llm-api-key=sk-ant-...
```

### 3. Query

**CLI:**

```bash
npx nttp query "show active users"
npx nttp query "count pending orders"
npx nttp query "top 10 products by price"
```

**Code:**

```typescript
import { NTTP } from 'nttp';

const nttp = await NTTP.fromEnv();
const result = await nttp.query("show active users");
console.log(result.data);
await nttp.close();
```

---

## How It Works

3-layer caching system optimizes cost and performance:

```
L1: EXACT       Hash match         $0        <1ms (in-memory) or ~5ms (Redis)
L2: SEMANTIC    Embedding match    $0.0001   80ms
L3: LLM         Claude/GPT         $0.01     2-3s
```

Most queries hit L1 or L2. Only novel queries reach the LLM.

---

## Features

- **Natural Language Queries** - "show active users" → `SELECT * FROM users WHERE status = 'active'`
- **3-Layer Caching** - Exact, semantic, and LLM-generated query caching
- **Multi-LLM Support** - Claude, GPT-4, Cohere, Mistral, Gemini
- **Multi-Database** - PostgreSQL, MySQL, SQLite, SQL Server
- **Redis Persistence** - Optional cache persistence across restarts
- **Type-Safe** - Full TypeScript support
- **CLI + SDK** - Use from command line or code

---

## Documentation

- **Quick Reference:** `npx nttp docs [topic]`
- **Full Guides:** [/docs](/docs)

### Guides

- [API Reference](docs/api.md) - Complete API documentation
- [Caching System](docs/caching.md) - 3-layer cache deep dive
- [Configuration](docs/configuration.md) - All config options
- [LLM Models](docs/models.md) - Model selection guide
- [Examples](docs/examples.md) - Usage examples
- [Production](docs/production.md) - Deployment best practices
- [Troubleshooting](docs/troubleshooting.md) - Common issues

---

## Example Queries

```typescript
// Simple
await nttp.query("show users");
await nttp.query("list products");

// Filtered
await nttp.query("active users from California");
await nttp.query("products under $50");

// Aggregations
await nttp.query("count pending orders");
await nttp.query("total revenue by category");

// Complex
await nttp.query("top 10 products by revenue");
await nttp.query("users who joined this year");
```

---

## Configuration

### Environment Variables (`.env`)

```bash
# Database
DATABASE_TYPE=pg
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb

# LLM
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-...

# Cache (optional but recommended)
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...  # For L2 semantic cache
```

### Programmatic

```typescript
const nttp = new NTTP({
  database: {
    client: 'pg',
    connection: 'postgresql://user:pass@localhost:5432/mydb'
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  cache: {
    redis: { url: 'redis://localhost:6379' },
    l2: { enabled: true, provider: 'openai', apiKey: process.env.OPENAI_API_KEY }
  }
});

await nttp.init();
```

See [Configuration Guide](docs/configuration.md) for all options.

---

## Performance

- **L1 Cache (Exact):** <1ms (in-memory) or ~5ms (Redis) - $0
- **L2 Cache (Semantic):** ~75ms - ~$0.0001
- **L3 (LLM):** 2-3s - ~$0.01
- **Throughput:** >10,000 req/s (cached)

**Cost Savings:** With caching, 90%+ cost reduction after warm-up.

---

## Supported Databases

- **PostgreSQL** - Recommended for production
- **MySQL** - Widely supported
- **SQLite** - Perfect for development
- **SQL Server** - Enterprise-ready

---

## Supported LLMs

- **Anthropic Claude** (recommended) - Best SQL generation
- **OpenAI GPT** - Fast and reliable
- **Cohere** - Enterprise support
- **Mistral** - Open-source preference
- **Google Gemini** - Multimodal capabilities

See [Model Selection Guide](docs/models.md) for detailed comparison.

---

## CLI Commands

```bash
# Setup wizard
npx nttp setup

# Query database
npx nttp query "your question"
npx nttp query "show users" --format json

# Documentation
npx nttp docs                    # Show all docs
npx nttp docs redis              # Search for "redis"
npx nttp docs "semantic cache"   # Multi-word search
```

---

## API Overview

```typescript
import { NTTP } from 'nttp';

// Initialize from environment variables
const nttp = await NTTP.fromEnv();

// Execute query
const result = await nttp.query("show active users");
console.log(result.data);        // Query results
console.log(result.cacheHit);    // true/false
console.log(result.meta);        // Cache metadata

// Explain query (without executing)
const explanation = await nttp.explain("show users");
console.log(explanation.sql);    // Generated SQL

// Database inspection
const tables = await nttp.getTables();
const schema = await nttp.getTableSchema('users');

// Cache management
const stats = await nttp.getCacheStats();
await nttp.pinSchema(schemaId);

// Clean up
await nttp.close();
```

See [API Reference](docs/api.md) for complete documentation.

---

## Error Handling

```typescript
import { IntentParseError, SQLGenerationError, SQLExecutionError } from 'nttp';

try {
  const result = await nttp.query("your query");
} catch (error) {
  if (error instanceof IntentParseError) {
    console.error('Could not understand query');
    console.log('Suggestions:', error.suggestions);
  } else if (error instanceof SQLGenerationError) {
    console.error('Could not generate SQL');
  } else if (error instanceof SQLExecutionError) {
    console.error('Query execution failed');
  }
}
```

All errors include helpful suggestions. See [Troubleshooting Guide](docs/troubleshooting.md).

---

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

---

## Examples

- [Basic Usage](docs/examples.md#basic-queries)
- [Express Integration](docs/examples.md#using-with-express)
- [Next.js Integration](docs/examples.md#using-with-nextjs)
- [CLI Tools](docs/examples.md#cli-integration)

---

## Links

- [GitHub](https://github.com/tylergibbs/nttp)
- [npm](https://www.npmjs.com/package/nttp)
- [Issues](https://github.com/tylergibbs/nttp/issues)
- [Documentation](/docs)

---

## License

MIT
