import crypto from 'crypto';
import { db } from '../db/client';
import { subscriptions, polarWebhookEvents } from '../db/schema/billing';
import { stores } from '../db/schema/stores';
import { eq } from 'drizzle-orm';
import { InferSelectModel } from 'drizzle-orm';

type Store = InferSelectModel<typeof stores>;
type Subscription = InferSelectModel<typeof subscriptions>;

export class BillingService {
  static storeHasAccess(subscription: Subscription | null): boolean {
    return Boolean(subscription && subscription.status === 'active');
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

    const secret = process.env.POLAR_WEBHOOK_SECRET;
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

    const candidates = signatures
      .split(',')
      .filter((item: string) => item.startsWith('v1,'))
      .map((item: string) => item.split(',')[1]);

    if (!candidates.some((candidate: string) => crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate)))) {
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
    }).returning();

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
    const externalId = data.customer?.external_id;
    if (!externalId) {
      throw new Error("Polar customer external_id is required.");
    }

    const [store] = await db.select().from(stores).where(eq(stores.id, externalId));
    if (!store) {
      throw new Error("Store not found for external_id.");
    }

    const productId = data.product_id || data.product?.id;
    const polarProductsStr = process.env.POLAR_PRODUCTS || '{}';
    const polarProducts = JSON.parse(polarProductsStr);

    let planKey = null;
    for (const [key, configuredId] of Object.entries(polarProducts)) {
      if (configuredId === productId) {
        planKey = key;
        break;
      }
    }

    if (!planKey) {
      throw new Error("Polar product is not mapped to a WooCS plan.");
    }

    const periodEnd = data.current_period_end;
    const parsedPeriodEnd = periodEnd ? new Date(periodEnd) : null;

    const status = eventType === "subscription.revoked" ? "revoked" : (data.status || "active");

    const existingSubs = await db.select().from(subscriptions).where(eq(subscriptions.storeId, store.id));
    
    if (existingSubs.length > 0) {
      await db.update(subscriptions).set({
        polarCustomerId: data.customer_id || data.customer?.id,
        polarSubscriptionId: data.id,
        planKey,
        status,
        cancelAtPeriodEnd: data.cancel_at_period_end || false,
        currentPeriodEnd: parsedPeriodEnd,
        updatedAt: new Date(),
      }).where(eq(subscriptions.storeId, store.id));
    } else {
      await db.insert(subscriptions).values({
        storeId: store.id,
        polarCustomerId: data.customer_id || data.customer?.id,
        polarSubscriptionId: data.id,
        planKey,
        status,
        cancelAtPeriodEnd: data.cancel_at_period_end || false,
        currentPeriodEnd: parsedPeriodEnd,
      });
    }
  }
}
