import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { StoreRegisterInSchema, SyncRequestInSchema, StoreSettingsInSchema } from '../schemas/store';
import { CheckoutInSchema } from '../schemas/billing';
import { StoreService, SyncService } from '../services/store';
import { BillingService, PolarCheckoutService } from '../services/billing';
import { requireApiKey, requireActiveSubscription } from '../middleware/auth';
import { requireFeature, enforceProductLimit } from '../middleware/paywall';
import { getPlanConfig } from '../config/pricing';
import { db } from '../db/client';
import { taskRecords } from '../db/schema/tasks';
import { KnowledgeService } from '../services/knowledge';
import { stores, products } from '../db/schema/stores';
import { chatSessions, chatMessages } from '../db/schema/chat';
import { eq, sql } from 'drizzle-orm';
import { executeTaskById, safeWaitUntil } from '../worker/runner.js';

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

// PUT /api/stores/settings
storeRouter.put('/settings', requireApiKey, zValidator('json', StoreSettingsInSchema), async (c) => {
  const body = c.req.valid('json');
  const storeId = c.get('storeId');

  await db.update(stores).set({
    poweredByEnabled: body.powered_by_enabled,
  }).where(eq(stores.id, storeId));

  return c.json({ success: true });
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
    const productLimit = c.get('productLimit' as any) as number | undefined;
    let productsToSync = body.products;
    let truncated = false;

    if (productLimit !== undefined && productLimit >= 0) {
      const currentCount = (c.get('currentProductCount' as any) as number) || 0;
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

    // Serverless background execution if running in Cloudflare Workers
    safeWaitUntil(c, executeTaskById(task.id));

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
      sql`kwargs->>'store_id' = ${storeId}`
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
  
  const MAX_SYNCS = isPro ? 20 : 5;
  const MAX_URLS = isPro ? 5 : 1;
  const MAX_PDFS = isPro ? 5 : 0;
  const MAX_TEXTS = isPro ? 10 : 3;

  // Check monthly sync limit
  const store = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (store[0].knowledgeSyncsThisMonth >= MAX_SYNCS) {
    return c.json({ error: 'Monthly sync limit reached', upgrade_required: !isPro }, 403);
  }

  const counts = await KnowledgeService.getDocumentCount(storeId);
  let body: any = {};
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await c.req.json().catch(() => ({}));
  } else {
    body = await c.req.parseBody().catch(() => ({}));
  }
  
  let type: 'url' | 'pdf' | 'text' = 'text';
  let source = '';
  let rawText = '';
  
  if (body.content && typeof body.content === 'string') {
    if (counts.texts >= MAX_TEXTS) {
      return c.json({ error: `Text document limit reached (max ${MAX_TEXTS})`, upgrade_required: !isPro }, 403);
    }
    type = 'text';
    source = (body.title && typeof body.title === 'string' && body.title.trim()) ? body.title.trim() : 'Document';
    rawText = body.content.trim();
  } else if (body.url && typeof body.url === 'string') {
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
    source = file.name || 'document.pdf';
    // In production we would save the file to S3 or process it directly.
    // For PoC, we just pretend it was saved.
  } else {
    return c.json({ error: 'Missing content, url or pdf in body' }, 400);
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
    kwargs: { store_id: storeId, document_id: doc.id, type, source, raw_text: rawText },
  }).returning();

  // Serverless background execution if running in Cloudflare Workers
  safeWaitUntil(c, executeTaskById(task.id));

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

// GET /api/stores/dashboard/stats/
storeRouter.get('/dashboard/stats', requireApiKey, async (c) => {
  const storeId = c.get('storeId');
  
  const sessionsCount = await db.select({ count: sql<number>`count(*)` }).from(chatSessions).where(eq(chatSessions.storeId, storeId));
  
  const messagesCount = await db.select({ count: sql<number>`count(*)` })
    .from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
    .where(eq(chatSessions.storeId, storeId));
    
  const escalationsCount = await db.select({ count: sql<number>`count(*)` })
    .from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
    .where(sql`${chatSessions.storeId} = ${storeId} AND ${chatMessages.escalated} = true`);

  const productsCount = await db.select({ count: sql<number>`count(*)` }).from(products).where(eq(products.storeId, storeId));

  return c.json({
    chat_sessions: Number(sessionsCount[0].count),
    total_messages: Number(messagesCount[0].count),
    products_synced: Number(productsCount[0].count),
    escalations: Number(escalationsCount[0].count),
  });
});

// GET /api/stores/chat-history/
storeRouter.get('/chat-history', requireApiKey, async (c) => {
  const storeId = c.get('storeId');
  
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('page_size') || '20', 10);
  const offset = (page - 1) * pageSize;
  
  const sessions = await db.select().from(chatSessions)
    .where(eq(chatSessions.storeId, storeId))
    .orderBy(sql`${chatSessions.createdAt} DESC`)
    .limit(pageSize)
    .offset(offset);
  
  const enrichedSessions = await Promise.all(sessions.map(async (s) => {
    const [firstMsg] = await db.select().from(chatMessages)
      .where(eq(chatMessages.sessionId, s.id))
      .orderBy(chatMessages.createdAt)
      .limit(1);
    
    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(chatMessages).where(eq(chatMessages.sessionId, s.id));
      
    const [escalatedResult] = await db.select({ count: sql<number>`count(*)` })
      .from(chatMessages)
      .where(sql`${chatMessages.sessionId} = ${s.id} AND ${chatMessages.escalated} = true`);

    return {
      session_id: s.sessionId,
      created_at: s.createdAt,
      customer_name: s.customerName,
      customer_email: s.customerEmail,
      customer_phone: s.customerPhone,
      lead_label: s.leadLabel || 'lead',
      first_message: firstMsg?.content || null,
      message_count: Number(countResult?.count || 0),
      escalated: Number(escalatedResult?.count || 0) > 0,
    };
  }));
  
  const [totalResult] = await db.select({ count: sql<number>`count(*)` })
    .from(chatSessions)
    .where(eq(chatSessions.storeId, storeId));

  return c.json({ sessions: enrichedSessions, total: Number(totalResult?.count || 0), page, page_size: pageSize });
});

// Helper to escape CSV cell
function escapeCsv(value: any): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

// GET /api/stores/chat-history/export
storeRouter.get('/chat-history/export', requireApiKey, async (c) => {
  const storeId = c.get('storeId');
  const type = c.req.query('type') || 'full'; // 'full' | 'leads'
  const dateStr = new Date().toISOString().split('T')[0];

  if (type === 'leads') {
    // Collect unique leads with contact info (email, phone, or name)
    const sessions = await db.select().from(chatSessions)
      .where(sql`${chatSessions.storeId} = ${storeId} AND (${chatSessions.customerEmail} IS NOT NULL OR ${chatSessions.customerPhone} IS NOT NULL OR ${chatSessions.customerName} IS NOT NULL)`)
      .orderBy(sql`${chatSessions.createdAt} DESC`);

    // Group by identifier
    const leadsMap = new Map<string, any>();

    for (const s of sessions) {
      const key = (s.customerEmail || s.customerPhone || s.customerName || s.sessionId).toLowerCase();
      
      const [lastMsg] = await db.select().from(chatMessages)
        .where(eq(chatMessages.sessionId, s.id))
        .orderBy(sql`${chatMessages.createdAt} DESC`)
        .limit(1);

      if (!leadsMap.has(key)) {
        leadsMap.set(key, {
          customerName: s.customerName || '',
          customerEmail: s.customerEmail || '',
          customerPhone: s.customerPhone || '',
          leadLabel: s.leadLabel || 'lead',
          totalSessions: 1,
          firstSeen: s.createdAt,
          lastSeen: s.createdAt,
          lastMessage: lastMsg?.content || '',
        });
      } else {
        const existing = leadsMap.get(key);
        existing.totalSessions += 1;
        if (new Date(s.createdAt) < new Date(existing.firstSeen)) existing.firstSeen = s.createdAt;
        if (new Date(s.createdAt) > new Date(existing.lastSeen)) {
          existing.lastSeen = s.createdAt;
          if (lastMsg) existing.lastMessage = lastMsg.content;
        }
        if (s.leadLabel === 'hot') existing.leadLabel = 'hot';
        else if (s.leadLabel === 'warm' && existing.leadLabel !== 'hot') existing.leadLabel = 'warm';
      }
    }

    const rows = [
      ['Customer Name', 'Customer Email', 'Customer Phone', 'Lead Label', 'Total Sessions', 'First Seen', 'Last Seen', 'Last Message'].join(',')
    ];

    for (const lead of leadsMap.values()) {
      rows.push([
        escapeCsv(lead.customerName),
        escapeCsv(lead.customerEmail),
        escapeCsv(lead.customerPhone),
        escapeCsv(lead.leadLabel),
        escapeCsv(lead.totalSessions),
        escapeCsv(new Date(lead.firstSeen).toISOString()),
        escapeCsv(new Date(lead.lastSeen).toISOString()),
        escapeCsv(lead.lastMessage),
      ].join(','));
    }

    const csvContent = rows.join('\n');
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="woocs-leads-${dateStr}.csv"`,
      },
    });
  } else {
    // Full export of all sessions and transcripts
    const sessions = await db.select().from(chatSessions)
      .where(eq(chatSessions.storeId, storeId))
      .orderBy(sql`${chatSessions.createdAt} DESC`);

    const rows = [
      ['Session ID', 'Date', 'Customer Name', 'Customer Email', 'Customer Phone', 'Lead Label', 'Message Count', 'Escalated', 'Escalation Reason', 'Transcript'].join(',')
    ];

    for (const s of sessions) {
      const msgs = await db.select().from(chatMessages)
        .where(eq(chatMessages.sessionId, s.id))
        .orderBy(chatMessages.createdAt);

      const transcript = msgs.map(m => `[${m.role === 'user' ? 'Customer' : 'AI'}]: ${m.content}`).join('\n');
      const isEscalated = msgs.some(m => m.escalated);
      const escalationReason = msgs.find(m => m.escalated)?.escalationReason || '';

      rows.push([
        escapeCsv(s.sessionId),
        escapeCsv(new Date(s.createdAt).toISOString()),
        escapeCsv(s.customerName || ''),
        escapeCsv(s.customerEmail || ''),
        escapeCsv(s.customerPhone || ''),
        escapeCsv(s.leadLabel || 'lead'),
        escapeCsv(msgs.length),
        escapeCsv(isEscalated ? 'Yes' : 'No'),
        escapeCsv(escalationReason),
        escapeCsv(transcript),
      ].join(','));
    }

    const csvContent = rows.join('\n');
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="woocs-conversations-${dateStr}.csv"`,
      },
    });
  }
});

const VALID_LEAD_LABELS = ['hot', 'warm', 'cold', 'customer', 'support', 'lead'];

// PATCH /api/stores/chat-history/:id/label
storeRouter.patch('/chat-history/:id/label', requireApiKey, async (c) => {
  const storeId = c.get('storeId');
  const reqSessionId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const label = body.lead_label;

  if (!label || !VALID_LEAD_LABELS.includes(label)) {
    return c.json({ error: `Invalid lead_label. Must be one of: ${VALID_LEAD_LABELS.join(', ')}` }, 400);
  }

  const [session] = await db.select().from(chatSessions)
    .where(sql`${chatSessions.sessionId} = ${reqSessionId} AND ${chatSessions.storeId} = ${storeId}`)
    .limit(1);

  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  await db.update(chatSessions)
    .set({ leadLabel: label })
    .where(eq(chatSessions.id, session.id));

  return c.json({ success: true, session_id: reqSessionId, lead_label: label });
});

// GET /api/stores/chat-history/:id/
storeRouter.get('/chat-history/:id', requireApiKey, async (c) => {
  const storeId = c.get('storeId');
  const reqSessionId = c.req.param('id');
  
  const session = await db.select().from(chatSessions).where(sql`${chatSessions.sessionId} = ${reqSessionId} AND ${chatSessions.storeId} = ${storeId}`).limit(1);
  if (session.length === 0) return c.json({ error: 'Session not found' }, 404);
  
  const messages = await db.select().from(chatMessages).where(eq(chatMessages.sessionId, session[0].id)).orderBy(chatMessages.createdAt);
  
  const sessionData = session[0];
  const formattedSession = {
    ...sessionData,
    created_at: sessionData.createdAt,
    customer_name: sessionData.customerName,
    customer_email: sessionData.customerEmail,
    customer_phone: sessionData.customerPhone,
    lead_label: sessionData.leadLabel || 'lead',
    session_id: sessionData.sessionId,
  };
  
  return c.json({ session: formattedSession, messages });
});
