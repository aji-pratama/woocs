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
import { KnowledgeService } from '../services/knowledge';
import { stores } from '../db/schema/stores';
import { eq } from 'drizzle-orm';

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

// GET /api/stores/knowledge/
storeRouter.get('/knowledge', requireApiKey, async (c) => {
  const storeId = c.get('storeId');
  const docs = await KnowledgeService.getDocuments(storeId);
  return c.json({ documents: docs });
});

// POST /api/stores/knowledge/document
storeRouter.post('/knowledge/document', requireApiKey, async (c) => {
  const storeId = c.get('storeId');
  
  // Dynamic Limits Check
  const sub = await BillingService.getSubscription(storeId);
  const isPro = sub && sub.planKey === 'pro';
  
  const MAX_SYNCS = isPro ? 20 : 3;
  const MAX_URLS = isPro ? 5 : 1;
  const MAX_PDFS = isPro ? 5 : 0;

  // Check monthly sync limit
  const store = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (store[0].knowledgeSyncsThisMonth >= MAX_SYNCS) {
    return c.json({ error: 'Monthly sync limit reached', upgrade_required: !isPro }, 403);
  }

  const counts = await KnowledgeService.getDocumentCount(storeId);
  const body = await c.req.parseBody();
  
  let type: 'url' | 'pdf' = 'url';
  let source = '';
  
  if (body.url && typeof body.url === 'string') {
    if (counts.urls >= MAX_URLS) {
      return c.json({ error: `URL limit reached (max ${MAX_URLS})`, upgrade_required: !isPro }, 403);
    }
    type = 'url';
    source = body.url;
  } else if (body.pdf) {
    if (counts.pdfs >= MAX_PDFS) {
      return c.json({ error: `PDF limit reached (max ${MAX_PDFS})`, upgrade_required: !isPro }, 403);
    }
    // PDF upload handling
    type = 'pdf';
    const file = body.pdf as File;
    source = file.name;
    // In production we would save the file to S3 or process it directly.
    // For PoC, we just pretend it was saved.
  } else {
    return c.json({ error: 'Missing url or pdf in body' }, 400);
  }

  // Increment syncs
  await db.update(stores).set({
    knowledgeSyncsThisMonth: store[0].knowledgeSyncsThisMonth + 1,
  }).where(eq(stores.id, storeId));

  const doc = await KnowledgeService.createDocument(storeId, type, source);

  // Queue background task
  const [task] = await db.insert(taskRecords).values({
    taskName: 'process_knowledge_document',
    args: [],
    kwargs: { store_id: storeId, document_id: doc.id, type, source },
  }).returning();

  return c.json({ document: doc, task_id: task.id }, 202);
});

// DELETE /api/stores/knowledge/document/:id
storeRouter.delete('/knowledge/document/:id', requireApiKey, async (c) => {
  const storeId = c.get('storeId');
  const documentId = c.req.param('id');
  await KnowledgeService.deleteDocument(storeId, documentId);
  return c.json({ success: true });
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
