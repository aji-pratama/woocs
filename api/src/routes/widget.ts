import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ChatRequestInSchema, OrderStatusRequestInSchema, EscalateRequestInSchema } from '../schemas/chat.js';
import { ChatService } from '../services/chat.js';
import { OrderService } from '../services/order.js';
import { EmailService } from '../services/email.js';
import { db } from '../db/client.js';
import { stores } from '../db/schema/stores.js';
import { subscriptions } from '../db/schema/billing.js';
import { chatMessages, chatSessions } from '../db/schema/chat.js';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { getPlanConfig } from '../config/pricing.js';
import { appCache } from '../common/cache.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { CACHE_CONFIG, RATE_LIMIT_CONFIG, LIMITS, REGEX } from '../config/constants.js';

export const widgetRouter = new Hono({ strict: false });

const chatLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_CONFIG.CHAT_WINDOW_MS,
  maxRequests: RATE_LIMIT_CONFIG.CHAT_MAX_REQUESTS,
});

const escalateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_CONFIG.CHAT_WINDOW_MS,
  maxRequests: RATE_LIMIT_CONFIG.ESCALATE_MAX_REQUESTS,
});

// Helper to get store with caching
async function getCachedStore(storeId: string) {
  const cacheKey = `store:id:${storeId}`;
  let store = appCache.get<any>(cacheKey);
  if (!store) {
    const [found] = await db.select().from(stores).where(eq(stores.id, storeId));
    if (found) {
      store = found;
      appCache.set(cacheKey, store, CACHE_CONFIG.STORE_TTL_SECONDS);
    }
  }
  return store;
}

// Helper to get subscription with caching
async function getCachedSubscription(storeId: string) {
  const subCacheKey = `sub:${storeId}`;
  let sub = appCache.get<any>(subCacheKey);
  if (!sub) {
    const [foundSub] = await db.select().from(subscriptions).where(eq(subscriptions.storeId, storeId));
    if (foundSub) {
      sub = foundSub;
      appCache.set(subCacheKey, sub, CACHE_CONFIG.SUBSCRIPTION_TTL_SECONDS);
    }
  }
  return sub;
}

// POST /api/widget/chat/
widgetRouter.post('/chat', chatLimiter, zValidator('json', ChatRequestInSchema), async (c) => {
  const body = c.req.valid('json');
  
  const store = await getCachedStore(body.store_id);
  if (!store) {
    return c.json({ error: 'Store not found' }, 404);
  }

  // Sanitize message length
  const cleanMessage = body.message.slice(0, LIMITS.MAX_CHAT_MESSAGE_LENGTH);

  // Conversation limit check
  const sub = await getCachedSubscription(store.id);

  if (sub) {
    const plan = getPlanConfig(sub.planKey);
    let limit = plan.features.monthlyConversationsLimit;
    if (limit !== -1 && store.poweredByEnabled) {
      limit += 50;
    }

    if (limit !== -1) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.storeId, store.id),
            gte(chatSessions.createdAt, startOfMonth)
          )
        );

      if (Number(result?.count || 0) >= limit) {
        return c.json({
          answer: "We're experiencing high demand right now. Please leave a message for our team and they'll get back to you shortly.",
          confidence: null,
          escalated: true,
          escalation_reason: 'limit_reached',
          session_id: body.session_id,
          response_type: 'text',
          metadata: null,
        });
      }
    }
  }

  const result = await ChatService.handleMessage(store, body.session_id, cleanMessage, body.page_context, body.widget_config, body.customer_info);
  
  return c.json(result);
});

// GET /api/widget/chat/history/
widgetRouter.get('/chat/history', async (c) => {
  const sessionId = c.req.query('session_id');
  const storeId = c.req.query('store_id');
  
  if (!sessionId || !storeId) {
    return c.json({ error: 'Missing session_id or store_id' }, 400);
  }

  if (!REGEX.UUID.test(sessionId) || !REGEX.UUID.test(storeId)) {
    return c.json({ error: 'Invalid store_id or session_id format' }, 400);
  }

  const [session] = await db.select().from(chatSessions).where(eq(chatSessions.sessionId, sessionId));
  if (!session) {
    return c.json({ session_id: sessionId, messages: [] });
  }
  
  const messages = await db.select().from(chatMessages)
    .where(eq(chatMessages.sessionId, session.id))
    .orderBy(desc(chatMessages.createdAt))
    .limit(50);

  return c.json({ 
    session_id: sessionId, 
    messages: messages.reverse().map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      response_type: m.responseType,
      metadata: m.metadata,
      created_at: m.createdAt,
    }))
  });
});

// POST /api/widget/chat/escalate
widgetRouter.post('/chat/escalate', escalateLimiter, zValidator('json', EscalateRequestInSchema), async (c) => {
  const body = c.req.valid('json');
  
  const store = await getCachedStore(body.store_id);
  if (!store) {
    return c.json({ error: 'Store not found' }, 404);
  }

  const session = await ChatService.getOrCreateSession(store.id, body.session_id);

  // Update session with customer info
  await db.update(chatSessions)
    .set({ customerEmail: body.email, customerName: body.name || null })
    .where(eq(chatSessions.id, session.id));

  // Save the escalation message as a user message in history
  await db.insert(chatMessages).values({
    sessionId: session.id,
    role: 'user',
    content: body.message,
    metadata: { is_escalation: true },
  });

  // Fire and forget email sending to not block the API response
  EmailService.sendEscalationEmail(
    store.wcUrl || store.id,
    store.merchantEmail,
    body.email,
    body.name,
    body.message,
    body.session_id
  ).catch(err => {
    console.error('Failed to send background email:', err);
  });

  return c.json({ success: true });
});

// POST /api/widget/order-status/
widgetRouter.post('/order-status', zValidator('json', OrderStatusRequestInSchema), async (c) => {
  const body = c.req.valid('json');
  
  const store = await getCachedStore(body.store_id);
  if (!store) {
    return c.json({ error: 'Store not found' }, 404);
  }

  // Feature gate: order status lookup
  const sub = await getCachedSubscription(store.id);

  if (sub) {
    const plan = getPlanConfig(sub.planKey);
    if (!plan.features.orderStatusLookup) {
      return c.json({
        order_id: body.order_id,
        found: false,
        status: null,
        items: [],
        total: null,
        error: 'Order tracking is available on the Pro plan. Please contact the store team directly for order updates.',
      });
    }
  }

  const result = await OrderService.getOrderStatus(store, body.order_id);
  
  return c.json(result);
});
