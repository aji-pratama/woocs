import { createOpenAI } from '@ai-sdk/openai';
import { ENV } from '../config/env.js';
import { logger } from '../common/logger.js';

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
 * Direct OpenRouter chat generation helper.
 * Correctly handles OpenRouter payloads (including reasoning_details) that break standard OpenAI SDK parsers.
 */
export async function generateOpenRouterText({
  model,
  system,
  prompt,
}: {
  model?: string;
  system?: string;
  prompt: string;
}): Promise<{ text: string }> {
  const startTime = Date.now();
  const chatModel = model || process.env.AI_CHAT_MODEL || ENV.AI_CHAT_MODEL || 'nex-agi/nex-n2.5-mini:free';

  if (process.env.NODE_ENV === 'test') {
    const { generateText } = await import('ai');
    const result = await generateText({
      model: aiModels.chat,
      system,
      prompt,
    });
    const durationMs = Date.now() - startTime;
    logger.ai(`Generated text via test model [${chatModel}]`, {
      model: chatModel,
      durationMs,
      promptLength: prompt.length,
      responseLength: result.text.length,
    });
    return result;
  }

  const apiKey = process.env.OPENROUTER_API_KEY || ENV.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || ENV.OPENAI_API_KEY || '';
  const baseURL = process.env.OPENROUTER_BASE_URL || ENV.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

  const messages: { role: string; content: string }[] = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.APP_URL || ENV.APP_URL || 'https://woocs.ai',
        'X-Title': 'WooCS AI',
      },
      body: JSON.stringify({
        model: chatModel,
        messages,
      }),
    });

    const durationMs = Date.now() - startTime;

    if (!res.ok) {
      const errorBody = await res.text();
      logger.error(`OpenRouter API error [${res.status}]`, {
        component: 'AI',
        model: chatModel,
        status: res.status,
        durationMs,
        error: errorBody,
      });
      throw new Error(`OpenRouter Error ${res.status}: ${errorBody}`);
    }

    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content || '';
    const usage = data?.usage;

    logger.ai(`Generated text via [${chatModel}]`, {
      model: chatModel,
      durationMs,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
      promptLength: prompt.length,
      responseLength: content.length,
    });

    return { text: content };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    logger.error(`AI generation failed: ${err.message}`, {
      component: 'AI',
      model: chatModel,
      durationMs,
      stack: err.stack,
    });
    throw err;
  }
}

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
