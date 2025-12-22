/**
 * Custom error classes for NTTP application.
 * Mirrors Python exception classes for API compatibility.
 */

/**
 * Error thrown when intent parsing fails.
 */
export class IntentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentParseError';
    Object.setPrototypeOf(this, IntentParseError.prototype);
  }
}

/**
 * Error thrown when SQL generation fails.
 */
export class SQLGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SQLGenerationError';
    Object.setPrototypeOf(this, SQLGenerationError.prototype);
  }
}

/**
 * Error thrown when SQL execution fails.
 */
export class SQLExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SQLExecutionError';
    Object.setPrototypeOf(this, SQLExecutionError.prototype);
  }
}

/**
 * Error thrown when LLM API calls fail.
 */
export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
    Object.setPrototypeOf(this, LLMError.prototype);
  }
}

/**
 * Error thrown when cache operations fail.
 */
export class CacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CacheError';
    Object.setPrototypeOf(this, CacheError.prototype);
  }
}
