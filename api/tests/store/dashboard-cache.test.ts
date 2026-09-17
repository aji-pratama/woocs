import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../../src/index.js';
import { db } from '../../src/db/client.js';
import { stores, products } from '../../src/db/schema/stores.js';
import { chatSessions, chatMessages } from '../../src/db/schema/chat.js';
import { appCache } from '../../src/common/cache.js';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('Dashboard Stats Caching & Invalidation', () => {
  let storeId: string;
  let rawApiKey = 'test-dashboard-key-12345';
  let hashedApiKey: string;

  beforeEach(async () => {
    appCache.clear();
    hashedApiKey = crypto.createHash('sha256').update(rawApiKey).digest('hex');

    const [s] = await db.insert(stores).values({
      wcUrl: 'https://dashboard-cache-test.com',
      merchantEmail: 'owner@dashboard-cache.com',
      apiKeyHash: hashedApiKey,
    }).returning();
    storeId = s.id;

    // Seed 1 product
    await db.insert(products).values({
      storeId: s.id,
      wcId: '101',
      name: 'Sample Test Shirt',
      price: '25.00',
    });
  });

  afterEach(async () => {
    if (storeId) {
      await db.delete(stores).where(eq(stores.id, storeId));
    }
    appCache.clear();
  });

  it('caches dashboard stats after first retrieval', async () => {
    // 1st request
    const res1 = await app.request('/api/stores/dashboard/stats', {
      headers: { 'X-API-Key': rawApiKey },
    });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.products_synced).toBe(1);

    // Verify cache has entry
    const cached = appCache.get(`dashboard_stats:${storeId}`);
    expect(cached).toBeDefined();
    expect(cached.products_synced).toBe(1);

    // Add another product directly in DB without sync endpoint
    await db.insert(products).values({
      storeId,
      wcId: '102',
      name: 'Sample Test Pants',
      price: '35.00',
    });

    // 2nd request should return cached value (still 1)
    const res2 = await app.request('/api/stores/dashboard/stats', {
      headers: { 'X-API-Key': rawApiKey },
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.products_synced).toBe(1);

    // Clear cache or invalidate it
    appCache.delete(`dashboard_stats:${storeId}`);

    // 3rd request should return fresh value (2)
    const res3 = await app.request('/api/stores/dashboard/stats', {
      headers: { 'X-API-Key': rawApiKey },
    });
    expect(res3.status).toBe(200);
    const data3 = await res3.json();
    expect(data3.products_synced).toBe(2);
  });
});
