import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createRateLimiter } from '../../src/middleware/rate-limit.js';

describe('Rate Limiter Middleware', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TEST_RATE_LIMITER = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('allows requests within rate limit threshold', async () => {
    const app = new Hono();
    const limiter = createRateLimiter({
      windowMs: 10000,
      maxRequests: 3,
      keyGenerator: () => 'client-1',
    });

    app.get('/test', limiter, (c) => c.json({ success: true }));

    const res1 = await app.request('/test');
    expect(res1.status).toBe(200);
    expect(res1.headers.get('X-RateLimit-Remaining')).toBe('2');

    const res2 = await app.request('/test');
    expect(res2.status).toBe(200);
    expect(res2.headers.get('X-RateLimit-Remaining')).toBe('1');

    const res3 = await app.request('/test');
    expect(res3.status).toBe(200);
    expect(res3.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  test('rejects requests exceeding rate limit threshold with 429', async () => {
    const app = new Hono();
    const limiter = createRateLimiter({
      windowMs: 10000,
      maxRequests: 2,
      keyGenerator: () => 'client-blocked',
    });

    app.get('/test', limiter, (c) => c.json({ ok: true }));

    await app.request('/test'); // 1
    await app.request('/test'); // 2

    const blockedRes = await app.request('/test'); // 3 (exceeded)
    expect(blockedRes.status).toBe(429);
    const data = await blockedRes.json();
    expect(data.error).toBe('Too Many Requests');
  });

  test('tracks limits independently for different client keys', async () => {
    const app = new Hono();
    const limiter = createRateLimiter({
      windowMs: 10000,
      maxRequests: 1,
      keyGenerator: (c) => c.req.header('x-user-id') || 'anon',
    });

    app.get('/test', limiter, (c) => c.json({ ok: true }));

    const resUserA1 = await app.request('/test', { headers: { 'x-user-id': 'user-A' } });
    expect(resUserA1.status).toBe(200);

    const resUserA2 = await app.request('/test', { headers: { 'x-user-id': 'user-A' } });
    expect(resUserA2.status).toBe(429);

    // User B should still succeed
    const resUserB = await app.request('/test', { headers: { 'x-user-id': 'user-B' } });
    expect(resUserB.status).toBe(200);
  });
});
