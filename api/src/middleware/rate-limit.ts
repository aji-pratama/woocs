import { createMiddleware } from 'hono/factory';
import { logger } from '../common/logger.js';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export function createRateLimiter({
  windowMs = 60 * 1000,
  maxRequests = 30,
  keyGenerator,
}: {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (c: any) => string;
} = {}) {
  const store = new Map<string, RateLimitRecord>();

  // Cleanup expired windows every 2 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, 120 * 1000).unref?.();

  return createMiddleware(async (c, next) => {
    // In test environment, allow bypassing if explicitly disabled
    if (process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMITER) {
      await next();
      return;
    }

    const key = keyGenerator
      ? keyGenerator(c)
      : c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'anonymous-ip';

    const now = Date.now();
    let record = store.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      store.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(resetSeconds));

    if (record.count > maxRequests) {
      logger.warn(`Rate limit exceeded for key [${key}]`, {
        component: 'RateLimiter',
        key,
        count: record.count,
        maxRequests,
        path: c.req.path,
      });

      return c.json({
        error: 'Too Many Requests',
        message: `You have exceeded the rate limit. Please try again in ${resetSeconds} seconds.`,
      }, 429);
    }

    await next();
  });
}
