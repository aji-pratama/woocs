import { createMiddleware } from 'hono/factory';
import { db } from '../db/client.js';
import { stores } from '../db/schema/stores.js';
import { subscriptions } from '../db/schema/billing.js';
import { eq } from 'drizzle-orm';
import { StoreService } from '../services/store.js';
import { BillingService } from '../services/billing.js';
import { appCache } from '../common/cache.js';
import { CACHE_CONFIG } from '../config/constants.js';

export const requireApiKey = createMiddleware(async (c, next) => {
  const apiKey = c.req.header('x-api-key');
  if (!apiKey) {
    return c.json({ error: 'Missing X-API-Key' }, 401);
  }

  // 1. Strict input validation: length (16-128) and alphanumeric/dashes/underscores only
  if (typeof apiKey !== 'string' || apiKey.length < 16 || apiKey.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(apiKey)) {
    return c.json({ error: 'Invalid API Key' }, 401);
  }

  const apiKeyHash = StoreService.hashApiKey(apiKey);
  const cacheKey = `store:hash:${apiKeyHash}`;
  const invalidKey = `invalid_key:${apiKeyHash}`;

  // 2. Negative cache check to protect database connection pool from brute-force spam
  if (process.env.NODE_ENV !== 'test' && appCache.get<boolean>(invalidKey)) {
    return c.json({ error: 'Invalid API Key' }, 401);
  }

  let store = process.env.NODE_ENV === 'test' ? null : appCache.get<any>(cacheKey);

  if (!store) {
    const existingStores = await db.select().from(stores).where(eq(stores.apiKeyHash, apiKeyHash));
    if (existingStores.length === 0) {
      if (process.env.NODE_ENV !== 'test') {
        appCache.set(invalidKey, true, 30); // Cache invalid key for 30s
      }
      return c.json({ error: 'Invalid API Key' }, 401);
    }
    store = existingStores[0];
    if (process.env.NODE_ENV !== 'test') {
      appCache.set(cacheKey, store, CACHE_CONFIG.STORE_TTL_SECONDS);
    }
  }

  c.set('storeId', store.id);
  c.set('store', store);

  await next();
});

export const requireActiveSubscription = createMiddleware(async (c, next) => {
  const storeId = c.get('storeId');
  if (!storeId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const cacheKey = `sub:${storeId}`;
  let sub = process.env.NODE_ENV === 'test' ? null : appCache.get<any>(cacheKey);

  if (!sub) {
    const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.storeId, storeId));
    if (!existingSub) {
      return c.json({ error: 'Subscription Required' }, 402);
    }
    sub = existingSub;
    if (process.env.NODE_ENV !== 'test') {
      appCache.set(cacheKey, sub, CACHE_CONFIG.SUBSCRIPTION_TTL_SECONDS);
    }
  }

  if (!BillingService.storeHasAccess(sub)) {
    return c.json({ error: 'Subscription is inactive', status: sub.status }, 402);
  }

  // Pass subscription to downstream handlers and middleware
  c.set('subscription', sub);

  await next();
});
