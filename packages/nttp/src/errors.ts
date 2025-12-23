/**
 * Custom error classes for NTTP application.
 * Enhanced with Claude 4.x best practices: clear explanations and actionable suggestions.
 */

/**
 * Error thrown when intent parsing fails.
 *
 * This error occurs when the LLM cannot understand the natural language query
 * or cannot map it to a valid database operation.
 *
 * Common causes:
 * - Query references unknown tables or fields
 * - Query is too ambiguous or vague
 * - LLM API is unavailable or quota exceeded
 *
 * Suggested fixes:
 * - Simplify your query (e.g., "show users" instead of complex phrasing)
 * - Ensure table/field names match your database schema
 * - Check LLM API key and quota
 * - Try a more explicit query (e.g., "list all products" instead of "products")
 */
export class IntentParseError extends Error {
  public readonly suggestions: string[];

  constructor(message: string, suggestions?: string[]) {
    const enhancedMessage = IntentParseError.formatMessage(message, suggestions);
    super(enhancedMessage);
    this.name = 'IntentParseError';
    this.suggestions = suggestions || IntentParseError.getDefaultSuggestions();
    Object.setPrototypeOf(this, IntentParseError.prototype);
  }

  private static formatMessage(message: string, suggestions?: string[]): string {
    const suggestionList = suggestions || IntentParseError.getDefaultSuggestions();
    return `${message}\n\nSuggested fixes:\n${suggestionList.map(s => `  • ${s}`).join('\n')}`;
  }

  private static getDefaultSuggestions(): string[] {
    return [
      'Simplify your query (e.g., "show users" instead of complex phrasing)',
      'Ensure table/field names match your database schema',
      'Try a more explicit query (e.g., "list all products")',
      'Check if LLM API key is valid and has quota available',
    ];
  }
}

/**
 * Error thrown when SQL generation fails.
 *
 * This error occurs when the LLM cannot generate valid SQL from the parsed intent,
 * or when the generated SQL fails safety validation.
 *
 * Common causes:
 * - Complex query requires table relationships not in schema
 * - Generated SQL violates safety rules (e.g., attempted UPDATE/DELETE)
 * - Schema description is incomplete or incorrect
 * - LLM hallucinated invalid SQL syntax
 *
 * Suggested fixes:
 * - Ensure your database schema is complete and accurate
 * - Try a simpler query with fewer joins
 * - Check that the LLM model supports structured outputs
 * - Verify the intent was parsed correctly (use explain() method)
 */
export class SQLGenerationError extends Error {
  public readonly suggestions: string[];

  constructor(message: string, suggestions?: string[]) {
    const enhancedMessage = SQLGenerationError.formatMessage(message, suggestions);
    super(enhancedMessage);
    this.name = 'SQLGenerationError';
    this.suggestions = suggestions || SQLGenerationError.getDefaultSuggestions();
    Object.setPrototypeOf(this, SQLGenerationError.prototype);
  }

  private static formatMessage(message: string, suggestions?: string[]): string {
    const suggestionList = suggestions || SQLGenerationError.getDefaultSuggestions();
    return `${message}\n\nSuggested fixes:\n${suggestionList.map(s => `  • ${s}`).join('\n')}`;
  }

  private static getDefaultSuggestions(): string[] {
    return [
      'Ensure your database schema is complete and accurate',
      'Try a simpler query with fewer joins or filters',
      'Verify the intent was parsed correctly (use explain() method)',
      'Check that the LLM model supports your database dialect',
    ];
  }
}

/**
 * Error thrown when SQL execution fails.
 *
 * This error occurs when the database rejects the generated SQL query.
 *
 * Common causes:
 * - Database connection issues
 * - Table or column doesn't exist (schema mismatch)
 * - Type mismatch in WHERE clause (e.g., string vs integer)
 * - Database permissions insufficient for SELECT
 * - Syntax error in generated SQL
 *
 * Suggested fixes:
 * - Verify database connection is active
 * - Ensure schema matches actual database structure
 * - Check database user has SELECT permissions
 * - Examine the generated SQL for syntax errors
 * - Try regenerating with forceNewSchema option
 */
export class SQLExecutionError extends Error {
  public readonly sql?: string;
  public readonly suggestions: string[];

  constructor(message: string, sql?: string, suggestions?: string[]) {
    const enhancedMessage = SQLExecutionError.formatMessage(message, sql, suggestions);
    super(enhancedMessage);
    this.name = 'SQLExecutionError';
    this.sql = sql;
    this.suggestions = suggestions || SQLExecutionError.getDefaultSuggestions();
    Object.setPrototypeOf(this, SQLExecutionError.prototype);
  }

  private static formatMessage(message: string, sql?: string, suggestions?: string[]): string {
    let formatted = message;
    if (sql) {
      formatted += `\n\nGenerated SQL:\n${sql}`;
    }
    const suggestionList = suggestions || SQLExecutionError.getDefaultSuggestions();
    formatted += `\n\nSuggested fixes:\n${suggestionList.map(s => `  • ${s}`).join('\n')}`;
    return formatted;
  }

  private static getDefaultSuggestions(): string[] {
    return [
      'Verify database connection is active (check DATABASE_URL)',
      'Ensure schema matches actual database structure',
      'Check database user has SELECT permissions on the table',
      'Examine the generated SQL for syntax errors',
      'Try regenerating with forceNewSchema: true option',
    ];
  }
}

/**
 * Error thrown when LLM API calls fail.
 *
 * This error occurs when communication with the LLM provider fails.
 *
 * Common causes:
 * - Invalid or expired API key
 * - Rate limit or quota exceeded
 * - Network connectivity issues
 * - LLM provider service outage
 * - Request timeout
 *
 * Suggested fixes:
 * - Verify API key is correct and active
 * - Check API quota and rate limits with provider
 * - Ensure network connectivity to LLM provider
 * - Wait and retry (automatic retry with backoff is already applied)
 * - Check LLM provider status page for outages
 */
export class LLMError extends Error {
  public readonly suggestions: string[];

  constructor(message: string, suggestions?: string[]) {
    const enhancedMessage = LLMError.formatMessage(message, suggestions);
    super(enhancedMessage);
    this.name = 'LLMError';
    this.suggestions = suggestions || LLMError.getDefaultSuggestions();
    Object.setPrototypeOf(this, LLMError.prototype);
  }

  private static formatMessage(message: string, suggestions?: string[]): string {
    const suggestionList = suggestions || LLMError.getDefaultSuggestions();
    return `${message}\n\nSuggested fixes:\n${suggestionList.map(s => `  • ${s}`).join('\n')}`;
  }

  private static getDefaultSuggestions(): string[] {
    return [
      'Verify API key is correct (check ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)',
      'Check API quota and rate limits with your provider',
      'Ensure network connectivity to the LLM provider',
      'Wait a moment and retry (automatic backoff already applied)',
      'Check provider status page for service outages',
    ];
  }
}

/**
 * Error thrown when cache operations fail.
 *
 * This error occurs when the caching system encounters an issue.
 *
 * Common causes:
 * - Redis connection failed (if using Redis L1 cache)
 * - Redis authentication error
 * - Network issues with Redis server
 * - Embedding API failure (if using L2 semantic cache)
 * - Out of memory for in-memory caches
 *
 * Suggested fixes:
 * - Verify Redis server is running (if using Redis)
 * - Check REDIS_URL format: redis://host:port
 * - Ensure Redis authentication credentials are correct
 * - Check OpenAI API key for embeddings (if L2 enabled)
 * - Reduce cache size limits if memory is constrained
 */
export class CacheError extends Error {
  public readonly suggestions: string[];

  constructor(message: string, suggestions?: string[]) {
    const enhancedMessage = CacheError.formatMessage(message, suggestions);
    super(enhancedMessage);
    this.name = 'CacheError';
    this.suggestions = suggestions || CacheError.getDefaultSuggestions();
    Object.setPrototypeOf(this, CacheError.prototype);
  }

  private static formatMessage(message: string, suggestions?: string[]): string {
    const suggestionList = suggestions || CacheError.getDefaultSuggestions();
    return `${message}\n\nSuggested fixes:\n${suggestionList.map(s => `  • ${s}`).join('\n')}`;
  }

  private static getDefaultSuggestions(): string[] {
    return [
      'Verify Redis server is running (if using Redis)',
      'Check REDIS_URL format: redis://host:port',
      'Ensure Redis authentication credentials are correct',
      'Verify OpenAI API key for embeddings (if L2 cache enabled)',
      'Try disabling cache temporarily to isolate the issue',
    ];
  }
}
