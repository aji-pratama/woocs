import { createMiddleware } from 'hono/factory';
import { db } from '../db/client';
import { products } from '../db/schema/stores';
import { chatSessions } from '../db/schema/chat';
import { subscriptions } from '../db/schema/billing';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getPlanConfig, type PlanFeatures } from '../config/pricing';

/**
 * Require a specific boolean feature from the store's plan.
 * Must be used AFTER requireActiveSubscription (which sets c.get('subscription')).
 */
export function requireFeature(featureKey: keyof PlanFeatures) {
  return createMiddleware(async (c, next) => {
    const sub = c.get('subscription');
    if (!sub) {
      return c.json({ error: 'Subscription required' }, 402);
    }

    const plan = getPlanConfig(sub.planKey);
    const featureValue = plan.features[featureKey];

    if (featureValue === false || featureValue === 0) {
      return c.json({
        error: 'Feature not available on your current plan',
        feature: featureKey,
        current_plan: plan.id,
        upgrade_to: 'pro',
      }, 403);
    }

    await next();
  });
}

/**
 * Enforce the maxProducts limit from the store's plan.
 * Checks how many products the store already has vs the plan limit.
 * Must be used AFTER requireActiveSubscription.
 */
export const enforceProductLimit = createMiddleware(async (c, next) => {
  const sub = c.get('subscription');
  const storeId = c.get('storeId');
  if (!sub || !storeId) {
    return c.json({ error: 'Subscription required' }, 402);
  }

  const plan = getPlanConfig(sub.planKey);
  const limit = plan.features.maxProducts;

  // -1 means unlimited (custom tier)
  if (limit === -1) {
    await next();
    return;
  }

  // Count existing products
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.storeId, storeId));

  const currentCount = Number(result?.count || 0);

  // We allow the sync to proceed but will truncate in the service layer
  // Here we just attach the limit info to context
  c.set('productLimit', limit);
  c.set('currentProductCount', currentCount);

  await next();
});

/**
 * Enforce the monthlyConversationsLimit from the store's plan.
 * Counts chat sessions created this month for the store.
 * Used on widget chat endpoint — resolves store from request body.
 */
export const enforceConversationLimit = createMiddleware(async (c, next) => {
  // Widget endpoints don't have API key auth — we need store_id from body or query
  let storeId: string | undefined;

  if (c.req.method === 'POST') {
    try {
      const body = await c.req.json();
      storeId = body.store_id;
      // Re-set the body so downstream handlers can read it
    } catch {
      // If body parsing fails, let the next handler deal with it
    }
  } else {
    storeId = c.req.query('store_id');
  }

  if (!storeId) {
    await next();
    return;
  }

  // Get subscription for this store
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.storeId, storeId));
  if (!sub) {
    await next();
    return;
  }

  const plan = getPlanConfig(sub.planKey);
  const limit = plan.features.monthlyConversationsLimit;

  // -1 means unlimited
  if (limit === -1) {
    await next();
    return;
  }

  // Count sessions this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.storeId, storeId),
        gte(chatSessions.createdAt, startOfMonth)
      )
    );

  const currentCount = Number(result?.count || 0);

  if (currentCount >= limit) {
    return c.json({
      error: 'Monthly conversation limit reached',
      current_plan: plan.id,
      limit,
      current_count: currentCount,
      upgrade_to: 'pro',
    }, 429);
  }

  await next();
});
