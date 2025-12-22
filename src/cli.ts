#!/usr/bin/env node
/**
 * nttp CLI
 * Command-line interface for natural text to query
 */

import { cac } from 'cac';
import { runSetupWizard } from './cli/setup.js';
import { runDiagnostics } from './cli/diagnostics.js';
import * as logger from './cli/logger.js';

const cli = cac('nttp');

// Version from package.json
cli.version('1.0.0');

// Help text
cli.help();

/**
 * nttp setup
 * Interactive configuration wizard
 */
cli
  .command('setup', 'Interactive setup wizard')
  .action(async () => {
    try {
      await runSetupWizard();
    } catch (error: any) {
      logger.error('Setup failed', error.message);
      process.exit(1);
    }
  });

/**
 * nttp dev
 * Start development server with hot reload
 */
cli
  .command('dev', 'Start development server')
  .option('-p, --port <port>', 'Server port', { default: 8000 })
  .action(async (options) => {
    logger.printBanner();
    logger.newline();
    logger.info('Starting development server...');
    logger.newline();

    try {
      // Import and start the server
      const { spawn } = await import('child_process');

      const server = spawn('npx', ['tsx', '--watch', 'src/index.ts'], {
        stdio: 'inherit',
        env: {
          ...process.env,
          PORT: options.port.toString(),
          NODE_ENV: 'development',
        },
      });

      server.on('error', (error) => {
        logger.error('Failed to start server', error.message);
        process.exit(1);
      });

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        logger.newline();
        logger.info('Shutting down development server...');
        server.kill();
        process.exit(0);
      });
    } catch (error: any) {
      logger.error('Failed to start dev server', error.message);
      process.exit(1);
    }
  });

/**
 * nttp start
 * Start production server
 */
cli
  .command('start', 'Start production server')
  .option('-p, --port <port>', 'Server port', { default: 8000 })
  .action(async (options) => {
    logger.printBanner();
    logger.newline();
    logger.info('Starting production server...');
    logger.newline();

    try {
      const { spawn } = await import('child_process');

      const server = spawn('node', ['dist/index.js'], {
        stdio: 'inherit',
        env: {
          ...process.env,
          PORT: options.port.toString(),
          NODE_ENV: 'production',
        },
      });

      server.on('error', (error) => {
        logger.error('Failed to start server', error.message);
        logger.warn('Make sure you ran "npm run build" first');
        process.exit(1);
      });

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        logger.newline();
        logger.info('Shutting down server...');
        server.kill();
        process.exit(0);
      });
    } catch (error: any) {
      logger.error('Failed to start server', error.message);
      process.exit(1);
    }
  });

/**
 * nttp stats
 * Show cache statistics
 */
cli
  .command('stats', 'Show cache statistics')
  .action(async () => {
    logger.printBanner();
    logger.newline();
    logger.info('Fetching cache statistics...');
    logger.newline();

    try {
      const response = await fetch('http://localhost:8000/stats');

      if (!response.ok) {
        throw new Error('Server not responding. Make sure nttp is running.');
      }

      const stats = await response.json() as {
        cache: { l1: number; l2: number };
        hitRates: { l1: number; l2: number; l3: number };
        queries: number;
        costSaved: number;
      };

      logger.section('Cache Statistics');
      logger.newline();

      // L1 Cache
      logger.info('L1 Cache (Exact Match):');
      logger.info(`  Size: ${stats.cache.l1} entries`);
      logger.info(`  Hit Rate: ${(stats.hitRates.l1 * 100).toFixed(1)}%`);
      logger.newline();

      // L2 Cache
      logger.info('L2 Cache (Semantic):');
      logger.info(`  Size: ${stats.cache.l2} entries`);
      logger.info(`  Hit Rate: ${(stats.hitRates.l2 * 100).toFixed(1)}%`);
      logger.newline();

      // L3 LLM
      logger.info('L3 (LLM Fallback):');
      logger.info(`  Hit Rate: ${(stats.hitRates.l3 * 100).toFixed(1)}%`);
      logger.newline();

      // Overall
      logger.section('Overall Performance');
      logger.info(`Total Queries: ${stats.queries}`);
      logger.info(`Cost Saved: $${stats.costSaved.toFixed(4)}`);
      logger.info(`Cache Hit Rate: ${((stats.hitRates.l1 + stats.hitRates.l2) * 100).toFixed(1)}%`);
      logger.newline();
    } catch (error: any) {
      logger.error('Failed to fetch stats', error.message);
      logger.info('Make sure the server is running: nttp dev');
      process.exit(1);
    }
  });

/**
 * nttp doctor
 * Run diagnostics
 */
cli
  .command('doctor', 'Run diagnostics')
  .action(async () => {
    try {
      await runDiagnostics();
    } catch (error: any) {
      logger.error('Diagnostics failed', error.message);
      process.exit(1);
    }
  });

/**
 * nttp query <text>
 * Execute a query from the command line
 */
cli
  .command('query <text>', 'Execute a natural language query')
  .action(async (text: string) => {
    logger.printBanner();
    logger.newline();
    logger.info(`Query: "${text}"`);
    logger.newline();

    try {
      const response = await fetch('http://localhost:8000/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });

      if (!response.ok) {
        throw new Error('Server not responding. Make sure nttp is running.');
      }

      const result = await response.json() as {
        data: any[];
        meta?: {
          cacheLayer: number;
          cost: number;
          latency: number;
        };
        sql?: string;
      };

      logger.section('Results');
      logger.info(`Rows: ${result.data.length}`);

      if (result.meta) {
        logger.info(`Cache Layer: L${result.meta.cacheLayer}`);
        logger.info(`Cost: $${result.meta.cost.toFixed(4)}`);
        logger.info(`Latency: ${result.meta.latency}ms`);
      }

      logger.newline();
      logger.section('Data');
      console.log(JSON.stringify(result.data, null, 2));
      logger.newline();

      if (result.sql) {
        logger.section('Generated SQL');
        logger.code(result.sql, 'sql');
        logger.newline();
      }
    } catch (error: any) {
      logger.error('Query failed', error.message);
      logger.info('Make sure the server is running: nttp dev');
      process.exit(1);
    }
  });

// Parse CLI arguments
cli.parse();
