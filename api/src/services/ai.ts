import { createOpenAI } from '@ai-sdk/openai';
import { ENV } from '../config/env';

const apiKey = ENV.OPENROUTER_API_KEY || ENV.OPENAI_API_KEY || '';

export const openrouter = createOpenAI({
  baseURL: ENV.OPENROUTER_BASE_URL,
  apiKey,
  headers: {
    'HTTP-Referer': ENV.APP_URL || 'https://woocs.ai',
    'X-Title': 'WooCS AI',
  },
});

export const aiModels = {
  chat: openrouter.chat(ENV.AI_CHAT_MODEL) as any,
  embedding: (openrouter.embedding as any)(ENV.AI_EMBEDDING_MODEL, { dimensions: 1024 }),
};

/**
 * Matryoshka Representation Learning (MRL) reduction:
 * If the provider returns 1536 dimensions (e.g. OpenRouter ignoring the dimensions parameter),
 * truncate to 1024 and apply L2 normalization to preserve unit length for cosine similarity.
 */
export function to1024Vector(vector: number[]): number[] {
  if (!vector || vector.length === 1024) return vector;
  const sliced = vector.slice(0, 1024);
  const norm = Math.sqrt(sliced.reduce((sum, val) => sum + val * val, 0));
  return sliced.map(val => val / (norm || 1));
}
