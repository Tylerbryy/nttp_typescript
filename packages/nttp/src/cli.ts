#!/usr/bin/env node
/**
 * nttp CLI - Vercel-inspired developer experience
 */

import { Command } from 'commander';
import { runSetup } from './cli/setup-ink.js';
import { runQuery } from './cli/query.js';
import { runInit } from './cli/init.js';
import { runDocs } from './cli/docs.js';

const program = new Command();

program
  .name('nttp')
  .description('Query databases with natural language')
  .version('1.4.9');

program
  .command('setup')
  .description('Interactive setup wizard (or use --non-interactive for agents)')
  .option('--non-interactive', 'Run setup without interactive prompts (for agents/automation)')
  .option('--database-type <type>', 'Database type: pg, mysql2, better-sqlite3, mssql')
  .option('--database-url <url>', 'Database connection URL')
  .option('--database-path <path>', 'SQLite database path (for better-sqlite3)')
  .option('--llm-provider <provider>', 'LLM provider: anthropic, openai, cohere, mistral, google')
  .option('--llm-model <model>', 'LLM model name')
  .option('--llm-api-key <key>', 'LLM API key')
  .option('--redis-url <url>', 'Redis URL for L1 cache persistence (optional)')
  .option('--enable-l2-cache', 'Enable L2 semantic cache (optional)')
  .option('--embedding-api-key <key>', 'OpenAI API key for embeddings (required if --enable-l2-cache)')
  .action(runSetup);

program
  .command('init')
  .description('Initialize nttp in current project')
  .action(runInit);

program
  .command('query <text>')
  .description('Execute a natural language query')
  .option('-f, --format <type>', 'Output format (json|table)', 'table')
  .action(runQuery);

program
  .command('docs [query]')
  .description('Show documentation (optionally search with query)')
  .option('-q, --query <search>', 'Search query for documentation')
  .action(runDocs);

program.parse();
