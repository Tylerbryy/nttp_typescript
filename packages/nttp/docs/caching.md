# 3-Layer Caching System

NTTP uses an intelligent 3-layer cache to optimize cost and performance. Queries cascade through increasingly expensive layers until a result is found.

## Table of Contents

- [Overview](#overview)
- [Layer 1: Exact Match](#layer-1-exact-match-l1)
- [Layer 2: Semantic Match](#layer-2-semantic-match-l2)
- [Layer 3: LLM Generation](#layer-3-llm-generation-l3)
- [Cache Flow](#cache-flow)
- [Configuration](#configuration)
- [Performance Metrics](#performance-metrics)
- [Best Practices](#best-practices)

---

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Natural Language Query                    │
│                   "show me active users"                     │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ L1: EXACT MATCH                                             │
│ Hash-based lookup        $0        <1ms (in-memory)         │
│                                    ~5ms (Redis)              │
├─────────────────────────────────────────────────────────────┤
│ • Checks if exact query string was seen before             │
│ • Instant hit if query matches character-for-character     │
│ • Uses MD5 hash for O(1) lookup                            │
└─────────────────────────────────────────────────────────────┘
                             │ MISS
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ L2: SEMANTIC MATCH                                          │
│ Embedding similarity     ~$0.0001   50-100ms                │
├─────────────────────────────────────────────────────────────┤
│ • Compares semantic meaning of query                       │
│ • Matches similar phrasings:                               │
│   "show users" ≈ "get users" ≈ "list users"               │
│ • Uses OpenAI embeddings (text-embedding-3-small)          │
│ • Similarity threshold: 0.85 (configurable)                │
└─────────────────────────────────────────────────────────────┘
                             │ MISS
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ L3: LLM GENERATION                                          │
│ Full pipeline            ~$0.01     2-3s                    │
├─────────────────────────────────────────────────────────────┤
│ • Parse intent with LLM                                    │
│ • Generate SQL with LLM                                    │
│ • Execute and cache result                                 │
│ • Populates L1 and L2 for future queries                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Exact Match (L1)

### How It Works

L1 cache uses **exact string matching** via hash lookup. If you query "show users" twice, the second query hits L1 instantly.

**Storage Options:**
1. **In-Memory** (default): Fast but resets on restart
2. **Redis** (recommended): Persistent across restarts and instances

### Configuration

**In-Memory:**

```typescript
const nttp = new NTTP({
  // ... other config
  cache: {
    l1: {
      enabled: true,    // Default: true
      maxSize: 1000     // Default: 1000 entries
    }
  }
});
```

**Redis (Persistent):**

```typescript
const nttp = new NTTP({
  // ... other config
  cache: {
    l1: {
      enabled: true,
      maxSize: 1000
    },
    redis: {
      url: 'redis://localhost:6379'
    }
  }
});
```

Or via environment variable:

```bash
REDIS_URL=redis://localhost:6379
```

### Performance

| Storage | Latency | Persistence | Multi-Instance |
|---------|---------|-------------|----------------|
| In-Memory | <1ms | ❌ No | ❌ No |
| Redis | ~5ms | ✅ Yes | ✅ Shared |

### When L1 Hits

```typescript
const result1 = await nttp.query("show active users");
// L3 MISS: 2500ms - LLM generation

const result2 = await nttp.query("show active users");
// L1 HIT: 0.8ms - Exact match

console.log(result2.meta);
// {
//   cacheLayer: 1,
//   cost: 0,
//   latency: 0.8
// }
```

### Benefits

- **Zero cost** - No API calls
- **Instant response** - Sub-millisecond latency
- **Perfect reliability** - No LLM variability

### Limitations

- **Exact match only** - "show users" ≠ "get users"
- **Case sensitive** - "Show Users" ≠ "show users"
- **No typo tolerance** - "show usres" ≠ "show users"

---

## Layer 2: Semantic Match (L2)

### How It Works

L2 cache uses **embedding-based semantic similarity** to match queries with similar meaning but different wording.

**Example Matches:**
- "show users" ≈ "get users" ≈ "list users" ≈ "display users"
- "top 10 products" ≈ "10 most popular products"
- "count orders" ≈ "how many orders" ≈ "number of orders"

### Configuration

```typescript
const nttp = new NTTP({
  // ... other config
  cache: {
    l2: {
      enabled: true,                          // Default: false
      provider: 'openai',                     // Only OpenAI supported
      model: 'text-embedding-3-small',        // Default model
      apiKey: process.env.OPENAI_API_KEY,    // Required
      maxSize: 500,                           // Default: 500 entries
      similarityThreshold: 0.85               // Default: 0.85 (0-1 scale)
    }
  }
});
```

Or via environment variables:

```bash
OPENAI_API_KEY=sk-...
# L2 is auto-enabled if OPENAI_API_KEY is present
```

### Performance

- **Cost:** ~$0.0001 per query (embedding generation)
- **Latency:** 50-100ms (embedding API call + cosine similarity)
- **Accuracy:** 85% similarity threshold (configurable)

### When L2 Hits

```typescript
const result1 = await nttp.query("show active users");
// L3 MISS: 2500ms - LLM generation

const result2 = await nttp.query("get active users");
// L2 HIT: 75ms - Semantic match (similarity: 0.92)

console.log(result2.meta);
// {
//   cacheLayer: 2,
//   cost: 0.0001,
//   latency: 75,
//   similarity: 0.92
// }
```

### Similarity Threshold

The `similarityThreshold` controls how strict the matching is:

- **0.95+**: Very strict - only nearly identical phrasings
- **0.85-0.95** (recommended): Moderate - same intent, different words
- **0.75-0.85**: Loose - more false positives but higher hit rate
- **<0.75**: Too loose - risky, may match unrelated queries

**Adjusting the threshold:**

```typescript
cache: {
  l2: {
    similarityThreshold: 0.90  // Stricter matching
  }
}
```

### Cache Promotion

When L2 hits, the query is **promoted to L1** for future exact matches:

```
Query 1: "show users"  → L3 MISS → Generate SQL → Cache in L1 + L2
Query 2: "get users"   → L2 HIT  → Promote to L1
Query 3: "get users"   → L1 HIT  → Instant
```

### Benefits

- **Low cost** - 100x cheaper than LLM
- **Handles variations** - Different phrasings match
- **Fast** - 30x faster than LLM generation

### Limitations

- **Requires OpenAI API** - Currently only provider
- **Additional cost** - $0.0001 per query vs $0 for L1
- **Slower than L1** - 75ms vs 1ms
- **False positives possible** - May match unrelated similar queries

---

## Layer 3: LLM Generation (L3)

### How It Works

L3 is the **full pipeline** when no cache hits:

1. **Parse Intent** - LLM extracts structured intent from natural language
2. **Generate SQL** - LLM creates safe, parameterized SQL
3. **Execute Query** - Database runs the SQL
4. **Cache Result** - Stores in L1, L2, and schema cache

### Configuration

L3 is always enabled. Configure via LLM settings:

```typescript
const nttp = new NTTP({
  llm: {
    provider: 'anthropic',                   // See models guide
    model: 'claude-sonnet-4-5-20250929',    // Recommended
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: 2048                          // Default: 2048
  }
});
```

### Performance

- **Cost:** ~$0.01 per query (2 LLM calls: intent + SQL)
- **Latency:** 2-3 seconds (network + LLM processing)
- **Reliability:** 99%+ with Claude Sonnet

### When L3 Runs

```typescript
const result = await nttp.query("show active premium users from California");
// L1 MISS: Never seen this exact query
// L2 MISS: No similar cached queries
// L3: Full generation (2847ms)

console.log(result.meta);
// {
//   cacheLayer: 3,
//   cost: 0.01,
//   latency: 2847
// }
```

### Benefits

- **Handles any query** - No cache required
- **Highest quality** - Claude's reasoning ensures correct SQL
- **Self-healing** - Populates cache for future queries

### Limitations

- **Expensive** - $0.01 vs $0.0001 (L2) vs $0 (L1)
- **Slow** - 2-3s vs 75ms (L2) vs 1ms (L1)
- **Rate limited** - Subject to LLM provider limits

---

## Cache Flow

### Complete Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ User Query: "show active users"                              │
└──────────────────────────────────────────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │ L1: Hash Lookup       │
            │ Hash("show active...") │
            └───────────────────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
         HIT│                       │MISS
            ▼                       ▼
    ┌──────────────┐    ┌──────────────────────┐
    │ Return SQL   │    │ L2: Semantic Search  │
    │ Cost: $0     │    │ Embed("show active...")│
    │ Time: <1ms   │    └──────────────────────┘
    └──────────────┘                │
                        ┌────────────┴────────────┐
                        │                         │
                     HIT│                         │MISS
                        ▼                         ▼
            ┌──────────────────┐      ┌─────────────────────┐
            │ Promote to L1    │      │ L3: LLM Generation  │
            │ Return SQL       │      │ 1. Parse Intent     │
            │ Cost: ~$0.0001   │      │ 2. Generate SQL     │
            │ Time: ~75ms      │      │ 3. Execute          │
            └──────────────────┘      │ 4. Cache in L1+L2   │
                                      │ Cost: ~$0.01        │
                                      │ Time: 2-3s          │
                                      └─────────────────────┘
```

### Example Flow

```typescript
// First user queries
await nttp.query("show active users");
// → L1 MISS → L2 MISS → L3 (2500ms, $0.01)

// Same user again
await nttp.query("show active users");
// → L1 HIT (0.8ms, $0)

// Different user, similar query
await nttp.query("get active users");
// → L1 MISS → L2 HIT (75ms, $0.0001) → Promote to L1

// Same different user again
await nttp.query("get active users");
// → L1 HIT (0.8ms, $0)

// Completely new query
await nttp.query("count pending orders");
// → L1 MISS → L2 MISS → L3 (2400ms, $0.01)
```

---

## Configuration

### Minimal (L1 Only)

```typescript
const nttp = new NTTP({
  database: { /* ... */ },
  llm: { /* ... */ }
  // L1 in-memory enabled by default
});
```

**Cost:** $0 after warm-up
**Latency:** <1ms for exact matches
**Use case:** Development, single-instance apps

---

### Recommended (L1 + Redis)

```typescript
const nttp = new NTTP({
  database: { /* ... */ },
  llm: { /* ... */ },
  cache: {
    redis: {
      url: 'redis://localhost:6379'
    }
  }
});
```

**Cost:** $0 after warm-up
**Latency:** ~5ms for exact matches
**Use case:** Production, CLI tools, multi-instance deployments

---

### Maximum (L1 + Redis + L2)

```typescript
const nttp = new NTTP({
  database: { /* ... */ },
  llm: { /* ... */ },
  cache: {
    redis: { url: 'redis://localhost:6379' },
    l2: {
      enabled: true,
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      similarityThreshold: 0.85
    }
  }
});
```

**Cost:** ~$0.0001 for similar queries, $0 for exact
**Latency:** ~75ms for similar, ~5ms for exact
**Use case:** Production with high query variation

---

## Performance Metrics

### Typical Hit Rates (After Warm-up)

| Layer | Hit Rate | Cumulative |
|-------|----------|------------|
| L1    | 60-70%   | 60-70%     |
| L2    | 20-30%   | 85-95%     |
| L3    | 5-15%    | 100%       |

### Cost Comparison (1000 queries)

| Configuration | Cold Start | After Warm-up | Savings |
|---------------|------------|---------------|---------|
| No cache | $10.00 | $10.00 | 0% |
| L1 only | $10.00 | $1.50 | 85% |
| L1 + L2 | $10.00 | $0.50 | 95% |

### Latency Comparison

| Cache Layer | Avg Latency | vs L3 Speedup |
|-------------|-------------|---------------|
| L1 (memory) | 0.8ms | 3000x faster |
| L1 (Redis) | 5ms | 500x faster |
| L2 | 75ms | 35x faster |
| L3 | 2500ms | 1x (baseline) |

---

## Best Practices

### 1. Always Enable Redis in Production

```typescript
// ✅ Good: Persistent cache
cache: {
  redis: { url: process.env.REDIS_URL }
}

// ❌ Bad: Cache resets on restart
cache: {
  l1: { enabled: true }  // In-memory only
}
```

**Why:** CLI tools and restarts lose all cache without Redis.

---

### 2. Enable L2 for High Query Variation

```typescript
// ✅ Good for customer-facing apps
cache: {
  redis: { url: process.env.REDIS_URL },
  l2: { enabled: true }
}

// ⚠️ Okay for internal tools with repeated queries
cache: {
  redis: { url: process.env.REDIS_URL }
}
```

**Why:** L2 handles different phrasings of the same intent.

---

### 3. Monitor Cache Performance

```typescript
const result = await nttp.query("show users");

if (result.meta) {
  console.log(`L${result.meta.cacheLayer} | $${result.meta.cost} | ${result.meta.latency}ms`);

  if (result.meta.cacheLayer === 3) {
    console.warn('⚠️ Cache miss - consider pre-warming');
  }
}
```

---

### 4. Pre-warm Cache for Common Queries

```typescript
// Warm cache on startup
const commonQueries = [
  "show active users",
  "count pending orders",
  "top 10 products by price"
];

for (const query of commonQueries) {
  await nttp.query(query);
}
```

---

### 5. Adjust L2 Threshold Based on Use Case

```typescript
// Strict matching for financial/critical queries
cache: {
  l2: { similarityThreshold: 0.92 }
}

// Loose matching for general search
cache: {
  l2: { similarityThreshold: 0.80 }
}
```

---

### 6. Set Appropriate Cache Sizes

```typescript
cache: {
  l1: {
    maxSize: 1000  // ~1MB memory, adjust based on query complexity
  },
  l2: {
    maxSize: 500   // Embeddings are larger, be conservative
  }
}
```

---

## See Also

- [Configuration](./configuration.md) - Complete cache config reference
- [Production Guide](./production.md) - Deployment best practices
- [API Reference](./api.md) - Cache management methods
