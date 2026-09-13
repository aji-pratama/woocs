import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ChatRequestInSchema, OrderStatusRequestInSchema, EscalateRequestInSchema } from '../schemas/chat';
import { ChatService } from '../services/chat';
import { OrderService } from '../services/order';
import { EmailService } from '../services/email';
import { db } from '../db/client';
import { stores } from '../db/schema/stores';
import { subscriptions } from '../db/schema/billing';
import { chatMessages, chatSessions } from '../db/schema/chat';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { getPlanConfig } from '../config/pricing';

export const widgetRouter = new Hono({ strict: false });

// POST /api/widget/chat/
widgetRouter.post('/chat', zValidator('json', ChatRequestInSchema), async (c) => {
  const body = c.req.valid('json');
  
  const [store] = await db.select().from(stores).where(eq(stores.id, body.store_id));
  if (!store) {
    return c.json({ error: 'Store not found' }, 404);
  }

  // Conversation limit check
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.storeId, store.id));
  if (sub) {
    const plan = getPlanConfig(sub.planKey);
    const limit = plan.features.monthlyConversationsLimit;

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

  const result = await ChatService.handleMessage(store, body.session_id, body.message, body.page_context, body.widget_config, body.customer_info);
  
  return c.json(result);
});

// GET /api/widget/chat/history/
widgetRouter.get('/chat/history', async (c) => {
  const sessionId = c.req.query('session_id');
  const storeId = c.req.query('store_id');
  
  if (!sessionId || !storeId) {
    return c.json({ error: 'Missing session_id or store_id' }, 400);
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
widgetRouter.post('/chat/escalate', zValidator('json', EscalateRequestInSchema), async (c) => {
  const body = c.req.valid('json');
  
  const [store] = await db.select().from(stores).where(eq(stores.id, body.store_id));
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
    store.name,
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
  
  const [store] = await db.select().from(stores).where(eq(stores.id, body.store_id));
  if (!store) {
    return c.json({ error: 'Store not found' }, 404);
  }

  // Feature gate: order status lookup
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.storeId, store.id));
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
