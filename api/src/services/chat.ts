import { db } from '../db/client';
import { stores } from '../db/schema/stores';
import { chatMessages, chatSessions } from '../db/schema/chat';
import { eq } from 'drizzle-orm';
import { InferSelectModel } from 'drizzle-orm';
import { OrderService } from './order';
import { RagService } from './rag';

type Store = InferSelectModel<typeof stores>;
type ChatSession = InferSelectModel<typeof chatSessions>;

const ESCALATION_KEYWORDS = ['refund', 'damage', 'broken', 'lawsuit'];
const CONFIDENCE_THRESHOLD = 0.65;
const ESCALATION_MESSAGE = "I'm not sure about this. Want me to connect you with the team?";

export class ChatService {
  static async getOrCreateSession(storeId: string, sessionId: string): Promise<ChatSession> {
    const existing = await db.select().from(chatSessions).where(eq(chatSessions.sessionId, sessionId));
    if (existing.length > 0) {
      return existing[0];
    }
    const [newSession] = await db.insert(chatSessions).values({ sessionId, storeId }).returning();
    return newSession;
  }

  static checkKeywords(message: string): boolean {
    const lower = message.toLowerCase();
    return ESCALATION_KEYWORDS.some(keyword => lower.includes(keyword));
  }

  static detectOrderIntent(message: string): string | null {
    const hashMatch = message.match(/#(\d+)/);
    if (hashMatch) return hashMatch[1];
    const orderMatch = message.match(/order\s+(\d+)/i);
    if (orderMatch) return orderMatch[1];
    return null;
  }

  static async handleMessage(store: Store, sessionId: string, message: string, pageContext: any = null) {
    const session = await this.getOrCreateSession(store.id, sessionId);
    
    // Save user message
    await db.insert(chatMessages).values({
      sessionId: session.id,
      role: 'user',
      content: message,
    });

    if (this.checkKeywords(message)) {
      return this._saveEscalation(session, sessionId, null, 'keyword_trigger', 'keyword_trigger', pageContext);
    }

    const orderId = this.detectOrderIntent(message);
    if (orderId) {
      return this._handleOrder(session, sessionId, store, orderId, pageContext);
    }

    const result = await RagService.query(store, message, session, pageContext);

    if (result.confidence < CONFIDENCE_THRESHOLD) {
      return this._saveEscalation(session, sessionId, result.confidence, 'low_confidence', result.contextUsed, pageContext);
    }

    const responseType = result.productData ? 'product_card' : 'text';
    const metadata = {
      ...(result.productData || {}),
      page_context: pageContext,
      context_used: result.contextUsed,
    };

    await db.insert(chatMessages).values({
      sessionId: session.id,
      role: 'assistant',
      content: result.answer,
      confidenceScore: String(result.confidence),
      responseType,
      metadata,
    });

    return {
      answer: result.answer,
      confidence: result.confidence,
      escalated: false,
      escalation_reason: null,
      session_id: sessionId,
      response_type: responseType,
      metadata: result.productData,
      context_used: result.contextUsed,
    };
  }

  private static async _handleOrder(session: ChatSession, sessionId: string, store: Store, orderId: string, pageContext: any) {
    const result = await OrderService.getOrderStatus(store, orderId);
    const found = result.found;
    const answer = found ? `Here's the status for order #${orderId}.` : String(result.error);
    
    const metadata = found ? { ...result } : {};
    Object.assign(metadata, {
      page_context: pageContext,
      context_used: 'order_lookup',
    });

    await db.insert(chatMessages).values({
      sessionId: session.id,
      role: 'assistant',
      content: answer,
      confidenceScore: found ? '1.0' : null,
      responseType: found ? 'order_card' : 'text',
      metadata,
    });

    return {
      answer,
      confidence: found ? 1.0 : null,
      escalated: false,
      escalation_reason: null,
      session_id: sessionId,
      response_type: found ? 'order_card' : 'text',
      metadata: found ? result : null,
      context_used: 'order_lookup',
    };
  }

  private static async _saveEscalation(session: ChatSession, sessionId: string, confidence: number | null, reason: string, contextUsed: string, pageContext: any) {
    await db.insert(chatMessages).values({
      sessionId: session.id,
      role: 'assistant',
      content: ESCALATION_MESSAGE,
      confidenceScore: confidence ? String(confidence) : null,
      escalated: true,
      escalationReason: reason,
      responseType: 'escalation',
      metadata: {
        page_context: pageContext,
        context_used: contextUsed,
      },
    });

    return {
      answer: ESCALATION_MESSAGE,
      confidence,
      escalated: true,
      escalation_reason: reason,
      session_id: sessionId,
      response_type: 'escalation',
      metadata: null,
      context_used: contextUsed,
    };
  }
}
