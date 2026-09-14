import { describe, it, expect } from 'vitest';
import app from '../../src/index';

describe('Health Check API', () => {
  const secret = 'woocs-secret-health-key-2026';
  const path = '/api/internal/health-check-9x7f2k';

  it('rejects unauthenticated requests with 401', async () => {
    const res = await app.request(path);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toContain('Unauthorized');
  });

  it('rejects requests with invalid key with 401', async () => {
    const res = await app.request(path, {
      headers: { 'X-Health-Key': 'wrong-key' }
    });
    expect(res.status).toBe(401);
  });

  it('returns health diagnostic JSON when valid X-Health-Key header is provided', async () => {
    const res = await app.request(path, {
      headers: { 'X-Health-Key': secret }
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.service).toBe('woocs-api');
    expect(data.checks).toBeDefined();
    expect(data.checks.database).toBeDefined();
    expect(data.checks.ai_provider).toBeDefined();
  });

  it('returns health diagnostic JSON when valid ?key= query parameter is provided', async () => {
    const res = await app.request(`${path}?key=${secret}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.service).toBe('woocs-api');
  });

  it('returns 404 for removed public /health path', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(404);
  });
});
