import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StoreService, SyncService } from '../../src/services/store';
import { db } from '../../src/db/client';
import { stores, products, productVariations, faqs } from '../../src/db/schema/stores';
import { subscriptions } from '../../src/db/schema/billing';
import { eq } from 'drizzle-orm';

describe('StoreService', () => {
  let createdStoreId: string;

  afterAll(async () => {
    if (createdStoreId) {
      await db.delete(stores).where(eq(stores.id, createdStoreId));
    }
  });

  it('should generate api key', () => {
    const key = StoreService.generateApiKey();
    expect(key.length).toBe(48);
  });

  it('should hash api key', () => {
    const key = 'test_key';
    const hash = StoreService.hashApiKey(key);
    expect(hash.length).toBe(64);
    expect(hash).not.toBe(key);
  });

  it('should get store name from url', () => {
    expect(StoreService.getStoreNameFromUrl('https://example.com')).toBe('example.com');
  });

  it('should register new store', async () => {
    const url = 'https://example.com';
    const { store, rawApiKey, isValid } = await StoreService.registerOrUpdateStore(url);
    
    expect(isValid).toBe(true);
    expect(store).not.toBeNull();
    expect(rawApiKey).not.toBeNull();
    expect(store?.wcUrl).toBe(url);

    createdStoreId = store!.id;

    // Check subscription
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.storeId, createdStoreId));
    expect(sub).toBeDefined();
    expect(sub.status).toBe('trialing');
  });

  it('should update existing store', async () => {
    const url = 'https://example-two.com';
    const { store, rawApiKey } = await StoreService.registerOrUpdateStore(url);
    const storeId = store!.id;

    const newUrl = 'https://new-example.com';
    const result = await StoreService.registerOrUpdateStore(newUrl, rawApiKey!);
    
    expect(result.isValid).toBe(true);
    expect(result.store?.id).toBe(storeId);
    expect(result.store?.wcUrl).toBe(newUrl);
    expect(result.rawApiKey).toBeNull();

    await db.delete(stores).where(eq(stores.id, storeId));
  });

  it('should return invalid for invalid api key', async () => {
    const { store, isValid } = await StoreService.registerOrUpdateStore('https://example.com', 'invalid_key');
    expect(isValid).toBe(false);
    expect(store).toBeNull();
  });
});

describe('SyncService', () => {
  let storeId: string;

  beforeAll(async () => {
    const { store } = await StoreService.registerOrUpdateStore('https://sync-test.com');
    storeId = store!.id;
  });

  afterAll(async () => {
    if (storeId) {
      await db.delete(stores).where(eq(stores.id, storeId));
    }
  });

  it('should process sync payload', async () => {
    const payload = {
      products: [
        {
          wc_id: 1,
          name: 'Test Product',
          price: 10.0,
          stock_status: 'instock',
          stock_quantity: 10,
          categories: ['Test'],
          tags: [],
          variations: [
            {
              wc_variation_id: 101,
              attributes: { color: 'red' },
              price: 10.0,
            }
          ]
        }
      ],
      faqs: [
        { question: 'Test Q', answer: 'Test A' }
      ]
    };

    const res = await SyncService.processSyncPayload(storeId, payload as any);

    expect(res.productsCount).toBe(1);
    expect(res.variationsCount).toBe(1);
    expect(res.faqsCount).toBe(1);

    const productsDb = await db.select().from(products).where(eq(products.storeId, storeId));
    expect(productsDb.length).toBe(1);
    
    const faqsDb = await db.select().from(faqs).where(eq(faqs.storeId, storeId));
    expect(faqsDb.length).toBe(1);
  });
});
