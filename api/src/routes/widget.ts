import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ChatRequestInSchema, OrderStatusRequestInSchema } from '../schemas/chat';
import { ChatService } from '../services/chat';
import { OrderService } from '../services/order';
import { db } from '../db/client';
import { stores } from '../db/schema/stores';
import { chatMessages, chatSessions } from '../db/schema/chat';
import { eq, desc } from 'drizzle-orm';

export const widgetRouter = new Hono({ strict: false });

// POST /api/widget/chat/
widgetRouter.post('/chat', zValidator('json', ChatRequestInSchema), async (c) => {
  const body = c.req.valid('json');
  
  const [store] = await db.select().from(stores).where(eq(stores.id, body.store_id));
  if (!store) {
    return c.json({ error: 'Store not found' }, 404);
  }

  const result = await ChatService.handleMessage(store, body.session_id, body.message, body.page_context);
  
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

  // TODO: validate storeId matches session?
  
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
      created_at: m.createdAt,
    }))
  });
});

// POST /api/widget/order-status/
widgetRouter.post('/order-status', zValidator('json', OrderStatusRequestInSchema), async (c) => {
  const body = c.req.valid('json');
  
  const [store] = await db.select().from(stores).where(eq(stores.id, body.store_id));
  if (!store) {
    return c.json({ error: 'Store not found' }, 404);
  }

  const result = await OrderService.getOrderStatus(store, body.order_id);
  
  return c.json(result);
});
