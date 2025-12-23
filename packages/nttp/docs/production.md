# Production Deployment Guide

Best practices for deploying NTTP in production environments.

## Table of Contents

- [Quick Checklist](#quick-checklist)
- [Infrastructure Setup](#infrastructure-setup)
- [Security](#security)
- [Performance Optimization](#performance-optimization)
- [Monitoring](#monitoring)
- [Error Handling](#error-handling)
- [Scaling](#scaling)
- [Cost Optimization](#cost-optimization)

---

## Quick Checklist

Before going to production:

- [ ] **Redis configured** for L1 cache persistence
- [ ] **Environment variables** secured (not in code)
- [ ] **Database connection pooling** enabled
- [ ] **Error logging** configured
- [ ] **Rate limiting** implemented
- [ ] **L2 semantic cache** enabled (if high query variation)
- [ ] **Cache monitoring** set up
- [ ] **Backup LLM provider** configured (optional)
- [ ] **Query length limits** enforced
- [ ] **Result size limits** configured

---

## Infrastructure Setup

### Recommended Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│         Application Server(s)            │
│  ┌─────────────────────────────────┐   │
│  │         NTTP Instance            │   │
│  └─────────────────────────────────┘   │
└──┬──────────┬──────────┬───────────────┘
   │          │          │
   ▼          ▼          ▼
┌──────┐  ┌──────┐  ┌───────────┐
│ Redis│  │  DB  │  │ LLM API   │
│Cache │  │      │  │(Anthropic)│
└──────┘  └──────┘  └───────────┘
```

---

### Required Services

**1. Redis (Required for production)**

```bash
# Docker
docker run -d --name redis -p 6379:6379 redis:latest

# Or use managed service
# - AWS ElastiCache
# - Redis Cloud
# - Upstash
```

**2. Database**

```bash
# Use connection pooling
DATABASE_URL=postgresql://user:pass@localhost:5432/db?pool_min=2&pool_max=10
```

---

### Configuration

**Production `.env`:**

```bash
# Database
DATABASE_TYPE=pg
DATABASE_URL=postgresql://user:pass@prod-db.example.com:5432/mydb

# LLM
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-production-key-here

# Cache (REQUIRED for production)
REDIS_URL=redis://:password@prod-redis.example.com:6379
OPENAI_API_KEY=sk-openai-key-for-l2-cache

# Limits
MAX_QUERY_LENGTH=300
DEFAULT_LIMIT=50
MAX_LIMIT=500
```

---

### Docker Deployment

**Dockerfile:**

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY . .

# Build if using TypeScript
RUN npm run build

# Start application
CMD ["node", "dist/server.js"]
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
      - REDIS_URL=redis://redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db
      - redis

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=mydb
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

---

## Security

### Environment Variables

**❌ Never do this:**

```typescript
// Hardcoded keys - DON'T DO THIS
const nttp = new NTTP({
  llm: {
    apiKey: 'sk-ant-1234567890'  // ❌ WRONG
  }
});
```

**✅ Always do this:**

```typescript
// Use environment variables
const nttp = new NTTP({
  llm: {
    apiKey: process.env.ANTHROPIC_API_KEY  // ✅ CORRECT
  }
});

// Or better, use fromEnv()
const nttp = await NTTP.fromEnv();  // ✅ BEST
```

---

### Input Validation

```typescript
import { z } from 'zod';

const querySchema = z.object({
  query: z.string()
    .min(1, 'Query cannot be empty')
    .max(300, 'Query too long')
    .regex(/^[a-zA-Z0-9\s,?!.]+$/, 'Invalid characters')
});

app.post('/api/query', async (req, res) => {
  try {
    // Validate input
    const { query } = querySchema.parse(req.body);

    const result = await nttp.query(query);
    res.json({ data: result.data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal error' });
  }
});
```

---

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// Per-IP rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/query', limiter);

// Per-user rate limiting (if authenticated)
const userLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 500,
  keyGenerator: (req) => req.user?.id || req.ip
});

app.use('/api/query', userLimiter);
```

---

### Database Access Control

```sql
-- Create read-only user for NTTP
CREATE ROLE nttp_readonly;
GRANT CONNECT ON DATABASE mydb TO nttp_readonly;
GRANT USAGE ON SCHEMA public TO nttp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO nttp_readonly;

-- Create specific user
CREATE USER nttp_app WITH PASSWORD 'secure_password';
GRANT nttp_readonly TO nttp_app;
```

Then use this user in your connection:

```bash
DATABASE_URL=postgresql://nttp_app:secure_password@localhost:5432/mydb
```

---

## Performance Optimization

### Cache Pre-warming

Warm cache on startup for common queries:

```typescript
async function warmCache(nttp: NTTP) {
  const commonQueries = [
    "show active users",
    "count pending orders",
    "top 10 products by revenue",
    "recent orders from last 7 days"
  ];

  console.log('Warming cache...');

  for (const query of commonQueries) {
    try {
      await nttp.query(query);
      console.log(`✓ Cached: ${query}`);
    } catch (error) {
      console.error(`✗ Failed: ${query}`, error.message);
    }
  }

  console.log('Cache warming complete');
}

// On startup
const nttp = await NTTP.fromEnv();
await warmCache(nttp);
```

---

### Connection Pooling

```typescript
database: {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // Connection pooling
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000
    }
  }
}
```

---

### Result Size Limits

```typescript
limits: {
  maxQueryLength: 300,  // Prevent very long queries
  defaultLimit: 50,     // Reasonable default
  maxLimit: 500         // Prevent huge result sets
}
```

---

### Timeouts

```typescript
// Add timeout to queries
async function queryWithTimeout(query: string, timeoutMs = 10000) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
  );

  return Promise.race([
    nttp.query(query),
    timeoutPromise
  ]);
}
```

---

## Monitoring

### Cache Metrics

```typescript
async function logCacheMetrics() {
  const stats = await nttp.getCacheStats();

  console.log('Cache Stats:', {
    totalSchemas: stats.totalSchemas,
    pinnedSchemas: stats.pinnedSchemas,
    avgUseCount: stats.averageUseCount
  });

  // Log to monitoring service
  metrics.gauge('nttp.cache.total_schemas', stats.totalSchemas);
  metrics.gauge('nttp.cache.avg_use_count', stats.averageUseCount);
}

// Run periodically
setInterval(logCacheMetrics, 60000); // Every minute
```

---

### Query Performance

```typescript
async function monitoredQuery(query: string) {
  const startTime = Date.now();

  try {
    const result = await nttp.query(query);
    const duration = Date.now() - startTime;

    // Log metrics
    metrics.histogram('nttp.query.duration', duration, {
      cacheHit: result.cacheHit,
      cacheLayer: result.meta?.cacheLayer
    });

    metrics.counter('nttp.query.success', 1, {
      cacheLayer: result.meta?.cacheLayer
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    metrics.counter('nttp.query.error', 1, {
      errorType: error.constructor.name
    });

    throw error;
  }
}
```

---

### Error Tracking

```typescript
import * as Sentry from '@sentry/node';

try {
  const result = await nttp.query(query);
} catch (error) {
  // Log to Sentry with context
  Sentry.captureException(error, {
    tags: {
      component: 'nttp',
      errorType: error.constructor.name
    },
    extra: {
      query,
      suggestions: error.suggestions
    }
  });

  throw error;
}
```

---

### Health Checks

```typescript
app.get('/health', async (req, res) => {
  try {
    // Check database
    const tables = await nttp.getTables();

    // Check Redis (if using)
    // await redis.ping();

    // Check LLM (optional - may be slow)
    // const test = await nttp.explain("test query");

    res.json({
      status: 'healthy',
      checks: {
        database: 'ok',
        cache: 'ok',
        llm: 'ok'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

---

## Error Handling

### Graceful Degradation

```typescript
async function resilientQuery(query: string) {
  try {
    // Try primary LLM
    return await nttp.query(query);
  } catch (error) {
    if (error instanceof LLMError) {
      // LLM failed - try backup provider
      console.error('Primary LLM failed, trying backup...');

      // Could switch to backup NTTP instance with different provider
      return await backupNTTP.query(query);
    }

    throw error;
  }
}
```

---

### Retry Logic

```typescript
async function queryWithRetry(
  query: string,
  maxRetries = 3,
  backoff = 1000
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await nttp.query(query);
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // Exponential backoff
      const delay = backoff * Math.pow(2, attempt - 1);
      console.log(`Retry ${attempt}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

## Scaling

### Horizontal Scaling

**Multiple app instances with shared cache:**

```
┌────────────┐
│ Instance 1 │───┐
└────────────┘   │
                 ├──→ Redis ──→ Database
┌────────────┐   │
│ Instance 2 │───┘
└────────────┘
```

All instances share the same Redis cache, so L1 hits work across instances.

---

### Load Balancing

```nginx
# nginx.conf
upstream nttp_backend {
  least_conn;  # Route to least busy server
  server app1:3000;
  server app2:3000;
  server app3:3000;
}

server {
  listen 80;

  location /api/query {
    proxy_pass http://nttp_backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

---

### Database Read Replicas

For high read volume:

```typescript
// Primary for writes (NTTP doesn't write, but for context)
const primaryDb = knex({
  client: 'pg',
  connection: process.env.DATABASE_PRIMARY_URL
});

// Read replica for NTTP queries
const replicaDb = knex({
  client: 'pg',
  connection: process.env.DATABASE_REPLICA_URL
});

const nttp = new NTTP({
  database: {
    client: 'pg',
    connection: process.env.DATABASE_REPLICA_URL  // Use replica
  },
  // ... other config
});
```

---

## Cost Optimization

### Cache Hit Rate Monitoring

```typescript
async function analyzeCachePerformance() {
  const queries = [];

  // Track queries for 1 hour
  for (const query of trackedQueries) {
    const result = await nttp.query(query);
    queries.push({
      query,
      cacheLayer: result.meta?.cacheLayer,
      cost: result.meta?.cost
    });
  }

  // Calculate hit rates
  const l1Hits = queries.filter(q => q.cacheLayer === 1).length;
  const l2Hits = queries.filter(q => q.cacheLayer === 2).length;
  const l3Misses = queries.filter(q => q.cacheLayer === 3).length;
  const total = queries.length;

  console.log({
    l1HitRate: (l1Hits / total * 100).toFixed(2) + '%',
    l2HitRate: (l2Hits / total * 100).toFixed(2) + '%',
    l3MissRate: (l3Misses / total * 100).toFixed(2) + '%',
    totalCost: queries.reduce((sum, q) => sum + q.cost, 0).toFixed(4)
  });
}
```

---

### Cost Projections

```typescript
// Monthly cost estimation
function estimateMonthlyCost(queriesPerDay: number, cacheHitRate: number) {
  const queriesPerMonth = queriesPerDay * 30;
  const cacheMisses = queriesPerMonth * (1 - cacheHitRate);
  const costPerQuery = 0.01; // Claude Sonnet

  const llmCost = cacheMisses * costPerQuery;
  const embeddingCost = queriesPerMonth * 0.0001; // L2 cache

  return {
    llmCost: llmCost.toFixed(2),
    embeddingCost: embeddingCost.toFixed(2),
    total: (llmCost + embeddingCost).toFixed(2)
  };
}

// Example: 10,000 queries/day, 85% cache hit rate
console.log(estimateMonthlyCost(10000, 0.85));
// { llmCost: '45.00', embeddingCost: '30.00', total: '75.00' }
```

---

## See Also

- [Configuration](./configuration.md) - Configuration reference
- [Caching](./caching.md) - Cache optimization
- [Troubleshooting](./troubleshooting.md) - Common issues
- [Examples](./examples.md) - Usage examples
