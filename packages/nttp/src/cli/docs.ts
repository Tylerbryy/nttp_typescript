/**
 * Documentation command for LLM agents
 */

const DOCS = {
  overview: `
# NTTP Documentation

Natural Text Transfer Protocol - Query databases with natural language.

## Quick Start

### Interactive Setup (for humans):
  npx nttp setup

### Non-Interactive Setup (for agents):
  npx nttp setup --non-interactive \\
    --database-type=pg \\
    --database-url=postgresql://... \\
    --llm-provider=anthropic \\
    --llm-api-key=sk-ant-...

### Query Database:
  npx nttp query "show me 5 users"

---
`,

  setup: `
## Setup Command

### Interactive Mode:
  npx nttp setup

  Guides you through configuration with beautiful UI.

### Non-Interactive Mode (for agents/automation):
  npx nttp setup --non-interactive [options]

  Required Options:
    --database-type <type>      pg, mysql2, better-sqlite3, mssql
    --database-url <url>        Connection URL (not for SQLite)
    --database-path <path>      SQLite database path
    --llm-provider <provider>   anthropic, openai, cohere, mistral, google
    --llm-api-key <key>         API key for LLM provider

  Optional Options:
    --llm-model <model>         Model name (auto-selected if omitted)
    --redis-url <url>           Redis URL for L1 cache persistence
    --enable-l2-cache           Enable semantic caching
    --embedding-api-key <key>   OpenAI API key (required if --enable-l2-cache)

  Example:
    npx nttp setup --non-interactive \\
      --database-type=pg \\
      --database-url=postgresql://user:pass@localhost:5432/db \\
      --llm-provider=anthropic \\
      --llm-api-key=sk-ant-...

---
`,

  cache: `
## Cache System

NTTP uses a 3-layer cache for cost optimization:

### L1: Exact Match Cache
  - Type: Hash-based lookup
  - Storage: In-memory (default) or Redis (persistent)
  - Cost: $0
  - Latency: <1ms (in-memory) or ~5ms (Redis)
  - Use: Identical queries

### L2: Semantic Match Cache
  - Type: Embedding-based similarity
  - Storage: In-memory
  - Cost: ~$0.0001 per query
  - Latency: 50-100ms
  - Use: Similar phrasing (e.g., "get users" vs "show users")
  - Threshold: 0.85 similarity (configurable)

### L3: LLM Generation
  - Type: Full intent parsing + SQL generation
  - Provider: Claude, GPT-4, etc.
  - Cost: ~$0.01 per query
  - Latency: 2-3s
  - Use: Novel queries

### Cache Persistence with Redis

Enable Redis for L1 cache to persist across CLI invocations:

Environment Variable:
  REDIS_URL=redis://localhost:6379

Non-Interactive Setup:
  npx nttp setup --non-interactive \\
    --redis-url=redis://localhost:6379 \\
    [other options...]

Configuration (programmatic):
  const nttp = new NTTP({
    cache: {
      redis: {
        url: 'redis://localhost:6379'
      }
    }
  });

Benefits:
  - Cache persists across CLI invocations
  - Shared cache in multi-instance deployments
  - Reduced cold-start latency
  - 24-hour TTL for cached entries

---
`,

  query: `
## Query Command

Execute natural language queries:

  npx nttp query "your question here"

Options:
  -f, --format <type>   Output format: table (default) or json

Examples:
  npx nttp query "show me 5 users"
  npx nttp query "count active orders"
  npx nttp query "top 10 products by price" --format json

Query Patterns:
  - Simple: "show me users"
  - Filtered: "active users from California"
  - Sorted: "top 10 products by price"
  - Aggregated: "count orders by status"
  - Complex: "users who joined this year with orders"

Output:
  - SQL: Generated SQL query
  - Cache: HIT or MISS (which layer)
  - Data: Query results
  - Time: Execution time in ms

---
`,

  api: `
## Programmatic API

### From Environment (.env)

  import { NTTP } from 'nttp';

  const nttp = await NTTP.fromEnv();
  const result = await nttp.query("show me users");
  await nttp.close();

Requires .env file:
  DATABASE_URL=postgresql://...
  DATABASE_TYPE=pg
  LLM_PROVIDER=anthropic
  LLM_MODEL=claude-sonnet-4-5-20250929
  ANTHROPIC_API_KEY=sk-ant-...
  REDIS_URL=redis://localhost:6379  # Optional

### Manual Configuration

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
    },
    cache: {
      redis: {
        url: 'redis://localhost:6379'
      },
      l2: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        apiKey: process.env.OPENAI_API_KEY
      }
    }
  });

  await nttp.init();
  const result = await nttp.query("your question");
  await nttp.close();

### Query Result

  {
    query: string,           // Original natural language query
    data: any[],            // Query results
    sql: string,            // Generated SQL
    params: any[],          // SQL parameters
    schemaId: string,       // Cache key
    cacheHit: boolean,      // Was query cached?
    executionTimeMs: number, // Execution time
    intent: Intent,         // Parsed intent
    meta?: {                // Cache metadata
      cacheLayer: 1 | 2 | 3,
      cost: number,
      latency: number,
      similarity?: number   // For L2 hits
    }
  }

---
`,

  databases: `
## Supported Databases

### PostgreSQL
  Type: pg
  Connection: postgresql://user:pass@host:port/database
  Recommended for: Production

### MySQL
  Type: mysql2
  Connection: mysql://user:pass@host:port/database
  Recommended for: Web applications

### SQLite
  Type: better-sqlite3
  Connection: Path to .db file
  Recommended for: Development, testing

### SQL Server
  Type: mssql
  Connection: Server=host;Database=db;User Id=user;Password=pass
  Recommended for: Enterprise applications

---
`,

  llm: `
## LLM Providers

### Anthropic (Claude)
  Provider: anthropic
  Models: claude-sonnet-4-5-20250929, claude-opus-4-5, claude-haiku-4
  API Key: ANTHROPIC_API_KEY
  Best for: Highest quality SQL generation

### OpenAI (GPT)
  Provider: openai
  Models: gpt-4o, gpt-4-turbo, gpt-3.5-turbo
  API Key: OPENAI_API_KEY
  Best for: Fast and reliable

### Cohere
  Provider: cohere
  Models: command-r-plus, command-r
  API Key: COHERE_API_KEY
  Best for: Enterprise deployments

### Mistral
  Provider: mistral
  Models: mistral-large-latest, mistral-medium
  API Key: MISTRAL_API_KEY
  Best for: Open-source preference

### Google (Gemini)
  Provider: google
  Models: gemini-pro, gemini-ultra
  API Key: GOOGLE_API_KEY
  Best for: Multimodal capabilities

---
`,

  performance: `
## Performance Metrics

### Cache Performance
  L1 (In-Memory): <1ms latency, $0 cost
  L1 (Redis):     ~5ms latency, $0 cost
  L2 (Semantic):  50-100ms latency, ~$0.0001 cost
  L3 (LLM):       2-3s latency, ~$0.01 cost

### Cost Savings
  Without caching: 1000 queries × $0.01 = $10.00
  With caching:    ~$1.00 (90% savings after warmup)

### Hit Rates (typical after warmup)
  L1: 60-70% of queries
  L2: 20-30% of queries
  L3: 5-10% of queries

### Throughput
  Cached queries: >10,000 req/s
  LLM queries:    Limited by API rate limits

---
`,

  troubleshooting: `
## Troubleshooting

### Setup Issues

Q: "Cannot find package 'nttp'"
A: Run: npm install nttp dotenv

Q: "Cannot find package 'dotenv'"
A: Run: npm install dotenv

Q: Setup fails to install dependencies
A: Manually run: npm install nttp dotenv

### Query Issues

Q: Query returns empty results
A: Check database connection and schema
   Verify query makes sense for your data

Q: "SQL generation failed"
A: Check LLM API key is valid
   Ensure LLM provider is correctly configured
   Try simpler query first

Q: Cache always shows MISS
A: First query is always MISS (populates cache)
   Check Redis connection if using Redis
   Verify REDIS_URL is correct

### Connection Issues

Q: "Database connection failed"
A: Verify DATABASE_URL is correct
   Check database server is running
   Confirm network access to database

Q: "Redis connection failed"
A: Verify Redis server is running
   Check REDIS_URL format: redis://host:port
   Confirm network access to Redis

---
`,

  examples: `
## Example Queries

### Simple Queries
  "show me all users"
  "get all products"
  "list recent orders"

### Filtered Queries
  "active users from California"
  "products under $50"
  "orders from last 30 days"
  "pending orders"

### Sorting and Limits
  "top 10 most expensive products"
  "newest 20 users"
  "5 most recent orders"

### Aggregations
  "count users by status"
  "total revenue by category"
  "average order value"

### Complex Queries
  "show users with their order count"
  "products with average rating above 4"
  "top customers by total spent"

---
`,
};

interface DocsOptions {
  query?: string;
}

export function runDocs(query?: string, options: DocsOptions = {}): void {
  const searchQuery = query || options.query;

  if (!searchQuery) {
    // Show all documentation
    console.log('📚 NTTP Documentation\n');
    console.log('='.repeat(60));
    Object.values(DOCS).forEach(section => {
      console.log(section);
    });
    console.log('='.repeat(60));
    console.log('\nSearch docs: npx nttp docs <query>');
    console.log('Examples:');
    console.log('  npx nttp docs redis');
    console.log('  npx nttp docs "cache configuration"');
    console.log('  npx nttp docs setup');
    return;
  }

  // Search/grep through documentation
  const searchTerm = searchQuery.toLowerCase();
  const results: Array<{ section: string; content: string; matches: string[] }> = [];

  Object.entries(DOCS).forEach(([section, content]) => {
    const lines = content.split('\n');
    const matchingLines: string[] = [];

    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(searchTerm)) {
        // Include context: 2 lines before and after
        const start = Math.max(0, index - 2);
        const end = Math.min(lines.length, index + 3);
        const context = lines.slice(start, end).join('\n');
        matchingLines.push(context);
      }
    });

    if (matchingLines.length > 0) {
      results.push({
        section,
        content,
        matches: matchingLines,
      });
    }
  });

  if (results.length === 0) {
    console.log(`❌ No results found for: "${searchQuery}"\n`);
    console.log('💡 Try searching for:');
    console.log('  - setup, query, cache, redis, database, llm, api, examples');
    return;
  }

  console.log(`🔍 Search results for: "${searchQuery}"\n`);
  console.log('='.repeat(60));

  results.forEach(({ section, matches }) => {
    console.log(`\n## ${section.toUpperCase()}\n`);

    // Show unique matches (deduplicate overlapping contexts)
    const uniqueMatches = [...new Set(matches)];
    uniqueMatches.forEach(match => {
      console.log(match);
      console.log('---');
    });
  });

  console.log('='.repeat(60));
  console.log(`\nFound ${results.length} section(s) with "${searchQuery}"`);
  console.log('\nShow all docs: npx nttp docs');
}
