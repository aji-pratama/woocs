import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import app from '../../src/index';
import { db } from '../../src/db/client';
import { stores } from '../../src/db/schema/stores';
import { subscriptions, polarWebhookEvents } from '../../src/db/schema/billing';
import { eq } from 'drizzle-orm';
import { StoreService } from '../../src/services/store';
import { BillingService } from '../../src/services/billing';
import { ENV } from '../../src/config/env';

describe('Billing & Webhooks API', () => {
  let storeId: string;
  let rawApiKey: string;
  const webhookSecret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const secretBytes = Buffer.from(webhookSecret.slice(6), 'base64');

  function createSignature(eventId: string, timestamp: number, body: string): string {
    const signedPayload = Buffer.concat([
      Buffer.from(`${eventId}.${timestamp}.`, 'utf8'),
      Buffer.from(body, 'utf8'),
    ]);
    return crypto.createHmac('sha256', secretBytes).update(signedPayload).digest('base64');
  }

  beforeAll(async () => {
    (ENV as any).POLAR_WEBHOOK_SECRET = webhookSecret;
    const res = await StoreService.registerOrUpdateStore('https://billing-test-shop.com');
    storeId = res.store!.id;
    rawApiKey = res.rawApiKey!;
  });

  afterAll(async () => {
    if (storeId) {
      await db.delete(subscriptions).where(eq(subscriptions.storeId, storeId));
      await db.delete(stores).where(eq(stores.id, storeId));
    }
  });

  describe('Webhook Security & Verification', () => {
    it('should reject requests without signature headers', async () => {
      const res = await app.request('/api/webhooks/polar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'subscription.created' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Missing Polar webhook signature headers.');
    });

    it('should reject requests with expired timestamp', async () => {
      const body = JSON.stringify({ type: 'subscription.created' });
      const eventId = 'evt_expired_1';
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const sig = createSignature(eventId, expiredTimestamp, body);

      const res = await app.request('/api/webhooks/polar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': eventId,
          'webhook-timestamp': String(expiredTimestamp),
          'webhook-signature': `v1,${sig}`,
        },
        body,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Polar webhook signature has expired.');
    });

    it('should safely reject invalid signatures without throwing buffer length errors', async () => {
      const body = JSON.stringify({ type: 'subscription.created' });
      const eventId = 'evt_bad_sig_1';
      const now = Math.floor(Date.now() / 1000);

      const res = await app.request('/api/webhooks/polar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': eventId,
          'webhook-timestamp': String(now),
          'webhook-signature': 'v1,short_invalid_signature',
        },
        body,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid Polar webhook signature.');
    });

    it('should process a valid subscription.created webhook', async () => {
      const eventId = `evt_create_${Date.now()}`;
      const now = Math.floor(Date.now() / 1000);
      const futurePeriodEnd = new Date(Date.now() + 30 * 86400000).toISOString();

      const payload = {
        type: 'subscription.created',
        data: {
          id: 'sub_polar_123',
          status: 'active',
          customer_id: 'cust_polar_123',
          current_period_end: futurePeriodEnd,
          cancel_at_period_end: false,
          customer: {
            id: 'cust_polar_123',
            external_id: storeId,
          },
        },
      };

      const body = JSON.stringify(payload);
      const sig = createSignature(eventId, now, body);

      const res = await app.request('/api/webhooks/polar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': eventId,
          'webhook-timestamp': String(now),
          'webhook-signature': `v1,${sig}`,
        },
        body,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
      expect(data.processed).toBe(true);

      // Verify DB was updated
      const sub = await BillingService.getSubscription(storeId);
      expect(sub).toBeDefined();
      expect(sub?.status).toBe('active');
      expect(sub?.polarCustomerId).toBe('cust_polar_123');
      expect(sub?.polarSubscriptionId).toBe('sub_polar_123');
      expect(BillingService.storeHasAccess(sub)).toBe(true);
    });

    it('should handle duplicate webhook events idempotently', async () => {
      const eventId = `evt_idempotent_${Date.now()}`;
      const now = Math.floor(Date.now() / 1000);

      const payload = {
        type: 'subscription.active',
        data: {
          id: 'sub_polar_123',
          customer_id: 'cust_polar_123',
          customer: { external_id: storeId },
        },
      };
      const body = JSON.stringify(payload);
      const sig = createSignature(eventId, now, body);

      // First call
      const res1 = await app.request('/api/webhooks/polar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': eventId,
          'webhook-timestamp': String(now),
          'webhook-signature': `v1,${sig}`,
        },
        body,
      });
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.processed).toBe(true);

      // Duplicate call with same eventId
      const res2 = await app.request('/api/webhooks/polar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': eventId,
          'webhook-timestamp': String(now),
          'webhook-signature': `v1,${sig}`,
        },
        body,
      });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.processed).toBe(false); // Idempotent skip
    });

    it('should process subscription.canceled with cancel_at_period_end', async () => {
      const eventId = `evt_cancel_${Date.now()}`;
      const now = Math.floor(Date.now() / 1000);
      const futurePeriodEnd = new Date(Date.now() + 15 * 86400000).toISOString();

      const payload = {
        type: 'subscription.canceled',
        data: {
          id: 'sub_polar_123',
          status: 'active',
          customer_id: 'cust_polar_123',
          cancel_at_period_end: true,
          current_period_end: futurePeriodEnd,
          customer: { external_id: storeId },
        },
      };
      const body = JSON.stringify(payload);
      const sig = createSignature(eventId, now, body);

      const res = await app.request('/api/webhooks/polar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': eventId,
          'webhook-timestamp': String(now),
          'webhook-signature': `v1,${sig}`,
        },
        body,
      });

      expect(res.status).toBe(200);
      const sub = await BillingService.getSubscription(storeId);
      expect(sub?.cancelAtPeriodEnd).toBe(true);
      // Still active until period ends
      expect(BillingService.storeHasAccess(sub)).toBe(true);
    });

    it('should revoke access on subscription.revoked', async () => {
      const eventId = `evt_revoke_${Date.now()}`;
      const now = Math.floor(Date.now() / 1000);

      const payload = {
        type: 'subscription.revoked',
        data: {
          id: 'sub_polar_123',
          customer_id: 'cust_polar_123',
          customer: { external_id: storeId },
        },
      };
      const body = JSON.stringify(payload);
      const sig = createSignature(eventId, now, body);

      const res = await app.request('/api/webhooks/polar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': eventId,
          'webhook-timestamp': String(now),
          'webhook-signature': `v1,${sig}`,
        },
        body,
      });

      expect(res.status).toBe(200);
      const sub = await BillingService.getSubscription(storeId);
      expect(sub?.status).toBe('revoked');
      expect(BillingService.storeHasAccess(sub)).toBe(false);
    });
  });

  describe('Store Subscription Endpoints', () => {
    it('GET /api/stores/subscription returns current subscription details', async () => {
      const res = await app.request('/api/stores/subscription', {
        method: 'GET',
        headers: { 'X-API-Key': rawApiKey },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.plan_key).toBeDefined();
      expect(data.plan_name).toBeDefined();
      expect(typeof data.active).toBe('boolean');
      expect(data.features).toBeDefined();
    });

    it('POST /api/stores/subscription/checkout rejects invalid plan key', async () => {
      const res = await app.request('/api/stores/subscription/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': rawApiKey,
        },
        body: JSON.stringify({ plan_key: 'super_premium' }),
      });

      expect(res.status).toBe(400);
    });

    it('POST /api/stores/subscription/checkout returns 400 if polar credentials unconfigured', async () => {
      const res = await app.request('/api/stores/subscription/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': rawApiKey,
        },
        body: JSON.stringify({ plan_key: 'pro' }),
      });

      // Polar product / credentials not configured in test environment
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it('POST /api/stores/subscription/portal rejects when Polar credentials missing', async () => {
      const res = await app.request('/api/stores/subscription/portal', {
        method: 'POST',
        headers: { 'X-API-Key': rawApiKey },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('BillingService storeHasAccess logic', () => {
    it('returns false for null subscription', () => {
      expect(BillingService.storeHasAccess(null)).toBe(false);
    });

    it('returns true for active free subscription', () => {
      expect(BillingService.storeHasAccess({
        id: '1',
        storeId: '1',
        planKey: 'free',
        status: 'active',
        polarCustomerId: null,
        polarSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })).toBe(true);
    });

    it('returns false for expired cancel_at_period_end subscription', () => {
      const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
      expect(BillingService.storeHasAccess({
        id: '1',
        storeId: '1',
        planKey: 'pro',
        status: 'active',
        polarCustomerId: 'cust_1',
        polarSubscriptionId: 'sub_1',
        currentPeriodEnd: pastDate,
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })).toBe(false);
    });

    it('returns true for cancel_at_period_end before expiration', () => {
      const futureDate = new Date(Date.now() + 86400000); // 1 day future
      expect(BillingService.storeHasAccess({
        id: '1',
        storeId: '1',
        planKey: 'pro',
        status: 'active',
        polarCustomerId: 'cust_1',
        polarSubscriptionId: 'sub_1',
        currentPeriodEnd: futureDate,
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })).toBe(true);
    });

    it('returns false for revoked status', () => {
      expect(BillingService.storeHasAccess({
        id: '1',
        storeId: '1',
        planKey: 'pro',
        status: 'revoked',
        polarCustomerId: 'cust_1',
        polarSubscriptionId: 'sub_1',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })).toBe(false);
    });
  });
});
