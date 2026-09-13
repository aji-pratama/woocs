import { embed, generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { db } from '../db/client';
import { stores, products, faqs, knowledgeChunks, knowledgeDocuments } from '../db/schema/stores';
import { chatMessages, chatSessions } from '../db/schema/chat';
import { eq, sql, and, desc, isNotNull } from 'drizzle-orm';
import { InferSelectModel } from 'drizzle-orm';

type Store = InferSelectModel<typeof stores>;
type Product = InferSelectModel<typeof products>;
type FAQ = InferSelectModel<typeof faqs>;
type KnowledgeChunk = InferSelectModel<typeof knowledgeChunks>;
type KnowledgeDocument = InferSelectModel<typeof knowledgeDocuments>;
type ChatSession = InferSelectModel<typeof chatSessions>;

export interface RagResult {
  answer: string;
  confidence: number;
  products: Record<string, any>[];
  contextUsed: string;
}

export class RagService {
  static systemPrompt = "You are a concise WooCommerce store assistant. Answer only from the provided catalog context. If the context is insufficient, say so.";

  static async query(store: Store, message: string, session: ChatSession, pageContext: any = null): Promise<RagResult> {
    try {
      return await this._query(store, message, session, pageContext);
    } catch (e) {
      console.error('RAG query failed for store', store.id, e);
      return {
        answer: "Sorry, I'm having trouble searching the catalog right now.",
        confidence: 0.0,
        products: [],
        contextUsed: "error",
      };
    }
  }

  private static async _query(store: Store, message: string, session: ChatSession, pageContext: any): Promise<RagResult> {
    // 1. Get embedding for the message
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small', { dimensions: 1024 }),
      value: message,
    });

    const queryVector = `[${embedding.join(',')}]`;

    // 2. Page context
    const primaryProduct = await this._getPrimaryProduct(store.id, pageContext);

    let retrievedProducts: Product[] = [];
    let retrievedFaqs: FAQ[] = [];
    let allDistances: number[] = [];
    let confidence = 0.0;
    let contextUsed = 'retrieval';

    if (primaryProduct && this._isPageContextQuestion(message, primaryProduct)) {
      retrievedProducts = [primaryProduct];
      confidence = 0.95;
      contextUsed = 'page_context';
    } else {
      // Vector search products
      const pResults = await db.select({
        product: products,
        distance: sql<number>`${products.embedding} <=> ${queryVector}::vector`
      })
      .from(products)
      .where(and(eq(products.storeId, store.id), isNotNull(products.embedding)))
      .orderBy(sql`${products.embedding} <=> ${queryVector}::vector`)
      .limit(5);

      // Vector search FAQs
      const fResults = await db.select({
        faq: faqs,
        distance: sql<number>`${faqs.embedding} <=> ${queryVector}::vector`
      })
      .from(faqs)
      .where(and(eq(faqs.storeId, store.id), isNotNull(faqs.embedding)))
      .orderBy(sql`${faqs.embedding} <=> ${queryVector}::vector`)
      .limit(5);

      // Vector search Knowledge Chunks
      const kResults = await db.select({
        chunk: knowledgeChunks,
        doc: knowledgeDocuments,
        distance: sql<number>`${knowledgeChunks.embedding} <=> ${queryVector}::vector`
      })
      .from(knowledgeChunks)
      .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
      .where(and(eq(knowledgeDocuments.storeId, store.id), isNotNull(knowledgeChunks.embedding)))
      .orderBy(sql`${knowledgeChunks.embedding} <=> ${queryVector}::vector`)
      .limit(5);

      retrievedProducts = pResults.map(r => r.product);
      retrievedFaqs = fResults.map(r => r.faq);
      const retrievedKnowledge = kResults.map(r => ({ chunk: r.chunk, source: r.doc.source }));
      
      allDistances = [...pResults.map(r => r.distance), ...fResults.map(r => r.distance), ...kResults.map(r => r.distance)];
      confidence = this._topConfidence(allDistances);
    }

    if (retrievedProducts.length === 0 && retrievedFaqs.length === 0 && allDistances.length === 0) {
      return {
        answer: "I couldn't find relevant information in the store catalog.",
        confidence: 0.0,
        products: [],
        contextUsed,
      };
    }

    // History
    const history = await db.select().from(chatMessages)
      .where(eq(chatMessages.sessionId, session.id))
      .orderBy(desc(chatMessages.createdAt))
      .limit(10);
    
    // Reverse to chronological
    history.reverse();

    const prompt = this._buildPrompt(message, retrievedProducts, retrievedFaqs, typeof kResults !== 'undefined' ? kResults.map(r => ({ chunk: r.chunk, source: r.doc.source })) : [], history, contextUsed === 'page_context' ? primaryProduct : null);

    const response = await generateText({
      model: openai('gpt-3.5-turbo'),
      system: this.systemPrompt,
      prompt,
    });

    const answer = response.text || '';
    
    // We return up to 3 products for the carousel
    const returnedProducts = retrievedProducts.slice(0, 3).map(p => this._productData(store, p));

    return {
      answer,
      confidence,
      products: returnedProducts,
      contextUsed,
    };
  }

  private static async _getPrimaryProduct(storeId: string, pageContext: any): Promise<Product | null> {
    const productId = pageContext?.product_id;
    if (!productId) return null;

    const [product] = await db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.wcId, productId)));
    return product || null;
  }

  private static _isPageContextQuestion(message: string, product: Product): boolean {
    const lowerMessage = message.toLowerCase();
    const contextTerms = ['this', 'it', 'size', 'stock', 'color', 'price', 'how much'];
    return lowerMessage.includes((product.name || '').toLowerCase()) || contextTerms.some(term => lowerMessage.includes(term));
  }

  private static _topConfidence(distances: number[]): number {
    if (distances.length === 0) return 0.0;
    const minDistance = Math.min(...distances);
    return Math.max(0.0, Math.min(1.0, 1.0 - minDistance));
  }

  private static _buildPrompt(message: string, retrievedProducts: Product[], retrievedFaqs: FAQ[], retrievedKnowledge: {chunk: KnowledgeChunk, source: string}[], history: any[], primaryProduct: Product | null): string {
    const sections = [`CUSTOMER QUESTION:\n${message}`];

    if (primaryProduct) {
      sections.push(`CUSTOMER IS CURRENTLY VIEWING:\n${this._productDocument(primaryProduct)}`);
    }

    if (history.length > 0) {
      // Exclude last if it's the current message we are building
      // wait, the current message is not in history yet usually, but let's just format history
      const historyText = history.map(item => `${item.role}: ${item.content}`).join('\n');
      if (historyText) {
        sections.push(`RECENT CONVERSATION:\n${historyText}`);
      }
    }

    const contextDocs = retrievedProducts.map(p => this._productDocument(p));
    const faqDocs = retrievedFaqs.map(f => `FAQ: ${f.question}\nAnswer: ${f.answer}`);
    const knowledgeDocs = retrievedKnowledge.map(k => `[Source: ${k.source}]\n${k.chunk.content}`);
    
    sections.push(`RETRIEVED CATALOG CONTEXT:\n` + [...contextDocs, ...faqDocs, ...knowledgeDocs].join('\n---\n'));

    return sections.join('\n\n');
  }

  private static _productDocument(product: Product): string {
    return `Product: ${product.name}\nDescription: ${product.description || ''}\nPrice: ${product.price}\nStock: ${product.stockStatus}\nCategories: ${(product.categories as string[] || []).join(', ')}`;
  }

  private static _productData(store: Store, product: Product): Record<string, any> {
    return {
      name: product.name,
      price: String(product.price),
      stock_status: product.stockStatus,
      stock_quantity: product.stockQuantity,
      wc_url: `${store.wcUrl?.replace(/\/$/, '')}/?p=${product.wcId}`,
    };
  }
}
