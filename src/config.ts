/**
 * Configuration management using Zod for validation.
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import type { Knex } from 'knex';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load .env file if it exists
const envPath = join(rootDir, '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

/**
 * Configuration schema with validation and defaults.
 */
const ConfigSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  DATABASE_TYPE: z
    .enum(['sqlite3', 'pg', 'mysql2', 'mssql'])
    .default('sqlite3'),
  DATABASE_PATH: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z
    .enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'])
    .default('INFO'),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-5-20250929'),
  MAX_QUERY_LENGTH: z.coerce.number().int().positive().default(500),
  DEFAULT_LIMIT: z.coerce.number().int().positive().default(100),
  MAX_LIMIT: z.coerce.number().int().positive().default(1000),
});

/**
 * Type for base configuration object.
 */
type BaseConfig = z.infer<typeof ConfigSchema>;

/**
 * Extended configuration with parsed KNEX_CONFIG.
 */
export interface Config extends Omit<BaseConfig, 'DATABASE_TYPE' | 'DATABASE_PATH' | 'DATABASE_URL'> {
  KNEX_CONFIG: Knex.Config;
}

/**
 * Parse and validate configuration from environment variables.
 */
function loadConfig(): Config {
  let baseConfig: BaseConfig;

  try {
    baseConfig = ConfigSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      for (const issue of error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw error;
  }

  // Build Knex config based on database type
  let knexConfig: Knex.Config;

  switch (baseConfig.DATABASE_TYPE) {
    case 'sqlite3':
      if (!baseConfig.DATABASE_PATH) {
        console.error('DATABASE_PATH is required when DATABASE_TYPE is sqlite3');
        process.exit(1);
      }
      knexConfig = {
        client: 'better-sqlite3',
        connection: {
          filename: baseConfig.DATABASE_PATH,
        },
        useNullAsDefault: true,
      };
      break;

    case 'pg':
      if (!baseConfig.DATABASE_URL) {
        console.error('DATABASE_URL is required when DATABASE_TYPE is pg');
        process.exit(1);
      }
      knexConfig = {
        client: 'pg',
        connection: baseConfig.DATABASE_URL,
        pool: { min: 2, max: 10 },
      };
      break;

    case 'mysql2':
      if (!baseConfig.DATABASE_URL) {
        console.error('DATABASE_URL is required when DATABASE_TYPE is mysql2');
        process.exit(1);
      }
      knexConfig = {
        client: 'mysql2',
        connection: baseConfig.DATABASE_URL,
        pool: { min: 2, max: 10 },
      };
      break;

    case 'mssql':
      if (!baseConfig.DATABASE_URL) {
        console.error('DATABASE_URL is required when DATABASE_TYPE is mssql');
        process.exit(1);
      }
      knexConfig = {
        client: 'mssql',
        connection: baseConfig.DATABASE_URL,
        pool: { min: 2, max: 10 },
      };
      break;

    default:
      throw new Error(`Unsupported database type: ${(baseConfig as any).DATABASE_TYPE}`);
  }

  // Return config with KNEX_CONFIG instead of individual DB fields
  const { DATABASE_TYPE, DATABASE_PATH, DATABASE_URL, ...rest } = baseConfig;

  return {
    ...rest,
    KNEX_CONFIG: knexConfig,
  };
}

/**
 * Global configuration instance.
 */
export const config = loadConfig();
