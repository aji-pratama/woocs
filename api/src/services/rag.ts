import { embed } from 'ai';
import { aiModels, to1024Vector, generateOpenRouterText } from './ai.js';
import { db } from '../db/client.js';
import { stores, products, faqs, knowledgeChunks, knowledgeDocuments } from '../db/schema/stores.js';
import { chatMessages, chatSessions } from '../db/schema/chat.js';
import { eq, sql, and, desc, isNotNull } from 'drizzle-orm';
import { InferSelectModel } from 'drizzle-orm';
import { logger } from '../common/logger.js';
import { appCache } from '../common/cache.js';
import { PROMPTS, CACHE_CONFIG, LIMITS, STOP_WORDS } from '../config/constants.js';

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
  static systemPrompt = PROMPTS.SYSTEM;

  static async query(store: Store, message: string, session: ChatSession, pageContext: any = null): Promise<RagResult> {
    const startTime = Date.now();
    try {
      const result = await this._query(store, message, session, pageContext);
      const durationMs = Date.now() - startTime;
      logger.rag('RAG query completed', {
        storeId: store.id,
        sessionId: session.id,
        durationMs,
        confidence: result.confidence,
        contextUsed: result.contextUsed,
        productsCount: result.products.length,
      });
      return result;
    } catch (e: any) {
      const durationMs = Date.now() - startTime;
      logger.error(`RAG query failed for store [${store.id}]: ${e.message}`, {
        component: 'RAG',
        storeId: store.id,
        sessionId: session.id,
        durationMs,
        stack: e.stack,
      });
      return {
        answer: "Sorry, I'm having trouble searching the catalog right now.",
        confidence: 0.0,
        products: [],
        contextUsed: "error",
      };
    }
  }

  private static async _query(store: Store, message: string, session: ChatSession, pageContext: any): Promise<RagResult> {
    if (process.env.AI_MOCK_MODE === 'true') {
      return this._getMockResponse(message);
    }

    // 1. Get embedding for the message with caching and graceful fallback
    const queryVector = await this.getQueryEmbedding(message, store.id);

    // 2. Page context
    const primaryProduct = await this._getPrimaryProduct(store.id, pageContext);

    let retrievedProducts: Product[] = [];
    let retrievedFaqs: FAQ[] = [];
    let retrievedKnowledge: { chunk: any, source: string }[] = [];
    let allDistances: number[] = [];
    let confidence = 0.0;
    let contextUsed = 'retrieval';

    if (primaryProduct && this._isPageContextQuestion(message, primaryProduct)) {
      retrievedProducts = [primaryProduct];
      confidence = 0.95;
      contextUsed = 'page_context';
    } else if (queryVector) {
      // Vector search products
      const pResults = await db.select({
        product: products,
        distance: sql<number>`${products.embedding} <=> ${queryVector}::vector`
      })
      .from(products)
      .where(and(eq(products.storeId, store.id), isNotNull(products.embedding)))
      .orderBy(sql`${products.embedding} <=> ${queryVector}::vector`)
      .limit(LIMITS.MAX_VECTOR_RETRIEVAL_ITEMS);

      // Vector search FAQs
      const fResults = await db.select({
        faq: faqs,
        distance: sql<number>`${faqs.embedding} <=> ${queryVector}::vector`
      })
      .from(faqs)
      .where(and(eq(faqs.storeId, store.id), isNotNull(faqs.embedding)))
      .orderBy(sql`${faqs.embedding} <=> ${queryVector}::vector`)
      .limit(LIMITS.MAX_VECTOR_RETRIEVAL_ITEMS);

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
      .limit(LIMITS.MAX_VECTOR_RETRIEVAL_ITEMS);

      retrievedProducts = pResults.map(r => r.product);
      retrievedFaqs = fResults.map(r => r.faq);
      retrievedKnowledge = kResults.map(r => ({ chunk: r.chunk, source: r.doc.source }));
      
      allDistances = [...pResults.map(r => r.distance), ...fResults.map(r => r.distance), ...kResults.map(r => r.distance)];
      confidence = this._topConfidence(allDistances);
    }

    // 3. Fallback: If vector search returned 0 items or embedding failed, search by keywords
    if (retrievedProducts.length === 0 && retrievedFaqs.length === 0 && retrievedKnowledge.length === 0) {
      const words = message.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
      
      if (words.length > 0) {
        // Search products by keywords
        const productMatches: Product[] = [];
        for (const w of words.slice(0, 3)) {
          const matched = await db.select().from(products)
            .where(and(
              eq(products.storeId, store.id),
              sql`LOWER(${products.name}) LIKE ${'%' + w + '%'}`
            ))
            .limit(3);
          for (const m of matched) {
            if (!productMatches.some(p => p.id === m.id)) {
              productMatches.push(m);
            }
          }
        }
        if (productMatches.length > 0) {
          retrievedProducts = productMatches.slice(0, LIMITS.MAX_VECTOR_RETRIEVAL_ITEMS);
          confidence = 0.88;
          contextUsed = 'text_search';
        }
      }

      // If still no products found, fetch general store catalog overview (cached)
      if (retrievedProducts.length === 0 && retrievedFaqs.length === 0 && retrievedKnowledge.length === 0) {
        const overviewCacheKey = `catalog_overview:${store.id}`;
        let storeProducts = appCache.get<Product[]>(overviewCacheKey);
        if (!storeProducts) {
          storeProducts = await db.select().from(products)
            .where(eq(products.storeId, store.id))
            .limit(LIMITS.MAX_VECTOR_RETRIEVAL_ITEMS);
          if (storeProducts && storeProducts.length > 0) {
            appCache.set(overviewCacheKey, storeProducts, CACHE_CONFIG.CATALOG_OVERVIEW_TTL_SECONDS);
          }
        }

        if (storeProducts && storeProducts.length > 0) {
          retrievedProducts = storeProducts;
          confidence = 0.85;
          contextUsed = 'catalog_overview';
        }
      }
    }

    if (retrievedProducts.length === 0 && retrievedFaqs.length === 0 && retrievedKnowledge.length === 0 && !primaryProduct) {
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

    const prompt = this._buildPrompt(message, retrievedProducts, retrievedFaqs, retrievedKnowledge, history, contextUsed === 'page_context' ? primaryProduct : null);

    const response = await generateOpenRouterText({
      system: this.systemPrompt,
      prompt,
    });

    const answer = response.text || '';
    
    // Guarantee confidence for answered questions with context
    const finalConfidence = (retrievedProducts.length > 0 || retrievedFaqs.length > 0 || retrievedKnowledge.length > 0 || primaryProduct)
      ? Math.max(0.85, confidence)
      : confidence;

    // We return up to 3 products for the carousel/cards
    const returnedProducts = retrievedProducts.slice(0, 3).map(p => this._productData(store, p));

    return {
      answer,
      confidence: finalConfidence,
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
    const lowerMessage = message.toLowerCase().trim();
    const contextTerms = [
      'this', 'it', 'size', 'stock', 'color', 'price', 'how much', 'how many', 'quantity', 'units', 'count',
      'available', 'ready', 'shipping', 'material', 'detail', 'discount', 'warranty', 'guarantee', 'photo', 'picture',
      'ini', 'itu', 'stok', 'harga', 'berapa', 'banyak', 'warna', 'ukuran', 'bahan', 'ready', 'ongkir', 'ada'
    ];

    if (lowerMessage.includes((product.name || '').toLowerCase())) return true;
    if (contextTerms.some(term => lowerMessage.includes(term))) return true;

    // Any short question (<= 8 words) asked while on a specific product page is contextual
    const words = lowerMessage.split(/\s+/).filter(Boolean);
    if (words.length <= 8) return true;

    return false;
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

  private static _getMockResponse(message: string): RagResult {
    const msg = message.toLowerCase();
    
    if (msg.includes('mock_error')) {
      throw new Error('This is a simulated AI error for testing.');
    }
    
    if (msg.includes('mock_escalate')) {
      return {
        answer: "I don't know the answer. (Low confidence mock)",
        confidence: 0.1,
        products: [],
        contextUsed: "mock_retrieval",
      };
    }
    
    if (msg.includes('mock_product')) {
      return {
        answer: "I found this product you might like.",
        confidence: 0.95,
        products: [
          { id: 9991, name: "Mocked Single Product", price: "19.99", url: "#", imageUrl: "https://placehold.co/150" } as any
        ],
        contextUsed: "mock_retrieval",
      };
    }
    
    if (msg.includes('mock_carousel')) {
      return {
        answer: "Here are some mocked products in a carousel.",
        confidence: 0.95,
        products: [
          { id: 9992, name: "Mock Product 1", price: "29.99", url: "#", imageUrl: "https://placehold.co/150?text=Product+1" } as any,
          { id: 9993, name: "Mock Product 2", price: "39.99", url: "#", imageUrl: "https://placehold.co/150?text=Product+2" } as any,
          { id: 9994, name: "Mock Product 3", price: "49.99", url: "#", imageUrl: "https://placehold.co/150?text=Product+3" } as any,
        ],
        contextUsed: "mock_retrieval",
      };
    }
    
    // Default mock response
    return {
      answer: "This is a default mocked response. Type 'mock_carousel', 'mock_product', 'mock_escalate', or 'mock_error' for different scenarios.",
      confidence: 0.9,
      products: [],
      contextUsed: "mock_retrieval",
    };
  }

  static async getQueryEmbedding(message: string, storeId?: string): Promise<string | null> {
    const normalizedMsg = message.trim().toLowerCase();
    const embCacheKey = `emb:${normalizedMsg}`;
    const cached = appCache.get<string>(embCacheKey);
    if (cached) return cached;

    try {
      const { embedding } = await embed({
        model: aiModels.embedding,
        value: message,
      });
      const vectorStr = `[${to1024Vector(embedding).join(',')}]`;
      appCache.set(embCacheKey, vectorStr, CACHE_CONFIG.EMBEDDING_TTL_SECONDS);
      return vectorStr;
    } catch (embErr: any) {
      logger.warn(`Query embedding failed (${embErr.message}), falling back to text search retrieval`, {
        component: 'RAG',
        storeId,
      });
      return null;
    }
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
