/**
 * Interactive setup wizard - Vercel-inspired DX
 */

import prompts from 'prompts';
import { existsSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';

interface SetupConfig {
  databaseType: 'pg' | 'mysql2' | 'better-sqlite3' | 'mssql';
  databaseUrl?: string;
  databasePath?: string;
  llmProvider: 'anthropic' | 'openai' | 'cohere' | 'mistral' | 'google';
  llmModel: string;
  llmApiKey: string;
  enableL2Cache: boolean;
  embeddingProvider?: 'openai' | 'cohere';
  embeddingApiKey?: string;
}

const DATABASE_DRIVERS = {
  pg: { name: 'pg', description: 'PostgreSQL' },
  mysql2: { name: 'mysql2', description: 'MySQL' },
  'better-sqlite3': { name: 'better-sqlite3', description: 'SQLite' },
  mssql: { name: 'mssql', description: 'SQL Server' },
};

const LLM_PROVIDERS = {
  anthropic: {
    name: '@ai-sdk/anthropic',
    defaultModel: 'claude-sonnet-4-5-20250929',
    envKey: 'ANTHROPIC_API_KEY',
  },
  openai: {
    name: '@ai-sdk/openai',
    defaultModel: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
  },
  cohere: {
    name: '@ai-sdk/cohere',
    defaultModel: 'command-r-plus',
    envKey: 'COHERE_API_KEY',
  },
  mistral: {
    name: '@ai-sdk/mistral',
    defaultModel: 'mistral-large-latest',
    envKey: 'MISTRAL_API_KEY',
  },
  google: {
    name: '@ai-sdk/google-vertex',
    defaultModel: 'gemini-pro',
    envKey: 'GOOGLE_API_KEY',
  },
};

export async function runSetup(): Promise<void> {
  console.clear();

  // Welcome banner
  console.log(
    boxen(
      chalk.bold.cyan('nttp setup') +
        '\n\n' +
        chalk.gray('Query databases with natural language') +
        '\n' +
        chalk.gray('Inspired by Vercel DX ✨'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );

  // Check for existing .env
  if (existsSync('.env')) {
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: chalk.yellow('.env already exists. Overwrite?'),
      initial: false,
    });

    if (!overwrite) {
      console.log(chalk.gray('\n✓ Keeping existing configuration\n'));
      return;
    }
  }

  console.log(chalk.bold('\n🗄️  Database Configuration\n'));

  // Database type
  const { databaseType } = await prompts({
    type: 'select',
    name: 'databaseType',
    message: 'Which database?',
    choices: [
      {
        title: '🐘 PostgreSQL',
        value: 'pg',
        description: 'Recommended for production',
      },
      {
        title: '🐬 MySQL',
        value: 'mysql2',
        description: 'Popular and widely supported',
      },
      {
        title: '📁 SQLite',
        value: 'better-sqlite3',
        description: 'Perfect for development',
      },
      {
        title: '🔷 SQL Server',
        value: 'mssql',
        description: 'Microsoft SQL Server',
      },
    ],
    initial: 0,
  });

  if (!databaseType) {
    console.log(chalk.red('\n✗ Setup cancelled\n'));
    process.exit(1);
  }

  const config: Partial<SetupConfig> = { databaseType };

  // Database connection
  if (databaseType === 'better-sqlite3') {
    const { databasePath } = await prompts({
      type: 'text',
      name: 'databasePath',
      message: 'SQLite database path:',
      initial: './database.db',
    });
    config.databasePath = databasePath;
  } else {
    const dbDriver = DATABASE_DRIVERS[databaseType as keyof typeof DATABASE_DRIVERS];
    const { databaseUrl } = await prompts({
      type: 'text',
      name: 'databaseUrl',
      message: `${dbDriver.description} connection URL:`,
      initial:
        databaseType === 'pg'
          ? 'postgresql://user:pass@localhost:5432/db'
          : databaseType === 'mysql2'
          ? 'mysql://user:pass@localhost:3306/db'
          : 'Server=localhost;Database=mydb;User Id=sa;Password=pass;',
    });
    config.databaseUrl = databaseUrl;
  }

  console.log(chalk.bold('\n🤖 LLM Configuration\n'));

  // LLM provider
  const { llmProvider } = await prompts({
    type: 'select',
    name: 'llmProvider',
    message: 'Which LLM provider?',
    choices: [
      {
        title: '🔮 Anthropic (Claude)',
        value: 'anthropic',
        description: 'Recommended - Best quality',
      },
      {
        title: '🌟 OpenAI (GPT-4)',
        value: 'openai',
        description: 'Fast and reliable',
      },
      {
        title: '🧠 Cohere',
        value: 'cohere',
        description: 'Enterprise-focused',
      },
      {
        title: '🚀 Mistral',
        value: 'mistral',
        description: 'Open and powerful',
      },
      {
        title: '🏔️ Google (Gemini)',
        value: 'google',
        description: 'Multimodal AI',
      },
    ],
    initial: 0,
  });

  if (!llmProvider) {
    console.log(chalk.red('\n✗ Setup cancelled\n'));
    process.exit(1);
  }

  config.llmProvider = llmProvider;

  const providerInfo = LLM_PROVIDERS[llmProvider as keyof typeof LLM_PROVIDERS];

  // LLM model
  const { llmModel } = await prompts({
    type: 'text',
    name: 'llmModel',
    message: 'Model name:',
    initial: providerInfo.defaultModel,
  });
  config.llmModel = llmModel;

  // API key
  const { llmApiKey } = await prompts({
    type: 'password',
    name: 'llmApiKey',
    message: `${providerInfo.envKey}:`,
    validate: (value) => (value.length > 0 ? true : 'API key required'),
  });
  config.llmApiKey = llmApiKey;

  console.log(chalk.bold('\n⚡ Performance (Optional)\n'));

  // L2 Cache
  const { enableL2Cache } = await prompts({
    type: 'confirm',
    name: 'enableL2Cache',
    message: 'Enable semantic cache? (Faster queries, requires embedding API)',
    initial: false,
  });
  config.enableL2Cache = enableL2Cache;

  if (enableL2Cache) {
    const { embeddingProvider } = await prompts({
      type: 'select',
      name: 'embeddingProvider',
      message: 'Embedding provider:',
      choices: [
        { title: 'OpenAI', value: 'openai' },
        { title: 'Cohere', value: 'cohere' },
      ],
    });
    config.embeddingProvider = embeddingProvider;

    const { embeddingApiKey } = await prompts({
      type: 'password',
      name: 'embeddingApiKey',
      message: `${embeddingProvider.toUpperCase()}_API_KEY:`,
    });
    config.embeddingApiKey = embeddingApiKey;
  }

  // Install dependencies (nttp is already installed since user ran npx nttp setup)
  console.log(chalk.bold('\n📦 Installing dependencies...\n'));

  const dependencies = [
    'dotenv',
    DATABASE_DRIVERS[databaseType as keyof typeof DATABASE_DRIVERS].name,
    '@ai-sdk/anthropic',
    '@ai-sdk/openai',
  ];

  // Add other AI SDKs if selected
  if (llmProvider === 'cohere') {
    dependencies.push('@ai-sdk/cohere');
  } else if (llmProvider === 'mistral') {
    dependencies.push('@ai-sdk/mistral');
  } else if (llmProvider === 'google') {
    dependencies.push('@ai-sdk/google-vertex');
  }

  console.log(chalk.gray('Installing:'));
  console.log(chalk.gray(`  • dotenv`));
  console.log(chalk.gray(`  • ${DATABASE_DRIVERS[databaseType as keyof typeof DATABASE_DRIVERS].name} (database driver)`));
  console.log(chalk.gray(`  • @ai-sdk/anthropic & @ai-sdk/openai (LLM providers)`));
  if (dependencies.length > 4) {
    console.log(chalk.gray(`  • ${dependencies.slice(4).join(', ')}`));
  }
  console.log('');

  const spinner = ora('Running npm install...').start();

  try {
    execSync(`npm install ${dependencies.join(' ')}`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    spinner.succeed(chalk.green('Dependencies installed'));
  } catch (error) {
    spinner.fail(chalk.red('Failed to install dependencies'));
    console.error(chalk.red(`\n${error}\n`));
    process.exit(1);
  }

  // Generate .env
  console.log(chalk.bold('\n📝 Creating configuration...\n'));

  const envContent = generateEnvFile(config as SetupConfig);
  writeFileSync('.env', envContent);

  console.log(chalk.green('✓ Created .env file'));

  // Generate example code
  const exampleCode = generateExampleCode();
  writeFileSync('nttp-example.js', exampleCode);

  console.log(chalk.green('✓ Created nttp-example.js'));

  // Success message
  console.log(
    boxen(
      chalk.bold.green('✓ Setup complete!') +
        '\n\n' +
        chalk.white('Installed:') +
        '\n' +
        chalk.gray(`  • ${config.databaseType} database driver`) +
        '\n' +
        chalk.gray('  • @ai-sdk/anthropic & @ai-sdk/openai') +
        (llmProvider !== 'anthropic' && llmProvider !== 'openai'
          ? '\n' + chalk.gray(`  • @ai-sdk/${llmProvider}`)
          : '') +
        '\n\n' +
        chalk.white('Next steps:') +
        '\n\n' +
        chalk.cyan('  1. Review your .env file') +
        '\n' +
        chalk.cyan('  2. Run: node nttp-example.js') +
        '\n' +
        chalk.cyan('  3. Or try: npx nttp query "show me 5 records"') +
        '\n\n' +
        chalk.gray('Switch providers anytime by changing LLM_PROVIDER in .env') +
        '\n' +
        chalk.gray('Documentation: https://github.com/tylergibbs/nttp'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
      }
    )
  );
}

function generateEnvFile(config: SetupConfig): string {
  const lines = [
    '# nttp configuration',
    '# Generated by nttp setup',
    '',
    '# Database',
  ];

  if (config.databaseType === 'better-sqlite3') {
    lines.push(`DATABASE_PATH=${config.databasePath}`);
  } else {
    lines.push(`DATABASE_URL=${config.databaseUrl}`);
  }

  lines.push(`DATABASE_TYPE=${config.databaseType}`);
  lines.push('');
  lines.push('# LLM Provider');
  lines.push(`LLM_PROVIDER=${config.llmProvider}`);
  lines.push(`LLM_MODEL=${config.llmModel}`);
  const providerInfo = LLM_PROVIDERS[config.llmProvider as keyof typeof LLM_PROVIDERS];
  lines.push(`${providerInfo.envKey}=${config.llmApiKey}`);

  if (config.enableL2Cache && config.embeddingProvider) {
    lines.push('');
    lines.push('# Semantic Cache');
    lines.push(`EMBEDDING_PROVIDER=${config.embeddingProvider}`);
    lines.push(
      `${config.embeddingProvider.toUpperCase()}_API_KEY=${config.embeddingApiKey}`
    );
  }

  return lines.join('\n') + '\n';
}

function generateExampleCode(): string {
  return `import 'dotenv/config';
import { NTTP } from 'nttp';

async function main() {
  // Load configuration from .env
  const nttp = await NTTP.fromEnv();

  console.log('✓ Connected to database');

  // Run a natural language query
  const result = await nttp.query('show me 5 records');

  console.log(\`\\n✓ Query succeeded! Got \${result.data.length} rows\`);
  console.log(\`  Generated SQL: \${result.sql}\`);
  console.log(\`  Cache hit: \${result.cacheHit}\`);
  console.log(\`  Time: \${result.executionTimeMs}ms\\n\`);

  // Display results
  console.table(result.data);

  // Cleanup
  await nttp.close();
}

main().catch(console.error);
`;
}
