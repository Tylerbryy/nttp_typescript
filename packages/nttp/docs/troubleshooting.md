# Troubleshooting Guide

Common issues and solutions for NTTP.

## Table of Contents

- [Setup Issues](#setup-issues)
- [Query Issues](#query-issues)
- [Cache Issues](#cache-issues)
- [Connection Issues](#connection-issues)
- [Performance Issues](#performance-issues)
- [Error Messages](#error-messages)

---

## Setup Issues

### "Cannot find package 'nttp'"

**Problem:** Import fails after running setup wizard.

**Cause:** Dependencies not installed.

**Solution:**

```bash
npm install nttp dotenv
```

The setup wizard should do this automatically, but manual installation may be needed.

---

### "Cannot find package 'dotenv'"

**Problem:** Environment variable loading fails.

**Cause:** `dotenv` package not installed.

**Solution:**

```bash
npm install dotenv
```

Then import at the top of your file:

```typescript
import 'dotenv/config';
```

---

### "DATABASE_URL is required"

**Problem:** `NTTP.fromEnv()` fails with missing environment variable error.

**Cause:** `.env` file not loaded or incorrect.

**Solution:**

1. Verify `.env` file exists in project root
2. Check `.env` has required variables:

```bash
DATABASE_TYPE=pg
DATABASE_URL=postgresql://...
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-...
```

3. Ensure `dotenv` is loaded:

```typescript
import 'dotenv/config';  // Add this FIRST
import { NTTP } from 'nttp';
```

---

## Query Issues

### Query Returns Empty Results

**Problem:** Query executes but returns `[]`.

**Possible Causes:**

1. **No matching data** - Query filters exclude all rows
2. **Table doesn't exist** - Entity name incorrect
3. **Schema mismatch** - Database structure changed

**Debug Steps:**

```typescript
// 1. Check what SQL was generated
const explanation = await nttp.explain("your query");
console.log('SQL:', explanation.sql);
console.log('Params:', explanation.params);

// 2. Verify table exists
const tables = await nttp.getTables();
console.log('Available tables:', tables);

// 3. Check table schema
const schema = await nttp.getTableSchema('users');
console.log('Columns:', schema);

// 4. Try simpler query
const all = await nttp.query("show all users");
console.log('Total rows:', all.data.length);
```

**Solutions:**

- Simplify query: `"show all users"` instead of `"active premium users from California"`
- Verify table name matches database
- Check filters aren't too restrictive

---

### "Failed to understand query" (IntentParseError)

**Problem:** LLM cannot parse natural language query.

**Example Error:**

```
IntentParseError: Failed to understand query

Suggested fixes:
  • Simplify your query (e.g., "show users" instead of complex phrasing)
  • Ensure table/field names match your database schema
  • Try a more explicit query (e.g., "list all products")
  • Check if LLM API key is valid and has quota available
```

**Solutions:**

**1. Simplify query:**

```typescript
// ❌ Too complex
"give me all the users who are currently active and have premium subscriptions"

// ✅ Simpler
"active premium users"
```

**2. Use explicit table names:**

```typescript
// ❌ Ambiguous
"show me the data"

// ✅ Explicit
"show me all users"
```

**3. Check API key:**

```bash
# Verify key is set
echo $ANTHROPIC_API_KEY

# Test with explain (faster than full query)
const test = await nttp.explain("show users");
```

---

### "Could not generate SQL" (SQLGenerationError)

**Problem:** Intent parsed but SQL generation failed.

**Possible Causes:**

1. Complex query requires table relationships not in schema
2. Schema description incomplete
3. LLM model not capable enough

**Solutions:**

**1. Check schema is complete:**

```typescript
const description = nttp.getSchemaDescription();
console.log(description);
// Ensure all tables and relationships are present
```

**2. Try simpler query:**

```typescript
// ❌ Complex join
"show users with their order counts and average order values"

// ✅ Simpler
"show users"
```

**3. Use more capable model:**

```typescript
llm: {
  provider: 'anthropic',
  model: 'claude-opus-4-5-20251101'  // More capable
}
```

---

### "Query failed" (SQLExecutionError)

**Problem:** Generated SQL fails when executed.

**Example Error:**

```
SQLExecutionError: Query failed: column "status" does not exist

Generated SQL:
SELECT * FROM users WHERE status = ? LIMIT ?

Suggested fixes:
  • Verify database connection is active (check DATABASE_URL)
  • Ensure schema matches actual database structure
  • Check database user has SELECT permissions on the table
  • Examine the generated SQL for syntax errors
  • Try regenerating with forceNewSchema: true option
```

**Solutions:**

**1. Verify column exists:**

```typescript
const schema = await nttp.getTableSchema('users');
console.log('Columns:', schema.columns.map(c => c.name));
// Check if 'status' column exists
```

**2. Force schema refresh:**

```typescript
// Clear cache and regenerate
const result = await nttp.query("show users", {
  forceNewSchema: true
});
```

**3. Check database connection:**

```typescript
try {
  const tables = await nttp.getTables();
  console.log('✓ Database connected');
} catch (error) {
  console.error('✗ Database connection failed:', error.message);
}
```

---

## Cache Issues

### Cache Always Shows MISS

**Problem:** Every query is L3 MISS even for repeated queries.

**Possible Causes:**

1. Redis not configured (for production)
2. Redis connection failed
3. Cache disabled
4. Query variations (need L2 cache)

**Debug Steps:**

```typescript
// 1. Check cache config
console.log('Redis URL:', process.env.REDIS_URL);

// 2. Try exact same query twice
const result1 = await nttp.query("show active users");
console.log('First query:', result1.meta);

const result2 = await nttp.query("show active users");
console.log('Second query:', result2.meta);
// Should be L1 HIT on second query

// 3. Check cache stats
const stats = await nttp.getCacheStats();
console.log('Cache stats:', stats);
```

**Solutions:**

**1. Enable Redis:**

```bash
# Add to .env
REDIS_URL=redis://localhost:6379
```

**2. Verify Redis is running:**

```bash
# Test Redis connection
redis-cli ping
# Should return: PONG
```

**3. Enable L2 for query variations:**

```bash
# Add to .env
OPENAI_API_KEY=sk-...
```

---

### Redis Connection Failed

**Problem:** "Redis connection failed" or cache not persisting.

**Error Example:**

```
CacheError: Redis connection failed: ECONNREFUSED

Suggested fixes:
  • Verify Redis server is running (if using Redis)
  • Check REDIS_URL format: redis://host:port
  • Ensure Redis authentication credentials are correct
```

**Solutions:**

**1. Verify Redis is running:**

```bash
# Check if Redis is running
redis-cli ping

# Start Redis if not running
redis-server
```

**2. Check URL format:**

```bash
# Correct formats
REDIS_URL=redis://localhost:6379
REDIS_URL=redis://:password@localhost:6379
REDIS_URL=redis://localhost:6379/0

# Wrong
REDIS_URL=localhost:6379  # Missing redis://
```

**3. Check authentication:**

```bash
# If Redis requires password
REDIS_URL=redis://:your-password@localhost:6379
```

**4. Test connection manually:**

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

redis.ping().then(() => {
  console.log('✓ Redis connected');
}).catch((error) => {
  console.error('✗ Redis connection failed:', error.message);
});
```

---

## Connection Issues

### Database Connection Failed

**Problem:** Cannot connect to database.

**Error Example:**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**

**1. Verify database is running:**

```bash
# PostgreSQL
pg_isready

# MySQL
mysqladmin ping
```

**2. Check connection URL:**

```bash
# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb

# MySQL
DATABASE_URL=mysql://user:pass@localhost:3306/mydb

# SQLite
DATABASE_PATH=./data.db
```

**3. Test connection:**

```typescript
import knex from 'knex';

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

db.raw('SELECT 1').then(() => {
  console.log('✓ Database connected');
}).catch((error) => {
  console.error('✗ Database connection failed:', error.message);
});
```

**4. Check firewall/network:**

```bash
# Test if port is accessible
telnet localhost 5432
```

---

### LLM API Failed

**Problem:** LLM API calls failing.

**Error Example:**

```
LLMError: LLM API failed after 3 attempts: Invalid API key

Suggested fixes:
  • Verify API key is correct (check ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
  • Check API quota and rate limits with your provider
  • Ensure network connectivity to the LLM provider
```

**Solutions:**

**1. Verify API key:**

```bash
# Check key is set
echo $ANTHROPIC_API_KEY

# Test with curl
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-5-20250929","messages":[{"role":"user","content":"test"}],"max_tokens":10}'
```

**2. Check quota:**

- Visit your provider's dashboard
- Anthropic: https://console.anthropic.com/
- OpenAI: https://platform.openai.com/usage

**3. Check rate limits:**

```typescript
// Add delay between requests if hitting rate limits
async function queryWithDelay(query: string) {
  await new Promise(resolve => setTimeout(resolve, 1000));  // 1s delay
  return nttp.query(query);
}
```

---

## Performance Issues

### Queries Too Slow

**Problem:** Queries taking 10+ seconds.

**Possible Causes:**

1. No caching (first query)
2. Very complex query
3. Large result set
4. Slow LLM model
5. Database slow

**Debug Steps:**

```typescript
const result = await nttp.query("your query");

console.log('Cache hit:', result.cacheHit);
console.log('Cache layer:', result.meta?.cacheLayer);
console.log('Latency:', result.meta?.latency);
console.log('Row count:', result.data.length);
console.log('SQL:', result.sql);
```

**Solutions:**

**1. Enable caching:**

```bash
# Add Redis for persistent cache
REDIS_URL=redis://localhost:6379

# Add L2 for query variations
OPENAI_API_KEY=sk-...
```

**2. Pre-warm cache:**

```typescript
// Warm cache on startup
const common = ["show users", "count orders", "show products"];
for (const q of common) {
  await nttp.query(q);
}
```

**3. Use faster model:**

```typescript
llm: {
  model: 'claude-haiku-4-20250514'  // Faster
}
```

**4. Reduce result size:**

```typescript
limits: {
  defaultLimit: 50,  // Smaller default
  maxLimit: 200      // Lower max
}
```

**5. Add database indexes:**

```sql
-- Index frequently filtered columns
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
```

---

## Error Messages

### "ECONNREFUSED"

**Meaning:** Cannot connect to service (database, Redis, etc.)

**Check:**
- Service is running
- Correct host/port
- Firewall rules

---

### "ETIMEDOUT"

**Meaning:** Connection timeout

**Check:**
- Network connectivity
- Firewall blocking connection
- Service is responsive

---

### "Invalid API key"

**Meaning:** LLM API key incorrect or expired

**Check:**
- API key is correct
- API key has proper permissions
- API key not expired

---

### "Rate limit exceeded"

**Meaning:** Too many API requests

**Solutions:**
- Wait and retry
- Upgrade API plan
- Add delays between requests
- Improve cache hit rate

---

### "Out of quota"

**Meaning:** API usage quota exhausted

**Solutions:**
- Upgrade API plan
- Wait for quota reset
- Use caching to reduce API calls

---

## Getting Help

### Debugging Checklist

Before asking for help, try:

1. ✅ Check this troubleshooting guide
2. ✅ Run with verbose logging
3. ✅ Test with minimal example
4. ✅ Verify all services are running
5. ✅ Check environment variables
6. ✅ Try `npx nttp docs` for quick reference

---

### Collecting Debug Info

```typescript
// Collect diagnostic information
console.log('NTTP Debug Info:');
console.log('- Node version:', process.version);
console.log('- DATABASE_TYPE:', process.env.DATABASE_TYPE);
console.log('- LLM_PROVIDER:', process.env.LLM_PROVIDER);
console.log('- LLM_MODEL:', process.env.LLM_MODEL);
console.log('- REDIS_URL set:', !!process.env.REDIS_URL);
console.log('- OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);

try {
  const tables = await nttp.getTables();
  console.log('- Database tables:', tables.length);
} catch (error) {
  console.log('- Database connection: FAILED');
}

try {
  const stats = await nttp.getCacheStats();
  console.log('- Cache schemas:', stats.totalSchemas);
} catch (error) {
  console.log('- Cache: FAILED');
}
```

---

### Reporting Issues

When reporting issues, include:

1. **Error message** (full stack trace)
2. **Debug info** (from above)
3. **Minimal reproducible example**
4. **Expected vs actual behavior**
5. **NTTP version** (`npm list nttp`)

**Report at:** https://github.com/tylergibbs/nttp/issues

---

## See Also

- [Configuration](./configuration.md) - Configuration reference
- [API Reference](./api.md) - Complete API documentation
- [Production Guide](./production.md) - Production best practices
- [Examples](./examples.md) - Usage examples
