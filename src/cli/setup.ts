/**
 * Interactive setup wizard for nttp.
 * Guides users through configuration with beautiful prompts.
 */

import prompts from 'prompts';
import { writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import * as logger from './logger.js';

interface SetupConfig {
  databaseType: 'sqlite3' | 'pg' | 'mysql2' | 'mssql';
  databasePath?: string;
  databaseUrl?: string;
  llmProvider: 'anthropic' | 'openai' | 'cohere' | 'mistral' | 'google';
  llmModel: string;
  llmApiKey: string;
  embeddingProvider: 'openai' | 'cohere' | 'mistral' | 'google';
  embeddingModel: string;
  embeddingApiKey: string;
  port: number;
  logLevel: string;
  enableRedis?: boolean;
  redisUrl?: string;
}

/**
 * Run interactive setup wizard.
 */
export async function runSetupWizard(): Promise<void> {
  logger.printBanner();
  logger.newline();

  logger.info('Welcome to nttp setup! Let\'s configure your database.');
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

  // Track database seeding intent (defer execution until after .env is written)
  let seedOptions: { path: string; size: 'full' | 'small' } | null = null;

  // Database-specific configuration
  if (databaseType === 'sqlite3') {
    const { path: dbPath } = await prompts({
      type: 'text',
      name: 'path',
      message: 'SQLite database file path:',
      initial: './nttp.db',
    });
    // Convert to absolute path to avoid issues with different CWDs
    config.databasePath = resolve(dbPath);

    // Offer to create sample database (store intent, don't execute yet)
    const { createSample } = await prompts({
      type: 'select',
      name: 'createSample',
      message: 'Create sample e-commerce database?',
      choices: [
        {
          title: 'Yes, full dataset (10k users, 5k products, 50k orders) ~60MB',
          value: 'full',
          description: 'Rich dataset for realistic testing',
        },
        {
          title: 'Yes, small dataset (500 users, 500 products, 2k orders) ~5MB',
          value: 'small',
          description: 'Good for testing semantic search',
        },
        {
          title: 'No, I have my own database',
          value: 'none',
        },
      ],
      initial: 0,
    });

    if (createSample === 'full' || createSample === 'small') {
      // Store intent - will execute after .env is written
      seedOptions = {
        path: config.databasePath!,
        size: createSample as 'full' | 'small',
      };
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

  // LLM provider selection
  const { llmProvider } = await prompts({
    type: 'select',
    name: 'llmProvider',
    message: 'Which LLM provider for query parsing?',
    choices: [
      {
        title: 'Anthropic (Claude) - recommended',
        value: 'anthropic',
        description: 'Claude Sonnet 4.5 - best reasoning',
      },
      {
        title: 'OpenAI (GPT)',
        value: 'openai',
        description: 'GPT-4o - fast and reliable',
      },
      {
        title: 'Cohere',
        value: 'cohere',
        description: 'Command R Plus',
      },
    ],
    initial: 0,
  });

  if (!llmProvider) {
    logger.error('Setup cancelled');
    return;
  }

  config.llmProvider = llmProvider;

  // Set default model based on provider
  const llmModels: Record<string, string> = {
    anthropic: 'claude-sonnet-4-5-20250929',
    openai: 'gpt-4o',
    cohere: 'command-r-plus',
    mistral: 'mistral-large-latest',
    google: 'gemini-1.5-pro',
  };
  config.llmModel = llmModels[llmProvider];

  // LLM API key
  const llmKeyPrefixes: Record<string, string> = {
    anthropic: 'sk-ant-',
    openai: 'sk-',
    cohere: 'co-', // Note: Some Cohere keys may have different prefixes
    mistral: 'ms-',
    google: 'AIza', // Google AI Studio keys start with AIza
  };

  const { llmApiKey } = await prompts({
    type: 'password',
    name: 'llmApiKey',
    message: `${llmProvider.toUpperCase()} API key:`,
    validate: (value: string) => {
      if (!value || value.length < 10) {
        return 'API key must be at least 10 characters';
      }
      // Looser validation for Cohere (trial keys may differ)
      if (llmProvider === 'cohere') {
        return true;
      }
      return value.startsWith(llmKeyPrefixes[llmProvider])
        ? true
        : `API key should start with "${llmKeyPrefixes[llmProvider]}"`;
    },
  });

  if (!llmApiKey) {
    logger.error('Setup cancelled');
    return;
  }

  config.llmApiKey = llmApiKey;

  // Ask if user wants to use same provider for embeddings
  let embeddingProvider: 'openai' | 'cohere' | 'mistral' | 'google';
  let distinctEmbeddingConfig = false; // Track if user wants separate embedding config

  // Only offer same-provider option if LLM provider supports embeddings
  const providersWithEmbeddings = ['openai', 'cohere', 'mistral', 'google'];

  if (providersWithEmbeddings.includes(llmProvider)) {
    const { useSameProvider } = await prompts({
      type: 'select',
      name: 'useSameProvider',
      message: 'Embedding provider for semantic cache (L2)?',
      choices: [
        {
          title: `Use ${llmProvider.toUpperCase()} for everything (recommended)`,
          value: 'same',
          description: `Reuse ${llmProvider} API key - simpler setup`,
        },
        {
          title: 'Use different provider for embeddings',
          value: 'different',
          description: 'Mix and match providers (advanced)',
        },
      ],
      initial: 0,
    });

    if (!useSameProvider) {
      logger.error('Setup cancelled');
      return;
    }

    if (useSameProvider === 'same') {
      embeddingProvider = llmProvider as typeof embeddingProvider;
      distinctEmbeddingConfig = false; // Same config, will reuse API key
    } else {
      distinctEmbeddingConfig = true; // User wants separate config
      // Ask for embedding provider
      const response = await prompts({
        type: 'select',
        name: 'embeddingProvider',
        message: 'Which embedding provider?',
        choices: [
          {
            title: 'OpenAI',
            value: 'openai',
            description: 'text-embedding-3-small - best quality/price',
          },
          {
            title: 'Cohere',
            value: 'cohere',
            description: 'embed-v4.0 - fast and multilingual',
          },
          {
            title: 'Mistral',
            value: 'mistral',
            description: 'mistral-embed - good for French/English',
          },
          {
            title: 'Google',
            value: 'google',
            description: 'text-embedding-004 - powerful',
          },
        ],
        initial: 0,
      });

      if (!response.embeddingProvider) {
        logger.error('Setup cancelled');
        return;
      }

      embeddingProvider = response.embeddingProvider;
    }
  } else {
    // Anthropic doesn't have embeddings, so must use separate provider
    distinctEmbeddingConfig = true; // Always distinct for Anthropic
    const response = await prompts({
      type: 'select',
      name: 'embeddingProvider',
      message: 'Which embedding provider for semantic cache?',
      choices: [
        {
          title: 'OpenAI - recommended',
          value: 'openai',
          description: 'text-embedding-3-small - best quality/price',
        },
        {
          title: 'Cohere',
          value: 'cohere',
          description: 'embed-v4.0 - fast and multilingual',
        },
        {
          title: 'Mistral',
          value: 'mistral',
          description: 'mistral-embed - good for French/English',
        },
        {
          title: 'Google',
          value: 'google',
          description: 'text-embedding-004 - powerful',
        },
      ],
      initial: 0,
    });

    if (!response.embeddingProvider) {
      logger.error('Setup cancelled');
      return;
    }

    embeddingProvider = response.embeddingProvider;
  }

  config.embeddingProvider = embeddingProvider;

  // Set default embedding model (matches config.ts defaults)
  const embeddingModels: Record<string, string> = {
    openai: 'text-embedding-3-small',
    cohere: 'embed-v4.0',
    mistral: 'mistral-embed',
    google: 'text-embedding-004',
  };
  config.embeddingModel = embeddingModels[embeddingProvider];

  // Embedding API key (ask if distinct config requested OR different provider)
  if (distinctEmbeddingConfig) {
    const { embeddingApiKey } = await prompts({
      type: 'password',
      name: 'embeddingApiKey',
      message: `${embeddingProvider.toUpperCase()} API key for embeddings:`,
      validate: (value: string) => {
        if (!value || value.length < 10) {
          return 'API key must be at least 10 characters';
        }
        // Looser validation for Cohere (trial keys may differ)
        if (embeddingProvider === 'cohere') {
          return true;
        }
        return value.startsWith(llmKeyPrefixes[embeddingProvider])
          ? true
          : `API key should start with "${llmKeyPrefixes[embeddingProvider]}"`;
      },
    });

    if (!embeddingApiKey) {
      logger.error('Setup cancelled');
      return;
    }

    config.embeddingApiKey = embeddingApiKey;
  } else {
    // Reuse LLM API key (user selected "Use {PROVIDER} for everything")
    config.embeddingApiKey = llmApiKey;
  }

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

  // Redis setup (optional)
  logger.newline();
  const { enableRedis } = await prompts({
    type: 'select',
    name: 'enableRedis',
    message: 'Enable persistent caching with Redis?',
    choices: [
      {
        title: 'No (use in-memory cache)',
        value: false,
        description: 'Default - caching is ephemeral, restarts clear cache',
      },
      {
        title: 'Yes (setup Redis with Docker)',
        value: true,
        description: 'Production-ready - persistent cache survives restarts',
      },
    ],
    initial: 0,
  });

  config.enableRedis = enableRedis;
  let needsDockerCompose = false;

  if (enableRedis) {
    // Check if Docker is available
    const hasDocker = checkDockerAvailable();

    if (!hasDocker) {
      logger.warn('Docker is not installed or not running.');
      logger.info('Install Docker from: https://docs.docker.com/get-docker/');
      logger.newline();

      const { manualRedis } = await prompts({
        type: 'confirm',
        name: 'manualRedis',
        message: 'Continue with manual Redis setup?',
        initial: false,
      });

      if (manualRedis) {
        const { redisUrl } = await prompts({
          type: 'text',
          name: 'redisUrl',
          message: 'Redis connection URL:',
          initial: 'redis://localhost:6379',
        });
        config.redisUrl = redisUrl;
      } else {
        logger.info('Skipping Redis setup. You can enable it later by adding REDIS_URL to .env');
        config.enableRedis = false;
      }
    } else {
      // Docker is available - offer to generate docker-compose.yml
      logger.success('Docker detected!');
      const { useDockerCompose } = await prompts({
        type: 'confirm',
        name: 'useDockerCompose',
        message: 'Generate docker-compose.yml for Redis?',
        initial: true,
      });

      if (useDockerCompose) {
        needsDockerCompose = true;
        config.redisUrl = 'redis://localhost:6379';
      } else {
        const { redisUrl } = await prompts({
          type: 'text',
          name: 'redisUrl',
          message: 'Redis connection URL:',
          initial: 'redis://localhost:6379',
        });
        config.redisUrl = redisUrl;
      }
    }
  }

  // Generate .env file
  const envContent = generateEnvFile(config as SetupConfig);
  writeFileSync(envPath, envContent);

  // Generate docker-compose.yml if needed
  if (needsDockerCompose) {
    const dockerComposePath = join(process.cwd(), 'docker-compose.yml');
    const dockerComposeContent = generateDockerCompose();
    writeFileSync(dockerComposePath, dockerComposeContent);
    logger.success('Generated docker-compose.yml');
  }

  // Execute database seeding now (after .env is written)
  if (seedOptions) {
    logger.newline();
    logger.info('Generating sample database... This may take a moment.');
    logger.newline();
    await createRichDatabase(seedOptions.path, seedOptions.size);
  }

  logger.newline();
  logger.successBox(
    `Configuration saved to .env!\n\nYou're ready to start nttp.`,
    '✨ Setup Complete'
  );

  logger.newline();
  logger.section('Next Steps');

  // Add Redis startup instructions if needed
  if (needsDockerCompose) {
    logger.info('1. Start Redis with Docker:');
    logger.code('docker-compose up -d', 'bash');
    logger.newline();
    logger.info('2. Start the development server:');
    logger.code('npm run dev', 'bash');
    logger.newline();
    logger.info('To stop Redis:');
    logger.code('docker-compose down', 'bash');
  } else {
    logger.info('Start the development server:');
    logger.code('npm run dev', 'bash');
  }

  logger.newline();
  logger.info('Or build for production:');
  logger.code('npm run build && npm start', 'bash');
  logger.newline();
  logger.link('Documentation', 'https://github.com/your-org/nttp');
  logger.link('API Docs (after starting)', `http://localhost:${config.port}/docs`);
  logger.newline();
}

/**
 * Check if Docker is available.
 */
function checkDockerAvailable(): boolean {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate docker-compose.yml content for Redis.
 */
function generateDockerCompose(): string {
  return `# nttp - Redis Cache
# Generated by setup wizard

version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: nttp-redis
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  redis-data:
    driver: local
`;
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
    '# nttp configuration',
    '# Generated by setup wizard',
    '',
    '# LLM Provider Configuration',
    `LLM_PROVIDER=${config.llmProvider}`,
    `LLM_MODEL=${config.llmModel}`,
  ];

  // Add appropriate API key based on provider
  const apiKeyNames: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    cohere: 'COHERE_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    google: 'GOOGLE_API_KEY',
  };

  lines.push(`${apiKeyNames[config.llmProvider]}=${config.llmApiKey}`);

  // Add embedding API key if different
  if (config.embeddingProvider !== config.llmProvider) {
    lines.push(`${apiKeyNames[config.embeddingProvider]}=${config.embeddingApiKey}`);
  }

  lines.push(
    '',
    '# Database Configuration',
    `DATABASE_TYPE=${config.databaseType}`,
  );

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
    'MAX_QUERY_LENGTH=500',
    'DEFAULT_LIMIT=100',
    'MAX_LIMIT=1000',
    '',
    '# 3-Layer Cache Configuration',
    `EMBEDDING_PROVIDER=${config.embeddingProvider}`,
    `EMBEDDING_MODEL=${config.embeddingModel}`,
    'L1_CACHE_SIZE=1000',
    'L2_CACHE_SIZE=500',
    'SIMILARITY_THRESHOLD=0.85'
  );

  // Add Redis configuration if enabled
  if (config.enableRedis && config.redisUrl) {
    lines.push(
      '',
      '# Redis L1 Cache (optional - enables persistent caching)',
      `REDIS_URL=${config.redisUrl}`
    );
  }

  return lines.join('\n') + '\n';
}

/**
 * Create rich e-commerce database with realistic data.
 */
async function createRichDatabase(path: string, size: 'full' | 'small'): Promise<void> {
  try {
    const { seedRichDatabase } = await import('./seed-database.js');

    const counts =
      size === 'full'
        ? {
            users: 10000,
            products: 5000,
            orders: 50000,
            reviews: 25000,
          }
        : {
            users: 500,
            products: 500,
            orders: 2000,
            reviews: 1500,
          };

    await seedRichDatabase(path, counts);

    logger.newline();
    logger.info('Sample queries to try:');
    logger.code(
      `"top 10 customers by total spend"\n` +
        `"products with 4+ star ratings under $100"\n` +
        `"orders from California in the last 30 days"\n` +
        `"most reviewed products in Electronics"\n` +
        `"pending orders over $500"`,
      'natural language'
    );
  } catch (error: any) {
    logger.error(
      'Failed to create sample database',
      error.message || 'You can create it manually or connect to an existing database'
    );
  }
}
