/**
 * LLM integration layer using Vercel AI SDK.
 * Implements structured outputs for guaranteed schema compliance.
 * Supports multiple LLM providers: Anthropic, OpenAI, etc.
 */

import { generateText, Output } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { LLMError } from '../types/errors.js';
import type { JsonValue } from '../types/utils.js';

/**
 * Initialize the language model based on the configured provider.
 */
async function initializeModel(): Promise<LanguageModel> {
  const provider = config.LLM_CONFIG.provider;
  const modelId = config.LLM_CONFIG.model;

  logger.info(`Initializing LLM: ${provider}/${modelId}`);

  switch (provider) {
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      return anthropic(modelId);
    }

    case 'openai': {
      const { openai } = await import('@ai-sdk/openai');
      return openai(modelId);
    }

    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

/**
 * Global model instance (lazy-loaded).
 */
let _modelInstance: LanguageModel | null = null;

async function getModel(): Promise<LanguageModel> {
  if (!_modelInstance) {
    _modelInstance = await initializeModel();
  }
  return _modelInstance;
}

/**
 * Call LLM API with structured outputs (guaranteed schema compliance).
 *
 * This uses the AI SDK's structured output feature to guarantee that the LLM's
 * response will always match the provided Zod schema, eliminating parsing errors
 * and schema validation issues.
 *
 * Generic type T is constrained to JsonValue to ensure only serializable
 * types can be returned, preventing type safety issues.
 *
 * @param prompt User prompt
 * @param system System prompt
 * @param schema Zod schema that response must follow
 * @param temperature Sampling temperature (0.0 for deterministic)
 * @param maxOutputTokens Maximum tokens in response (default 2048)
 * @param maxRetries Maximum number of retry attempts
 * @returns Parsed response matching the schema
 * @throws LLMError if all retries fail
 */
export async function callLLMStructured<T extends JsonValue>(
  prompt: string,
  system: string,
  schema: z.ZodType<T>,
  temperature: number = 0.0,
  maxOutputTokens: number = 2048,
  maxRetries: number = 3
): Promise<T> {
  const model = await getModel();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await generateText({
        model,
        system,
        prompt,
        temperature,
        maxOutputTokens,
        output: Output.object({ schema }),
      });

      // Log token usage
      const steps = (result as any).steps;
      if (steps && steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        const usage = lastStep.usage;
        if (usage) {
          logger.info(
            `LLM API call successful (structured) - ` +
              `Input: ${usage.inputTokens}, ` +
              `Output: ${usage.outputTokens}`
          );
        }
      }

      // Return the structured output from _output
      return (result as any)._output as T;
    } catch (error) {
      const waitTime = Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
      logger.warn(
        `LLM API call failed (attempt ${attempt + 1}/${maxRetries}): ${error}`
      );

      if (attempt < maxRetries - 1) {
        logger.info(`Retrying in ${waitTime} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
      } else {
        throw new LLMError(
          `LLM API failed after ${maxRetries} attempts: ${error}`
        );
      }
    }
  }

  // TypeScript requires this, but we'll never reach it due to the throw above
  throw new LLMError('Unexpected error in callLLMStructured');
}

/**
 * Call LLM API without structured outputs (basic text response).
 *
 * @param prompt User prompt
 * @param system System prompt
 * @param temperature Sampling temperature
 * @param maxOutputTokens Maximum tokens in response (default 2048)
 * @param maxRetries Maximum number of retry attempts
 * @returns Response text from LLM
 * @throws LLMError if all retries fail
 */
export async function callLLM(
  prompt: string,
  system: string,
  temperature: number = 0.0,
  maxOutputTokens: number = 2048,
  maxRetries: number = 3
): Promise<string> {
  const model = await getModel();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await generateText({
        model,
        system,
        prompt,
        temperature,
        maxOutputTokens,
      });

      // Log token usage
      if (result.usage) {
        logger.info(
          `LLM API call successful - ` +
            `Input: ${result.usage.inputTokens}, ` +
            `Output: ${result.usage.outputTokens}`
        );
      }

      return result.text;
    } catch (error) {
      const waitTime = Math.pow(2, attempt); // Exponential backoff
      logger.warn(
        `LLM API call failed (attempt ${attempt + 1}/${maxRetries}): ${error}`
      );

      if (attempt < maxRetries - 1) {
        logger.info(`Retrying in ${waitTime} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
      } else {
        throw new LLMError(
          `LLM API failed after ${maxRetries} attempts: ${error}`
        );
      }
    }
  }

  throw new LLMError('Unexpected error in callLLM');
}
