# NTTP TypeScript

Natural Text Transfer Protocol - TypeScript Implementation

Query databases using natural language. Built with Fastify, Claude AI, and TypeScript.

## Features

- 🗣️ **Natural Language Queries**: Ask questions in plain English
- 🗄️ **Multi-Database Support**: Works with PostgreSQL, MySQL, SQLite, and SQL Server via Knex.js
- ⚡ **Fast Schema Caching**: Sub-50ms response times for cached queries
- 🔒 **Type-Safe**: Built with strict TypeScript and Zod validation
- 🎯 **Structured Outputs**: Guaranteed valid JSON from Claude API
- 📊 **Automatic Schema Inference**: Powered by knex-schema-inspector
- 🛡️ **Safe Parameter Binding**: Knex handles SQL injection protection across all dialects
- 🔄 **100% API Compatible**: Drop-in replacement for Python NTTP

## Quick Start

### Prerequisites

- Node.js 20+
- Anthropic API key
- A database (PostgreSQL, MySQL, SQLite, or SQL Server)

### Installation

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env and configure your database and ANTHROPIC_API_KEY

# Start the server
npm run dev
```

The server will start at `http://localhost:8000` with interactive API docs at `http://localhost:8000/docs`.

### Database Configuration

NTTP uses Knex.js for database abstraction. Configure via environment variables:

**SQLite** (default):
```bash
DATABASE_TYPE=sqlite3
DATABASE_PATH=./nttp.db
```

**PostgreSQL**:
```bash
DATABASE_TYPE=pg
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

**MySQL**:
```bash
DATABASE_TYPE=mysql2
DATABASE_URL=mysql://user:password@localhost:3306/dbname
```

**SQL Server**:
```bash
DATABASE_TYPE=mssql
DATABASE_URL=Server=localhost,1433;Database=dbname;User Id=user;Password=password;Encrypt=true
```

## Usage

### POST /query

```bash
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "get all active users"}'
```

### GET /query (convenience)

```bash
curl "http://localhost:8000/query?q=show+me+10+products"
```

### Example Queries

```bash
# User queries
"get all active users"
"show me 10 users"
"find suspended users"

# Product queries
"list products in the electronics category"
"find products under $50"
"show expensive products over $500"

# Order queries
"list pending orders"
"find orders over $1000"
"count completed orders"

# Complex queries
"show orders with user details"
"find top 10 customers by total order value"
```

## API Endpoints

### Query Endpoints
- `POST /query` - Execute natural language query
- `GET /query` - Query via GET parameters

### Schema Management
- `GET /schemas` - List all cached schemas
- `GET /schemas/:id` - Get specific schema
- `DELETE /schemas/:id` - Delete schema
- `PUT /schemas/:id/pin` - Pin schema (prevent eviction)
- `PUT /schemas/:id/unpin` - Unpin schema

### Utility
- `GET /intents` - List known intent patterns
- `POST /explain` - Explain query without executing
- `GET /health` - Health check + cache statistics
- `GET /` - API information

## Development

```bash
# Run in development with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

## Architecture

```
src/
├── index.ts              # Fastify server setup
├── config.ts             # Environment configuration (builds Knex config)
├── types/
│   ├── models.ts        # Zod schemas + TypeScript types
│   └── errors.ts        # Custom error classes
├── services/
│   ├── database.ts      # Knex.js database service
│   ├── llm.ts           # Claude API integration
│   ├── intent.ts        # Intent parsing + normalization
│   ├── executor.ts      # Main query pipeline
│   └── schema-cache.ts  # In-memory cache
├── routes/
│   ├── query.ts         # Query endpoints
│   ├── schemas.ts       # Schema management
│   └── utility.ts       # Health, intents, explain
└── utils/
    └── logger.ts        # Pino logging
```

## Technology Stack

- **Framework**: Fastify (async, performant)
- **Validation**: Zod (runtime + compile-time types)
- **Database**: Knex.js (universal SQL query builder)
  - **Schema Introspection**: knex-schema-inspector
  - **Drivers**: better-sqlite3, pg, mysql2, mssql
  - **Connection Pooling**: Built-in with tarn.js
  - **Safe Parameter Binding**: Dialect-aware escaping
- **LLM**: @anthropic-ai/sdk (Claude with structured outputs)
- **Testing**: Vitest (fast, modern test runner)
- **Build**: TypeScript 5.4+ (strict mode)

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-...     # Your Anthropic API key

# Database Configuration (choose one)
DATABASE_TYPE=sqlite3        # sqlite3|pg|mysql2|mssql (default: sqlite3)
DATABASE_PATH=./nttp.db      # For SQLite: file path
DATABASE_URL=...             # For Postgres/MySQL/MSSQL: connection string

# Optional
LOG_LEVEL=INFO               # DEBUG|INFO|WARN|ERROR|FATAL
CLAUDE_MODEL=claude-sonnet-4-5-20250929  # Claude model to use
MAX_QUERY_LENGTH=500         # Maximum query length
DEFAULT_LIMIT=100            # Default result limit
MAX_LIMIT=1000               # Maximum result limit
```

## Performance

- **Cache Hit**: <50ms average response time
- **Cache Miss**: ~2-3s (LLM latency dominant)
- **Throughput**: >10,000 req/s with cache hits

## Comparison with Python Version

| Feature | Python (FastAPI) | TypeScript (Fastify) |
|---------|-----------------|---------------------|
| Framework | FastAPI | Fastify |
| Type System | Pydantic | Zod |
| Database | SQLite only (aiosqlite) | PostgreSQL, MySQL, SQLite, SQL Server (Knex.js) |
| Schema Introspection | Manual PRAGMA | knex-schema-inspector |
| Parameter Binding | Manual `?` replacement | Knex dialect-aware |
| Performance | ~5k req/s | ~15k req/s |
| Startup Time | ~2s | ~200ms |
| API Compatibility | ✅ 100% | ✅ 100% |

## Related Projects

- [NTTP Python](../nttp) - Original Python implementation

## License

MIT
