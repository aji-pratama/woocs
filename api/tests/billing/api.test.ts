import { describe, it, expect, vi } from 'vitest';
import app from '../../src/index';

describe('Webhooks API', () => {
  it('should reject requests without signature headers', async () => {
    const res = await app.request('/api/webhooks/polar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'subscription.created' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing Polar webhook signature headers.');
  });
});
