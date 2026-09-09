import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { StoreRegisterInSchema, SyncRequestInSchema } from '../schemas/store';
import { CheckoutInSchema } from '../schemas/billing';
import { StoreService, SyncService } from '../services/store';
import { BillingService, PolarCheckoutService } from '../services/billing';
import { requireApiKey, requireActiveSubscription } from '../middleware/auth';
import { requireFeature, enforceProductLimit } from '../middleware/paywall';
import { getPlanConfig } from '../config/pricing';
import { db } from '../db/client';
import { taskRecords } from '../db/schema/tasks';

type Variables = {
  storeId: string;
};

export const storeRouter = new Hono<{ Variables: Variables }>();

// POST /api/stores/register/
storeRouter.post('/register', zValidator('json', StoreRegisterInSchema), async (c) => {
  const body = c.req.valid('json');
  
  const { store, rawApiKey, isValid } = await StoreService.registerOrUpdateStore(
    body.wc_url,
    body.api_key,
    body.merchant_email,
    body.wc_consumer_key,
    body.wc_consumer_secret
  );

  if (!isValid || !store) {
    return c.json({ error: 'Invalid API Key' }, 401);
  }

  return c.json({
    store_id: store.id,
    store_name: StoreService.getStoreNameFromUrl(store.wcUrl || ''),
    valid: true,
    api_key: rawApiKey, // Only returned once on initial registration
  });
});

// POST /api/stores/sync/
storeRouter.post(
  '/sync',
  requireApiKey,
  requireActiveSubscription,
  requireFeature('syncCatalog'),
  enforceProductLimit,
  zValidator('json', SyncRequestInSchema),
  async (c) => {
    const body = c.req.valid('json');
    const storeId = c.get('storeId');

    // Enforce product limit — truncate if over limit
    const productLimit = c.get('productLimit') as number | undefined;
    let productsToSync = body.products;
    let truncated = false;

    if (productLimit !== undefined && productLimit >= 0) {
      const currentCount = (c.get('currentProductCount') as number) || 0;
      const remainingSlots = Math.max(0, productLimit - currentCount);
      if (productsToSync.length > remainingSlots) {
        productsToSync = productsToSync.slice(0, remainingSlots);
        truncated = true;
      }
    }

    // Persist catalog data
    const syncResult = await SyncService.processSyncPayload(storeId, {
      products: productsToSync,
      faqs: body.faqs,
    });

    // Enqueue embedding task
    const [task] = await db.insert(taskRecords).values({
      taskName: 'embed_catalog',
      args: [],
      kwargs: { store_id: storeId },
    }).returning();

    return c.json({
      task_id: task.id,
      status: 'processing',
      products_received: syncResult.productsCount,
      faqs_received: syncResult.faqsCount,
      ...(truncated ? { warning: `Product limit reached (${productLimit}). Some products were skipped. Upgrade to sync more.` } : {}),
    }, 202);
  }
);

// GET /api/stores/sync/status/
storeRouter.get('/sync/status', requireApiKey, async (c) => {
  const storeId = c.get('storeId');
  
  // Get the latest task for this store
  const tasks = await db.select().from(taskRecords)
    .where(
      // Simple approach: get latest embed_catalog task
      // In production, filter by store_id in kwargs
    )
    .orderBy(taskRecords.enqueuedAt)
    .limit(1);

  if (tasks.length === 0) {
    return c.json({ task_id: null, status: 'no_tasks', products_count: 0 });
  }

  const task = tasks[0];
  return c.json({
    task_id: task.id,
    status: task.status,
    started_at: task.startedAt,
    finished_at: task.finishedAt,
    error: task.traceback,
  });
});

// GET /api/stores/subscription/
storeRouter.get('/subscription', requireApiKey, async (c) => {
  const storeId = c.get('storeId');
  const sub = await BillingService.getSubscription(storeId);

  if (!sub) {
    return c.json({ error: 'No subscription found' }, 404);
  }

  const plan = getPlanConfig(sub.planKey);

  return c.json({
    plan_key: sub.planKey,
    plan_name: plan.name,
    status: sub.status,
    active: BillingService.storeHasAccess(sub),
    cancel_at_period_end: sub.cancelAtPeriodEnd,
    current_period_end: sub.currentPeriodEnd?.toISOString() || null,
    features: plan.features,
    price_usd: plan.priceUsd,
  });
});

// POST /api/stores/subscription/checkout/
storeRouter.post(
  '/subscription/checkout',
  requireApiKey,
  zValidator('json', CheckoutInSchema),
  async (c) => {
    const storeId = c.get('storeId');
    const { plan_key } = c.req.valid('json');

    try {
      const url = await PolarCheckoutService.createCheckout(storeId, plan_key);
      return c.json({ url });
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  }
);

// POST /api/stores/subscription/portal/
storeRouter.post('/subscription/portal', requireApiKey, async (c) => {
  const storeId = c.get('storeId');

  try {
    const url = await PolarCheckoutService.createPortalSession(storeId);
    return c.json({ url });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});
