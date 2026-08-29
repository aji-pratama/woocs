import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { storeRouter } from './routes/store.js';
import { widgetRouter } from './routes/widget.js';
import { webhooksRouter } from './routes/webhooks.js';

const app = new Hono();

app.use('*', logger());

app.route('/api/stores', storeRouter);
app.route('/api/widget', widgetRouter);
app.route('/api/webhooks', webhooksRouter);

app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'woocs-api' });
});

export default app;
