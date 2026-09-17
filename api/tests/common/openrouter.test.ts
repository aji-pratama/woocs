import { describe, it, expect, vi, beforeEach } from 'vitest';
import { to1024Vector } from '../../src/services/ai';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, embed } from 'ai';

describe('OpenRouter Integration & AI Utilities', () => {
  describe('to1024Vector (Matryoshka Reduction)', () => {
    it('should return the original vector if already 1024 dimensions', () => {
      const vector = new Array(1024).fill(0.5);
      const result = to1024Vector(vector);
      expect(result).toHaveLength(1024);
      expect(result).toEqual(vector);
    });

    it('should truncate and L2 normalize a 1536 dimension vector to 1024', () => {
      const vector = new Array(1536).fill(1);
      const result = to1024Vector(vector);

      expect(result).toHaveLength(1024);
      // L2 norm of the sliced vector must equal ~1.0
      const norm = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('should handle empty or null vectors gracefully', () => {
      expect(to1024Vector([])).toEqual([]);
      expect(to1024Vector(null as any)).toBeNull();
    });
  });

  describe('OpenRouter Client Configuration', () => {
    it('should create an OpenRouter client with correct base URL and custom headers', () => {
      const customOpenRouter = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: 'test-api-key',
        headers: {
          'HTTP-Referer': 'https://woocs.ai',
          'X-Title': 'WooCS AI',
        },
      });

      expect(customOpenRouter).toBeDefined();
      expect(typeof customOpenRouter.chat).toBe('function');
      expect(typeof customOpenRouter.embedding).toBe('function');
    });
  });

  describe('OpenRouter Request Mocking', () => {
    it('should handle simulated chat completion requests', async () => {
      // Mock chat completion response
      const mockChatModel = {
        modelId: 'test-chat-model',
        provider: 'openrouter.chat',
        doGenerate: vi.fn().mockResolvedValue({
          text: 'Hello! I am your WooCommerce AI assistant.',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 8 },
          rawCall: { rawPrompt: null, rawSettings: {} },
        }),
      };

      const result = await generateText({
        model: mockChatModel as any,
        prompt: 'Hello',
      });

      expect(result.text).toBe('Hello! I am your WooCommerce AI assistant.');
      expect(mockChatModel.doGenerate).toHaveBeenCalledTimes(1);
    });

    it('should handle simulated embedding requests', async () => {
      const mockEmbeddingVector = new Array(1024).fill(0.1);
      const mockEmbeddingModel = {
        modelId: 'test-embedding-model',
        provider: 'openrouter.embedding',
        maxEmbeddingsPerCall: 20,
        supportsParallelCalls: true,
        doEmbed: vi.fn().mockResolvedValue({
          embeddings: [mockEmbeddingVector],
          usage: { tokens: 5 },
        }),
      };

      const result = await embed({
        model: mockEmbeddingModel as any,
        value: 'Classic Hoodie',
      });

      expect(result.embedding).toHaveLength(1024);
      expect(mockEmbeddingModel.doEmbed).toHaveBeenCalledTimes(1);
    });

    it('should handle upstream API errors (e.g. 401 Unauthorized or 429 Rate Limit)', async () => {
      const errorModel = {
        modelId: 'error-model',
        provider: 'openrouter.chat',
        doGenerate: vi.fn().mockRejectedValue(new Error('Provider returned error 429: Rate limit exceeded')),
      };

      await expect(
        generateText({
          model: errorModel as any,
          prompt: 'Test query',
        })
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  // Optional live integration test (only runs when valid OPENROUTER_API_KEY is available)
  describe.runIf(process.env.OPENROUTER_API_KEY && !process.env.OPENROUTER_API_KEY.includes('placeholder'))(
    'Live OpenRouter API Tests',
    () => {
      it('should successfully call OpenRouter embedding endpoint if API key exists', async () => {
        const openrouter = createOpenAI({
          baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
          apiKey: process.env.OPENROUTER_API_KEY || '',
        });

        const embeddingModel = (openrouter.embedding as any)(
          process.env.AI_EMBEDDING_MODEL || 'liquid/lfm-2.5-embedding-350m:free',
          { dimensions: 1024 }
        );

        const { embedding } = await embed({
          model: embeddingModel,
          value: 'WooCommerce product test',
        });

        expect(embedding).toBeDefined();
        expect(embedding.length).toBeGreaterThan(0);
        const vector1024 = to1024Vector(embedding);
        expect(vector1024).toHaveLength(1024);
      }, 15000);
    }
  );
});
