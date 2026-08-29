import { serve } from '@hono/node-server';
import app from './index.js';

const port = process.env.PORT ? parseInt(process.env.PORT) : 8001;

console.log(`[Node.js] Starting Hono dev server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});
