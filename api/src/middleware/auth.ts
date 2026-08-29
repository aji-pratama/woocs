import { createMiddleware } from 'hono/factory';
import { db } from '../db/client';
import { stores } from '../db/schema/stores';
import { subscriptions } from '../db/schema/billing';
import { eq } from 'drizzle-orm';
import { StoreService } from '../services/store';

export const requireApiKey = createMiddleware(async (c, next) => {
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    return c.json({ error: 'Missing X-API-Key' }, 401);
  }

  const apiKeyHash = StoreService.hashApiKey(apiKey);
  const existingStores = await db.select().from(stores).where(eq(stores.apiKeyHash, apiKeyHash));

  if (existingStores.length === 0) {
    return c.json({ error: 'Invalid API Key' }, 401);
  }

  const store = existingStores[0];
  c.set('storeId', store.id);
  c.set('store', store);

  await next();
});

export const requireActiveSubscription = createMiddleware(async (c, next) => {
  const storeId = c.get('storeId');
  if (!storeId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const existingSubs = await db.select().from(subscriptions).where(eq(subscriptions.storeId, storeId));
  if (existingSubs.length === 0) {
    return c.json({ error: 'Subscription Required' }, 402);
  }

  const sub = existingSubs[0];
  if (sub.status === 'revoked' || sub.status === 'canceled' || sub.status === 'past_due') {
    return c.json({ error: 'Subscription is inactive' }, 402);
  }

  await next();
});
