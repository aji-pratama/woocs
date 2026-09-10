import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/index';
import { db } from '../../src/db/client';
import { stores, knowledgeDocuments, knowledgeChunks } from '../../src/db/schema/stores';
import { subscriptions } from '../../src/db/schema/billing';
import { eq } from 'drizzle-orm';
import { StoreService } from '../../src/services/store';

describe('Knowledge API', () => {
  let storeId: string;
  let rawApiKey: string;

  beforeAll(async () => {
    // Generate a store for tests
    const url = 'https://knowledge-test.com';
    const res = await StoreService.registerOrUpdateStore(url);
    storeId = res.store!.id;
    rawApiKey = res.rawApiKey!;

    // Upgrade to pro to allow enough syncs
    await db.update(subscriptions)
      .set({ planKey: 'pro', status: 'active' })
      .where(eq(subscriptions.storeId, storeId));
  });

  afterAll(async () => {
    if (storeId) {
      // Cascade will delete chunks and docs
      await db.delete(stores).where(eq(stores.id, storeId));
    }
  });

  it('should get an empty list of documents initially', async () => {
    const res = await app.request('/api/stores/knowledge', {
      method: 'GET',
      headers: { 'X-API-Key': rawApiKey },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.documents).toBeDefined();
    expect(data.documents.length).toBe(0);
  });

  it('should accept a new knowledge URL', async () => {
    const formData = new FormData();
    formData.append('url', 'https://example.com/about');

    const res = await app.request('/api/stores/knowledge/document', {
      method: 'POST',
      headers: { 'X-API-Key': rawApiKey },
      body: formData,
    });

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.document).toBeDefined();
    expect(data.document.type).toBe('url');
    expect(data.document.source).toBe('https://example.com/about');
    expect(data.task_id).toBeDefined();
  });

  it('should reject a new knowledge URL without valid payload', async () => {
    const formData = new FormData();
    // Missing url or pdf

    const res = await app.request('/api/stores/knowledge/document', {
      method: 'POST',
      headers: { 'X-API-Key': rawApiKey },
      body: formData,
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Missing url or pdf in body');
  });

  it('should enforce quota limits when downgrading to free', async () => {
    // Downgrade to free
    await db.update(subscriptions)
      .set({ planKey: 'free', status: 'active' })
      .where(eq(subscriptions.storeId, storeId));

    // Fill the quota manually in DB (Free limit is 1 URL)
    const counts = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.storeId, storeId));
    if (counts.length === 0) {
      await db.insert(knowledgeDocuments).values({
        storeId,
        type: 'url',
        source: 'https://example.com/test',
        status: 'completed',
      });
    }

    const formData = new FormData();
    formData.append('url', 'https://example.com/another');

    const res = await app.request('/api/stores/knowledge/document', {
      method: 'POST',
      headers: { 'X-API-Key': rawApiKey },
      body: formData,
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('limit reached');
    expect(data.upgrade_required).toBe(true);
  });

});
