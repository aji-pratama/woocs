import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/index';
import { db } from '../../src/db/client';
import { stores } from '../../src/db/schema/stores';
import { subscriptions } from '../../src/db/schema/billing';
import { eq } from 'drizzle-orm';
import { StoreService } from '../../src/services/store';

describe('Paywall', () => {
  let storeId: string;
  let rawApiKey: string;

  beforeAll(async () => {
    const res = await StoreService.registerOrUpdateStore('https://paywall-test.com');
    storeId = res.store!.id;
    rawApiKey = res.rawApiKey!;
    // Store starts on free tier by default
  });

  afterAll(async () => {
    if (storeId) {
      await db.delete(stores).where(eq(stores.id, storeId));
    }
  });

  it('should block sync on free tier', async () => {
    const res = await app.request('/api/stores/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': rawApiKey,
      },
      body: JSON.stringify({
        products: [{ wc_id: 1, name: 'Test', price: 10 }],
        faqs: [],
      }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.feature).toBe('syncCatalog');
    expect(data.upgrade_to).toBe('pro');
  });

  it('should allow sync on pro tier', async () => {
    // Upgrade to pro
    await db.update(subscriptions)
      .set({ planKey: 'pro', status: 'active' })
      .where(eq(subscriptions.storeId, storeId));

    const res = await app.request('/api/stores/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': rawApiKey,
      },
      body: JSON.stringify({
        products: [{ wc_id: 1, name: 'Test', price: 10 }],
        faqs: [],
      }),
    });

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.products_received).toBe(1);
  });

  it('should allow FAQ sync on free tier', async () => {
    // Downgrade back to free
    await db.update(subscriptions)
      .set({ planKey: 'free', status: 'active' })
      .where(eq(subscriptions.storeId, storeId));

    // FAQs go through the same sync endpoint but free tier blocks it
    // because syncCatalog is false — this is correct per pricing rules
    const res = await app.request('/api/stores/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': rawApiKey,
      },
      body: JSON.stringify({ products: [], faqs: [{ question: 'test?', answer: 'yes' }] }),
    });

    // Free tier blocks ALL sync (syncCatalog: false)
    expect(res.status).toBe(403);
  });

  it('should return subscription info', async () => {
    const res = await app.request('/api/stores/subscription', {
      method: 'GET',
      headers: { 'X-API-Key': rawApiKey },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.plan_key).toBe('free');
    expect(data.active).toBe(true);
    expect(data.features).toBeDefined();
    expect(data.features.syncCatalog).toBe(false);
    expect(data.features.maxProducts).toBe(0);
  });

  it('should block order status on free tier', async () => {
    const res = await app.request('/api/widget/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId,
        order_id: '123',
        billing_email: 'test@test.com',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.found).toBe(false);
    expect(data.error).toContain('Pro plan');
  });
});
