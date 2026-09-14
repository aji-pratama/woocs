import { db } from '../db/client';
import { knowledgeDocuments, knowledgeChunks, stores } from '../db/schema/stores';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

export class KnowledgeService {
  static async getDocuments(storeId: string) {
    return await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.storeId, storeId)).orderBy(knowledgeDocuments.updatedAt);
  }

  static async getDocumentCount(storeId: string) {
    const docs = await this.getDocuments(storeId);
    let urls = 0;
    let pdfs = 0;
    let texts = 0;
    docs.forEach(d => {
      if (d.type === 'url') urls++;
      if (d.type === 'pdf') pdfs++;
      if (d.type === 'text') texts++;
    });
    return { total: urls + pdfs + texts, urls, pdfs, texts };
  }

  static async createDocument(storeId: string, type: 'url' | 'pdf' | 'text', source: string) {
    const [doc] = await db.insert(knowledgeDocuments).values({
      storeId,
      type,
      source,
      status: 'pending',
    }).returning();
    return doc;
  }

  static async deleteDocument(storeId: string, documentId: string) {
    return await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).returning();
  }
}
