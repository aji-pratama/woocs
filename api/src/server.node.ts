
import { serve } from '@hono/node-server';
import app from './index.js';
import { ENV } from './config/env';

const port = ENV.PORT;

console.log(`[Node.js] Starting Hono dev server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});
