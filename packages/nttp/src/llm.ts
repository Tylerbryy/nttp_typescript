/**
 * LLM integration layer with Claude API.
 * Implements structured outputs for guaranteed schema compliance.
 */

import Anthropic from '@anthropic-ai/sdk';
import { LLMError } from './errors.js';

/**
 * Beta version for structured outputs.
 */
const STRUCTURED_OUTPUTS_BETA = 'structured-outputs-2025-11-13';

export interface LLMConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Service for interacting with Claude AI API.
 */
export class LLMService {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || 'claude-sonnet-4-5-20250929';
    this.maxTokens = config.maxTokens || 2048;
  }

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
   * @param maxRetries Maximum number of retry attempts
   * @returns Parsed JSON response matching the schema
   * @throws LLMError if all retries fail
   */
  async callStructured<T>(
    prompt: string,
    system: string,
    jsonSchema: Record<string, any>,
    temperature: number = 0.0,
    maxRetries: number = 3
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.client.beta.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
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

        // Parse the JSON (will always be valid due to structured outputs)
        return JSON.parse(jsonText) as T;
      } catch (error) {
        const waitTime = Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
        } else {
          throw new LLMError(
            `Claude API failed after ${maxRetries} attempts: ${error}`
          );
        }
      }
    }

    // TypeScript requires this, but we'll never reach it due to the throw above
    throw new LLMError('Unexpected error in callStructured');
  }

  /**
   * Call Claude API without structured outputs (basic text response).
   *
   * @param prompt User prompt
   * @param system System prompt
   * @param temperature Sampling temperature
   * @param maxRetries Maximum number of retry attempts
   * @returns Response text from Claude
   * @throws LLMError if all retries fail
   */
  async call(
    prompt: string,
    system: string,
    temperature: number = 0.0,
    maxRetries: number = 3
  ): Promise<string> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
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

        return textContent;
      } catch (error) {
        const waitTime = Math.pow(2, attempt); // Exponential backoff

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
        } else {
          throw new LLMError(
            `Claude API failed after ${maxRetries} attempts: ${error}`
          );
        }
      }
    }

    throw new LLMError('Unexpected error in call');
  }
}
