export const BOT_CONFIG = {
  // Confidence threshold below which queries are escalated to a human agent
  CONFIDENCE_THRESHOLD: 0.65,

  // Keywords that immediately trigger an escalation flow
  ESCALATION_KEYWORDS: ['human', 'agent', 'person', 'representative', 'support', 'help', 'manager', 'complaint', 'refund', 'return', 'damage', 'broken', 'lawsuit'],
};

export const PROMPTS = {
  // Main System Prompt used by RAG
  SYSTEM: "You are a friendly, helpful, and concise AI customer support assistant for a WooCommerce online store. Answer customer questions clearly, politely, and accurately using the provided catalog context, product details, stock status, and store policies. If asked in Indonesian, reply in Indonesian. If asked in English, reply in English. Help customers find products, check stock, and answer general questions about the store. If context is provided, rely on it to give accurate answers.",
};

export const TEMPLATES = {
  // Escalation response when the bot cannot confidently answer
  ESCALATION_MESSAGE: "I'm not sure about this. Want me to connect you with the team?",

  // Static responses for quick reply intents
  QUICK_REPLIES: {
    CHECK_ORDER: "To check your order status, please provide your order number (for example: #12345).",
    RETURNS: "I can help with that. Could you provide your order number or let me know what item you'd like to return?",
    BROWSE: "Sure! What kind of products are you looking for today?",
  },

  // Order status message templates
  ORDER: {
    INCOMPLETE_CONFIG: "Store configuration is incomplete. I cannot check order status right now.",
    NOT_FOUND: "I couldn't find an order with that number. Could you double-check it?",
    STATUS_PREFIX: "Your order status is: ",
  }
};

export const WC_STATUS_MAP: Record<string, string> = {
  pending: 'Payment pending',
  processing: 'Processing your order',
  'on-hold': 'On hold',
  completed: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  failed: 'Payment failed',
};
