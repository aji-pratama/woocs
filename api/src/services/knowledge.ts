import { db } from '../db/client';
import { knowledgeDocuments, stores } from '../db/schema/stores';
import { eq, and, sql } from 'drizzle-orm';
import { appCache } from '../common/cache';

export class KnowledgeService {
  static async getDocuments(storeId: string) {
    return await db.select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.storeId, storeId))
      .orderBy(knowledgeDocuments.updatedAt);
  }

  static async getDocumentCount(storeId: string) {
    const counts = await db.select({
      type: knowledgeDocuments.type,
      count: sql<number>`count(*)`,
    })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.storeId, storeId))
    .groupBy(knowledgeDocuments.type);

    let urls = 0;
    let pdfs = 0;
    let texts = 0;
    for (const row of counts) {
      const c = Number(row.count || 0);
      if (row.type === 'url') urls = c;
      if (row.type === 'pdf') pdfs = c;
      if (row.type === 'text') texts = c;
    }
    return { total: urls + pdfs + texts, urls, pdfs, texts };
  }

  static async createDocument(storeId: string, type: 'url' | 'pdf' | 'text', source: string) {
    const [doc] = await db.insert(knowledgeDocuments).values({
      storeId,
      type,
      source,
      status: 'pending',
    }).returning();
    appCache.delete(`dashboard_stats:${storeId}`);
    return doc;
  }

  static async deleteDocument(storeId: string, documentId: string) {
    const res = await db.delete(knowledgeDocuments)
      .where(and(eq(knowledgeDocuments.id, documentId), eq(knowledgeDocuments.storeId, storeId)))
      .returning();
    appCache.delete(`dashboard_stats:${storeId}`);
    return res;
  }
}
