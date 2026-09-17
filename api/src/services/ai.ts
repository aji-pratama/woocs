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

export function getChatModelCandidates(overrideModel?: string): string[] {
  if (overrideModel) return [overrideModel];
  
  if (process.env.AI_CHAT_MODEL && !process.env.AI_CHAT_MODELS) {
    return [process.env.AI_CHAT_MODEL];
  }

  const rawList = process.env.AI_CHAT_MODELS || ENV.AI_CHAT_MODELS || '';
  const parsed = rawList
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const primary = process.env.AI_CHAT_MODEL;
  if (primary && !parsed.includes(primary)) {
    parsed.unshift(primary);
  }

  if (parsed.length === 0) {
    return [
      'nex-agi/nex-n2.5-mini:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-small-24b-instruct-2501:free',
      'google/gemini-2.0-flash-exp:free',
      'qwen/qwen-2.5-coder-32b-instruct:free',
    ];
  }

  return parsed;
}

export const aiModels = {
  get chat() {
    const candidates = getChatModelCandidates();
    return getOpenRouter().chat(candidates[0]) as any;
  },
  get embedding() {
    const model = process.env.AI_EMBEDDING_MODEL || ENV.AI_EMBEDDING_MODEL || 'liquid/lfm-2.5-embedding-350m:free';
    return (getOpenRouter().embedding as any)(model, { dimensions: 1024 });
  },
};

/**
 * Direct OpenRouter chat generation helper with automatic multi-model rotation & failover.
 * If the primary free model hits rate limits (429), capacity errors (5xx), or returns empty responses,
 * it seamlessly fails over to the next candidate model in the pool without dropping customer chat sessions.
 */
export async function generateOpenRouterText({
  model,
  system,
  prompt,
}: {
  model?: string;
  system?: string;
  prompt: string;
}): Promise<{ text: string; modelUsed?: string }> {
  const candidates = getChatModelCandidates(model);

  if (process.env.NODE_ENV === 'test' && !process.env.TEST_OPENROUTER_ROTATOR) {
    const startTime = Date.now();
    const { generateText } = await import('ai');
    const result = await generateText({
      model: aiModels.chat,
      system,
      prompt,
    });
    const durationMs = Date.now() - startTime;
    logger.ai(`Generated text via test model [${candidates[0]}]`, {
      model: candidates[0],
      durationMs,
      promptLength: prompt.length,
      responseLength: result.text.length,
    });
    return { text: result.text, modelUsed: candidates[0] };
  }

  const apiKey = process.env.OPENROUTER_API_KEY || ENV.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || ENV.OPENAI_API_KEY || '';
  const baseURL = process.env.OPENROUTER_BASE_URL || ENV.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

  const messages: { role: string; content: string }[] = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: prompt });

  const errors: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const currentModel = candidates[i];
    const startTime = Date.now();

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
          model: currentModel,
          messages,
        }),
      });

      const durationMs = Date.now() - startTime;

      if (!res.ok) {
        const errorBody = await res.text();
        const errSummary = `[${res.status}] ${errorBody.slice(0, 150)}`;
        errors.push(`${currentModel}: ${errSummary}`);

        const nextModel = candidates[i + 1];
        if (nextModel) {
          logger.warn(`AI model [${currentModel}] failed (${res.status}), rotating to next candidate [${nextModel}]...`, {
            component: 'AI',
            failedModel: currentModel,
            nextModel,
            status: res.status,
            durationMs,
          });
          continue;
        } else {
          logger.error(`AI model [${currentModel}] failed (${res.status}) and no more candidates available.`, {
            component: 'AI',
            model: currentModel,
            status: res.status,
            durationMs,
          });
          throw new Error(`OpenRouter Error ${res.status}: ${errorBody}`);
        }
      }

      const data = (await res.json()) as any;
      const content = data?.choices?.[0]?.message?.content || '';
      const usage = data?.usage;

      if (!content && candidates[i + 1]) {
        logger.warn(`AI model [${currentModel}] returned empty content, rotating to next candidate [${candidates[i + 1]}]...`, {
          component: 'AI',
          failedModel: currentModel,
          nextModel: candidates[i + 1],
          durationMs,
        });
        continue;
      }

      logger.ai(`Generated text via [${currentModel}]`, {
        model: currentModel,
        durationMs,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
        promptLength: prompt.length,
        responseLength: content.length,
        attemptsCount: i + 1,
      });

      return { text: content, modelUsed: currentModel };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const nextModel = candidates[i + 1];

      if (nextModel) {
        logger.warn(`AI model [${currentModel}] exception: ${err.message}, rotating to next candidate [${nextModel}]...`, {
          component: 'AI',
          failedModel: currentModel,
          nextModel,
          durationMs,
        });
        errors.push(`${currentModel}: ${err.message}`);
        continue;
      }

      logger.error(`All AI model candidates failed. Last error [${currentModel}]: ${err.message}`, {
        component: 'AI',
        candidates,
        durationMs,
        errors,
        stack: err.stack,
      });
      throw err;
    }
  }

  throw new Error(`All candidate AI models failed: ${errors.join(' | ')}`);
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
