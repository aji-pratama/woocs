import { ENV } from './env.js';

export type AIProviderType = 'openai' | 'openrouter' | 'gemini' | 'anthropic' | 'custom';

export interface AIRouteConfig {
  id: string;
  provider: AIProviderType;
  model: string;
  apiKeyEnv?: string;
  apiKey?: string;
  baseURL?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

export const DEFAULT_AI_ROUTER_CHAIN: AIRouteConfig[] = [
  // 1. Primary: Direct OpenAI GPT-4o Mini if OPENAI_API_KEY is set
  {
    id: 'openai-primary',
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
    timeoutMs: 12000,
    enabled: true,
  },
  // 2. OpenRouter Fast / Free Candidates
  {
    id: 'openrouter-gemini-flash',
    provider: 'openrouter',
    model: 'google/gemini-2.0-flash-exp:free',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    timeoutMs: 12000,
    enabled: true,
  },
  {
    id: 'openrouter-llama-70b',
    provider: 'openrouter',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    timeoutMs: 12000,
    enabled: true,
  },
  {
    id: 'openrouter-qwen',
    provider: 'openrouter',
    model: 'qwen/qwen-2.5-coder-32b-instruct:free',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    timeoutMs: 12000,
    enabled: true,
  },
  // 3. Direct Google Gemini if GEMINI_API_KEY is set
  {
    id: 'gemini-direct',
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    timeoutMs: 12000,
    enabled: true,
  },
];

/**
 * Resolves the active AI routing chain.
 * Can be overridden via AI_ROUTER_CONFIG_JSON env variable.
 */
export function getAIRouterConfig(): AIRouteConfig[] {
  const jsonConfig = process.env.AI_ROUTER_CONFIG_JSON || ENV.AI_ROUTER_CONFIG_JSON;
  if (jsonConfig) {
    try {
      const parsed = JSON.parse(jsonConfig);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse AI_ROUTER_CONFIG_JSON, falling back to default config:', e);
    }
  }

  // Also support legacy comma-separated list AI_CHAT_MODELS (mapping each to openrouter)
  if (process.env.AI_CHAT_MODELS) {
    const list = process.env.AI_CHAT_MODELS.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length > 0) {
      return list.map((model, idx) => ({
        id: `openrouter-legacy-${idx + 1}`,
        provider: 'openrouter' as AIProviderType,
        model,
        apiKeyEnv: 'OPENROUTER_API_KEY',
        timeoutMs: 12000,
        enabled: true,
      }));
    }
  }

  return DEFAULT_AI_ROUTER_CHAIN;
}
