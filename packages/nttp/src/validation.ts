/**
 * Configuration validation and helpful error messages
 */

/**
 * Valid Knex client names
 */
const VALID_CLIENTS = ['pg', 'mysql2', 'better-sqlite3', 'mssql'] as const;

/**
 * Common mistakes and their corrections
 */
const CLIENT_ALIASES: Record<string, typeof VALID_CLIENTS[number]> = {
  postgres: 'pg',
  postgresql: 'pg',
  sqlite: 'better-sqlite3',
  sqlite3: 'better-sqlite3',
  mysql: 'mysql2',
  sqlserver: 'mssql',
  'sql-server': 'mssql',
};

/**
 * Validate and normalize database client name
 */
export function validateDatabaseClient(
  client: string | undefined
): typeof VALID_CLIENTS[number] {
  if (!client) {
    throw new Error(
      'Database client is required. Valid options: pg, mysql2, better-sqlite3, mssql\n' +
        '💡 Tip: Run "npx nttp setup" for interactive configuration'
    );
  }

  // Check if it's already valid
  if (VALID_CLIENTS.includes(client as any)) {
    return client as typeof VALID_CLIENTS[number];
  }

  // Check for common aliases
  const normalized = CLIENT_ALIASES[client.toLowerCase()];
  if (normalized) {
    console.warn(
      `⚠️  Database client "${client}" is not valid. Using "${normalized}" instead.\n` +
        `   💡 Tip: Use "${normalized}" directly to avoid this warning.`
    );
    return normalized;
  }

  // Invalid client - provide helpful error
  throw new Error(
    `Invalid database client: "${client}"\n\n` +
      `Valid options:\n` +
      `  - "pg" (PostgreSQL)\n` +
      `  - "mysql2" (MySQL)\n` +
      `  - "better-sqlite3" (SQLite)\n` +
      `  - "mssql" (SQL Server)\n\n` +
      `Common mistakes:\n` +
      `  - Use "pg" not "postgres" or "postgresql"\n` +
      `  - Use "better-sqlite3" not "sqlite" or "sqlite3"\n` +
      `  - Use "mysql2" not "mysql"\n\n` +
      `💡 Tip: Run "npx nttp setup" for interactive configuration`
  );
}

/**
 * Validate connection configuration
 */
export function validateConnection(
  client: string,
  connection: string | object | undefined
): void {
  if (!connection) {
    throw new Error(
      `Database connection is required for ${client}\n` +
        `💡 Tip: Run "npx nttp setup" for interactive configuration`
    );
  }

  // Validate connection string format
  if (typeof connection === 'string') {
    if (client === 'pg') {
      if (!connection.startsWith('postgres://') && !connection.startsWith('postgresql://')) {
        throw new Error(
          `PostgreSQL connection string must start with "postgresql://" or "postgres://"\n` +
            `Got: ${connection.substring(0, 20)}...\n\n` +
            `Example: postgresql://user:pass@localhost:5432/dbname\n` +
            `💡 Tip: Run "npx nttp setup" for interactive configuration`
        );
      }
    } else if (client === 'mysql2') {
      if (!connection.startsWith('mysql://')) {
        console.warn(
          `⚠️  MySQL connection string should start with "mysql://"\n` +
            `   Got: ${connection.substring(0, 20)}...`
        );
      }
    }
  }
}

/**
 * Validate LLM configuration
 */
export function validateLLMConfig(config: {
  provider?: string;
  model?: string;
  apiKey?: string;
}): void {
  const validProviders = ['anthropic', 'openai', 'cohere', 'mistral', 'google'];

  if (!config.provider) {
    throw new Error(
      'LLM provider is required\n' +
        `Valid options: ${validProviders.join(', ')}\n` +
        `💡 Tip: Run "npx nttp setup" for interactive configuration`
    );
  }

  if (!validProviders.includes(config.provider)) {
    throw new Error(
      `Invalid LLM provider: "${config.provider}"\n` +
        `Valid options: ${validProviders.join(', ')}\n` +
        `💡 Tip: Run "npx nttp setup" for interactive configuration`
    );
  }

  if (!config.model) {
    throw new Error(
      `LLM model is required for ${config.provider}\n` +
        `💡 Tip: Run "npx nttp setup" for interactive configuration`
    );
  }

  if (!config.apiKey) {
    const envKeyMap: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      cohere: 'COHERE_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      google: 'GOOGLE_API_KEY',
    };

    throw new Error(
      `API key is required for ${config.provider}\n` +
        `Please set ${envKeyMap[config.provider]} environment variable\n` +
        `💡 Tip: Run "npx nttp setup" for interactive configuration`
    );
  }
}
