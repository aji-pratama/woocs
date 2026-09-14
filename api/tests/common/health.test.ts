import { describe, it, expect } from 'vitest';
import app from '../../src/index';

describe('Health Check API', () => {
  it('GET /health returns health diagnostic JSON', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.service).toBe('woocs-api');
    expect(data.checks).toBeDefined();
    expect(data.checks.database).toBeDefined();
    expect(data.checks.ai_provider).toBeDefined();
  });

  it('GET /api/health also returns health diagnostic JSON', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.service).toBe('woocs-api');
  });
});
