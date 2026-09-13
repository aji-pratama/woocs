import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import app from '../../src/index';
import { db } from '../../src/db/client';
import { stores } from '../../src/db/schema/stores';
import { chatSessions } from '../../src/db/schema/chat';
import { eq } from 'drizzle-orm';
import { StoreService } from '../../src/services/store';

// Mock AI SDK
vi.mock('ai', () => ({
  embed: vi.fn().mockResolvedValue({ embedding: new Array(1536).fill(0.1) }),
  generateText: vi.fn().mockResolvedValue({ text: 'This is a mocked AI response.' }),
}));

describe('Widget API', () => {
  let storeId: string;
  let sessionId: string;

  beforeAll(async () => {
    const res = await StoreService.registerOrUpdateStore('https://widget-test.com');
    storeId = res.store!.id;
    sessionId = crypto.randomUUID();
  });

  afterAll(async () => {
    if (storeId) {
      await db.delete(stores).where(eq(stores.id, storeId));
    }
  });

  it('should handle order intent', async () => {
    const res = await app.request('/api/widget/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId,
        session_id: sessionId,
        message: 'where is my order #1234?',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.context_used).toBe('order_lookup');
    expect(data.answer).toContain('I cannot check order status right now'); // Because config is incomplete
  });

  it('should handle keyword escalation', async () => {
    const res = await app.request('/api/widget/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId,
        session_id: sessionId,
        message: 'i want a refund',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.escalated).toBe(true);
    expect(data.escalation_reason).toBe('keyword_trigger');
  });

  it('should handle quick reply intent', async () => {
    const res = await app.request('/api/widget/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId,
        session_id: sessionId,
        message: 'check my order',
        widget_config: {
          enable_quick_replies: true
        }
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.response_type).toBe('text');
    expect(data.answer).toContain('To check your order status');
  });

  it('should query rag service for normal questions', async () => {
    const res = await app.request('/api/widget/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId,
        session_id: sessionId,
        message: 'what are your products?',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.confidence).toBe(0);
    // Since confidence is 0, it should be escalated
    expect(data.escalated).toBe(true);
    expect(data.answer).toBe("I'm not sure about this. Want me to connect you with the team?");
  });

  it('should fetch chat history', async () => {
    const res = await app.request(`/api/widget/chat/history?store_id=${storeId}&session_id=${sessionId}`, {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session_id).toBe(sessionId);
    expect(Array.isArray(data.messages)).toBe(true);
    expect(data.messages.length).toBeGreaterThan(0);
  });
});
