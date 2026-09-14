import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/index';
import { db } from '../../src/db/client';
import { stores } from '../../src/db/schema/stores';
import { chatSessions, chatMessages } from '../../src/db/schema/chat';
import { eq } from 'drizzle-orm';
import { StoreService } from '../../src/services/store';

describe('Chat Export & Lead Labeling API', () => {
  let storeId: string;
  let rawApiKey: string;
  let session1Uuid: string;
  let session2Uuid: string;
  let sessionAnonymousUuid: string;

  beforeAll(async () => {
    const res = await StoreService.registerOrUpdateStore('https://export-test.example.com');
    storeId = res.store!.id;
    rawApiKey = res.rawApiKey!;

    session1Uuid = crypto.randomUUID();
    session2Uuid = crypto.randomUUID();
    sessionAnonymousUuid = crypto.randomUUID();

    // Seed session 1 (Lead with email & phone)
    const [s1] = await db.insert(chatSessions).values({
      storeId,
      sessionId: session1Uuid,
      customerName: 'Budi Santoso',
      customerEmail: 'budi@example.com',
      customerPhone: '+628123456789',
      leadLabel: 'warm',
    }).returning();

    await db.insert(chatMessages).values([
      { sessionId: s1.id, role: 'user', content: 'Apakah produk ini ready?' },
      { sessionId: s1.id, role: 'assistant', content: 'Iya, produk ready stock kak!' },
    ]);

    // Seed session 2 (Same lead returning, or another lead)
    const [s2] = await db.insert(chatSessions).values({
      storeId,
      sessionId: session2Uuid,
      customerName: 'Siti Rahma',
      customerEmail: 'siti@example.com',
      customerPhone: '+628987654321',
      leadLabel: 'hot',
    }).returning();

    await db.insert(chatMessages).values([
      { sessionId: s2.id, role: 'user', content: 'Mau beli 100 pcs untuk kantor, ada diskon?', escalated: true, escalationReason: 'bulk_inquiry' },
      { sessionId: s2.id, role: 'assistant', content: 'Tentu ada diskon grosir, kami hubungkan ke tim sales ya.' },
    ]);

    // Seed session 3 (Anonymous, no contact info)
    const [s3] = await db.insert(chatSessions).values({
      storeId,
      sessionId: sessionAnonymousUuid,
      leadLabel: 'lead',
    }).returning();

    await db.insert(chatMessages).values([
      { sessionId: s3.id, role: 'user', content: 'Halo cek jam buka' },
      { sessionId: s3.id, role: 'assistant', content: 'Halo! Toko buka pk 09.00 - 17.00 WIB.' },
    ]);
  });

  afterAll(async () => {
    if (storeId) {
      await db.delete(stores).where(eq(stores.id, storeId));
    }
  });

  it('1. Returns lead_label in GET /api/stores/chat-history', async () => {
    const res = await app.request('/api/stores/chat-history', {
      method: 'GET',
      headers: { 'X-API-Key': rawApiKey },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessions).toBeDefined();
    expect(data.sessions.length).toBeGreaterThanOrEqual(3);

    const s1 = data.sessions.find((s: any) => s.session_id === session1Uuid);
    expect(s1).toBeDefined();
    expect(s1.lead_label).toBe('warm');
    expect(s1.customer_name).toBe('Budi Santoso');
  });

  it('2. Updates lead_label via PATCH /api/stores/chat-history/:id/label', async () => {
    const res = await app.request(`/api/stores/chat-history/${session1Uuid}/label`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': rawApiKey,
      },
      body: JSON.stringify({ lead_label: 'customer' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.lead_label).toBe('customer');

    // Verify in DB
    const [check] = await db.select().from(chatSessions).where(eq(chatSessions.sessionId, session1Uuid));
    expect(check.leadLabel).toBe('customer');
  });

  it('3. Rejects invalid lead_label with 400', async () => {
    const res = await app.request(`/api/stores/chat-history/${session1Uuid}/label`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': rawApiKey,
      },
      body: JSON.stringify({ lead_label: 'invalid_label_123' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('4. Full Export: GET /api/stores/chat-history/export?type=full returns all conversations as CSV', async () => {
    const res = await app.request('/api/stores/chat-history/export?type=full', {
      method: 'GET',
      headers: { 'X-API-Key': rawApiKey },
    });

    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toContain('text/csv');
    const disposition = res.headers.get('content-disposition') || '';
    expect(disposition).toContain('woocs-conversations-');

    const csvText = await res.text();
    // Headers check
    expect(csvText).toContain('Session ID,Date,Customer Name,Customer Email,Customer Phone,Lead Label,Message Count,Escalated,Escalation Reason,Transcript');
    // Content check
    expect(csvText).toContain('Budi Santoso');
    expect(csvText).toContain('siti@example.com');
    expect(csvText).toContain('Mau beli 100 pcs untuk kantor');
    expect(csvText).toContain('Halo cek jam buka');
  });

  it('5. Leads Export: GET /api/stores/chat-history/export?type=leads returns only unique contacts as CSV', async () => {
    const res = await app.request('/api/stores/chat-history/export?type=leads', {
      method: 'GET',
      headers: { 'X-API-Key': rawApiKey },
    });

    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toContain('text/csv');
    const disposition = res.headers.get('content-disposition') || '';
    expect(disposition).toContain('woocs-leads-');

    const csvText = await res.text();
    // Headers check
    expect(csvText).toContain('Customer Name,Customer Email,Customer Phone,Lead Label,Total Sessions,First Seen,Last Seen,Last Message');
    // Must contain Budi and Siti
    expect(csvText).toContain('Budi Santoso');
    expect(csvText).toContain('budi@example.com');
    expect(csvText).toContain('Siti Rahma');
    expect(csvText).toContain('siti@example.com');
    // Must NOT contain anonymous session with empty name/email/phone
    expect(csvText).not.toContain('Halo cek jam buka');
  });
});
