import { ESCALATION_KEYWORDS } from './chat';

export interface RouteIntent {
  intent: 'escalation' | 'order_status' | 'quick_reply' | 'rag';
  payload?: string;
  reason?: string;
}

export class RouterService {
  /**
   * Evaluates the incoming message and routes it to the appropriate sub-system.
   * This is a fast, rule-based pre-routing layer that runs before any LLM calls.
   */
  static routeMessage(message: string): RouteIntent {
    const quickReply = this._detectQuickReplyIntent(message);
    if (quickReply) {
      return { intent: 'quick_reply', payload: quickReply };
    }

    if (this._isEscalation(message)) {
      return { intent: 'escalation', reason: 'keyword_trigger' };
    }

    const orderId = this._detectOrderIntent(message);
    if (orderId) {
      return { intent: 'order_status', payload: orderId };
    }

    return { intent: 'rag' };
  }

  private static _isEscalation(message: string): boolean {
    const lower = message.toLowerCase();
    return ESCALATION_KEYWORDS.some(keyword => lower.includes(keyword));
  }

  private static _detectOrderIntent(message: string): string | null {
    const hashMatch = message.match(/#(\d+)/);
    if (hashMatch) return hashMatch[1];
    const orderMatch = message.match(/order\s+(\d+)/i);
    if (orderMatch) return orderMatch[1];
    return null;
  }

  private static _detectQuickReplyIntent(message: string): string | null {
    const lower = message.toLowerCase().trim();
    if (lower === 'check my order') return 'check_order_prompt';
    if (lower === 'returns & refunds' || lower === 'return policy') return 'returns_prompt';
    if (lower === 'browse products') return 'browse_prompt';
    return null;
  }
}
