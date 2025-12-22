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
  // LLM Provider Configuration
  LLM_PROVIDER: z
    .enum(['anthropic', 'openai', 'cohere', 'mistral', 'google'])
    .default('anthropic'),
  LLM_MODEL: z.string().default('claude-sonnet-4-5-20250929'),

  // API Keys (provider-specific)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),

  // Database Configuration
  DATABASE_TYPE: z
    .enum(['sqlite3', 'pg', 'mysql2', 'mssql'])
    .default('sqlite3'),
  DATABASE_PATH: z.string().optional(),
  DATABASE_URL: z.string().optional(),

  // Server Configuration
  LOG_LEVEL: z
    .enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'])
    .default('INFO'),
  MAX_QUERY_LENGTH: z.coerce.number().int().positive().default(500),
  DEFAULT_LIMIT: z.coerce.number().int().positive().default(100),
  MAX_LIMIT: z.coerce.number().int().positive().default(1000),

  // 3-Layer Cache Configuration
  EMBEDDING_PROVIDER: z
    .enum(['openai', 'cohere', 'mistral', 'google'])
    .default('openai'),
  EMBEDDING_MODEL: z.string().optional(), // Provider-specific defaults applied in loadConfig()
  L1_CACHE_SIZE: z.coerce.number().int().positive().default(1000),
  L2_CACHE_SIZE: z.coerce.number().int().positive().default(500),
  SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),

  // Optional Redis L1 Cache
  REDIS_URL: z
    .string()
    .url()
    .optional()
    .describe(
      'Connection string for Redis L1 Cache (e.g. redis://localhost:6379)'
    ),

  // Optional LanceDB Path for L2 Vector Store
  LANCEDB_PATH: z
    .string()
    .default('./.nttp/vectors')
    .describe('Path to store vector embeddings'),
});

/**
 * Type for base configuration object.
 */
type BaseConfig = z.infer<typeof ConfigSchema>;

/**
 * Extended configuration with parsed KNEX_CONFIG, LLM_CONFIG, and EMBEDDING_CONFIG.
 */
export interface Config extends Omit<BaseConfig,
  'DATABASE_TYPE' | 'DATABASE_PATH' | 'DATABASE_URL' |
  'LLM_PROVIDER' | 'LLM_MODEL' | 'EMBEDDING_PROVIDER' | 'EMBEDDING_MODEL' |
  'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY' | 'COHERE_API_KEY' | 'MISTRAL_API_KEY' | 'GOOGLE_API_KEY'
> {
  KNEX_CONFIG: Knex.Config;
  LLM_CONFIG: {
    provider: 'anthropic' | 'openai' | 'cohere' | 'mistral' | 'google';
    model: string;
    apiKey: string;
    maxTokens: number;
  };
  EMBEDDING_CONFIG: {
    provider: 'openai' | 'cohere' | 'mistral' | 'google';
    model: string;
    apiKey: string;
  };
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

  // Determine API key based on provider
  let llmApiKey: string;
  switch (baseConfig.LLM_PROVIDER) {
    case 'anthropic':
      if (!baseConfig.ANTHROPIC_API_KEY) {
        console.error('ANTHROPIC_API_KEY is required when LLM_PROVIDER is anthropic');
        process.exit(1);
      }
      llmApiKey = baseConfig.ANTHROPIC_API_KEY;
      break;
    case 'openai':
      if (!baseConfig.OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY is required when LLM_PROVIDER is openai');
        process.exit(1);
      }
      llmApiKey = baseConfig.OPENAI_API_KEY;
      break;
    case 'cohere':
      if (!baseConfig.COHERE_API_KEY) {
        console.error('COHERE_API_KEY is required when LLM_PROVIDER is cohere');
        process.exit(1);
      }
      llmApiKey = baseConfig.COHERE_API_KEY;
      break;
    case 'mistral':
      if (!baseConfig.MISTRAL_API_KEY) {
        console.error('MISTRAL_API_KEY is required when LLM_PROVIDER is mistral');
        process.exit(1);
      }
      llmApiKey = baseConfig.MISTRAL_API_KEY;
      break;
    case 'google':
      if (!baseConfig.GOOGLE_API_KEY) {
        console.error('GOOGLE_API_KEY is required when LLM_PROVIDER is google');
        process.exit(1);
      }
      llmApiKey = baseConfig.GOOGLE_API_KEY;
      break;
    default:
      throw new Error(`Unsupported LLM provider: ${baseConfig.LLM_PROVIDER}`);
  }

  // Build LLM config
  const llmConfig = {
    provider: baseConfig.LLM_PROVIDER,
    model: baseConfig.LLM_MODEL,
    apiKey: llmApiKey,
    maxTokens: 2048,
  };

  // Determine embedding API key and default model based on provider
  let embeddingApiKey: string;
  let embeddingModel: string;

  switch (baseConfig.EMBEDDING_PROVIDER) {
    case 'openai':
      if (!baseConfig.OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER is openai');
        process.exit(1);
      }
      embeddingApiKey = baseConfig.OPENAI_API_KEY;
      embeddingModel = baseConfig.EMBEDDING_MODEL || 'text-embedding-3-small';
      break;
    case 'cohere':
      if (!baseConfig.COHERE_API_KEY) {
        console.error('COHERE_API_KEY is required when EMBEDDING_PROVIDER is cohere');
        process.exit(1);
      }
      embeddingApiKey = baseConfig.COHERE_API_KEY;
      embeddingModel = baseConfig.EMBEDDING_MODEL || 'embed-v4.0';
      break;
    case 'mistral':
      if (!baseConfig.MISTRAL_API_KEY) {
        console.error('MISTRAL_API_KEY is required when EMBEDDING_PROVIDER is mistral');
        process.exit(1);
      }
      embeddingApiKey = baseConfig.MISTRAL_API_KEY;
      embeddingModel = baseConfig.EMBEDDING_MODEL || 'mistral-embed';
      break;
    case 'google':
      if (!baseConfig.GOOGLE_API_KEY) {
        console.error('GOOGLE_API_KEY is required when EMBEDDING_PROVIDER is google');
        process.exit(1);
      }
      embeddingApiKey = baseConfig.GOOGLE_API_KEY;
      embeddingModel = baseConfig.EMBEDDING_MODEL || 'text-embedding-004';
      break;
    default:
      throw new Error(`Unsupported embedding provider: ${baseConfig.EMBEDDING_PROVIDER}`);
  }

  // Build embedding config
  const embeddingConfig = {
    provider: baseConfig.EMBEDDING_PROVIDER,
    model: embeddingModel,
    apiKey: embeddingApiKey,
  };

  // Return config with KNEX_CONFIG, LLM_CONFIG, and EMBEDDING_CONFIG
  const {
    DATABASE_TYPE,
    DATABASE_PATH,
    DATABASE_URL,
    LLM_PROVIDER,
    LLM_MODEL,
    EMBEDDING_PROVIDER,
    EMBEDDING_MODEL,
    ANTHROPIC_API_KEY,
    OPENAI_API_KEY,
    COHERE_API_KEY,
    MISTRAL_API_KEY,
    GOOGLE_API_KEY,
    ...rest
  } = baseConfig;

  return {
    ...rest,
    KNEX_CONFIG: knexConfig,
    LLM_CONFIG: llmConfig,
    EMBEDDING_CONFIG: embeddingConfig,
  };
}

/**
 * Global configuration instance.
 */
export const config = loadConfig();
