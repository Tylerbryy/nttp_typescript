# Usage Examples

Comprehensive examples for using NTTP in various scenarios.

## Table of Contents

- [Basic Queries](#basic-queries)
- [Filtered Queries](#filtered-queries)
- [Aggregations](#aggregations)
- [Sorting and Limits](#sorting-and-limits)
- [Advanced Queries](#advanced-queries)
- [Error Handling](#error-handling)
- [Using with Express](#using-with-express)
- [Using with Next.js](#using-with-nextjs)
- [CLI Integration](#cli-integration)

---

## Basic Queries

### Simple SELECT

```typescript
import { NTTP } from 'nttp';

const nttp = await NTTP.fromEnv();

// Get all users
const users = await nttp.query("show me all users");
console.log(users.data);
// [{ id: 1, name: 'John', email: 'john@example.com' }, ...]

// Get all products
const products = await nttp.query("list all products");

// Get all orders
const orders = await nttp.query("show orders");

await nttp.close();
```

---

### Specific Fields

```typescript
// Get only specific fields
const emails = await nttp.query("show user emails");
// [{ email: 'john@example.com' }, { email: 'jane@example.com' }, ...]

// Multiple fields
const names = await nttp.query("show user names and emails");
// [{ name: 'John', email: 'john@example.com' }, ...]
```

---

## Filtered Queries

### Simple Filters

```typescript
// Filter by status
const active = await nttp.query("show active users");
// WHERE status = 'active'

// Filter by category
const electronics = await nttp.query("products in Electronics category");
// WHERE category = 'Electronics'

// Filter by state
const californiaUsers = await nttp.query("users from California");
// WHERE state = 'California'
```

---

### Multiple Filters

```typescript
// Multiple conditions
const result = await nttp.query("active premium users from California");
// WHERE status = 'active' AND tier = 'premium' AND state = 'California'

// Complex filtering
const orders = await nttp.query("pending orders over $500");
// WHERE status = 'pending' AND total > 500
```

---

### Range Filters

```typescript
// Price range
const affordable = await nttp.query("products under $50");
// WHERE price < 50

// Date range
const recent = await nttp.query("orders from the last 30 days");
// WHERE created_at > NOW() - INTERVAL '30 days'

// Rating filter
const topRated = await nttp.query("products with 4+ star rating");
// WHERE rating >= 4
```

---

## Aggregations

### COUNT

```typescript
// Count all
const userCount = await nttp.query("count all users");
console.log(userCount.data);
// [{ count: 1523 }]

// Count with filter
const pendingCount = await nttp.query("count pending orders");
// [{ count: 42 }]

// Count by group
const byStatus = await nttp.query("count users by status");
// [{ status: 'active', count: 1200 }, { status: 'inactive', count: 323 }]
```

---

### SUM / AVG

```typescript
// Total revenue
const revenue = await nttp.query("total revenue");
// [{ total: 125000.50 }]

// Average order value
const avgOrder = await nttp.query("average order value");
// [{ average: 85.25 }]

// Sum by category
const categoryRevenue = await nttp.query("total revenue by category");
// [{ category: 'Electronics', total: 50000 }, ...]
```

---

## Sorting and Limits

### Sorting

```typescript
// Sort ascending
const alphabetical = await nttp.query("users sorted alphabetically");
// ORDER BY name ASC

// Sort descending
const expensive = await nttp.query("products sorted by price highest first");
// ORDER BY price DESC

// Sort by date
const newest = await nttp.query("orders sorted by newest first");
// ORDER BY created_at DESC
```

---

### Limits

```typescript
// Fixed limit
const top5 = await nttp.query("show me 5 users");
// LIMIT 5

// Top N pattern
const top10Products = await nttp.query("top 10 products by price");
// ORDER BY price DESC LIMIT 10

// First N pattern
const recent20 = await nttp.query("first 20 recent orders");
// ORDER BY created_at DESC LIMIT 20
```

---

## Advanced Queries

### Checking Cache Performance

```typescript
const result = await nttp.query("show active users");

if (result.meta) {
  console.log(`Cache Layer: L${result.meta.cacheLayer}`);
  console.log(`Cost: $${result.meta.cost}`);
  console.log(`Latency: ${result.meta.latency}ms`);

  if (result.meta.similarity) {
    console.log(`Similarity: ${result.meta.similarity}`);
  }
}

// Output:
// Cache Layer: L2
// Cost: $0.0001
// Latency: 75ms
// Similarity: 0.92
```

---

### Force Fresh Query

```typescript
// Skip cache, always generate new SQL
const fresh = await nttp.query("show users", {
  useCache: false,
  forceNewSchema: true
});

console.log(fresh.cacheHit); // false
console.log(fresh.sql);      // Generated SQL
```

---

### Explain Query

```typescript
// See what SQL would be generated without executing
const explanation = await nttp.explain("top 10 expensive products");

console.log('Intent:', explanation.intent);
// { entity: 'products', operation: 'list', sort: 'price:desc', limit: 10 }

console.log('SQL:', explanation.sql);
// SELECT * FROM products ORDER BY price DESC LIMIT ?

console.log('Params:', explanation.params);
// [10]
```

---

## Error Handling

### Basic Try-Catch

```typescript
import {
  IntentParseError,
  SQLGenerationError,
  SQLExecutionError
} from 'nttp';

try {
  const result = await nttp.query("ambiguous query");
} catch (error) {
  if (error instanceof IntentParseError) {
    console.error('Failed to understand query');
    console.log('Suggestions:', error.suggestions);
  } else if (error instanceof SQLGenerationError) {
    console.error('Failed to generate SQL');
    console.log('Suggestions:', error.suggestions);
  } else if (error instanceof SQLExecutionError) {
    console.error('Query execution failed');
    console.log('SQL:', error.sql);
    console.log('Suggestions:', error.suggestions);
  }
}
```

---

### Production Error Handling

```typescript
async function safeQuery(query: string) {
  try {
    return await nttp.query(query);
  } catch (error) {
    if (error instanceof IntentParseError) {
      return {
        error: 'Could not understand your query. Please try rephrasing.',
        suggestions: error.suggestions
      };
    } else if (error instanceof SQLGenerationError) {
      return {
        error: 'Could not generate database query. Please simplify your request.',
        suggestions: error.suggestions
      };
    } else if (error instanceof SQLExecutionError) {
      return {
        error: 'Database error occurred. Please contact support.',
        suggestions: error.suggestions
      };
    }
    throw error; // Re-throw unknown errors
  }
}

const result = await safeQuery("show users");
if ('error' in result) {
  console.error(result.error);
} else {
  console.log(result.data);
}
```

---

## Using with Express

### Basic API Endpoint

```typescript
import express from 'express';
import { NTTP } from 'nttp';

const app = express();
const nttp = await NTTP.fromEnv();

app.get('/api/query', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }

    const result = await nttp.query(q);

    res.json({
      data: result.data,
      cacheHit: result.cacheHit,
      meta: result.meta
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      suggestions: error.suggestions || []
    });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));

// Usage:
// GET /api/query?q=show%20active%20users
```

---

### With Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const queryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later'
});

app.get('/api/query', queryLimiter, async (req, res) => {
  // ... query logic
});
```

---

## Using with Next.js

### App Router (Server Actions)

```typescript
// app/actions.ts
'use server';

import { NTTP } from 'nttp';

let nttpInstance: NTTP | null = null;

async function getNTTP() {
  if (!nttpInstance) {
    nttpInstance = await NTTP.fromEnv();
  }
  return nttpInstance;
}

export async function queryDatabase(query: string) {
  try {
    const nttp = await getNTTP();
    const result = await nttp.query(query);

    return {
      success: true,
      data: result.data,
      cacheHit: result.cacheHit,
      meta: result.meta
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      suggestions: error.suggestions || []
    };
  }
}
```

```typescript
// app/page.tsx
'use client';

import { useState } from 'react';
import { queryDatabase } from './actions';

export default function QueryPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleQuery() {
    setLoading(true);
    const result = await queryDatabase(query);
    setResults(result);
    setLoading(false);
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask a question..."
      />
      <button onClick={handleQuery} disabled={loading}>
        {loading ? 'Loading...' : 'Query'}
      </button>

      {results?.success && (
        <pre>{JSON.stringify(results.data, null, 2)}</pre>
      )}

      {results?.error && (
        <div className="error">
          {results.error}
          <ul>
            {results.suggestions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

### API Routes

```typescript
// app/api/query/route.ts
import { NTTP } from 'nttp';
import { NextRequest, NextResponse } from 'next/server';

let nttp: NTTP | null = null;

async function getNTTP() {
  if (!nttp) {
    nttp = await NTTP.fromEnv();
  }
  return nttp;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter required' },
      { status: 400 }
    );
  }

  try {
    const nttpInstance = await getNTTP();
    const result = await nttpInstance.query(query);

    return NextResponse.json({
      data: result.data,
      cacheHit: result.cacheHit,
      meta: result.meta
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message,
        suggestions: error.suggestions || []
      },
      { status: 500 }
    );
  }
}
```

---

## CLI Integration

### Simple CLI Tool

```typescript
#!/usr/bin/env node
import { NTTP } from 'nttp';

const query = process.argv.slice(2).join(' ');

if (!query) {
  console.error('Usage: query-cli <natural language query>');
  process.exit(1);
}

const nttp = await NTTP.fromEnv();

try {
  const result = await nttp.query(query);

  console.log('\nResults:');
  console.table(result.data);

  if (result.meta) {
    console.log(`\nCache: L${result.meta.cacheLayer} | Cost: $${result.meta.cost} | Latency: ${result.meta.latency}ms`);
  }
} catch (error) {
  console.error('Error:', error.message);
  if (error.suggestions) {
    console.log('\nSuggestions:');
    error.suggestions.forEach((s: string) => console.log(`  • ${s}`));
  }
  process.exit(1);
} finally {
  await nttp.close();
}
```

**Usage:**

```bash
./query-cli "show active users"
./query-cli "count pending orders"
./query-cli "top 10 products by price"
```

---

### Interactive CLI

```typescript
#!/usr/bin/env node
import { NTTP } from 'nttp';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'nttp> '
});

const nttp = await NTTP.fromEnv();

console.log('NTTP Interactive Query Tool');
console.log('Type your questions in natural language, or "exit" to quit\n');

rl.prompt();

rl.on('line', async (line) => {
  const query = line.trim();

  if (query === 'exit' || query === 'quit') {
    await nttp.close();
    process.exit(0);
  }

  if (!query) {
    rl.prompt();
    return;
  }

  try {
    const result = await nttp.query(query);
    console.table(result.data);

    if (result.meta) {
      console.log(`L${result.meta.cacheLayer} | $${result.meta.cost} | ${result.meta.latency}ms`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }

  rl.prompt();
});
```

---

## See Also

- [API Reference](./api.md) - Complete API documentation
- [Configuration](./configuration.md) - Configuration options
- [Production Guide](./production.md) - Production deployment tips
- [Troubleshooting](./troubleshooting.md) - Common issues
