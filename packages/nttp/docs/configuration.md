# Configuration Reference

Complete reference for all NTTP configuration options.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Configuration Object](#configuration-object)
- [Database Configuration](#database-configuration)
- [LLM Configuration](#llm-configuration)
- [Cache Configuration](#cache-configuration)
- [Limits Configuration](#limits-configuration)
- [Configuration Examples](#configuration-examples)

---

## Environment Variables

### Using NTTP.fromEnv()

The recommended way to configure NTTP is via environment variables using `NTTP.fromEnv()`.

```typescript
import { NTTP } from 'nttp';

const nttp = await NTTP.fromEnv();
```

### Required Environment Variables

```bash
# Database Configuration
DATABASE_TYPE=pg              # pg | mysql2 | better-sqlite3 | mssql
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb

# For SQLite, use DATABASE_PATH instead of DATABASE_URL
# DATABASE_TYPE=better-sqlite3
# DATABASE_PATH=./data.db

# LLM Configuration
LLM_PROVIDER=anthropic        # anthropic | openai | cohere | mistral | google
LLM_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-...  # Or OPENAI_API_KEY, COHERE_API_KEY, etc.
```

### Optional Environment Variables

```bash
# Redis L1 Cache (recommended for production)
REDIS_URL=redis://localhost:6379

# L2 Semantic Cache (requires OpenAI)
OPENAI_API_KEY=sk-...         # Automatically enables L2 if present

# LLM Configuration
LLM_MAX_TOKENS=2048           # Default: 2048

# Cache Configuration
CACHE_L1_ENABLED=true         # Default: true
CACHE_L1_MAX_SIZE=1000        # Default: 1000
CACHE_L2_ENABLED=true         # Default: false (true if OPENAI_API_KEY set)
CACHE_L2_MAX_SIZE=500         # Default: 500
CACHE_L2_SIMILARITY_THRESHOLD=0.85  # Default: 0.85

# Query Limits
MAX_QUERY_LENGTH=500          # Default: 500
DEFAULT_LIMIT=100             # Default: 100
MAX_LIMIT=1000                # Default: 1000
```

### .env File Example

Create a `.env` file in your project root:

```bash
# Database
DATABASE_TYPE=pg
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# LLM
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-api-key-here

# Cache (production setup)
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-openai-api-key-here

# Limits
MAX_QUERY_LENGTH=500
DEFAULT_LIMIT=100
MAX_LIMIT=1000
```

Then load with dotenv:

```typescript
import 'dotenv/config';
import { NTTP } from 'nttp';

const nttp = await NTTP.fromEnv();
```

---

## Configuration Object

### Full Configuration Interface

```typescript
interface NTTPConfig {
  database: DatabaseConfig;
  llm: LLMConfig;
  cache?: CacheConfig;
  limits?: LimitsConfig;
}
```

### Using Manual Configuration

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
    l1: { enabled: true, maxSize: 1000 },
    l2: { enabled: true, provider: 'openai', apiKey: process.env.OPENAI_API_KEY },
    redis: { url: 'redis://localhost:6379' }
  },
  limits: {
    maxQueryLength: 500,
    defaultLimit: 100,
    maxLimit: 1000
  }
});

await nttp.init();
```

---

## Database Configuration

### Interface

```typescript
interface DatabaseConfig {
  client: 'pg' | 'mysql2' | 'better-sqlite3' | 'mssql';
  connection: string | Knex.ConnectionConfig;
}
```

### PostgreSQL

```typescript
database: {
  client: 'pg',
  connection: 'postgresql://user:password@localhost:5432/database'
}

// Or with detailed config
database: {
  client: 'pg',
  connection: {
    host: 'localhost',
    port: 5432,
    user: 'myuser',
    password: 'mypassword',
    database: 'mydb',
    ssl: false
  }
}
```

**Environment Variables:**

```bash
DATABASE_TYPE=pg
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
```

---

### MySQL

```typescript
database: {
  client: 'mysql2',
  connection: 'mysql://user:password@localhost:3306/database'
}

// Or with detailed config
database: {
  client: 'mysql2',
  connection: {
    host: 'localhost',
    port: 3306,
    user: 'myuser',
    password: 'mypassword',
    database: 'mydb'
  }
}
```

**Environment Variables:**

```bash
DATABASE_TYPE=mysql2
DATABASE_URL=mysql://user:pass@localhost:3306/mydb
```

---

### SQLite

```typescript
database: {
  client: 'better-sqlite3',
  connection: {
    filename: './data.db'
  }
}
```

**Environment Variables:**

```bash
DATABASE_TYPE=better-sqlite3
DATABASE_PATH=./data.db
```

---

### SQL Server

```typescript
database: {
  client: 'mssql',
  connection: {
    server: 'localhost',
    database: 'mydb',
    user: 'sa',
    password: 'password',
    options: {
      encrypt: true,
      trustServerCertificate: true
    }
  }
}
```

**Environment Variables:**

```bash
DATABASE_TYPE=mssql
DATABASE_URL=Server=localhost;Database=mydb;User Id=sa;Password=pass;
```

---

## LLM Configuration

### Interface

```typescript
interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'cohere' | 'mistral' | 'google';
  model: string;
  apiKey: string;
  maxTokens?: number;  // Default: 2048
}
```

### Anthropic (Claude)

```typescript
llm: {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929',  // Recommended
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxTokens: 2048
}
```

**Environment Variables:**

```bash
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-...
LLM_MAX_TOKENS=2048
```

**Available Models:**
- `claude-sonnet-4-5-20250929` (recommended) - Best balance
- `claude-opus-4-5-20251101` - Most capable, slower
- `claude-haiku-4-20250514` - Fastest, less capable

See [Models Guide](./models.md) for detailed comparison.

---

### OpenAI (GPT)

```typescript
llm: {
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY,
  maxTokens: 2048
}
```

**Environment Variables:**

```bash
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
OPENAI_API_KEY=sk-...
```

**Available Models:**
- `gpt-4o` - Fast and capable
- `gpt-4-turbo` - Good balance
- `gpt-3.5-turbo` - Fastest, less accurate

---

### Cohere

```typescript
llm: {
  provider: 'cohere',
  model: 'command-r-plus',
  apiKey: process.env.COHERE_API_KEY
}
```

**Environment Variables:**

```bash
LLM_PROVIDER=cohere
LLM_MODEL=command-r-plus
COHERE_API_KEY=...
```

---

### Mistral

```typescript
llm: {
  provider: 'mistral',
  model: 'mistral-large-latest',
  apiKey: process.env.MISTRAL_API_KEY
}
```

**Environment Variables:**

```bash
LLM_PROVIDER=mistral
LLM_MODEL=mistral-large-latest
MISTRAL_API_KEY=...
```

---

### Google (Gemini)

```typescript
llm: {
  provider: 'google',
  model: 'gemini-pro',
  apiKey: process.env.GOOGLE_API_KEY
}
```

**Environment Variables:**

```bash
LLM_PROVIDER=google
LLM_MODEL=gemini-pro
GOOGLE_API_KEY=...
```

---

## Cache Configuration

### Interface

```typescript
interface CacheConfig {
  l1?: L1CacheConfig;
  l2?: L2CacheConfig;
  redis?: RedisCacheConfig;
}

interface L1CacheConfig {
  enabled?: boolean;   // Default: true
  maxSize?: number;    // Default: 1000
}

interface L2CacheConfig {
  enabled?: boolean;              // Default: false
  provider?: 'openai';            // Only OpenAI currently
  model?: string;                 // Default: 'text-embedding-3-small'
  apiKey?: string;                // Required if enabled
  maxSize?: number;               // Default: 500
  similarityThreshold?: number;   // Default: 0.85 (0-1)
}

interface RedisCacheConfig {
  url: string;  // Redis connection URL
}
```

### L1 Cache (In-Memory)

```typescript
cache: {
  l1: {
    enabled: true,
    maxSize: 1000  // Number of queries to cache
  }
}
```

**Environment Variables:**

```bash
CACHE_L1_ENABLED=true
CACHE_L1_MAX_SIZE=1000
```

**When to use:**
- Development
- Single-instance deployments
- When cache persistence not needed

---

### L1 Cache (Redis)

```typescript
cache: {
  l1: {
    enabled: true,
    maxSize: 1000
  },
  redis: {
    url: 'redis://localhost:6379'
  }
}
```

**Environment Variables:**

```bash
CACHE_L1_ENABLED=true
CACHE_L1_MAX_SIZE=1000
REDIS_URL=redis://localhost:6379
```

**Redis URL Formats:**

```bash
# Basic
REDIS_URL=redis://localhost:6379

# With auth
REDIS_URL=redis://:password@localhost:6379

# With database selection
REDIS_URL=redis://localhost:6379/0

# TLS
REDIS_URL=rediss://localhost:6380

# Cloud (e.g., Upstash)
REDIS_URL=rediss://default:password@fly-cache.upstash.io:6379
```

**When to use:**
- Production deployments
- CLI tools
- Multi-instance applications
- When cache persistence required

---

### L2 Cache (Semantic)

```typescript
cache: {
  l2: {
    enabled: true,
    provider: 'openai',
    model: 'text-embedding-3-small',
    apiKey: process.env.OPENAI_API_KEY,
    maxSize: 500,
    similarityThreshold: 0.85
  }
}
```

**Environment Variables:**

```bash
CACHE_L2_ENABLED=true
CACHE_L2_MAX_SIZE=500
CACHE_L2_SIMILARITY_THRESHOLD=0.85
OPENAI_API_KEY=sk-...
```

**Similarity Threshold Guide:**

| Threshold | Strictness | Use Case |
|-----------|------------|----------|
| 0.95+ | Very strict | Financial, critical queries |
| 0.85-0.95 | Moderate (recommended) | General purpose |
| 0.75-0.85 | Loose | High variation, less critical |
| <0.75 | Too loose | Not recommended |

**When to use:**
- High query variation
- Customer-facing applications
- Natural language interfaces
- When users rephrase queries

---

### Complete Cache Setup

```typescript
cache: {
  // L1: In-memory + Redis for persistence
  l1: {
    enabled: true,
    maxSize: 1000
  },
  redis: {
    url: 'redis://localhost:6379'
  },
  // L2: Semantic matching
  l2: {
    enabled: true,
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    maxSize: 500,
    similarityThreshold: 0.85
  }
}
```

---

## Limits Configuration

### Interface

```typescript
interface LimitsConfig {
  maxQueryLength?: number;  // Default: 500
  defaultLimit?: number;    // Default: 100
  maxLimit?: number;        // Default: 1000
}
```

### Configuration

```typescript
limits: {
  maxQueryLength: 500,  // Max characters in natural language query
  defaultLimit: 100,    // Default LIMIT if not specified in query
  maxLimit: 1000        // Maximum LIMIT allowed
}
```

**Environment Variables:**

```bash
MAX_QUERY_LENGTH=500
DEFAULT_LIMIT=100
MAX_LIMIT=1000
```

### Field Descriptions

**maxQueryLength:**
- Maximum characters allowed in natural language query
- Prevents abuse/very long queries
- Default: 500 characters

**defaultLimit:**
- Default SQL LIMIT if user doesn't specify
- Applied to queries like "show users" → "LIMIT 100"
- Default: 100 rows

**maxLimit:**
- Maximum LIMIT allowed even if user requests more
- "show me 10000 users" → capped at 1000
- Prevents resource exhaustion
- Default: 1000 rows

---

## Configuration Examples

### Minimal Development Setup

```typescript
const nttp = new NTTP({
  database: {
    client: 'better-sqlite3',
    connection: { filename: './dev.db' }
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-haiku-4-20250514',  // Fastest for dev
    apiKey: process.env.ANTHROPIC_API_KEY
  }
});
```

---

### Production Setup (Single Instance)

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
      url: process.env.REDIS_URL
    }
  }
});
```

---

### Production Setup (Multi-Instance with L2)

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
    l1: { maxSize: 1000 },
    redis: { url: process.env.REDIS_URL },
    l2: {
      enabled: true,
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      similarityThreshold: 0.85
    }
  },
  limits: {
    maxQueryLength: 500,
    defaultLimit: 100,
    maxLimit: 1000
  }
});
```

---

### CLI Tool Setup

```bash
# .env file
DATABASE_TYPE=pg
DATABASE_URL=postgresql://...
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-...
REDIS_URL=redis://localhost:6379
```

```typescript
// Uses NTTP.fromEnv() automatically
import { NTTP } from 'nttp';

const nttp = await NTTP.fromEnv();
const result = await nttp.query(process.argv[2]);
console.log(result.data);
await nttp.close();
```

---

### Customer-Facing Application

```typescript
const nttp = new NTTP({
  database: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: false }
    }
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: 2048
  },
  cache: {
    l1: { enabled: true, maxSize: 2000 },
    redis: { url: process.env.REDIS_URL },
    l2: {
      enabled: true,
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      maxSize: 1000,
      similarityThreshold: 0.85  // Handle query variations
    }
  },
  limits: {
    maxQueryLength: 300,   // Reasonable for customer queries
    defaultLimit: 50,      // Smaller default for UX
    maxLimit: 500          // Prevent large result sets
  }
});
```

---

## See Also

- [Caching Guide](./caching.md) - Deep dive into cache system
- [Models Guide](./models.md) - LLM selection guide
- [Production Guide](./production.md) - Deployment best practices
- [API Reference](./api.md) - Complete API documentation
