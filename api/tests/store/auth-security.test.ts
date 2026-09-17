import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/index';
import { db } from '../../src/db/client';
import { stores } from '../../src/db/schema/stores';
import { subscriptions } from '../../src/db/schema/billing';
import { eq } from 'drizzle-orm';
import { StoreService } from '../../src/services/store';

describe('Account & API Key Security and Subscription Reliability', () => {
  let storeId: string;
  let rawApiKey: string;

  beforeAll(async () => {
    // Register store
    const res = await StoreService.registerOrUpdateStore('https://security-test.com');
    storeId = res.store!.id;
    rawApiKey = res.rawApiKey!;

    // Upgrade to pro initially for baseline authorized testing
    await db.update(subscriptions)
      .set({ planKey: 'pro', status: 'active' })
      .where(eq(subscriptions.storeId, storeId));
  });

  afterAll(async () => {
    if (storeId) {
      await db.delete(stores).where(eq(stores.id, storeId));
    }
  });

  describe('1. API Key Sanitization & Format Security', () => {
    it('rejects requests with missing X-API-Key with 401', async () => {
      const res = await app.request('/api/stores/settings', {
        method: 'GET',
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Missing X-API-Key');
    });

    it('rejects API key that is too short (< 16 characters) with 401', async () => {
      const res = await app.request('/api/stores/settings', {
        method: 'GET',
        headers: { 'X-API-Key': 'short_key_123' },
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Invalid API Key');
    });

    it('rejects API key that is too long (> 128 characters) with 401', async () => {
      const longKey = 'a'.repeat(130);
      const res = await app.request('/api/stores/settings', {
        method: 'GET',
        headers: { 'X-API-Key': longKey },
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Invalid API Key');
    });

    it('rejects API key with special/injection characters without touching database', async () => {
      const injectionKeys = [
        "validlengthkey12345' OR '1'='1",
        "validlengthkey12345; DROP TABLE store_store;",
        "validlengthkey12345<script>alert(1)</script>",
        "validlengthkey12345$$$$@#",
      ];

      for (const key of injectionKeys) {
        const res = await app.request('/api/stores/settings', {
          method: 'GET',
          headers: { 'X-API-Key': key },
        });
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Invalid API Key');
      }
    });

    it('rejects well-formatted but non-existent API key with 401', async () => {
      const fakeKey = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
      const res = await app.request('/api/stores/settings', {
        method: 'GET',
        headers: { 'X-API-Key': fakeKey },
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Invalid API Key');
    });

    it('authenticates successfully with valid API key', async () => {
      const res = await app.request('/api/stores/settings', {
        method: 'GET',
        headers: { 'X-API-Key': rawApiKey },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('powered_by_enabled');
    });
  });

  describe('2. Store Key Storage & Cryptographic Hashing', () => {
    it('never stores raw API key in database — only SHA-256 hash', async () => {
      const [record] = await db.select().from(stores).where(eq(stores.id, storeId));
      expect(record).toBeDefined();
      expect(record.apiKeyHash).toBeDefined();
      expect(record.apiKeyHash).toHaveLength(64); // 256-bit hex
      expect(record.apiKeyHash).toBe(StoreService.hashApiKey(rawApiKey));
      // Raw key must never match the hash column
      expect(record.apiKeyHash).not.toBe(rawApiKey);
    });

    it('connects existing store with correct key but rejects with wrong key', async () => {
      // Connect with correct key
      const goodRes = await app.request('/api/stores/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wc_url: 'https://security-test.com',
          api_key: rawApiKey,
        }),
      });
      expect(goodRes.status).toBe(200);
      const goodData = await goodRes.json();
      expect(goodData.valid).toBe(true);
      expect(goodData.store_id).toBe(storeId);
      expect(goodData.api_key).toBeNull(); // Does not re-expose key

      // Connect with invalid key
      const badRes = await app.request('/api/stores/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wc_url: 'https://security-test.com',
          api_key: 'wrong_key_1234567890123456789012345678901234567890',
        }),
      });
      expect(badRes.status).toBe(401);
    });
  });

  describe('3. Subscription Status & Paywall Gating', () => {
    it('allows sync when subscription is active on pro tier', async () => {
      await db.update(subscriptions)
        .set({ planKey: 'pro', status: 'active' })
        .where(eq(subscriptions.storeId, storeId));

      const res = await app.request('/api/stores/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': rawApiKey,
        },
        body: JSON.stringify({ products: [{ wc_id: 1, name: 'Security Shirt' }], faqs: [] }),
      });
      expect(res.status).toBe(202);
    });

    it('allows sync when subscription is trialing on pro tier', async () => {
      await db.update(subscriptions)
        .set({ planKey: 'pro', status: 'trialing' })
        .where(eq(subscriptions.storeId, storeId));

      const res = await app.request('/api/stores/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': rawApiKey,
        },
        body: JSON.stringify({ products: [{ wc_id: 2, name: 'Trial Shirt' }], faqs: [] }),
      });
      expect(res.status).toBe(202);
    });

    it('blocks sync with 402 when subscription status is past_due', async () => {
      await db.update(subscriptions)
        .set({ planKey: 'pro', status: 'past_due' })
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
      const data = await res.json();
      expect(data.error).toBe('Subscription is inactive');
    });

    it('blocks sync with 402 when subscription status is canceled', async () => {
      await db.update(subscriptions)
        .set({ planKey: 'pro', status: 'canceled' })
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
      const data = await res.json();
      expect(data.error).toBe('Subscription is inactive');
    });

    it('blocks sync with 402 when subscription status is revoked', async () => {
      await db.update(subscriptions)
        .set({ planKey: 'pro', status: 'revoked' })
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
      const data = await res.json();
      expect(data.error).toBe('Subscription is inactive');
    });

    it('blocks product sync with 403 on free tier even when active', async () => {
      await db.update(subscriptions)
        .set({ planKey: 'free', status: 'active' })
        .where(eq(subscriptions.storeId, storeId));

      const res = await app.request('/api/stores/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': rawApiKey,
        },
        body: JSON.stringify({ products: [{ wc_id: 3, name: 'Free Shirt' }], faqs: [] }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.feature).toBe('syncCatalog');
      expect(data.upgrade_to).toBe('pro');
    });
  });
});
