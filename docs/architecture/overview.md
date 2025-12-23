# nttp

**natural text to query**

Ask your database questions in plain English.

---

## What is nttp?

nttp is a natural language query layer for SQL databases. Instead of writing SQL, you write questions:

```bash
nttp "show me active users from last week"
```

```json
{
  "data": [
    { "id": 1, "email": "user@example.com", "status": "active", "created_at": "2024-01-15" }
  ],
  "meta": {
    "sql": "SELECT * FROM users WHERE status = $1 AND created_at > $2",
    "latencyMs": 82,
    "cacheLayer": 2
  }
}
```

## Why nttp?

**The problem:** Every "LLM + SQL" tool calls the LLM for every query. That's $0.01 and 2-3 seconds per request.

**The solution:** Semantic caching. If you've asked a similar question before, nttp reuses the cached result without calling the LLM.

```
"show me active users"  →  First time    →  LLM ($0.01, 2s)
"show me active users"  →  Exact match   →  Cache ($0, <1ms)
"get active users"      →  Similar match →  Cache ($0.0001, 80ms)
```

**Result: 90% cost reduction after warmup.**

---

## Architecture

nttp uses a 3-layer cache. Each layer is progressively more expensive:

```
┌─────────────────────────────────────────────────────┐
│                    nttp                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  L1: EXACT MATCH (In-Memory or Redis)               │
│  Hash(query) → cached result                        │
│  Cost: $0 | Latency: <1ms (memory) or ~5ms (Redis)  │
│  Redis: Persists across restarts & multi-instance   │
│                                                     │
│  L2: SEMANTIC MATCH                                 │
│  embed(query) → cosine similarity → cached result   │
│  Cost: ~$0.0001 | Latency: 50-100ms                 │
│                                                     │
│  L3: LLM                                            │
│  Parse intent → Generate SQL → Execute              │
│  Cost: ~$0.01 | Latency: 2-3s                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Queries cascade through layers. Most hit L1 or L2 after warmup.

---

## How It Works

### Layer 1: Exact Match

Simple hash lookup. If you've asked this exact question before, return instantly.

**In-Memory (default):**
```typescript
class ExactCache {
  private cache = new Map<string, CachedResult>();

  async get(query: string): Promise<CachedResult | null> {
    const key = query.toLowerCase().trim();
    return this.cache.get(key) ?? null;
  }
}
```

**Redis (persistent):**
```typescript
import Redis from 'ioredis';

class RedisExactCache {
  private redis: Redis;

  async get(query: string): Promise<CachedResult | null> {
    const cached = await this.redis.get(`nttp:l1:${query}`);
    return cached ? JSON.parse(cached) : null;
  }
}
```

**When to use Redis:**
- CLI usage (cache persists across `npx nttp query` invocations)
- Multi-instance deployments (shared cache)
- Production servers (survives restarts)

### Layer 2: Semantic Match

Uses AI SDK embeddings to find similar queries. "get active users" matches "show me active users" with 0.97 similarity.

```typescript
import { embed, cosineSimilarity } from 'ai';
import { openai } from '@ai-sdk/openai';

class SemanticCache {
  private entries: Array<{ embedding: number[]; result: CachedResult }> = [];
  private model = openai.embeddingModel('text-embedding-3-small');
  
  async find(query: string): Promise<CachedResult | null> {
    const { embedding } = await embed({ model: this.model, value: query });
    
    for (const entry of this.entries) {
      if (cosineSimilarity(embedding, entry.embedding) >= 0.92) {
        return entry.result;
      }
    }
    return null;
  }
}
```

### Layer 3: LLM

Full pipeline for novel queries. Parses intent, generates SQL, executes, and populates L1+L2 for future queries.

```typescript
import Anthropic from '@anthropic-ai/sdk';

class LLMParser {
  private client = new Anthropic();
  
  async parse(query: string, schemas: string): Promise<{ sql: string; params: any[] }> {
    // 1. Parse intent
    // 2. Generate parameterized SQL
    // 3. Return result
  }
}
```

### The Pipeline

```typescript
async function query(text: string): Promise<Result> {
  // L1: Exact match
  const l1 = exactCache.get(text);
  if (l1) return execute(l1, { layer: 1 });
  
  // L2: Semantic match  
  const { embedding } = await embed({ model, value: text });
  const l2 = await semanticCache.find(text);
  if (l2) {
    exactCache.set(text, l2);  // Promote to L1
    return execute(l2, { layer: 2 });
  }
  
  // L3: LLM
  const result = await llm.parse(text, schemas);
  exactCache.set(text, result);
  semanticCache.add(text, embedding, result);
  return execute(result, { layer: 3 });
}
```

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                            nttp                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Client                                                         │
│     │                                                            │
│     ▼                                                            │
│   ┌──────────────────────────────────────┐                       │
│   │ HTTP Layer (Fastify)                 │                       │
│   │ /query  /cache  /stats  /docs        │                       │
│   └──────────────────┬───────────────────┘                       │
│                      │                                           │
│                      ▼                                           │
│   ┌──────────────────────────────────────┐    ┌───────────────┐  │
│   │ L1: Exact Cache                      │    │               │  │
│   │ Hash Map • <1ms • $0                 │───▶│               │  │
│   └──────────────────┬───────────────────┘    │               │  │
│                      │ MISS                   │               │  │
│                      ▼                        │   Executor    │  │
│   ┌──────────────────────────────────────┐    │               │  │
│   │ L2: Semantic Cache                   │───▶│       │       │  │
│   │ AI SDK Embeddings • 80ms • $0.0001   │    │       │       │  │
│   └──────────────────┬───────────────────┘    │       │       │  │
│                      │ MISS                   │       ▼       │  │
│                      ▼                        │   Database    │  │
│   ┌──────────────────────────────────────┐    │   Service     │  │
│   │ L3: LLM Parser                       │───▶│               │  │
│   │ Claude API • 2-3s • $0.01            │    │               │  │
│   └──────────────────────────────────────┘    └───────┬───────┘  │
│                                                       │          │
│                                                       ▼          │
│                                               ┌───────────────┐  │
│                                               │   Database    │  │
│                                               │ PG/SQLite/... │  │
│                                               └───────────────┘  │
│                                                                  │
│   External APIs:                                                 │
│   • AI SDK Embeddings (OpenAI/Cohere/Mistral)                    │
│   • Claude API (intent + SQL generation)                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## API

### POST /query

```bash
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "show me active users"}'
```

```json
{
  "data": [
    { "id": 1, "email": "user@example.com", "status": "active" }
  ],
  "meta": {
    "schemaId": "schema_7a3f9e2c",
    "cacheLayer": 2,
    "latencyMs": 87,
    "cost": 0.0001,
    "sql": "SELECT * FROM users WHERE status = $1",
    "similarity": 0.94
  }
}
```

### GET /query?q=...

```bash
curl "http://localhost:8000/query?q=active%20users"
```

### GET /stats

```json
{
  "cacheSize": { "l1": 156, "l2": 89 },
  "hitRates": { "l1": 0.62, "l2": 0.31, "l3": 0.07 },
  "totalQueries": 1247,
  "costSaved": 11.22
}
```

### GET /cache

List cached queries.

### DELETE /cache/:schemaId

Clear specific cache entry.

---

## Configuration

```typescript
// config.ts
import { openai } from '@ai-sdk/openai';

export const config = {
  cache: {
    redis: {
      url: process.env.REDIS_URL,  // Optional: Enable L1 persistence
    },
  },

  embedding: {
    model: openai.embeddingModel('text-embedding-3-small'),
    threshold: 0.92,
  },

  llm: {
    model: 'claude-sonnet-4-20250514',
  },

  database: {
    type: 'postgresql',  // or sqlite, mysql, mssql
    connectionString: process.env.DATABASE_URL,
  },

  server: {
    port: 8000,
  },
};
```

**Environment Variables:**
```bash
# .env
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-...
OPENAI_API_KEY=sk-...
REDIS_URL=redis://localhost:6379  # Optional: L1 cache persistence
```

### Embedding Models

| Provider | Model | Cost/1M tokens |
|----------|-------|----------------|
| OpenAI | `text-embedding-3-small` | $0.02 |
| Cohere | `embed-english-light-v3.0` | $0.01 |
| Mistral | `mistral-embed` | $0.01 |
| Google | `text-embedding-004` | Free tier |

---

## CLI

```bash
nttp setup      # Interactive configuration
nttp dev        # Development server
nttp start      # Production server
nttp doctor     # Health diagnostics
nttp stats      # Cache statistics
```

---

## Performance

| Layer | Latency | Cost | When |
|-------|---------|------|------|
| L1 (In-Memory) | <1ms | $0 | Exact query match |
| L1 (Redis) | ~5ms | $0 | Exact query match (persistent) |
| L2 | 50-100ms | ~$0.0001 | Similar phrasing |
| L3 | 2-3s | ~$0.01 | Novel query |

### Cost at Scale (1000 queries after warmup)

```
Without nttp:   1000 × $0.01  = $10.00
With nttp:      ~$1.00        = 90% savings
```

---

## Project Structure

```
nttp/
├── src/
│   ├── index.ts           # Fastify server
│   ├── config.ts          # Configuration
│   ├── routes/
│   │   ├── query.ts       # POST/GET /query
│   │   ├── cache.ts       # Cache management
│   │   └── stats.ts       # Statistics
│   ├── cache/
│   │   ├── exact.ts       # L1: Hash map
│   │   └── semantic.ts    # L2: Embeddings
│   ├── llm/
│   │   └── parser.ts      # L3: Claude
│   ├── services/
│   │   ├── executor.ts    # Orchestrator
│   │   └── database.ts    # SQL execution
│   └── types.ts
├── package.json
└── .env
```

---

## Quick Start

```bash
# Install
npm install nttp

# Configure
cp .env.example .env
# Add: ANTHROPIC_API_KEY, OPENAI_API_KEY, DATABASE_URL

# Run
nttp dev

# Query
curl "http://localhost:8000/query?q=show%20me%20active%20users"
```

---

## Dependencies

```json
{
  "dependencies": {
    "fastify": "^4.26.0",
    "ai": "^3.0.0",
    "@ai-sdk/openai": "^0.0.40",
    "@anthropic-ai/sdk": "^0.20.0",
    "knex": "^3.1.0",
    "zod": "^3.22.0"
  }
}
```

---

## Use Cases

| Use Case | Fit |
|----------|-----|
| Internal dashboards | ✅ |
| Admin tools | ✅ |
| Prototypes / MVPs | ✅ |
| AI agent data access | ✅ |
| High-throughput APIs | ❌ |
| Public APIs | ❌ |

---

## Summary

```
nttp = natural text to query

┌─────────────────────────────────────────┐
│                                         │
│  "show me active users"                 │
│           │                             │
│           ▼                             │
│  L1: Exact ─── HIT ──▶ ($0, <1ms)       │
│           │                             │
│         MISS                            │
│           ▼                             │
│  L2: Semantic ─ HIT ─▶ ($0.0001, 80ms)  │
│           │                             │
│         MISS                            │
│           ▼                             │
│  L3: LLM ──────────▶ ($0.01, 2s)        │
│           │                             │
│           └─▶ Cache for next time       │
│                                         │
│  90% of queries hit L1/L2 after warmup  │
│                                         │
└─────────────────────────────────────────┘
```

**Three layers. No training. 90% cheaper.**