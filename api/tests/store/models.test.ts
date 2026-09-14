import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/db/client';
import { stores, products, productVariations, faqs } from '../../src/db/schema/stores';
import { eq } from 'drizzle-orm';

describe('Store Models', () => {
  let storeId: string;

  beforeAll(async () => {
    // Note: ensure tests are run against an isolated test DB
  });

  afterAll(async () => {
    if (storeId) {
      await db.delete(stores).where(eq(stores.id, storeId));
    }
  });

  it('should create a store', async () => {
    const [store] = await db.insert(stores).values({
      apiKeyHash: 'dummy_hash_' + Date.now(),
      wcUrl: 'https://test.com',
      merchantEmail: 'test@test.com',
    }).returning();

    expect(store.id).toBeDefined();
    expect(store.apiKeyHash).toMatch(/^dummy_hash_/);
    expect(store.wcUrl).toBe('https://test.com');
    storeId = store.id;
  });

  describe('Catalog Models', () => {
    let productId: string;

    it('should create a product', async () => {
      const [product] = await db.insert(products).values({
        storeId,
        wcId: 101,
        name: 'Test Product',
        price: '99.99',
      }).returning();

      expect(product.name).toBe('Test Product');
      expect(product.storeId).toBe(storeId);
      expect(product.embedding).toBeNull();
      productId = product.id;
    });

    it('should create a product variation', async () => {
      const [variation] = await db.insert(productVariations).values({
        productId,
        wcVariationId: 202,
        attributes: { size: 'M' },
        price: '99.99',
      }).returning();

      expect(variation.productId).toBe(productId);
      expect(variation.wcVariationId).toBe(202);
      expect(variation.attributes).toEqual({ size: 'M' });
    });

    it('should create an FAQ', async () => {
      const [faq] = await db.insert(faqs).values({
        storeId,
        question: 'Is this a test?',
        answer: 'Yes.',
      }).returning();

      expect(faq.storeId).toBe(storeId);
      expect(faq.question).toBe('Is this a test?');
    });
  });
});
