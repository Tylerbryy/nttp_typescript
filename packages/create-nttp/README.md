# create-nttp

Scaffold a new NTTP project in seconds.

## Usage

```bash
npx create-nttp my-api
```

Or with npm:

```bash
npm create nttp my-api
```

## What You Get

Interactive setup wizard that creates a ready-to-run NTTP project with:

- ✅ TypeScript configuration
- ✅ Database driver installed
- ✅ Environment variables setup
- ✅ Example code
- ✅ README with instructions

## Templates

### Standalone API (Fastify)

Full-featured API server with:
- Fastify web server
- NTTP plugin pre-configured
- Swagger documentation
- Ready-to-deploy

### Library Only

Minimal setup for using NTTP programmatically:
- Core NTTP library
- Example usage code
- Perfect for integrating into existing apps

## Quick Start

```bash
# Create project
npx create-nttp my-store-api

# Navigate to project
cd my-store-api

# Add your API key to .env
# ANTHROPIC_API_KEY=sk-ant-...

# Start development server
npm run dev
```

## Options

```bash
create-nttp [project-name]
```

The CLI will prompt you for:
1. Project template (API or Library)
2. Database type (SQLite, PostgreSQL, MySQL, SQL Server)
3. Install dependencies now?

## Examples

### Create API with PostgreSQL

```bash
npx create-nttp ecommerce-api
# Choose: Standalone API
# Choose: PostgreSQL
# Choose: Yes (install deps)
```

### Create Library for Existing App

```bash
npx create-nttp nttp-integration
# Choose: Library only
# Choose: SQLite
# Choose: Yes
```

## What's Created

```
my-api/
├── src/
│   └── index.ts        # Main entry point
├── .env.example        # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
