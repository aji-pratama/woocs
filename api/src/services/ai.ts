import { createOpenAI } from '@ai-sdk/openai';
import { ENV } from '../config/env.js';
import { logger } from '../common/logger.js';
import { getAIRouterConfig, AIRouteConfig } from '../config/ai-router.js';

export * from '../config/ai-router.js';

// ─── 1. AI Models & Embedding Client ──────────────────────────────────────────

export function getOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY || ENV.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || ENV.OPENAI_API_KEY || '';
  const baseURL = process.env.OPENROUTER_BASE_URL || ENV.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const appUrl = process.env.APP_URL || ENV.APP_URL || 'https://woocs.ai';

  return createOpenAI({
    baseURL,
    apiKey,
    headers: { 'HTTP-Referer': appUrl, 'X-Title': 'WooCS AI' },
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
  if (process.env.AI_CHAT_MODEL && !process.env.AI_CHAT_MODELS) return [process.env.AI_CHAT_MODEL];
  const rawList = process.env.AI_CHAT_MODELS || ENV.AI_CHAT_MODELS || '';
  const parsed = rawList.split(',').map((s) => s.trim()).filter(Boolean);
  const primary = process.env.AI_CHAT_MODEL;
  if (primary && !parsed.includes(primary)) parsed.unshift(primary);
  return parsed.length > 0
    ? parsed
    : ['google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.3-70b-instruct:free'];
}

export const aiModels = {
  get chat() {
    return getOpenRouter().chat(getChatModelCandidates()[0]) as any;
  },
  get embedding() {
    const model = process.env.AI_EMBEDDING_MODEL || ENV.AI_EMBEDDING_MODEL || 'liquid/lfm-2.5-embedding-350m:free';
    return (getOpenRouter().embedding as any)(model, { dimensions: 1024 });
  },
};

// ─── 2. Provider API Dispatcher ───────────────────────────────────────────────

async function callProviderAPI(
  route: AIRouteConfig,
  apiKey: string,
  prompt: string,
  system?: string,
  timeoutMs = 15000
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Direct Google Gemini API
    if (route.provider === 'gemini') {
      const cleanModel = route.model.replace(/^models\//, '');
      const baseURL = route.baseURL || 'https://generativelanguage.googleapis.com/v1beta';
      const url = `${baseURL.replace(/\/$/, '')}/models/${cleanModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const contents = [
        {
          role: 'user',
          parts: [{ text: system ? `[SYSTEM]: ${system}\n\n[USER]: ${prompt}` : prompt }],
        },
      ];

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Google Gemini Error [${res.status}]: ${(await res.text()).slice(0, 150)}`);
      const data = (await res.json()) as any;
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // OpenAI / OpenRouter / Custom OpenAI-compatible endpoint
    const baseURL =
      route.baseURL ||
      (route.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    if (route.provider === 'openrouter') {
      headers['HTTP-Referer'] = process.env.APP_URL || 'https://woocs.ai';
      headers['X-Title'] = 'WooCS AI';
    }

    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: route.model, messages }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`${route.provider.toUpperCase()} Error [${res.status}]: ${(await res.text()).slice(0, 150)}`);
    const data = (await res.json()) as any;
    return data?.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── 3. AI Router Engine ──────────────────────────────────────────────────────

export class AIRouter {
  private static routeCooldowns = new Map<string, number>();

  static resetCooldowns(): void {
    this.routeCooldowns.clear();
  }

  static async generateText({
    prompt,
    system,
    modelOverride,
    chainOverride,
    timeoutMs = 15000,
  }: {
    prompt: string;
    system?: string;
    modelOverride?: string;
    chainOverride?: AIRouteConfig[];
    timeoutMs?: number;
  }): Promise<{
    text: string;
    routeUsed: string;
    providerUsed: string;
    modelUsed: string;
    attemptsCount: number;
  }> {
    let chain = chainOverride;
    if (!chain || chain.length === 0) {
      if (modelOverride) {
        const isSlash = modelOverride.includes('/');
        chain = [
          {
            id: `override-${modelOverride}`,
            provider: isSlash ? 'openrouter' : 'openai',
            model: modelOverride,
            apiKeyEnv: isSlash ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY',
            enabled: true,
          },
        ];
      } else {
        chain = getAIRouterConfig().filter((r) => r.enabled !== false);
      }
    }

    const errors: string[] = [];
    let attemptsCount = 0;

    for (let i = 0; i < chain.length; i++) {
      const route = chain[i];
      const routeKey = route.id || `${route.provider}:${route.model}`;

      // 1. Circuit breaker cooldown check
      const cooldownUntil = this.routeCooldowns.get(routeKey);
      if (cooldownUntil && Date.now() < cooldownUntil) continue;

      // 2. Resolve API key
      let apiKey = route.apiKey || (route.apiKeyEnv ? process.env[route.apiKeyEnv] : undefined);
      if (!apiKey) {
        if (route.provider === 'openai') apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
        else if (route.provider === 'openrouter') apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
        else if (route.provider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
      }
      if (!apiKey && route.provider !== 'custom') continue;

      attemptsCount++;
      const startTime = Date.now();

      try {
        const text = await callProviderAPI(route, apiKey || '', prompt, system, timeoutMs || route.timeoutMs);

        if (!text) {
          errors.push(`[${routeKey}]: Empty response`);
          if (i < chain.length - 1) continue;
          throw new Error(`AI route [${routeKey}] returned empty content`);
        }

        this.routeCooldowns.delete(routeKey);
        logger.ai(`Generated text via [${routeKey}]`, {
          route: routeKey,
          provider: route.provider,
          model: route.model,
          durationMs: Date.now() - startTime,
          attemptsCount,
        });

        return {
          text,
          routeUsed: routeKey,
          providerUsed: route.provider,
          modelUsed: route.model,
          attemptsCount,
        };
      } catch (err: any) {
        const errMessage = err.message || String(err);
        errors.push(`[${routeKey}]: ${errMessage}`);
        this.routeCooldowns.set(routeKey, Date.now() + 30_000);

        if (i < chain.length - 1) {
          logger.warn(`AI route [${routeKey}] failed (${errMessage}), failing over...`);
          continue;
        }
      }
    }

    throw new Error(`All candidate AI routes failed: ${errors.join(' | ')}`);
  }
}

// ─── 4. Backward-Compatible Helpers ───────────────────────────────────────────

export async function generateOpenRouterText({
  model,
  system,
  prompt,
}: {
  model?: string;
  system?: string;
  prompt: string;
}): Promise<{ text: string; modelUsed?: string }> {
  if (process.env.NODE_ENV === 'test' && !process.env.TEST_OPENROUTER_ROTATOR) {
    const { generateText } = await import('ai');
    const result = await generateText({ model: aiModels.chat, system, prompt });
    return { text: result.text, modelUsed: getChatModelCandidates(model)[0] };
  }

  const result = await AIRouter.generateText({ prompt, system, modelOverride: model });
  return { text: result.text, modelUsed: result.modelUsed };
}

export function to1024Vector(vector: number[]): number[] {
  if (!vector || vector.length === 1024) return vector;
  const sliced = vector.slice(0, 1024);
  const norm = Math.sqrt(sliced.reduce((sum, val) => sum + val * val, 0));
  return sliced.map((val) => val / (norm || 1));
}
