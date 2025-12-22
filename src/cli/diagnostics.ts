/**
 * Health diagnostics and troubleshooting.
 * Helps users identify and fix configuration issues.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as logger from './logger.js';
import Table from 'cli-table3';
import chalk from 'chalk';

interface DiagnosticCheck {
  name: string;
  passed: boolean;
  message: string;
  fix?: string;
}

/**
 * Run comprehensive diagnostics.
 */
export async function runDiagnostics(): Promise<void> {
  logger.printBanner();
  logger.newline();
  logger.section('Running Diagnostics');
  logger.newline();

  const checks: DiagnosticCheck[] = [];

  // Check 1: .env file exists
  const envPath = join(process.cwd(), '.env');
  const envExists = existsSync(envPath);
  checks.push({
    name: 'Environment File',
    passed: envExists,
    message: envExists ? '.env file found' : '.env file not found',
    fix: envExists ? undefined : 'Run: npm run setup',
  });

  if (envExists) {
    const envContent = readFileSync(envPath, 'utf-8');

    // Check 2: ANTHROPIC_API_KEY
    const hasApiKey = envContent.includes('ANTHROPIC_API_KEY=sk-ant-');
    checks.push({
      name: 'Anthropic API Key',
      passed: hasApiKey,
      message: hasApiKey ? 'API key configured' : 'API key missing or invalid',
      fix: hasApiKey ? undefined : 'Add ANTHROPIC_API_KEY=sk-ant-... to .env',
    });

    // Check 3: DATABASE_TYPE
    const dbTypeMatch = envContent.match(/DATABASE_TYPE=(\w+)/);
    const dbType = dbTypeMatch?.[1];
    const validDbTypes = ['sqlite3', 'pg', 'mysql2', 'mssql'];
    const hasValidDbType = dbType && validDbTypes.includes(dbType);
    checks.push({
      name: 'Database Type',
      passed: !!hasValidDbType,
      message: hasValidDbType
        ? `Database type: ${dbType}`
        : `Invalid or missing DATABASE_TYPE`,
      fix: hasValidDbType
        ? undefined
        : `Set DATABASE_TYPE to one of: ${validDbTypes.join(', ')}`,
    });

    // Check 4: Database configuration
    if (dbType === 'sqlite3') {
      const hasPath = envContent.includes('DATABASE_PATH=');
      checks.push({
        name: 'SQLite Path',
        passed: hasPath,
        message: hasPath ? 'Database path configured' : 'DATABASE_PATH missing',
        fix: hasPath ? undefined : 'Add DATABASE_PATH=./nttp.db to .env',
      });

      // Check if SQLite file exists
      const pathMatch = envContent.match(/DATABASE_PATH=(.+)/);
      const dbPath = pathMatch?.[1]?.trim();
      if (dbPath) {
        const dbExists = existsSync(dbPath);
        checks.push({
          name: 'SQLite File',
          passed: dbExists,
          message: dbExists ? 'Database file exists' : `Database file not found: ${dbPath}`,
          fix: dbExists
            ? undefined
            : 'Create database or run: npm run setup (with sample data)',
        });
      }
    } else {
      const hasUrl = envContent.includes('DATABASE_URL=');
      checks.push({
        name: 'Database URL',
        passed: hasUrl,
        message: hasUrl ? 'Connection string configured' : 'DATABASE_URL missing',
        fix: hasUrl ? undefined : 'Add DATABASE_URL to .env',
      });
    }
  }

  // Check 5: Required dependencies
  const packageJsonPath = join(process.cwd(), 'package.json');
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const requiredDeps = ['knex', 'fastify', '@ai-sdk/anthropic', 'ai'];
    const missingDeps = requiredDeps.filter((dep) => !packageJson.dependencies?.[dep]);

    checks.push({
      name: 'Dependencies',
      passed: missingDeps.length === 0,
      message:
        missingDeps.length === 0
          ? 'All dependencies installed'
          : `Missing: ${missingDeps.join(', ')}`,
      fix: missingDeps.length === 0 ? undefined : 'Run: npm install',
    });
  }

  // Check 6: Node version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  const validNodeVersion = majorVersion >= 20;
  checks.push({
    name: 'Node.js Version',
    passed: validNodeVersion,
    message: `Node ${nodeVersion}`,
    fix: validNodeVersion ? undefined : 'Upgrade to Node.js 20 or higher',
  });

  // Check 7: TypeScript compilation
  const distExists = existsSync(join(process.cwd(), 'dist'));
  checks.push({
    name: 'Build Status',
    passed: distExists,
    message: distExists ? 'Build artifacts found' : 'Project not built',
    fix: distExists ? undefined : 'Run: npm run build',
  });

  // Display results
  displayDiagnostics(checks);

  // Summary
  logger.newline();
  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;

  if (passed === total) {
    logger.successBox(
      `All checks passed! (${passed}/${total})\n\nYour NTTP installation is healthy.`,
      '✅ Diagnostics Complete'
    );
    logger.newline();
    logger.info('Ready to start:');
    logger.code('npm run dev', 'bash');
  } else {
    logger.errorBox(
      `${total - passed} issue(s) found\n\nPlease fix the issues above to continue.`,
      '⚠️  Diagnostics Complete'
    );
    logger.newline();
    logger.info('Need help? Run:');
    logger.code('npm run setup', 'bash');
  }

  logger.newline();
}

/**
 * Display diagnostics in a table.
 */
function displayDiagnostics(checks: DiagnosticCheck[]): void {
  const table = new Table({
    head: [
      chalk.bold('Check'),
      chalk.bold('Status'),
      chalk.bold('Details'),
    ],
    colWidths: [25, 10, 50],
    style: {
      head: ['cyan'],
      border: ['gray'],
    },
  });

  for (const check of checks) {
    const status = check.passed
      ? chalk.green('✔ PASS')
      : chalk.red('✖ FAIL');

    const details = check.passed
      ? chalk.dim(check.message)
      : `${check.message}\n${chalk.yellow('Fix:')} ${check.fix}`;

    table.push([check.name, status, details]);
  }

  console.log(table.toString());
}

/**
 * Test database connection.
 */
export async function testConnection(): Promise<void> {
  logger.printBanner();
  logger.newline();
  logger.section('Testing Database Connection');
  logger.newline();

  const spinner = logger.spinner('Connecting to database...');

  try {
    // Dynamically import to avoid circular dependencies
    const { initDb, getAllTables, closeDb } = await import('../services/database.js');

    await initDb();
    spinner.succeed('Connected to database!');

    const tablesSpinner = logger.spinner('Fetching tables...');
    const tables = await getAllTables();
    tablesSpinner.succeed(`Found ${tables.length} table(s)`);

    logger.newline();
    if (tables.length > 0) {
      logger.info('Tables:');
      tables.forEach((table) => {
        logger.success(table);
      });
    } else {
      logger.warn('No tables found in database');
      logger.info('You can create sample data with: npm run setup');
    }

    await closeDb();

    logger.newline();
    logger.successBox(
      'Database connection successful!\n\nYou\'re ready to query with natural language.',
      '✅ Connection Test'
    );
  } catch (error: any) {
    spinner.fail('Connection failed');
    logger.newline();
    logger.errorBox(
      `${error.message}\n\nCheck your DATABASE_TYPE and connection string in .env`,
      '❌ Connection Error'
    );
    logger.newline();
    logger.info('Common issues:');
    logger.error('SQLite: Check DATABASE_PATH points to valid file');
    logger.error('PostgreSQL: Ensure server is running on specified port');
    logger.error('MySQL: Verify credentials and database exists');
    logger.error('SQL Server: Check connection string format');
  }

  logger.newline();
}
