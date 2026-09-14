import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { env } from 'hono/adapter';
import { sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { ENV } from './config/env.js';
import { storeRouter } from './routes/store.js';
import { widgetRouter } from './routes/widget.js';
import { webhooksRouter } from './routes/webhooks.js';

const app = new Hono({ strict: false });

app.use('*', cors());
app.use('*', logger());

// Bridge Cloudflare Workers bindings (c.env) into process.env for universal runtime compatibility
app.use('*', async (c, next) => {
  const currentEnv = env(c) as Record<string, any>;
  if (currentEnv) {
    for (const [key, val] of Object.entries(currentEnv)) {
      if (typeof val === 'string' && val.length > 0) {
        process.env[key] = val;
      }
    }
  }
  await next();
});

app.route('/api/stores', storeRouter);
app.route('/api/widget', widgetRouter);
app.route('/api/webhooks', webhooksRouter);

const healthCheckHandler = async (c: any) => {
  const currentEnv = env(c) as Record<string, any>;
  const expectedSecret = currentEnv.HEALTH_CHECK_SECRET || process.env.HEALTH_CHECK_SECRET || ENV.HEALTH_CHECK_SECRET || 'woocs-secret-health-key-2026';
  const providedKey = c.req.header('x-health-key') || c.req.query('key');

  if (!providedKey || providedKey !== expectedSecret) {
    return c.json({
      error: 'Unauthorized: Invalid or missing health check key',
      message: 'Provide valid X-Health-Key header or ?key= query parameter'
    }, 401);
  }

  const start = Date.now();
  const dbUrl = currentEnv.DATABASE_URL || process.env.DATABASE_URL || '';
  const isFallbackLocal = !dbUrl || dbUrl.includes('127.0.0.1:5435');

  let dbStatus = 'disconnected';
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  if (!isFallbackLocal) {
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1 as ping`);
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = 'connected';
    } catch (err: any) {
      dbStatus = 'error';
      dbError = err.message || String(err);
    }
  } else {
    dbStatus = 'not_configured';
    dbError = 'DATABASE_URL is not configured in Cloudflare Secrets. Please add DATABASE_URL in Cloudflare Settings > Variables and Secrets.';
  }

  // Mask database host for security (e.g. ep-ca...neon.tech)
  let maskedHost = 'none';
  if (dbUrl) {
    try {
      const match = dbUrl.match(/@([^:\/?]+)/);
      if (match && match[1]) {
        const host = match[1];
        maskedHost = host.length > 12 ? `${host.slice(0, 6)}...${host.slice(-10)}` : host;
      }
    } catch {
      maskedHost = 'unknown';
    }
  }

  const isHealthy = dbStatus === 'connected';

  return c.json({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'woocs-api',
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - start,
    checks: {
      database: {
        status: dbStatus,
        host: maskedHost,
        latency_ms: dbLatencyMs,
        ...(dbError ? { error: dbError } : {}),
      },
      ai_provider: {
        openrouter_configured: Boolean((currentEnv.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY) && !(currentEnv.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '').includes('...')),
        chat_model: currentEnv.AI_CHAT_MODEL || process.env.AI_CHAT_MODEL || 'openai/gpt-4o-mini',
      },
      billing: {
        polar_configured: Boolean((currentEnv.POLAR_ACCESS_TOKEN || process.env.POLAR_ACCESS_TOKEN) && !(currentEnv.POLAR_ACCESS_TOKEN || process.env.POLAR_ACCESS_TOKEN || '').includes('...')),
      }
    }
  });
};

const healthPath = ENV.HEALTH_CHECK_PATH || '/api/internal/health-check-9x7f2k';
app.get(healthPath, healthCheckHandler);

app.onError((err, c) => {
  console.error('[API Error]', err);
  return c.json({
    error: err.message || 'Internal Server Error',
    type: err.name || 'Error',
    stack: err.stack,
  }, 500);
});

export default app;
