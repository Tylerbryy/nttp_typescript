/**
 * Embedding service for semantic cache (L2).
 * Generates vector embeddings for query similarity matching.
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { LLMError } from '../types/errors.js';

/**
 * Calculate cosine similarity between two vectors.
 * Returns a value between -1 (opposite) and 1 (identical).
 *
 * @param a First embedding vector
 * @param b Second embedding vector
 * @returns Similarity score (0-1 range, where 1 is most similar)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Generate embedding for text using configured provider.
 *
 * @param text Text to embed
 * @returns Embedding vector
 * @throws LLMError if embedding generation fails
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = config.EMBEDDING_CONFIG.provider;
  const model = config.EMBEDDING_CONFIG.model;
  const apiKey = config.EMBEDDING_CONFIG.apiKey;

  logger.debug(`Generating embedding with ${provider}/${model}`);

  try {
    switch (provider) {
      case 'openai':
        return await generateOpenAIEmbedding(text, model, apiKey);
      case 'cohere':
        return await generateCohereEmbedding(text, model, apiKey);
      default:
        throw new Error(`Unsupported embedding provider: ${provider}`);
    }
  } catch (error) {
    logger.error(`Embedding generation failed: ${error}`);
    throw new LLMError(`Failed to generate embedding: ${error}`);
  }
}

/**
 * Generate embedding using OpenAI API.
 */
async function generateOpenAIEmbedding(
  text: string,
  model: string,
  apiKey: string
): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: model,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}

/**
 * Generate embedding using Cohere API.
 */
async function generateCohereEmbedding(
  text: string,
  model: string,
  apiKey: string
): Promise<number[]> {
  const response = await fetch('https://api.cohere.ai/v1/embed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      texts: [text],
      model: model,
      input_type: 'search_query',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cohere API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    embeddings: number[][];
  };
  return data.embeddings[0];
}

/**
 * Find most similar embedding from a list.
 *
 * @param queryEmbedding Query embedding vector
 * @param candidates List of candidate embeddings with metadata
 * @param threshold Minimum similarity threshold (0-1)
 * @returns Best match if similarity >= threshold, null otherwise
 */
export function findSimilar<T>(
  queryEmbedding: number[],
  candidates: Array<{ embedding: number[]; data: T }>,
  threshold: number = 0.85
): { similarity: number; data: T } | null {
  let bestMatch: { similarity: number; data: T } | null = null;

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(queryEmbedding, candidate.embedding);
    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { similarity, data: candidate.data };
    }
  }

  return bestMatch;
}
