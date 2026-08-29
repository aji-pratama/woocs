import { Hono } from 'hono';

export const webhooksRouter = new Hono();

// POST /api/webhooks/polar/
webhooksRouter.post('/polar', async (c) => {
  // TODO: Verify signature and process event
  const body = await c.req.json();
  return c.json({ received: true });
});
