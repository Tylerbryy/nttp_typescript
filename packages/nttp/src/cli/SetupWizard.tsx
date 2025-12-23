/**
 * Setup Wizard using Ink (React for CLIs)
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, Newline } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

interface SetupConfig {
  databaseType?: 'pg' | 'mysql2' | 'better-sqlite3' | 'mssql';
  databaseUrl?: string;
  databasePath?: string;
  llmProvider?: 'anthropic' | 'openai' | 'cohere' | 'mistral' | 'google';
  llmModel?: string;
  llmApiKey?: string;
  enableRedisCache?: boolean;
  redisUrl?: string;
  enableL2Cache?: boolean;
  embeddingProvider?: 'openai';
  embeddingApiKey?: string;
}

type Step =
  | 'welcome'
  | 'database-type'
  | 'database-connection'
  | 'llm-provider'
  | 'llm-model'
  | 'llm-api-key'
  | 'redis-cache'
  | 'redis-url'
  | 'l2-cache'
  | 'embedding-api-key'
  | 'installing'
  | 'complete';

const DATABASE_OPTIONS = [
  { label: '🐘 PostgreSQL - Recommended for production', value: 'pg' },
  { label: '🐬 MySQL - Popular and widely supported', value: 'mysql2' },
  { label: '📁 SQLite - Perfect for development', value: 'better-sqlite3' },
  { label: '🔷 SQL Server - Microsoft SQL Server', value: 'mssql' },
];

const LLM_OPTIONS = [
  { label: '🔮 Anthropic (Claude) - Best quality', value: 'anthropic' },
  { label: '🌟 OpenAI (GPT-4) - Fast and reliable', value: 'openai' },
  { label: '🧠 Cohere - Enterprise-focused', value: 'cohere' },
  { label: '🚀 Mistral - Open and powerful', value: 'mistral' },
  { label: '🏔️  Google (Gemini) - Multimodal AI', value: 'google' },
];

const LLM_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4o',
  cohere: 'command-r-plus',
  mistral: 'mistral-large-latest',
  google: 'gemini-pro',
};

export default function SetupWizard() {
  const [step, setStep] = useState<Step>('welcome');
  const [config, setConfig] = useState<SetupConfig>({});
  const [input, setInput] = useState('');

  useEffect(() => {
    // Show welcome for 1 second
    if (step === 'welcome') {
      const timer = setTimeout(() => setStep('database-type'), 1000);
      return () => clearTimeout(timer);
    }

    // Auto-fill LLM model when provider is selected
    if (step === 'llm-model' && config.llmProvider && !config.llmModel) {
      setConfig((prev) => ({
        ...prev,
        llmModel: LLM_MODELS[config.llmProvider!],
      }));
    }

    return undefined;
  }, [step, config]);

  const handleDatabaseType = (item: { value: string }) => {
    setConfig({ ...config, databaseType: item.value as any });
    setStep('database-connection');
  };

  const handleDatabaseConnection = () => {
    if (config.databaseType === 'better-sqlite3') {
      setConfig({ ...config, databasePath: input || './database.db' });
    } else {
      setConfig({ ...config, databaseUrl: input });
    }
    setInput('');
    setStep('llm-provider');
  };

  const handleLLMProvider = (item: { value: string }) => {
    setConfig({ ...config, llmProvider: item.value as any });
    setStep('llm-model');
  };

  const handleLLMModel = () => {
    setConfig({ ...config, llmModel: input || config.llmModel });
    setInput('');
    setStep('llm-api-key');
  };

  const handleLLMApiKey = () => {
    setConfig({ ...config, llmApiKey: input });
    setInput('');
    setStep('redis-cache');
  };

  const handleRedisCache = (item: { value: boolean }) => {
    const updatedConfig = { ...config, enableRedisCache: item.value };
    setConfig(updatedConfig);
    if (item.value) {
      setStep('redis-url');
    } else {
      setStep('l2-cache');
    }
  };

  const handleRedisUrl = () => {
    setConfig({ ...config, redisUrl: input || 'redis://localhost:6379' });
    setInput('');
    setStep('l2-cache');
  };

  const handleL2Cache = (item: { value: boolean }) => {
    const updatedConfig = {
      ...config,
      enableL2Cache: item.value,
      embeddingProvider: item.value ? ('openai' as const) : undefined
    };
    setConfig(updatedConfig);
    if (item.value) {
      setStep('embedding-api-key');
    } else {
      setStep('installing');
      finishSetup(updatedConfig);
    }
  };

  const handleEmbeddingApiKey = () => {
    const updatedConfig = { ...config, embeddingApiKey: input };
    setConfig(updatedConfig);
    setInput('');
    setStep('installing');
    finishSetup(updatedConfig);
  };

  const finishSetup = (finalConfig: SetupConfig = config) => {
    setTimeout(() => {
      try {
        // Generate .env and example code
        generateEnvFile(finalConfig);
        generateExampleCode();

        // Create package.json if it doesn't exist
        if (!existsSync('package.json')) {
          const packageJson = {
            name: 'nttp-project',
            version: '1.0.0',
            type: 'module',
            scripts: {
              start: 'node nttp-example.js'
            }
          };
          writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
        }

        // Install dependencies
        try {
          execSync('npm install nttp dotenv', { stdio: 'inherit' });
        } catch (error) {
          console.error('Failed to install dependencies. Please run: npm install nttp dotenv');
        }

        setStep('complete');
      } catch (error) {
        console.error('Setup failed:', error);
        process.exit(1);
      }
    }, 100);
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box
        borderStyle="round"
        borderColor="cyan"
        padding={1}
        marginBottom={1}
      >
        <Text bold color="cyan">
          nttp setup
        </Text>
      </Box>

      {/* Welcome */}
      {step === 'welcome' && (
        <Box flexDirection="column">
          <Text color="gray">Query databases with natural language</Text>
          <Text color="gray">Inspired by Vercel DX ✨</Text>
          <Newline />
          <Text>
            <Spinner type="dots" /> Initializing...
          </Text>
        </Box>
      )}

      {/* Database Type */}
      {step === 'database-type' && (
        <Box flexDirection="column">
          <Text bold>🗄️  Database Configuration</Text>
          <Newline />
          <Text>Which database?</Text>
          <SelectInput items={DATABASE_OPTIONS} onSelect={handleDatabaseType} />
        </Box>
      )}

      {/* Database Connection */}
      {step === 'database-connection' && (
        <Box flexDirection="column">
          <Text>
            {config.databaseType === 'better-sqlite3'
              ? 'SQLite database path:'
              : `${
                  config.databaseType === 'pg'
                    ? 'PostgreSQL'
                    : config.databaseType === 'mysql2'
                    ? 'MySQL'
                    : 'SQL Server'
                } connection URL:`}
          </Text>
          <Box>
            <Text color="cyan">&gt; </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleDatabaseConnection}
              placeholder={
                config.databaseType === 'better-sqlite3'
                  ? './database.db'
                  : config.databaseType === 'pg'
                  ? 'postgresql://user:pass@localhost:5432/db'
                  : config.databaseType === 'mysql2'
                  ? 'mysql://user:pass@localhost:3306/db'
                  : 'Server=localhost;Database=db;User Id=sa;Password=pass;'
              }
            />
          </Box>
        </Box>
      )}

      {/* LLM Provider */}
      {step === 'llm-provider' && (
        <Box flexDirection="column">
          <Text bold>🤖 LLM Configuration</Text>
          <Newline />
          <Text>Which LLM provider?</Text>
          <SelectInput items={LLM_OPTIONS} onSelect={handleLLMProvider} />
        </Box>
      )}

      {/* LLM Model */}
      {step === 'llm-model' && (
        <Box flexDirection="column">
          <Text>Model name:</Text>
          <Box>
            <Text color="cyan">&gt; </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleLLMModel}
              placeholder={config.llmModel}
            />
          </Box>
        </Box>
      )}

      {/* LLM API Key */}
      {step === 'llm-api-key' && (
        <Box flexDirection="column">
          <Text>
            {config.llmProvider?.toUpperCase()}_API_KEY:
          </Text>
          <Box>
            <Text color="cyan">&gt; </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleLLMApiKey}
              mask="*"
            />
          </Box>
        </Box>
      )}

      {/* Redis Cache */}
      {step === 'redis-cache' && (
        <Box flexDirection="column">
          <Text bold>⚡ Cache Configuration</Text>
          <Newline />
          <Text>Enable Redis cache?</Text>
          <Text color="gray">(Persist cache across CLI calls)</Text>
          <SelectInput
            items={[
              { label: 'No', value: false },
              { label: 'Yes', value: true },
            ]}
            onSelect={handleRedisCache}
          />
        </Box>
      )}

      {/* Redis URL */}
      {step === 'redis-url' && (
        <Box flexDirection="column">
          <Text>Redis connection URL:</Text>
          <Box>
            <Text color="cyan">&gt; </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleRedisUrl}
              placeholder="redis://localhost:6379"
            />
          </Box>
        </Box>
      )}

      {/* L2 Cache */}
      {step === 'l2-cache' && (
        <Box flexDirection="column">
          <Text bold>⚡ Performance (Optional)</Text>
          <Newline />
          <Text>Enable semantic cache?</Text>
          <Text color="gray">(Faster queries, requires embedding API)</Text>
          <SelectInput
            items={[
              { label: 'No', value: false },
              { label: 'Yes', value: true },
            ]}
            onSelect={handleL2Cache}
          />
        </Box>
      )}

      {/* Embedding API Key */}
      {step === 'embedding-api-key' && (
        <Box flexDirection="column">
          <Text>OPENAI_API_KEY (for embeddings):</Text>
          <Box>
            <Text color="cyan">&gt; </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleEmbeddingApiKey}
              mask="*"
            />
          </Box>
        </Box>
      )}

      {/* Generating configuration */}
      {step === 'installing' && (
        <Box flexDirection="column">
          <Text bold>⚙️  Setting up your project...</Text>
          <Newline />
          <Text>
            <Spinner type="dots" /> Creating configuration files...
          </Text>
          <Text>
            <Spinner type="dots" /> Installing dependencies (nttp, dotenv)...
          </Text>
        </Box>
      )}

      {/* Complete */}
      {step === 'complete' && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="green"
          padding={1}
        >
          <Text bold color="green">
            ✓ Setup complete!
          </Text>
          <Newline />
          <Text bold>Created:</Text>
          <Text color="gray">  • .env (your configuration)</Text>
          <Text color="gray">  • nttp-example.js (example code)</Text>
          <Text color="gray">  • package.json (if not exists)</Text>
          <Text color="gray">  • node_modules/ (installed nttp, dotenv)</Text>
          <Newline />
          <Text bold>Next steps:</Text>
          <Text color="cyan">  1. Try CLI: npx nttp query "show me 5 records"</Text>
          <Text color="cyan">  2. Or run code: node nttp-example.js</Text>
          <Text color="cyan">  3. Or use in your code: npm start</Text>
          <Newline />
          <Text color="gray">
            Switch providers anytime by changing LLM_PROVIDER in .env
          </Text>
        </Box>
      )}
    </Box>
  );
}

function generateEnvFile(config: SetupConfig): void {
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

  const envKeys: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    cohere: 'COHERE_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    google: 'GOOGLE_API_KEY',
  };

  lines.push(`${envKeys[config.llmProvider!]}=${config.llmApiKey}`);

  if (config.enableRedisCache) {
    lines.push('');
    lines.push('# Redis Cache');
    lines.push(`REDIS_URL=${config.redisUrl}`);
  }

  if (config.enableL2Cache) {
    lines.push('');
    lines.push('# Semantic Cache');
    lines.push('EMBEDDING_PROVIDER=openai');
    lines.push(`OPENAI_API_KEY=${config.embeddingApiKey}`);
  }

  writeFileSync('.env', lines.join('\n') + '\n');
}

function generateExampleCode(): void {
  const code = `/**
 * NTTP Example - Ready to run!
 * Run: node nttp-example.js or npm start
 */

import 'dotenv/config';
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

  writeFileSync('nttp-example.js', code);
}
