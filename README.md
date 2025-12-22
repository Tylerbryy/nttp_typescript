# nttp

**natural text to query**

Ask your database questions in plain English.

[![npm version](https://img.shields.io/npm/v/nttp.svg)](https://www.npmjs.com/package/nttp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

```bash
nttp "show me active users from last week"
```

```json
{
  "data": [{ "id": 1, "email": "user@example.com", "status": "active" }],
  "meta": { "cacheLayer": 2, "latencyMs": 82, "cost": 0.0001 }
}
```

---

## Why nttp?

Every "LLM + SQL" tool calls the LLM for every query. That's **$0.01 and 2-3 seconds per request**.

nttp uses **semantic caching**. Similar questions reuse cached results:

```
"show me active users"  →  LLM         →  $0.01, 2s
"show me active users"  →  Exact hit   →  $0, <1ms
"get active users"      →  Semantic hit →  $0.0001, 80ms
```

**90% cost reduction after warmup.**

---

## How It Works

3-layer cache. Queries cascade through increasingly expensive layers:

```
L1: EXACT       Hash match         $0        <1ms
L2: SEMANTIC    Embedding match    $0.0001   80ms
L3: LLM         Claude API         $0.01     2-3s
```

Most queries hit L1 or L2. Only novel queries reach the LLM.

---

## Quick Start

### Option 1: CLI

```bash
npx create-nttp my-api
cd my-api
npm run dev
```

### Option 2: Library

```bash
npm install nttp
```

```typescript
import { NTTP } from 'nttp';

const db = new NTTP({
  database: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  cache: {
    l2: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
    },
  },
});

await db.init();

const users = await db.query("active users from California");
const orders = await db.query("orders over $500 this month");
const stats = await db.query("total revenue by category");
```

### Option 3: Fastify Plugin

```typescript
import Fastify from 'fastify';
import { nttpPlugin } from 'nttp/fastify';

const app = Fastify();

await app.register(nttpPlugin, {
  database: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  cache: {
    l2: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
    },
  },
});

await app.listen({ port: 8000 });
// POST /query { "query": "active users" }
```

---

## Example Queries

```typescript
// Simple
await db.query("get all users");
await db.query("show products");

// Filtered
await db.query("active users from California");
await db.query("products under $50");
await db.query("orders from last week");

// Aggregations
await db.query("count users by status");
await db.query("total revenue by month");
await db.query("average order value");

// Complex
await db.query("top 10 customers by lifetime value");
await db.query("products with 4+ stars under $100");
await db.query("users who ordered but never reviewed");
```

---

## Architecture

![nttp architecture](public/figure1.jpeg)

---

## API

### POST /query

```bash
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "active users"}'
```

```json
{
  "data": [
    { "id": 1, "email": "user@example.com", "status": "active" }
  ],
  "meta": {
    "sql": "SELECT * FROM users WHERE status = $1",
    "cacheLayer": 2,
    "latencyMs": 82,
    "cost": 0.0001,
    "similarity": 0.94
  }
}
```

### GET /stats

```json
{
  "cache": { "l1": 156, "l2": 89 },
  "hitRates": { "l1": 0.62, "l2": 0.31, "l3": 0.07 },
  "queries": 1247,
  "costSaved": 11.22
}
```

---

## Performance

| Layer | Latency | Cost | When |
|-------|---------|------|------|
| L1: Exact | <1ms | $0 | Same query |
| L2: Semantic | 80ms | $0.0001 | Similar query |
| L3: LLM | 2-3s | $0.01 | Novel query |

After warmup: **90%+ queries hit L1/L2**.

---

## Configuration

```typescript
new NTTP({
  // Database (required)
  database: {
    client: 'pg',  // or 'better-sqlite3', 'mysql2', 'mssql'
    connection: 'postgresql://...',
  },

  // LLM for intent parsing (required)
  llm: {
    provider: 'anthropic',  // or 'openai', 'cohere', 'mistral', 'google'
    model: 'claude-sonnet-4-5-20250929',
    apiKey: 'sk-ant-...',
  },

  // 3-layer cache configuration
  cache: {
    l1: {
      enabled: true,      // Exact match cache (default: true)
      maxSize: 1000,      // Max entries (default: 1000)
    },
    l2: {
      enabled: true,      // Semantic cache (default: true)
      provider: 'openai', // or 'cohere', 'mistral', 'google'
      model: 'text-embedding-3-small',
      apiKey: 'sk-...',
      threshold: 0.85,    // Similarity threshold (default: 0.85)
      maxSize: 500,       // Max entries (default: 500)
    },
  },
});
```

### LLM Providers

```typescript
// Anthropic (default)
llm: {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929',
  apiKey: 'sk-ant-...',
}

// OpenAI
llm: {
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: 'sk-...',
}

// Cohere
llm: {
  provider: 'cohere',
  model: 'command-r-plus',
  apiKey: 'co-...',
}
```

### Embedding Providers

```typescript
// OpenAI (default)
cache: {
  l2: {
    provider: 'openai',
    model: 'text-embedding-3-small',
    apiKey: 'sk-...',
  }
}

// Cohere
cache: {
  l2: {
    provider: 'cohere',
    model: 'embed-english-v3.0',
    apiKey: 'co-...',
  }
}

// Mistral
cache: {
  l2: {
    provider: 'mistral',
    model: 'mistral-embed',
    apiKey: 'ms-...',
  }
}

// Google
cache: {
  l2: {
    provider: 'google',
    model: 'text-embedding-004',
    apiKey: 'goog-...',
  }
}
```

---

## Database Support

| Database | Package | Status |
|----------|---------|--------|
| PostgreSQL | `pg` | ✅ |
| SQLite | `better-sqlite3` | ✅ |
| MySQL | `mysql2` | ✅ |
| SQL Server | `mssql` | ✅ |

---

## Security

- **Read-only by default** — Blocks INSERT, UPDATE, DELETE, DROP
- **Parameterized queries** — SQL injection protection via Knex
- **Input validation** — Zod schemas on all endpoints

---

## CLI

```bash
nttp setup      # Interactive config
nttp dev        # Dev server with hot reload
nttp start      # Production server
nttp stats      # Cache statistics
nttp doctor     # Diagnose issues
```

---

## Use Cases

| Use Case | Fit |
|----------|-----|
| Internal dashboards | ✅ |
| Admin tools | ✅ |
| Prototypes | ✅ |
| AI agents | ✅ |
| High-throughput APIs | ❌ |
| Public APIs | ❌ |

---

## Packages

| Package | Description |
|---------|-------------|
| `nttp` | Core library |
| `create-nttp` | Project scaffolding |
| `nttp/fastify` | Fastify plugin |

---

## Development

```bash
git clone https://github.com/your-org/nttp
cd nttp
npm install
npm run dev
```

---

## Credits

- [Claude](https://anthropic.com) — LLM
- [AI SDK](https://sdk.vercel.ai) — Embeddings
- [Knex.js](https://knexjs.org) — SQL
- [Fastify](https://fastify.dev) — HTTP

---

## License

MIT

---

**natural text to query**