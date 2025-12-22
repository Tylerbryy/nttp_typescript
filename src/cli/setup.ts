/**
 * Interactive setup wizard for NTTP.
 * Guides users through configuration with beautiful prompts.
 */

import prompts from 'prompts';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as logger from './logger.js';

interface SetupConfig {
  databaseType: 'sqlite3' | 'pg' | 'mysql2' | 'mssql';
  databasePath?: string;
  databaseUrl?: string;
  anthropicApiKey: string;
  port: number;
  logLevel: string;
}

/**
 * Run interactive setup wizard.
 */
export async function runSetupWizard(): Promise<void> {
  logger.printBanner();
  logger.newline();

  logger.info('Welcome to NTTP setup! Let\'s configure your database.');
  logger.newline();

  // Check if .env already exists
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: '.env file already exists. Overwrite?',
      initial: false,
    });

    if (!overwrite) {
      logger.warn('Setup cancelled. Existing .env file preserved.');
      return;
    }
  }

  // Database type selection
  const { databaseType } = await prompts({
    type: 'select',
    name: 'databaseType',
    message: 'Which database do you want to use?',
    choices: [
      {
        title: 'SQLite (easiest, file-based)',
        value: 'sqlite3',
        description: 'Perfect for development and small projects',
      },
      {
        title: 'PostgreSQL (recommended for production)',
        value: 'pg',
        description: 'Powerful, reliable, great for scaling',
      },
      {
        title: 'MySQL',
        value: 'mysql2',
        description: 'Popular, widely supported',
      },
      {
        title: 'SQL Server',
        value: 'mssql',
        description: 'Microsoft SQL Server',
      },
    ],
    initial: 0,
  });

  if (!databaseType) {
    logger.error('Setup cancelled');
    return;
  }

  const config: Partial<SetupConfig> = { databaseType };

  // Database-specific configuration
  if (databaseType === 'sqlite3') {
    const { path } = await prompts({
      type: 'text',
      name: 'path',
      message: 'SQLite database file path:',
      initial: './nttp.db',
    });
    config.databasePath = path;

    // Offer to create sample database
    const { createSample } = await prompts({
      type: 'confirm',
      name: 'createSample',
      message: 'Create sample database with test data?',
      initial: true,
    });

    if (createSample) {
      await createSampleDatabase(path);
    }
  } else {
    const { url } = await prompts({
      type: 'text',
      name: 'url',
      message: `${databaseType.toUpperCase()} connection string:`,
      initial: getDefaultConnectionString(databaseType),
    });
    config.databaseUrl = url;
  }

  // Anthropic API key
  const { apiKey } = await prompts({
    type: 'password',
    name: 'apiKey',
    message: 'Anthropic API key:',
    validate: (value: string) =>
      value.startsWith('sk-ant-') ? true : 'API key should start with "sk-ant-"',
  });

  if (!apiKey) {
    logger.error('Setup cancelled');
    return;
  }

  config.anthropicApiKey = apiKey;

  // Optional: Port configuration
  const { customizePort } = await prompts({
    type: 'confirm',
    name: 'customizePort',
    message: 'Customize server port? (default: 8000)',
    initial: false,
  });

  if (customizePort) {
    const { port } = await prompts({
      type: 'number',
      name: 'port',
      message: 'Server port:',
      initial: 8000,
    });
    config.port = port;
  } else {
    config.port = 8000;
  }

  // Log level
  const { logLevel } = await prompts({
    type: 'select',
    name: 'logLevel',
    message: 'Log level:',
    choices: [
      { title: 'INFO (recommended)', value: 'INFO' },
      { title: 'DEBUG (verbose)', value: 'DEBUG' },
      { title: 'WARN (quiet)', value: 'WARN' },
      { title: 'ERROR (minimal)', value: 'ERROR' },
    ],
    initial: 0,
  });

  config.logLevel = logLevel || 'INFO';

  // Generate .env file
  const envContent = generateEnvFile(config as SetupConfig);
  writeFileSync(envPath, envContent);

  logger.newline();
  logger.successBox(
    `Configuration saved to .env!\n\nYou're ready to start NTTP.`,
    '✨ Setup Complete'
  );

  logger.newline();
  logger.section('Next Steps');
  logger.info('Start the development server:');
  logger.code('npm run dev', 'bash');
  logger.newline();
  logger.info('Or build for production:');
  logger.code('npm run build && npm start', 'bash');
  logger.newline();
  logger.link('Documentation', 'https://github.com/your-org/nttp');
  logger.link('API Docs (after starting)', `http://localhost:${config.port}/docs`);
  logger.newline();
}

/**
 * Get default connection string template.
 */
function getDefaultConnectionString(dbType: string): string {
  switch (dbType) {
    case 'pg':
      return 'postgresql://user:password@localhost:5432/dbname';
    case 'mysql2':
      return 'mysql://user:password@localhost:3306/dbname';
    case 'mssql':
      return 'Server=localhost,1433;Database=dbname;User Id=user;Password=password;Encrypt=true';
    default:
      return '';
  }
}

/**
 * Generate .env file content.
 */
function generateEnvFile(config: SetupConfig): string {
  const lines = [
    '# NTTP Configuration',
    '# Generated by setup wizard',
    '',
    `ANTHROPIC_API_KEY=${config.anthropicApiKey}`,
    '',
    '# Database Configuration',
    `DATABASE_TYPE=${config.databaseType}`,
  ];

  if (config.databasePath) {
    lines.push(`DATABASE_PATH=${config.databasePath}`);
  } else if (config.databaseUrl) {
    lines.push(`DATABASE_URL=${config.databaseUrl}`);
  }

  lines.push(
    '',
    '# Server Configuration',
    `PORT=${config.port}`,
    `LOG_LEVEL=${config.logLevel}`,
    '',
    '# Claude Configuration',
    'CLAUDE_MODEL=claude-sonnet-4-5-20250929',
    'MAX_QUERY_LENGTH=500',
    'DEFAULT_LIMIT=100',
    'MAX_LIMIT=1000'
  );

  return lines.join('\n') + '\n';
}

/**
 * Create sample SQLite database with test data.
 */
async function createSampleDatabase(path: string): Promise<void> {
  const spinner = logger.spinner('Creating sample database...');

  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(path);

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL,
        category TEXT,
        stock INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        total REAL,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Insert sample data
    db.exec(`
      INSERT INTO users (name, email, status) VALUES
        ('Alice Johnson', 'alice@example.com', 'active'),
        ('Bob Smith', 'bob@example.com', 'active'),
        ('Charlie Brown', 'charlie@example.com', 'suspended'),
        ('Diana Prince', 'diana@example.com', 'active');

      INSERT INTO products (name, price, category, stock) VALUES
        ('Laptop', 999.99, 'Electronics', 15),
        ('Mouse', 29.99, 'Electronics', 50),
        ('Desk Chair', 199.99, 'Furniture', 8),
        ('Coffee Mug', 12.99, 'Kitchen', 100),
        ('Monitor', 349.99, 'Electronics', 12);

      INSERT INTO orders (user_id, total, status) VALUES
        (1, 1029.98, 'completed'),
        (2, 12.99, 'pending'),
        (1, 549.98, 'completed'),
        (3, 199.99, 'cancelled'),
        (4, 999.99, 'pending');
    `);

    db.close();

    spinner.succeed('Sample database created with test data!');
    logger.newline();
    logger.info('Sample data includes:');
    logger.success('4 users (3 active, 1 suspended)');
    logger.success('5 products across categories');
    logger.success('5 orders with different statuses');
  } catch (error) {
    spinner.fail('Failed to create sample database');
    logger.error(
      'Could not create sample database',
      'You can create it manually or connect to an existing database'
    );
  }
}
