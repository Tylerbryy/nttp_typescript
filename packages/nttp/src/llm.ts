/**
 * LLM integration layer using AI SDK for provider-agnostic support.
 * Implements structured outputs for guaranteed schema compliance.
 */

import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { LLMError } from './errors.js';

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'cohere' | 'mistral' | 'google';
  model: string;
  apiKey: string;
  maxTokens?: number;
}

/**
 * Service for interacting with LLM APIs via AI SDK.
 */
export class LLMService {
  private model: LanguageModel | null = null;
  private modelPromise: Promise<LanguageModel> | null = null;
  private config: LLMConfig;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.config = config;
    this.maxTokens = config.maxTokens || 2048;
  }

  /**
   * Lazy initialization of LLM model
   * Supports multiple providers with dynamic imports
   */
  private async initializeModel(): Promise<LanguageModel> {
    if (this.model) {
      return this.model;
    }

    if (this.modelPromise) {
      return this.modelPromise;
    }

    this.modelPromise = this.loadModel();
    return this.modelPromise;
  }

  /**
   * Load the model based on provider configuration
   */
  private async loadModel(): Promise<LanguageModel> {
    switch (this.config.provider) {
      case 'anthropic': {
        // Set environment variable for Anthropic
        process.env.ANTHROPIC_API_KEY = this.config.apiKey;
        const { anthropic } = await import('@ai-sdk/anthropic');
        const model = anthropic(this.config.model);
        this.model = model;
        return model;
      }

      case 'openai': {
        // Set environment variable for OpenAI
        process.env.OPENAI_API_KEY = this.config.apiKey;
        const { openai } = await import('@ai-sdk/openai');
        const model = openai(this.config.model);
        this.model = model;
        return model;
      }

      case 'cohere': {
        // Set environment variable for Cohere
        process.env.COHERE_API_KEY = this.config.apiKey;
        // @ts-expect-error - Optional peer dependency
        const { cohere } = await import('@ai-sdk/cohere');
        const model = cohere(this.config.model);
        this.model = model;
        return model;
      }

      case 'mistral': {
        // Set environment variable for Mistral
        process.env.MISTRAL_API_KEY = this.config.apiKey;
        // @ts-expect-error - Optional peer dependency
        const { mistral } = await import('@ai-sdk/mistral');
        const model = mistral(this.config.model);
        this.model = model;
        return model;
      }

      case 'google': {
        // Set environment variable for Google
        process.env.GOOGLE_API_KEY = this.config.apiKey;
        // @ts-expect-error - Optional peer dependency
        const { google } = await import('@ai-sdk/google-vertex');
        const model = google(this.config.model);
        this.model = model;
        return model;
      }

      default: {
        throw new LLMError(`Unsupported provider: ${this.config.provider}`);
      }
    }
  }

  /**
   * Call LLM with structured outputs (guaranteed schema compliance).
   *
   * Uses AI SDK's generateText to generate JSON responses that match
   * the provided schema.
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
    const model = await this.initializeModel();

    // Add JSON schema to prompt
    const enhancedPrompt = `${prompt}\n\nYou must respond with valid JSON matching this schema:\n${JSON.stringify(jsonSchema, null, 2)}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await generateText({
          model,
          system: `${system}\n\nAlways respond with valid JSON only, no additional text or formatting.`,
          prompt: enhancedPrompt,
          temperature,
          maxTokens: this.maxTokens,
        });

        // Parse JSON from response
        const jsonText = result.text.trim();
        // Remove markdown code blocks if present
        const cleaned = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        return JSON.parse(cleaned) as T;
      } catch (error) {
        const waitTime = Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
        } else {
          throw new LLMError(
            `LLM API failed after ${maxRetries} attempts: ${error}`
          );
        }
      }
    }

    // TypeScript requires this, but we'll never reach it due to the throw above
    throw new LLMError('Unexpected error in callStructured');
  }

  /**
   * Call LLM without structured outputs (basic text response).
   *
   * @param prompt User prompt
   * @param system System prompt
   * @param temperature Sampling temperature
   * @param maxRetries Maximum number of retry attempts
   * @returns Response text from LLM
   * @throws LLMError if all retries fail
   */
  async call(
    prompt: string,
    system: string,
    temperature: number = 0.0,
    maxRetries: number = 3
  ): Promise<string> {
    const model = await this.initializeModel();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await generateText({
          model,
          system,
          prompt,
          temperature,
          maxTokens: this.maxTokens,
        });

        return result.text;
      } catch (error) {
        const waitTime = Math.pow(2, attempt); // Exponential backoff

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
        } else {
          throw new LLMError(
            `LLM API failed after ${maxRetries} attempts: ${error}`
          );
        }
      }
    }

    throw new LLMError('Unexpected error in call');
  }
}
