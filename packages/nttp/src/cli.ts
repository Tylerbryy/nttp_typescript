#!/usr/bin/env node
/**
 * nttp CLI - Vercel-inspired developer experience
 */

import { Command } from 'commander';
import { runSetup } from './cli/setup-ink.js';
import { runQuery } from './cli/query.js';
import { runInit } from './cli/init.js';

const program = new Command();

program
  .name('nttp')
  .description('Query databases with natural language')
  .version('1.4.6');

program
  .command('setup')
  .description('Interactive setup wizard')
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

program.parse();
