import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { StoreRegisterInSchema, SyncRequestInSchema } from '../schemas/store.js';

export const storeRouter = new Hono();

// POST /api/stores/register/
storeRouter.post('/register', zValidator('json', StoreRegisterInSchema), async (c) => {
  const body = c.req.valid('json');
  // TODO: Implement StoreService.registerOrUpdateStore
  return c.json({ store_id: '123', valid: true, store_name: 'test', api_key: 'test_key' });
});

// POST /api/stores/sync/
storeRouter.post('/sync', zValidator('json', SyncRequestInSchema), async (c) => {
  const body = c.req.valid('json');
  // TODO: Validate API Key & Subscription
  // TODO: Implement Task Enqueue for ingestion
  return c.json({ task_id: 'task-123', status: 'pending', products_received: body.products.length, faqs_received: body.faqs.length });
});

// GET /api/stores/sync/status/
storeRouter.get('/sync/status/:taskId', async (c) => {
  const taskId = c.req.param('taskId');
  // TODO: Fetch from task_records table
  return c.json({ task_id: taskId, status: 'completed' });
});
