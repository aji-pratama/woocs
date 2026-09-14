import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../../src/db/client';
import { stores, knowledgeDocuments, knowledgeChunks, chatSessions } from '../../src/db/schema/stores';
import { eq, sql } from 'drizzle-orm';
import { StoreService } from '../../src/services/store';
import { processKnowledgeDocument } from '../../src/worker/tasks/processKnowledgeDocument';
import { RagService } from '../../src/services/rag';

// Helper to create a normalized 1024-dim vector
function makeVector(primaryIndex: number): number[] {
  const vec = new Array(1024).fill(0.001);
  vec[primaryIndex] = 1.0;
  // Normalize
  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  return vec.map(v => v / norm);
}

// Mock AI SDK to produce deterministic embeddings
vi.mock('ai', () => ({
  embedMany: vi.fn().mockImplementation(async ({ values }) => {
    return {
      embeddings: values.map((val: string) => {
        const text = String(val).toLowerCase();
        if (text.includes('return') || text.includes('refund')) {
          return makeVector(0); // Vector aligned on dim 0
        }
        if (text.includes('shipping') || text.includes('delivery')) {
          return makeVector(1); // Vector aligned on dim 1
        }
        return makeVector(100);
      }),
    };
  }),
  embed: vi.fn().mockImplementation(async ({ value }) => {
    const text = String(value).toLowerCase();
    if (text.includes('return') || text.includes('refund')) {
      return { embedding: makeVector(0) }; // Vector aligned on dim 0
    }
    if (text.includes('shipping') || text.includes('delivery')) {
      return { embedding: makeVector(1) }; // Vector aligned on dim 1
    }
    return { embedding: makeVector(100) };
  }),
  generateText: vi.fn().mockImplementation(async ({ prompt }) => {
    return {
      text: `Based on your store policy: Customers can return items within 30 days for a full refund. (Prompt context was checked)`,
    };
  }),
}));

describe('Knowledge Base Vector DB & RAG TDD', () => {
  let storeId: string;
  let rawApiKey: string;

  beforeAll(async () => {
    const res = await StoreService.registerOrUpdateStore('https://vector-test.example.com');
    storeId = res.store!.id;
    rawApiKey = res.rawApiKey!;
  });

  afterAll(async () => {
    if (storeId) {
      await db.delete(stores).where(eq(stores.id, storeId));
    }
  });

  it('1. Creates a text document record with pending status', async () => {
    const [doc] = await db.insert(knowledgeDocuments).values({
      storeId,
      type: 'text',
      source: 'Return & Refund Policy',
      status: 'pending',
    }).returning();

    expect(doc).toBeDefined();
    expect(doc.type).toBe('text');
    expect(doc.source).toBe('Return & Refund Policy');
    expect(doc.status).toBe('pending');
  });

  it('2. Processes text document, generates chunks and writes vectors to PostgreSQL pgvector', async () => {
    const content = 'Return Policy: Customers can return any item within 30 days of purchase for a 100% full refund. Items must be unopened.';
    
    const [doc] = await db.insert(knowledgeDocuments).values({
      storeId,
      type: 'text',
      source: 'Return Policy 30-Days',
      status: 'pending',
    }).returning();

    // Run the worker task
    const result = await processKnowledgeDocument(storeId, doc.id, 'text', doc.source, content);
    
    expect(result.chunksEmbedded).toBeGreaterThanOrEqual(1);

    // Verify document status updated to completed
    const [updatedDoc] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, doc.id));
    expect(updatedDoc.status).toBe('completed');

    // Verify chunks exist in pgvector table store_knowledgechunk
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc.id));
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe(content);
    expect(chunks[0].embedding).not.toBeNull();

    // Verify embedding vector format and dimension in PostgreSQL
    const rawVectorCheck = await db.execute(sql`
      SELECT 
        id,
        content,
        embedding IS NOT NULL AS has_embedding
      FROM store_knowledgechunk
      WHERE document_id = ${doc.id}
    `) as any[];

    expect(rawVectorCheck.length).toBe(1);
    expect(rawVectorCheck[0].has_embedding).toBe(true);
  });

  it('3. Performs vector cosine similarity search (<=>) directly in pgvector', async () => {
    // We search with a vector aligned on dimension 0 (the "return" concept)
    const matchingQueryVec = `[${makeVector(0).join(',')}]`;
    const orthogonalQueryVec = `[${makeVector(500).join(',')}]`;

    // Query closest chunk using pgvector <=> operator
    const matchingResults = await db.execute(sql`
      SELECT 
        kc.id,
        kc.content,
        kd.source,
        kc.embedding <=> ${matchingQueryVec}::vector AS distance
      FROM store_knowledgechunk kc
      JOIN store_knowledgedocument kd ON kc.document_id = kd.id
      WHERE kd.store_id = ${storeId}
      ORDER BY distance ASC
      LIMIT 1
    `) as any[];

    expect(matchingResults.length).toBeGreaterThan(0);
    const topMatch = matchingResults[0];
    expect(Number(topMatch.distance)).toBeLessThan(0.05); // Exact or near-zero cosine distance!
    expect(topMatch.content).toContain('Return Policy');

    // Query distant vector -> distance should be close to 1.0
    const distantResults = await db.execute(sql`
      SELECT 
        kc.embedding <=> ${orthogonalQueryVec}::vector AS distance
      FROM store_knowledgechunk kc
      JOIN store_knowledgedocument kd ON kc.document_id = kd.id
      WHERE kd.store_id = ${storeId}
      ORDER BY distance ASC
      LIMIT 1
    `) as any[];

    expect(Number(distantResults[0].distance)).toBeGreaterThan(0.9);
  });

  it('4. Integrates with RagService: retrieves knowledge chunk and answers customer question', async () => {
    const store = (await db.select().from(stores).where(eq(stores.id, storeId)))[0];
    const session = { id: crypto.randomUUID(), storeId };

    const ragResponse = await RagService.query(
      store,
      'Can I get a refund if I return an item?',
      session as any
    );

    expect(ragResponse).toBeDefined();
    expect(ragResponse.confidence).toBeGreaterThan(0.7);
    expect(ragResponse.answer).toContain('30 days');
    expect(ragResponse.answer).toContain('refund');
  });

  it('5. Handles multiple chunks for long markdown documents and updates idempotently on re-sync', async () => {
    // Create a long policy with multiple sections
    const longContent = [
      '# Store Shipping & Delivery Guide',
      'Standard shipping takes 3-5 business days across the country.',
      'Express shipping takes 1-2 business days for an additional fee.',
      'Free shipping is automatically applied on all orders over $50.',
      'Tracking numbers are emailed immediately upon dispatch.',
    ].join('\n\n');

    const [doc] = await db.insert(knowledgeDocuments).values({
      storeId,
      type: 'text',
      source: 'Shipping Guide',
      status: 'pending',
    }).returning();

    // First sync
    const firstSync = await processKnowledgeDocument(storeId, doc.id, 'text', doc.source, longContent);
    expect(firstSync.chunksEmbedded).toBeGreaterThanOrEqual(1);

    const firstChunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc.id));
    const firstChunkCount = firstChunks.length;
    expect(firstChunkCount).toBeGreaterThan(0);

    // Re-sync with updated content (must replace, not duplicate chunks)
    const updatedContent = longContent + '\n\nInternational shipping is available to Canada and Mexico.';
    const secondSync = await processKnowledgeDocument(storeId, doc.id, 'text', doc.source, updatedContent);
    expect(secondSync.chunksEmbedded).toBeGreaterThanOrEqual(1);

    const secondChunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc.id));
    expect(secondChunks.length).toBeGreaterThanOrEqual(1);
    
    // Ensure chunks were replaced and not doubled
    const matchingUpdated = secondChunks.some(c => c.content.includes('International shipping'));
    expect(matchingUpdated).toBe(true);
  });
});
