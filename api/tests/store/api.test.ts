import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/index';
import { db } from '../../src/db/client';
import { stores } from '../../src/db/schema/stores';
import { subscriptions } from '../../src/db/schema/billing';
import { eq } from 'drizzle-orm';
import { StoreService } from '../../src/services/store';

describe('Store API', () => {
  let storeId: string;
  let rawApiKey: string;

  beforeAll(async () => {
    // Generate a store for tests
    const url = 'https://api-test.com';
    const res = await StoreService.registerOrUpdateStore(url);
    storeId = res.store!.id;
    rawApiKey = res.rawApiKey!;

    // Upgrade to pro so sync tests pass the feature gate
    await db.update(subscriptions)
      .set({ planKey: 'pro', status: 'active' })
      .where(eq(subscriptions.storeId, storeId));
  });

  afterAll(async () => {
    if (storeId) {
      await db.delete(stores).where(eq(stores.id, storeId));
    }
  });

  it('should register a new store', async () => {
    const res = await app.request('/api/stores/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wc_url: 'https://test.com' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.store_id).toBeDefined();
    expect(data.api_key).toBeDefined();

    // cleanup
    await db.delete(stores).where(eq(stores.id, data.store_id));
  });

  it('should register an existing store', async () => {
    const res = await app.request('/api/stores/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wc_url: 'https://new-api-test.com', api_key: rawApiKey }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.store_name).toBe('new-api-test.com');
    expect(data.api_key).toBeNull();
  });

  it('should reject sync when unauthorized', async () => {
    const res = await app.request('/api/stores/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: [], faqs: [] }),
    });

    expect(res.status).toBe(401);
  });

  it('should accept sync when authorized', async () => {
    const res = await app.request('/api/stores/sync', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': rawApiKey,
      },
      body: JSON.stringify({
        products: [{ wc_id: 1, name: 'Test', price: 10.0 }],
        faqs: []
      }),
    });

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.status).toBe('processing');
  });

  it('should get sync status', async () => {
    const res = await app.request('/api/stores/sync/status/', {
      method: 'GET',
      headers: { 'X-API-Key': rawApiKey },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    // When no tasks have been created yet
    expect(data.status).toBeDefined();
  });

  it('should deny sync when subscription is revoked', async () => {
    // Modify subscription status
    await db.update(subscriptions)
      .set({ status: 'revoked' })
      .where(eq(subscriptions.storeId, storeId));

    const res = await app.request('/api/stores/sync', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': rawApiKey,
      },
      body: JSON.stringify({ products: [], faqs: [] }),
    });

    expect(res.status).toBe(402);
  });
});
