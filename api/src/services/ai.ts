import { createOpenAI } from '@ai-sdk/openai';
import { ENV } from '../config/env';

export function getOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY || ENV.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || ENV.OPENAI_API_KEY || '';
  const baseURL = process.env.OPENROUTER_BASE_URL || ENV.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const appUrl = process.env.APP_URL || ENV.APP_URL || 'https://woocs.ai';

  return createOpenAI({
    baseURL,
    apiKey,
    headers: {
      'HTTP-Referer': appUrl,
      'X-Title': 'WooCS AI',
    },
  });
}

export const openrouter = new Proxy({} as ReturnType<typeof createOpenAI>, {
  get(_, prop) {
    const instance = getOpenRouter() as any;
    const value = instance[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export const aiModels = {
  get chat() {
    const model = process.env.AI_CHAT_MODEL || ENV.AI_CHAT_MODEL || 'nex-agi/nex-n2.5-mini:free';
    return getOpenRouter().chat(model) as any;
  },
  get embedding() {
    const model = process.env.AI_EMBEDDING_MODEL || ENV.AI_EMBEDDING_MODEL || 'liquid/lfm-2.5-embedding-350m:free';
    return (getOpenRouter().embedding as any)(model, { dimensions: 1024 });
  },
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
