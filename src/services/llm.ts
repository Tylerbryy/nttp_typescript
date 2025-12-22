/**
 * LLM integration layer with Claude API.
 * Implements structured outputs for guaranteed schema compliance.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { LLMError } from '../types/errors.js';

/**
 * Initialize Anthropic client.
 */
const client = new Anthropic({
  apiKey: config.ANTHROPIC_API_KEY,
});

/**
 * Beta version for structured outputs.
 */
const STRUCTURED_OUTPUTS_BETA = 'structured-outputs-2025-11-13';

/**
 * Call Claude API with structured outputs (guaranteed schema compliance).
 *
 * This uses the structured outputs beta feature to guarantee that Claude's
 * response will always match the provided JSON schema, eliminating parsing errors
 * and schema validation issues.
 *
 * @param prompt User prompt
 * @param system System prompt
 * @param jsonSchema JSON schema that response must follow
 * @param temperature Sampling temperature (0.0 for deterministic)
 * @param maxTokens Maximum tokens in response
 * @param maxRetries Maximum number of retry attempts
 * @returns Parsed JSON response matching the schema
 * @throws LLMError if all retries fail
 */
export async function callClaudeStructured<T>(
  prompt: string,
  system: string,
  jsonSchema: Record<string, any>,
  temperature: number = 0.0,
  maxTokens: number = 2048,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.beta.messages.create({
        model: config.CLAUDE_MODEL,
        max_tokens: maxTokens,
        temperature,
        system,
        betas: [STRUCTURED_OUTPUTS_BETA],
        messages: [{ role: 'user', content: prompt }],
        output_format: {
          type: 'json_schema',
          schema: jsonSchema,
        },
      } as any);

      // Extract JSON from response (guaranteed to match schema)
      let jsonText = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          jsonText += block.text;
        }
      }

      // Log token usage
      logger.info(
        `Claude API call successful (structured) - ` +
          `Input: ${response.usage.input_tokens}, ` +
          `Output: ${response.usage.output_tokens}`
      );

      // Parse the JSON (will always be valid due to structured outputs)
      return JSON.parse(jsonText) as T;
    } catch (error) {
      const waitTime = Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
      logger.warn(
        `Claude API call failed (attempt ${attempt + 1}/${maxRetries}): ${error}`
      );

      if (attempt < maxRetries - 1) {
        logger.info(`Retrying in ${waitTime} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
      } else {
        throw new LLMError(
          `Claude API failed after ${maxRetries} attempts: ${error}`
        );
      }
    }
  }

  // TypeScript requires this, but we'll never reach it due to the throw above
  throw new LLMError('Unexpected error in callClaudeStructured');
}

/**
 * Call Claude API without structured outputs (basic text response).
 *
 * @param prompt User prompt
 * @param system System prompt
 * @param temperature Sampling temperature
 * @param maxTokens Maximum tokens in response
 * @param maxRetries Maximum number of retry attempts
 * @returns Response text from Claude
 * @throws LLMError if all retries fail
 */
export async function callClaude(
  prompt: string,
  system: string,
  temperature: number = 0.0,
  maxTokens: number = 2048,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: config.CLAUDE_MODEL,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: prompt }],
      });

      // Extract text from response
      let textContent = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          textContent += block.text;
        }
      }

      // Log token usage
      logger.info(
        `Claude API call successful - ` +
          `Input: ${response.usage.input_tokens}, ` +
          `Output: ${response.usage.output_tokens}`
      );

      return textContent;
    } catch (error) {
      const waitTime = Math.pow(2, attempt); // Exponential backoff
      logger.warn(
        `Claude API call failed (attempt ${attempt + 1}/${maxRetries}): ${error}`
      );

      if (attempt < maxRetries - 1) {
        logger.info(`Retrying in ${waitTime} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
      } else {
        throw new LLMError(
          `Claude API failed after ${maxRetries} attempts: ${error}`
        );
      }
    }
  }

  throw new LLMError('Unexpected error in callClaude');
}
