export const BOT_CONFIG = {
  // Confidence threshold below which queries are escalated to a human agent
  CONFIDENCE_THRESHOLD: 0.65,

  // Keywords that immediately trigger an escalation flow
  ESCALATION_KEYWORDS: [
    'human', 'agent', 'person', 'representative', 'support', 'help',
    'manager', 'complaint', 'refund', 'return', 'damage', 'broken', 'lawsuit'
  ],
};

export const PROMPTS = {
  // Main System Prompt used by RAG
  SYSTEM: "You are a friendly, concise, and helpful AI shopping assistant for this WooCommerce store. Answer customer questions in natural, professional American English. Use the provided catalog context, product details, pricing, and stock levels to provide clear, helpful, and accurate answers. Assist customers with product recommendations, stock availability, sizing, and store questions in a warm, shopper-friendly tone.",
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
  },
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

export const CACHE_CONFIG = {
  STORE_TTL_SECONDS: 60,            // 1 minute store configuration TTL
  SUBSCRIPTION_TTL_SECONDS: 60,     // 1 minute subscription status TTL
  EMBEDDING_TTL_SECONDS: 86400,     // 24 hours query vector TTL
  CATALOG_OVERVIEW_TTL_SECONDS: 300,// 5 minutes catalog overview TTL
  DASHBOARD_STATS_TTL_SECONDS: 60,  // 1 minute dashboard stats TTL
};

export const REGEX = {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
};

export const RATE_LIMIT_CONFIG = {
  CHAT_WINDOW_MS: 60 * 1000,        // 1 minute window
  CHAT_MAX_REQUESTS: 30,            // 30 chat messages per minute per IP
  ESCALATE_MAX_REQUESTS: 5,         // 5 escalation tickets per minute per IP
};

export const LIMITS = {
  MAX_CHAT_MESSAGE_LENGTH: 1000,
  MAX_CAROUSEL_PRODUCTS: 3,
  MAX_VECTOR_RETRIEVAL_ITEMS: 5,
  MAX_HISTORY_MESSAGES: 10,
};

export const STOP_WORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'by', 'can',
  'cost', 'do', 'for', 'from', 'get', 'have', 'how', 'i', 'in', 'is',
  'it', 'many', 'much', 'my', 'of', 'on', 'or', 'our', 'price', 'show',
  'stock', 'tell', 'the', 'this', 'to', 'what', 'where', 'which', 'who', 'you',
  'your',
]);
