import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIRouter, getAIRouterConfig, AIRouteConfig } from '../../src/services/ai.js';

describe('AIRouter Multi-Provider Pipeline & Routing', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    AIRouter.resetCooldowns();
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.AI_ROUTER_CONFIG_JSON;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  test('successfully executes primary route in pipeline', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Hello from OpenAI primary' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    const result = await AIRouter.generateText({
      prompt: 'Hello store',
    });

    expect(result.text).toBe('Hello from OpenAI primary');
    expect(result.providerUsed).toBe('openai');
    expect(result.attemptsCount).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('fails over from OpenAI to OpenRouter when OpenAI returns 429', async () => {
    globalThis.fetch = vi.fn()
      // 1. OpenAI returns 429
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded on OpenAI',
      })
      // 2. OpenRouter succeeds with 200
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Hello from OpenRouter backup' } }],
          usage: { prompt_tokens: 8, completion_tokens: 6, total_tokens: 14 },
        }),
      });

    const result = await AIRouter.generateText({
      prompt: 'Do you have red shoes?',
    });

    expect(result.text).toBe('Hello from OpenRouter backup');
    expect(result.providerUsed).toBe('openrouter');
    expect(result.attemptsCount).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  test('supports custom dynamic JSON router configuration via AI_ROUTER_CONFIG_JSON', async () => {
    const customConfig: AIRouteConfig[] = [
      {
        id: 'account-1-openai',
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'sk-account-1',
      },
      {
        id: 'account-2-gemini',
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        apiKey: 'gemini-key-2',
      },
    ];

    process.env.AI_ROUTER_CONFIG_JSON = JSON.stringify(customConfig);

    const activeConfig = getAIRouterConfig();
    expect(activeConfig).toHaveLength(2);
    expect(activeConfig[0].id).toBe('account-1-openai');
    expect(activeConfig[1].id).toBe('account-2-gemini');

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Custom route response' } }],
      }),
    });

    const result = await AIRouter.generateText({
      prompt: 'Testing custom config',
    });

    expect(result.text).toBe('Custom route response');
    expect(result.routeUsed).toBe('account-1-openai');
  });

  test('applies circuit breaker cooldown to avoid retrying recently failed routes', async () => {
    // Call 1: OpenAI fails (sets 30s cooldown), OpenRouter succeeds
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'OpenRouter fallback 1' } }],
        }),
      });

    const result1 = await AIRouter.generateText({ prompt: 'First query' });
    expect(result1.text).toBe('OpenRouter fallback 1');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    // Call 2: OpenAI should be skipped due to active cooldown, straight to OpenRouter!
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'OpenRouter fast response' } }],
      }),
    });

    const result2 = await AIRouter.generateText({ prompt: 'Second query' });
    expect(result2.text).toBe('OpenRouter fast response');
    // Only 1 call because failed OpenAI was skipped!
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
