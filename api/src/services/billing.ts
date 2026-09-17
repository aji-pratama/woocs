import crypto from 'crypto';
import { ENV } from '../config/env';
import { db } from '../db/client';
import { subscriptions, polarWebhookEvents } from '../db/schema/billing';
import { stores } from '../db/schema/stores';
import { eq } from 'drizzle-orm';
import { InferSelectModel } from 'drizzle-orm';
import { appCache } from '../common/cache';

type Store = InferSelectModel<typeof stores>;
type Subscription = InferSelectModel<typeof subscriptions>;

export class BillingService {
  static storeHasAccess(subscription: Subscription | null): boolean {
    if (!subscription) return false;

    // Free tier is always active if status is active
    if (subscription.planKey === 'free' && subscription.status === 'active') {
      return true;
    }

    const now = new Date();

    // If marked for cancellation at period end, check if period has expired
    if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd) {
      if (now > subscription.currentPeriodEnd) {
        return false;
      }
    }

    // Active or trialing provides access
    if (subscription.status === 'active' || subscription.status === 'trialing') {
      return true;
    }

    // If status is canceled, but period end is still in the future
    if (subscription.status === 'canceled' && subscription.currentPeriodEnd && subscription.currentPeriodEnd > now) {
      return true;
    }

    return false;
  }

  static async getSubscription(storeId: string): Promise<Subscription | null> {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.storeId, storeId));
    return sub || null;
  }
}

export class PolarCheckoutService {
  static async createCheckout(storeId: string, planKey: string): Promise<string> {
    const { getPlanConfig } = await import('../config/pricing');
    const plan = getPlanConfig(planKey);

    if (!plan.polarProductId || plan.polarProductId === 'prod_placeholder') {
      throw new Error(`Polar product not configured for plan: ${planKey}`);
    }

    const polarApiUrl = ENV.POLAR_API_URL;
    const polarAccessToken = ENV.POLAR_ACCESS_TOKEN;
    if (!polarAccessToken) {
      throw new Error('POLAR_ACCESS_TOKEN is not configured');
    }

    const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);

    const successUrl = store?.wcUrl
      ? `${store.wcUrl.replace(/\/$/, '')}/wp-admin/admin.php?page=woocs-settings&tab=billing&checkout=success`
      : (ENV.POLAR_SUCCESS_URL || 'http://localhost:8080/wp-admin/admin.php?page=woocs-settings&tab=billing&checkout=success');

    const bodyPayload: Record<string, any> = {
      product_id: plan.polarProductId,
      customer_external_id: storeId,
      metadata: { store_id: storeId },
      success_url: successUrl,
    };

    if (store?.merchantEmail) {
      bodyPayload.customer_email = store.merchantEmail;
    }

    const response = await fetch(`${polarApiUrl}/v1/checkouts/custom/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${polarAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Polar checkout creation failed: ${error}`);
    }

    const data = await response.json() as { url: string };
    return data.url;
  }

  static async createPortalSession(storeId: string): Promise<string> {
    const sub = await BillingService.getSubscription(storeId);
    if (!sub?.polarCustomerId) {
      throw new Error('No Polar customer linked to this store');
    }

    const polarApiUrl = ENV.POLAR_API_URL;
    const polarAccessToken = ENV.POLAR_ACCESS_TOKEN;
    if (!polarAccessToken) {
      throw new Error('POLAR_ACCESS_TOKEN is not configured');
    }

    const response = await fetch(`${polarApiUrl}/v1/customer-sessions/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${polarAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer_id: sub.polarCustomerId,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Polar portal session creation failed: ${error}`);
    }

    const data = await response.json() as { customer_portal_url: string };
    return data.customer_portal_url;
  }
}

export class PolarWebhookVerifier {
  static TOLERANCE_SECONDS = 300;

  static verify(body: string, headers: Record<string, string>): string {
    const eventId = headers['webhook-id'] || '';
    const timestamp = headers['webhook-timestamp'] || '';
    const signatures = headers['webhook-signature'] || '';

    if (!eventId || !timestamp || !signatures) {
      throw new Error("Missing Polar webhook signature headers.");
    }

    const timestampValue = parseInt(timestamp, 10);
    if (isNaN(timestampValue)) {
      throw new Error("Invalid Polar webhook timestamp.");
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampValue) > this.TOLERANCE_SECONDS) {
      throw new Error("Polar webhook signature has expired.");
    }

    const secret = ENV.POLAR_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("POLAR_WEBHOOK_SECRET is not configured.");
    }

    const encodedSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const secretBytes = Buffer.from(encodedSecret, 'base64');

    const signedPayload = Buffer.concat([
      Buffer.from(`${eventId}.${timestamp}.`, 'utf8'),
      Buffer.from(body, 'utf8')
    ]);

    const expected = crypto
      .createHmac('sha256', secretBytes)
      .update(signedPayload)
      .digest('base64');

    const candidates: string[] = [];
    const matches = signatures.matchAll(/v1,([A-Za-z0-9+/=]+)/g);
    for (const match of matches) {
      candidates.push(match[1]);
    }

    const expectedBuf = Buffer.from(expected, 'utf8');
    const valid = candidates.some((candidate: string) => {
      const candidateBuf = Buffer.from(candidate, 'utf8');
      return expectedBuf.length === candidateBuf.length && crypto.timingSafeEqual(expectedBuf, candidateBuf);
    });

    if (!valid) {
      throw new Error("Invalid Polar webhook signature.");
    }

    return eventId;
  }
}

export class PolarWebhookService {
  static SUBSCRIPTION_EVENTS = new Set([
    "subscription.created",
    "subscription.updated",
    "subscription.active",
    "subscription.canceled",
    "subscription.uncanceled",
    "subscription.revoked",
    "subscription.past_due",
  ]);

  static async process(body: string, headers: Record<string, string>): Promise<boolean> {
    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
    );

    const eventId = PolarWebhookVerifier.verify(body, normalizedHeaders);
    const payload = JSON.parse(body);
    const eventType = payload.type || '';

    const existingEvents = await db.select().from(polarWebhookEvents).where(eq(polarWebhookEvents.eventId, eventId));
    if (existingEvents.length > 0) {
      return false; // Already processed
    }

    const [event] = await db.insert(polarWebhookEvents).values({
      eventId,
      eventType,
      payload,
      error: '',
    })
    .onConflictDoNothing({ target: polarWebhookEvents.eventId })
    .returning();

    if (!event) {
      return false; // Concurrently inserted by duplicate delivery
    }

    try {
      if (this.SUBSCRIPTION_EVENTS.has(eventType)) {
        await this._applySubscription(payload.data || {}, eventType);
      }

      await db.update(polarWebhookEvents)
        .set({ status: 'processed', processedAt: new Date() })
        .where(eq(polarWebhookEvents.id, event.id));
        
    } catch (exc: any) {
      await db.update(polarWebhookEvents)
        .set({ status: 'failed', error: String(exc) })
        .where(eq(polarWebhookEvents.id, event.id));
      throw exc;
    }

    return true;
  }

  private static async _applySubscription(data: any, eventType: string) {
    const externalId = data.customer?.external_id || data.customer_external_id || data.metadata?.store_id;
    let store = null;

    if (externalId) {
      const [found] = await db.select().from(stores).where(eq(stores.id, externalId));
      store = found;
    }

    const customerId = data.customer_id || data.customer?.id;
    if (!store && customerId) {
      const [foundSub] = await db.select().from(subscriptions).where(eq(subscriptions.polarCustomerId, customerId));
      if (foundSub) {
        const [found] = await db.select().from(stores).where(eq(stores.id, foundSub.storeId));
        store = found;
      }
    }

    const subscriptionId = data.id || data.subscription_id;
    if (!store && subscriptionId) {
      const [foundSub] = await db.select().from(subscriptions).where(eq(subscriptions.polarSubscriptionId, subscriptionId));
      if (foundSub) {
        const [found] = await db.select().from(stores).where(eq(stores.id, foundSub.storeId));
        store = found;
      }
    }

    if (!store) {
      throw new Error(`Store not found for webhook event (external_id: ${externalId || 'none'}, customer_id: ${customerId || 'none'}, sub_id: ${subscriptionId || 'none'}).`);
    }

    const existingSubs = await db.select().from(subscriptions).where(eq(subscriptions.storeId, store.id));
    const currentSub = existingSubs[0] || null;

    const productId = data.product_id || data.product?.id;
    let planKey: string | null = null;

    if (productId) {
      try {
        const polarProducts = JSON.parse(ENV.POLAR_PRODUCTS || '{}');
        for (const [key, configuredId] of Object.entries(polarProducts)) {
          if (configuredId === productId) {
            planKey = key;
            break;
          }
        }
      } catch {
        // ignore parse error
      }

      if (!planKey && ENV.POLAR_PRO_PRODUCT_ID && productId === ENV.POLAR_PRO_PRODUCT_ID) {
        planKey = 'pro';
      }
    }

    // Preserve existing plan if not explicitly changed in payload
    if (!planKey && currentSub?.planKey) {
      planKey = currentSub.planKey;
    }

    // Default to 'pro' for subscription events
    if (!planKey) {
      planKey = 'pro';
    }

    const periodEnd = data.current_period_end;
    const parsedPeriodEnd = periodEnd ? new Date(periodEnd) : null;

    let status = data.status || 'active';
    if (eventType === 'subscription.revoked') {
      status = 'revoked';
    } else if (eventType === 'subscription.canceled' && !data.cancel_at_period_end) {
      status = 'canceled';
    } else if (eventType === 'subscription.uncanceled') {
      status = 'active';
    }

    const cancelAtPeriodEnd = eventType === 'subscription.uncanceled'
      ? false
      : Boolean(data.cancel_at_period_end ?? (eventType === 'subscription.canceled'));

    const polarCustomerId = data.customer_id || data.customer?.id || currentSub?.polarCustomerId;
    const polarSubscriptionId = data.id || currentSub?.polarSubscriptionId;

    if (currentSub) {
      await db.update(subscriptions).set({
        polarCustomerId,
        polarSubscriptionId,
        planKey,
        status,
        cancelAtPeriodEnd,
        currentPeriodEnd: parsedPeriodEnd ?? currentSub.currentPeriodEnd,
        updatedAt: new Date(),
      }).where(eq(subscriptions.storeId, store.id));
    } else {
      await db.insert(subscriptions).values({
        storeId: store.id,
        polarCustomerId,
        polarSubscriptionId,
        planKey,
        status,
        cancelAtPeriodEnd,
        currentPeriodEnd: parsedPeriodEnd,
      });
    }

    appCache.delete(`sub:${store.id}`);
    appCache.delete(`dashboard_stats:${store.id}`);
  }
}
