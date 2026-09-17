import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateOpenRouterText, getChatModelCandidates } from '../../src/services/ai.js';

describe('OpenRouter Multi-Model Rotator & Failover', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TEST_OPENROUTER_ROTATOR = 'true';
    process.env.OPENROUTER_API_KEY = 'test-mock-key-12345';
    process.env.AI_CHAT_MODELS = 'model-primary:free,model-backup-1:free,model-backup-2:free';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  test('parses comma-separated candidate models in priority order', () => {
    const candidates = getChatModelCandidates();
    expect(candidates).toEqual(['model-primary:free', 'model-backup-1:free', 'model-backup-2:free']);
  });

  test('successfully generates text with primary model on HTTP 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Response from primary model' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    const result = await generateOpenRouterText({
      prompt: 'Hello store',
    });

    expect(result.text).toBe('Response from primary model');
    expect(result.modelUsed).toBe('model-primary:free');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('rotates to backup model when primary returns HTTP 429 (Rate Limit)', async () => {
    globalThis.fetch = vi.fn()
      // Primary model fails with 429
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded on free tier',
      })
      // Backup model succeeds with 200
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Response from backup model 1' } }],
          usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
        }),
      });

    const result = await generateOpenRouterText({
      prompt: 'Is this in stock?',
    });

    expect(result.text).toBe('Response from backup model 1');
    expect(result.modelUsed).toBe('model-backup-1:free');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  test('rotates to secondary backup when primary and first backup fail with 5xx', async () => {
    globalThis.fetch = vi.fn()
      // Primary model fails with 503
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      })
      // Backup 1 model fails with 500
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Error',
      })
      // Backup 2 model succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Response from backup model 2' } }],
        }),
      });

    const result = await generateOpenRouterText({
      prompt: 'What sizes are available?',
    });

    expect(result.text).toBe('Response from backup model 2');
    expect(result.modelUsed).toBe('model-backup-2:free');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  test('rotates to next model when model returns empty content', async () => {
    globalThis.fetch = vi.fn()
      // Primary model returns empty content
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '' } }],
        }),
      })
      // Backup model succeeds with valid text
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Here is the product info' } }],
        }),
      });

    const result = await generateOpenRouterText({
      prompt: 'Show details',
    });

    expect(result.text).toBe('Here is the product info');
    expect(result.modelUsed).toBe('model-backup-1:free');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  test('throws error when all models in pool fail', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });

    await expect(generateOpenRouterText({
      prompt: 'Hello',
    })).rejects.toThrow();
  });
});
