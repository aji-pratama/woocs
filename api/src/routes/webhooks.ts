import { Hono } from 'hono';

export const webhooksRouter = new Hono();

import { PolarWebhookService } from '../services/billing';

// POST /api/webhooks/polar/
webhooksRouter.post('/polar', async (c) => {
  const body = await c.req.text();
  const headers = c.req.header();

  try {
    const processed = await PolarWebhookService.process(body, headers);
    return c.json({ received: true, processed });
  } catch (e: any) {
    console.error('Polar webhook error:', e);
    return c.json({ error: e.message || 'Webhook processing failed' }, 400);
  }
});
