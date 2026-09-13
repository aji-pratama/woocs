import { db } from '../db/client';
import { stores } from '../db/schema/stores';
import { chatMessages, chatSessions } from '../db/schema/chat';
import { eq } from 'drizzle-orm';
import { InferSelectModel } from 'drizzle-orm';
import { OrderService } from './order';
import { RagService } from './rag';
import { RouterService } from './router';

type Store = InferSelectModel<typeof stores>;
type ChatSession = InferSelectModel<typeof chatSessions>;

import { BOT_CONFIG, TEMPLATES } from '../config/constants';

export const ESCALATION_KEYWORDS = BOT_CONFIG.ESCALATION_KEYWORDS;

export class ChatService {
  static async getOrCreateSession(storeId: string, sessionId: string): Promise<ChatSession> {
    const existing = await db.select().from(chatSessions).where(eq(chatSessions.sessionId, sessionId));
    if (existing.length > 0) {
      return existing[0];
    }
    const [newSession] = await db.insert(chatSessions).values({ sessionId, storeId }).returning();
    return newSession;
  }



  static async handleMessage(store: Store, sessionId: string, message: string, pageContext: any = null, widgetConfig: any = null) {
    const session = await this.getOrCreateSession(store.id, sessionId);
    
    // Save user message
    await db.insert(chatMessages).values({
      sessionId: session.id,
      role: 'user',
      content: message,
    });

    const route = RouterService.routeMessage(message);

    if (route.intent === 'escalation') {
      return this._saveEscalation(session, sessionId, null, route.reason || 'keyword_trigger', 'keyword_trigger', pageContext);
    }

    if (route.intent === 'order_status' && route.payload) {
      return this._handleOrder(session, sessionId, store, route.payload, pageContext);
    }

    if (route.intent === 'quick_reply' && route.payload) {
      let text = '';
      if (route.payload === 'check_order_prompt') text = TEMPLATES.QUICK_REPLIES.CHECK_ORDER;
      if (route.payload === 'returns_prompt') text = TEMPLATES.QUICK_REPLIES.RETURNS;
      if (route.payload === 'browse_prompt') text = TEMPLATES.QUICK_REPLIES.BROWSE;
      
      return this._saveStaticResponse(session, sessionId, text, pageContext);
    }

    const result = await RagService.query(store, message, session, pageContext);

    if (result.confidence < BOT_CONFIG.CONFIDENCE_THRESHOLD) {
      return this._saveEscalation(session, sessionId, result.confidence, 'low_confidence', result.contextUsed, pageContext);
    }

    let responseType = 'text';
    let metadata: any = {
      page_context: pageContext,
      context_used: result.contextUsed,
    };

    if (result.products.length > 0) {
      if (widgetConfig?.enable_carousel && result.products.length > 1) {
        responseType = 'product_carousel';
        metadata.products = result.products;
      } else {
        responseType = 'product_card';
        // For backwards compatibility or single product, we just merge it into metadata root
        Object.assign(metadata, result.products[0]);
      }
    }

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
      metadata: responseType !== 'text' ? metadata : null,
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
      content: TEMPLATES.ESCALATION_MESSAGE,
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
      answer: TEMPLATES.ESCALATION_MESSAGE,
      confidence,
      escalated: true,
      escalation_reason: reason,
      session_id: sessionId,
      response_type: 'escalation',
      metadata: null,
      context_used: contextUsed,
    };
  }

  private static async _saveStaticResponse(session: ChatSession, sessionId: string, answer: string, pageContext: any) {
    await db.insert(chatMessages).values({
      sessionId: session.id,
      role: 'assistant',
      content: answer,
      confidenceScore: '1.0',
      responseType: 'text',
      metadata: {
        page_context: pageContext,
        context_used: 'quick_reply_rule',
      },
    });

    return {
      answer,
      confidence: 1.0,
      escalated: false,
      escalation_reason: null,
      session_id: sessionId,
      response_type: 'text',
      metadata: null,
      context_used: 'quick_reply_rule',
    };
  }
}
