import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { RagService } from '../../src/services/rag.js';
import { db } from '../../src/db/client.js';
import { stores, products } from '../../src/db/schema/stores.js';
import { chatSessions } from '../../src/db/schema/chat.js';
import { appCache } from '../../src/common/cache.js';
// Mock AI SDK
vi.mock('ai', () => ({
  embed: vi.fn().mockResolvedValue({ embedding: new Array(1024).fill(0.1) }),
  generateText: vi.fn().mockResolvedValue({ text: 'Yes, we have Slim Fit Jeans in stock!' }),
}));

describe('RAG Resilient Search Fallback', () => {
  let testStore: any;
  let testSession: any;

  beforeEach(async () => {
    appCache.clear();

    const [store] = await db.insert(stores).values({
      wcUrl: 'https://test-fallback-shop.com',
      merchantEmail: 'owner@test-fallback.com',
      apiKeyHash: `mock-hash-${Date.now()}`,
    }).returning();
    testStore = store;

    const [session] = await db.insert(chatSessions).values({
      storeId: store.id,
      sessionId: crypto.randomUUID(),
    }).returning();
    testSession = session;

    // Insert sample product
    await db.insert(products).values({
      storeId: store.id,
      wcId: '991',
      name: 'Signature Slim Fit Jeans',
      price: '49.99',
      stockStatus: 'instock',
      stockQuantity: 15,
      wcUrl: 'https://test-fallback-shop.com/?p=991',
    });
  });

  test('successfully retrieves product via text search fallback when embedding fails', async () => {
    // Force getQueryEmbedding to return null (simulating embedding API outage or rate limit)
    const embedSpy = vi.spyOn(RagService, 'getQueryEmbedding').mockResolvedValueOnce(null);

    const result = await RagService.query(testStore, 'Do you have Slim Fit Jeans in stock?', testSession);

    expect(result).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products[0].name).toContain('Slim Fit Jeans');
    expect(['text_search', 'catalog_overview', 'retrieval']).toContain(result.contextUsed);

    embedSpy.mockRestore();
  });

  test('caches query embeddings to avoid redundant embed calls', async () => {
    const question = 'Are there jeans available?';

    // First call
    const res1 = await RagService.query(testStore, question, testSession);
    expect(res1).toBeDefined();

    // Check that cache has the entry
    const normalized = question.trim().toLowerCase();
    const cachedVector = appCache.get(`emb:${normalized}`);
    expect(cachedVector).toBeDefined();

    // Second call should reuse cached vector
    const res2 = await RagService.query(testStore, question, testSession);
    expect(res2).toBeDefined();
    expect(res2.products.length).toBe(res1.products.length);
  });
});
