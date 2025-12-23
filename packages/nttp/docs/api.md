# API Reference

Complete API documentation for NTTP.

## Table of Contents

- [NTTP Class](#nttp-class)
  - [Constructor](#constructor)
  - [Static Methods](#static-methods)
  - [Instance Methods](#instance-methods)
- [Types](#types)
- [Errors](#errors)

---

## NTTP Class

### Constructor

#### `new NTTP(config: NTTPConfig)`

Creates a new NTTP instance with manual configuration.

**Parameters:**

```typescript
interface NTTPConfig {
  database: DatabaseConfig;
  llm: LLMConfig;
  cache?: CacheConfig;
  limits?: LimitsConfig;
}
```

**Example:**

```typescript
import { NTTP } from 'nttp';

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
    l1: { enabled: true, maxSize: 1000 },
    l2: { enabled: true, provider: 'openai', apiKey: process.env.OPENAI_API_KEY },
    redis: { url: 'redis://localhost:6379' }
  }
});
```

See [Configuration](./configuration.md) for all config options.

---

### Static Methods

#### `NTTP.fromEnv(): Promise<NTTP>`

Creates an NTTP instance from environment variables. This is the recommended way to initialize NTTP.

**Environment Variables Required:**

```bash
DATABASE_TYPE=pg
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-...
```

**Optional Environment Variables:**

```bash
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...  # For L2 semantic cache
```

**Example:**

```typescript
import { NTTP } from 'nttp';

// Automatically reads from .env file (using dotenv)
const nttp = await NTTP.fromEnv();
const result = await nttp.query("show me users");
await nttp.close();
```

**Returns:** `Promise<NTTP>` - Initialized NTTP instance (already called `init()`)

**Throws:** `Error` if required environment variables are missing

See [Configuration](./configuration.md#environment-variables) for complete env var reference.

---

### Instance Methods

#### `init(): Promise<void>`

Initializes the NTTP instance by connecting to the database and building the schema cache.

**Required:** Must be called before any queries (unless using `fromEnv()`, which calls this automatically).

**Example:**

```typescript
const nttp = new NTTP({ /* config */ });
await nttp.init();  // Connect to database, build schema cache
```

**Throws:** `Error` if database connection fails

---

#### `query(query: string, options?: QueryOptions): Promise<QueryResult>`

Execute a natural language query against the database.

**Parameters:**

- `query` (string): Natural language query (e.g., "show me active users")
- `options` (optional):
  ```typescript
  interface QueryOptions {
    useCache?: boolean;       // Default: true
    forceNewSchema?: boolean; // Default: false
  }
  ```

**Returns:**

```typescript
interface QueryResult {
  query: string;           // Original natural language query
  data: any[];            // Query results (array of objects)
  schemaId: string;       // Cache key (16-char hash)
  cacheHit: boolean;      // true if result came from cache
  intent: Intent;         // Parsed intent structure
  sql?: string;           // Generated SQL (for debugging)
  params?: any[];         // SQL parameters (for debugging)
  meta?: {                // Cache metadata (v2 only)
    cacheLayer: 1 | 2 | 3;  // Which cache layer was hit
    cost: number;           // Estimated cost in USD
    latency: number;        // Query latency in ms
    similarity?: number;    // Semantic similarity (L2 only)
  };
}
```

**Examples:**

```typescript
// Basic query
const result = await nttp.query("show me 5 users");
console.log(result.data); // Array of user objects

// Filtered query
const active = await nttp.query("active users from California");

// Aggregation
const count = await nttp.query("count pending orders");

// With options
const fresh = await nttp.query("show products", {
  useCache: false,        // Skip cache, always generate new SQL
  forceNewSchema: true    // Force new schema generation
});

// Check cache performance
const result = await nttp.query("show users");
if (result.meta) {
  console.log(`Cache: L${result.meta.cacheLayer}, Cost: $${result.meta.cost}, Latency: ${result.meta.latency}ms`);
}
```

**Throws:**
- `IntentParseError` - Failed to parse natural language query
- `SQLGenerationError` - Failed to generate SQL from intent
- `SQLExecutionError` - Database query execution failed

See [Examples](./examples.md) for comprehensive query examples.

---

#### `explain(query: string): Promise<ExplanationResult>`

Explains what SQL would be generated for a query without executing it. Useful for debugging and understanding how NTTP interprets queries.

**Parameters:**

- `query` (string): Natural language query to explain

**Returns:**

```typescript
interface ExplanationResult {
  query: string;                    // Original query
  intent: Intent;                   // Parsed intent
  sql: string;                      // Generated SQL
  params: any[];                    // SQL parameters
  schemaId: string;                 // Cache key
  cachedSchema: SchemaDefinition | null;  // Cached schema if exists
}
```

**Example:**

```typescript
const explanation = await nttp.explain("top 10 expensive products");

console.log('Intent:', explanation.intent);
// { entity: 'products', operation: 'list', sort: 'price:desc', limit: 10, ... }

console.log('SQL:', explanation.sql);
// SELECT * FROM products ORDER BY price DESC LIMIT ?

console.log('Params:', explanation.params);
// [10]
```

---

#### `close(): Promise<void>`

Closes the database connection and cleans up resources. Always call this when done using NTTP.

**Example:**

```typescript
const nttp = await NTTP.fromEnv();
try {
  const result = await nttp.query("show users");
  console.log(result.data);
} finally {
  await nttp.close();  // Clean up
}
```

---

### Schema Management

#### `listSchemas(): Promise<SchemaDefinition[]>`

Lists all cached schemas (query patterns).

**Returns:** Array of schema definitions with metadata

**Example:**

```typescript
const schemas = await nttp.listSchemas();
schemas.forEach(schema => {
  console.log(`${schema.schema_id}: ${schema.intent_pattern}`);
  console.log(`  Used ${schema.use_count} times`);
  console.log(`  Example: ${schema.example_queries[0]}`);
});
```

---

#### `getSchema(schemaId: string): Promise<SchemaDefinition | null>`

Retrieves a specific cached schema by ID.

**Parameters:**

- `schemaId` (string): 16-character schema hash

**Returns:** Schema definition or null if not found

**Example:**

```typescript
const schema = await nttp.getSchema('a1b2c3d4e5f6g7h8');
if (schema) {
  console.log('SQL:', schema.generated_sql);
  console.log('Used:', schema.use_count);
}
```

---

#### `deleteSchema(schemaId: string): Promise<void>`

Deletes a cached schema.

**Parameters:**

- `schemaId` (string): Schema to delete

**Example:**

```typescript
await nttp.deleteSchema('a1b2c3d4e5f6g7h8');
```

---

#### `pinSchema(schemaId: string): Promise<void>`

Pins a schema to prevent it from being evicted from cache.

**Parameters:**

- `schemaId` (string): Schema to pin

**Example:**

```typescript
// Pin frequently used query pattern
await nttp.pinSchema('a1b2c3d4e5f6g7h8');
```

---

#### `unpinSchema(schemaId: string): Promise<void>`

Unpins a previously pinned schema.

**Parameters:**

- `schemaId` (string): Schema to unpin

---

#### `getCacheStats(): Promise<CacheStats>`

Gets cache statistics and performance metrics.

**Returns:**

```typescript
interface CacheStats {
  totalSchemas: number;
  pinnedSchemas: number;
  totalUseCount: number;
  averageUseCount: number;
  oldestSchema: Date;
  newestSchema: Date;
}
```

**Example:**

```typescript
const stats = await nttp.getCacheStats();
console.log(`Total cached patterns: ${stats.totalSchemas}`);
console.log(`Average uses per pattern: ${stats.averageUseCount}`);
```

---

### Database Inspection

#### `getTables(): Promise<string[]>`

Gets list of all tables in the database.

**Returns:** Array of table names

**Example:**

```typescript
const tables = await nttp.getTables();
console.log('Available tables:', tables);
// ['users', 'products', 'orders', ...]
```

---

#### `getTableSchema(tableName: string): Promise<TableSchema>`

Gets the schema (columns, types, etc.) for a specific table.

**Parameters:**

- `tableName` (string): Name of table to inspect

**Returns:** Table schema with column definitions

**Example:**

```typescript
const schema = await nttp.getTableSchema('users');
console.log('Columns:', schema.columns);
// [{ name: 'id', type: 'integer' }, { name: 'email', type: 'string' }, ...]
```

---

#### `getSchemaDescription(): string`

Gets a human-readable description of the database schema. This is what's sent to the LLM for context.

**Returns:** Formatted schema description string

**Example:**

```typescript
const description = nttp.getSchemaDescription();
console.log(description);
// Tables:
// - users (id: integer, email: string, name: string, ...)
// - products (id: integer, name: string, price: decimal, ...)
```

---

## Types

### Intent

Structured representation of parsed natural language query.

```typescript
interface Intent {
  entity: string;                    // Table name
  operation: OperationType;          // 'list' | 'count' | 'aggregate' | 'filter'
  filters: Record<string, any>;      // Filter conditions
  limit?: number | null;             // Result limit
  fields?: string[] | null;          // Specific fields to select
  sort?: string | null;              // Sort specification (e.g., 'price:desc')
  normalized_text: string;           // Normalized representation for caching
}
```

---

### SchemaDefinition

Cached query pattern.

```typescript
interface SchemaDefinition {
  schema_id: string;                 // 16-char hash
  intent_pattern: string;            // Normalized intent
  generated_sql: string;             // Cached SQL
  sql_params: any[];                 // SQL parameters
  result_schema: Record<string, any>; // Result structure
  use_count: number;                 // Times this pattern was used
  created_at: Date;                  // When cached
  last_used_at: Date;                // Last access time
  example_queries: string[];         // Example natural language queries
  pinned: boolean;                   // Prevent eviction?
}
```

---

## Errors

All NTTP errors include helpful suggestions for resolving issues.

### IntentParseError

Thrown when the LLM cannot parse the natural language query.

```typescript
try {
  await nttp.query("ambiguous query");
} catch (error) {
  if (error instanceof IntentParseError) {
    console.error(error.message);
    console.log('Suggestions:', error.suggestions);
  }
}
```

**Common causes:**
- Query references unknown tables/fields
- Query is too vague or ambiguous
- LLM API unavailable or quota exceeded

---

### SQLGenerationError

Thrown when SQL generation fails or violates safety rules.

```typescript
try {
  await nttp.query("complex query");
} catch (error) {
  if (error instanceof SQLGenerationError) {
    console.error(error.message);
    console.log('Suggestions:', error.suggestions);
  }
}
```

**Common causes:**
- Complex query requires missing table relationships
- Generated SQL violates safety rules
- Schema description incomplete

---

### SQLExecutionError

Thrown when the database rejects the generated SQL.

```typescript
try {
  await nttp.query("show users");
} catch (error) {
  if (error instanceof SQLExecutionError) {
    console.error(error.message);
    console.log('Generated SQL:', error.sql);
    console.log('Suggestions:', error.suggestions);
  }
}
```

**Common causes:**
- Database connection issues
- Table/column doesn't exist (schema mismatch)
- Type mismatch in WHERE clause
- Insufficient permissions

---

### LLMError

Thrown when LLM API calls fail.

**Common causes:**
- Invalid or expired API key
- Rate limit or quota exceeded
- Network connectivity issues
- Provider service outage

---

### CacheError

Thrown when cache operations fail.

**Common causes:**
- Redis connection failed
- Redis authentication error
- Embedding API failure (L2 cache)
- Out of memory

---

## See Also

- [Configuration](./configuration.md) - Complete configuration reference
- [Examples](./examples.md) - Comprehensive usage examples
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
