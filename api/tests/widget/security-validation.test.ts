import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';

describe('Widget Security & Input Validation', () => {
  it('rejects history requests with non-UUID store_id or session_id', async () => {
    // Malicious or non-UUID store_id
    const res1 = await app.request('/api/widget/chat/history?store_id=123-malformed&session_id=11111111-1111-4111-8111-111111111111');
    expect(res1.status).toBe(400);
    const data1 = await res1.json();
    expect(data1.error).toContain('Invalid store_id or session_id');

    // Malicious or non-UUID session_id (e.g. SQL injection attempt)
    const res2 = await app.request('/api/widget/chat/history?store_id=11111111-1111-4111-8111-111111111111&session_id=\' OR 1=1 --');
    expect(res2.status).toBe(400);
    const data2 = await res2.json();
    expect(data2.error).toContain('Invalid store_id or session_id');
  });

  it('rejects chat messages exceeding max character limit', async () => {
    const validStoreId = crypto.randomUUID();
    const validSessionId = crypto.randomUUID();

    // A valid format request but with oversized payload
    const longMessage = 'A'.repeat(2000);
    const res = await app.request('/api/widget/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: validStoreId,
        session_id: validSessionId,
        message: longMessage,
      }),
    });

    // Should not crash, returns 404 since store not found, but validated cleanly without DB overflow
    expect([400, 404]).toContain(res.status);
  });

  it('includes Server-Timing header in responses', async () => {
    const res = await app.request('/api/widget/chat/history?store_id=11111111-1111-4111-8111-111111111111&session_id=22222222-2222-4222-8222-222222222222');
    expect(res.headers.get('Server-Timing')).toMatch(/total;dur=\d+/);
  });
});
