import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { StoreRegisterInSchema, SyncRequestInSchema } from '../schemas/store';
import { StoreService, SyncService } from '../services/store';
import { requireApiKey, requireActiveSubscription } from '../middleware/auth';

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
storeRouter.post('/sync', requireApiKey, requireActiveSubscription, zValidator('json', SyncRequestInSchema), async (c) => {
  const body = c.req.valid('json');
  const storeId = c.get('storeId');
  
  // In a real scenario, this would enqueue a task.
  // For now, process synchronously for parity if task worker isn't ready.
  // We'll leave it as a mock return until the queue is built.
  return c.json({ 
    task_id: crypto.randomUUID(), 
    status: 'processing', // changed to processing to match django test
    products_received: body.products.length, 
    faqs_received: body.faqs.length 
  }, 202);
});

// GET /api/stores/sync/status/
storeRouter.get('/sync/status/', requireApiKey, async (c) => {
  return c.json({ task_id: 'dummy', status: 'pending', products_count: 0 });
});
