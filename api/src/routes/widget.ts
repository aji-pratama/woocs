import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ChatRequestInSchema, OrderStatusRequestInSchema } from '../schemas/chat.js';

export const widgetRouter = new Hono();

// POST /api/widget/chat/
widgetRouter.post('/chat', zValidator('json', ChatRequestInSchema), async (c) => {
  const body = c.req.valid('json');
  // TODO: Implement RagService chat flow
  return c.json({
    message: 'Hello, how can I help you today?',
    confidence_score: 0.95,
    escalated: false,
  });
});

// GET /api/widget/chat/history/
widgetRouter.get('/chat/history', async (c) => {
  const sessionId = c.req.query('session_id');
  const storeId = c.req.query('store_id');
  // TODO: Fetch from chat_messages table
  return c.json({ session_id: sessionId, messages: [] });
});

// POST /api/widget/order-status/
widgetRouter.post('/order-status', zValidator('json', OrderStatusRequestInSchema), async (c) => {
  const body = c.req.valid('json');
  // TODO: Fetch order status from WooCommerce REST API
  return c.json({ status: 'Processing' });
});
