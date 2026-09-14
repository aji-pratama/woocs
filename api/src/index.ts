import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { storeRouter } from './routes/store.js';
import { widgetRouter } from './routes/widget.js';
import { webhooksRouter } from './routes/webhooks.js';

const app = new Hono({ strict: false });

app.use('*', cors());
app.use('*', logger());

app.route('/api/stores', storeRouter);
app.route('/api/widget', widgetRouter);
app.route('/api/webhooks', webhooksRouter);

app.get('/health', (c) => {
  const dbUrl = process.env.DATABASE_URL || '';
  const dbConfigured = dbUrl.length > 0 && !dbUrl.includes('127.0.0.1:5435');
  return c.json({
    status: 'ok',
    service: 'woocs-api',
    database_configured: dbConfigured,
  });
});

app.onError((err, c) => {
  console.error('[API Error]', err);
  return c.json({
    error: err.message || 'Internal Server Error',
    type: err.name || 'Error',
  }, 500);
});

export default app;
