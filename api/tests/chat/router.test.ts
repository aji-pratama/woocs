import { describe, it, expect } from 'vitest';
import { RouterService } from '../../src/services/router';
import { ESCALATION_KEYWORDS } from '../../src/services/chat';

describe('RouterService', () => {
  it('should detect escalation keywords', () => {
    // Pick one keyword from the actual list to test
    const keyword = ESCALATION_KEYWORDS[0];
    const message = `I want to speak to a ${keyword} please`;
    const route = RouterService.routeMessage(message);
    
    expect(route.intent).toBe('escalation');
    expect(route.reason).toBe('keyword_trigger');
  });

  it('should detect order intent with hash symbol', () => {
    const route = RouterService.routeMessage('where is order #9912?');
    expect(route.intent).toBe('order_status');
    expect(route.payload).toBe('9912');
  });

  it('should detect order intent with the word order', () => {
    const route = RouterService.routeMessage('please check order 4567 for me');
    expect(route.intent).toBe('order_status');
    expect(route.payload).toBe('4567');
  });

  it('should detect quick reply: check my order', () => {
    const route = RouterService.routeMessage('Check my order');
    expect(route.intent).toBe('quick_reply');
    expect(route.payload).toBe('check_order_prompt');
  });

  it('should detect quick reply: returns & refunds', () => {
    const route = RouterService.routeMessage(' Returns & Refunds ');
    expect(route.intent).toBe('quick_reply');
    expect(route.payload).toBe('returns_prompt');
  });

  it('should route normal queries to RAG', () => {
    const route = RouterService.routeMessage('what materials are your shirts made of?');
    expect(route.intent).toBe('rag');
    expect(route.payload).toBeUndefined();
  });
});
