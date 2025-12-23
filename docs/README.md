# NTTP Documentation

## Overview

**NTTP (Natural Text Transfer Protocol)** is a TypeScript API server that allows you to query databases using natural language. Simply ask questions in plain English, and NTTP translates them into SQL queries using an LLM.

## Key Features

- 🗣️ **Natural Language Queries** - Ask questions like "show me active users" or "top 10 products by rating"
- 🔄 **Multi-Database Support** - Works with SQLite, PostgreSQL, MySQL, and SQL Server
- ⚡ **Fast Performance** - <50ms response time for cached queries
- 🛡️ **Safe by Default** - Read-only query validation prevents destructive operations
- 📊 **Intelligent Caching** - 3-layer cache (exact, semantic, LLM) with optional Redis persistence
- 💾 **Redis Support** - Persistent L1 cache across server restarts and multi-instance deployments
- 🔧 **Easy Setup** - Interactive CLI wizard for configuration

## Documentation

### Architecture

- **[Architecture Overview](./architecture/overview.md)** - Comprehensive architecture diagram and component explanations

### API Reference

- **Swagger Documentation** - Available at `http://localhost:8000/docs` when server is running
- **Main Endpoints**:
  - `POST /query` - Execute natural language queries
  - `GET /schemas` - Manage cached schemas
  - `GET /health` - Health check and statistics

### Getting Started

1. **Setup**: Run `nttp setup` to configure your database and API keys
2. **Start Server**: Run `nttp start` for production or `nttp dev` for development
3. **Test Connection**: Run `nttp test-db` to verify database connectivity
4. **Diagnostics**: Run `nttp doctor` to check system health

### CLI Commands

- `nttp setup` - Interactive configuration wizard
- `nttp dev` - Start development server with hot reload
- `nttp start` - Start production server
- `nttp doctor` - Run health diagnostics
- `nttp test-db` - Test database connection
- `nttp help` - Show help message
- `nttp version` - Show version number

## Quick Example

```bash
# Setup your database and API key
nttp setup

# Start the server
nttp start

# Query your database
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"query": "show me all active users"}'
```

## Performance

- **L1 Cache Hit (In-Memory)**: <1ms response time
- **L1 Cache Hit (Redis)**: ~5ms response time
- **L2 Cache Hit (Semantic)**: ~80ms response time
- **Cache Miss**: ~2-3s (includes LLM API calls)
- **Throughput**: >10,000 requests/second (cached)

## Tech Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Web Framework**: Fastify
- **Database**: Knex.js (universal SQL query builder)
- **AI/LLM**: Anthropic Claude Sonnet 4.5
- **Cache**: Redis (optional) for L1 persistence
- **Embeddings**: OpenAI for semantic L2 cache
- **Validation**: Zod schemas
- **CLI**: prompts, ora, chalk, boxen

## Links

- [Architecture Documentation](./architecture/overview.md)
- [API Documentation](http://localhost:8000/docs) (when server is running)
- [GitHub Repository](https://github.com/yourusername/nttp_typescript)
