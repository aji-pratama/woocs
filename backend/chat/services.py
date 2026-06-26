import logging
import re
from typing import Optional, Tuple
from uuid import UUID

from store.models import Store

from .models import ChatMessage, ChatSession

logger = logging.getLogger(__name__)

# Hardcoded keyword triggers that bypass RAG entirely (PRD Section 5.2)
ESCALATION_KEYWORDS = ["refund", "damage", "broken", "lawsuit"]

# Confidence threshold below which escalation is triggered (PRD Section 5.2)
CONFIDENCE_THRESHOLD = 0.65

# WC status → customer-facing label mapping (PRD Section 15, C-06)
WC_STATUS_MAP = {
    "pending": "Payment pending",
    "processing": "Processing your order",
    "on-hold": "On hold",
    "completed": "Delivered",
    "cancelled": "Cancelled",
    "refunded": "Refunded",
    "failed": "Payment failed",
}


class ChatService:
    """Orchestrates the full chat flow: keyword check → RAG → confidence evaluation."""

    @staticmethod
    def get_or_create_session(store: Store, session_id: UUID) -> ChatSession:
        """Get or create a ChatSession for the given store and widget session_id."""
        session, _ = ChatSession.objects.get_or_create(
            store=store,
            session_id=session_id,
        )
        return session

    @staticmethod
    def check_keywords(message: str) -> bool:
        """Returns True if the message contains any escalation keywords."""
        message_lower = message.lower()
        return any(keyword in message_lower for keyword in ESCALATION_KEYWORDS)

    @staticmethod
    def detect_order_intent(message: str) -> Optional[str]:
        """
        Detects order status intent and extracts order ID.
        Returns order_id string if found, else None.
        """
        # Match patterns like "#1234" or "order 1234"
        match = re.search(r"#(\d+)", message) or re.search(
            r"order\s+(\d+)", message, re.IGNORECASE
        )
        if match:
            return match.group(1)
        return None

    @classmethod
    def handle_message(
        cls,
        store: Store,
        session_id: UUID,
        message: str,
    ) -> dict:
        """
        Full chat flow:
        1. Get or create session
        2. Save user message
        3. Keyword check → escalate immediately if matched
        4. RAG pipeline (stub) → evaluate confidence
        5. Save assistant message
        6. Return response dict
        """
        session = cls.get_or_create_session(store, session_id)

        # Save user message
        ChatMessage.objects.create(
            session=session,
            role="user",
            content=message,
        )

        # 1. Keyword check (bypass RAG entirely)
        if cls.check_keywords(message):
            escalation_msg = (
                "I'm not sure about this. " "Want me to connect you with the team?"
            )
            ChatMessage.objects.create(
                session=session,
                role="assistant",
                content=escalation_msg,
                escalated=True,
                escalation_reason="keyword_trigger",
            )
            return {
                "answer": escalation_msg,
                "confidence": None,
                "escalated": True,
                "escalation_reason": "keyword_trigger",
                "session_id": session_id,
            }

        # 2. RAG pipeline (STUB for PoC)
        answer, confidence = cls._rag_query_stub(store, message, session)

        # 3. Evaluate confidence
        if confidence < CONFIDENCE_THRESHOLD:
            escalation_msg = (
                "I'm not sure about this. " "Want me to connect you with the team?"
            )
            ChatMessage.objects.create(
                session=session,
                role="assistant",
                content=escalation_msg,
                confidence_score=confidence,
                escalated=True,
                escalation_reason="low_confidence",
            )
            return {
                "answer": escalation_msg,
                "confidence": confidence,
                "escalated": True,
                "escalation_reason": "low_confidence",
                "session_id": session_id,
            }

        # 4. Normal response
        ChatMessage.objects.create(
            session=session,
            role="assistant",
            content=answer,
            confidence_score=confidence,
        )
        return {
            "answer": answer,
            "confidence": confidence,
            "escalated": False,
            "escalation_reason": None,
            "session_id": session_id,
        }

    @staticmethod
    def _rag_query_stub(
        store: Store, message: str, session: ChatSession
    ) -> Tuple[str, float]:
        """
        STUB: Simulates the RAG pipeline.
        In production, this will:
        1. Embed the query via Claude Haiku
        2. Search pgvector via LlamaIndex (top-k=5)
        3. Build prompt with context + conversation history
        4. Call Claude Haiku for generation
        5. Return (answer, confidence_score)

        For PoC validation, returns a canned response with high confidence.
        """
        # TODO: Replace with real LlamaIndex + Anthropic integration
        logger.info(f"[STUB] RAG query for store {store.id}: '{message[:50]}...'")

        # Check if there are any products in the store to give a slightly
        # more realistic stub response
        product_count = store.products.count()
        if product_count > 0:
            return (
                f"Based on our catalog of {product_count} products, "
                f"I can help you with that! "
                f"(This is a stub response — real RAG pipeline coming soon.)",
                0.85,
            )
        else:
            return (
                "I don't have enough information to answer that right now. "
                "(This is a stub response — real RAG pipeline coming soon.)",
                0.50,
            )


class OrderService:
    """Proxies order status requests to WooCommerce REST API."""

    @staticmethod
    def get_order_status(store: Store, order_id: str) -> dict:
        """
        Fetches order status from WooCommerce REST API.

        STUB for PoC: Returns a simulated order response.
        In production, this will use store.wc_consumer_key and
        store.wc_consumer_secret to call WC REST API.
        """
        # TODO: Replace with real WooCommerce REST API call
        # Real implementation would be:
        # response = requests.get(
        #     f"{store.wc_url}/wp-json/wc/v3/orders/{order_id}",
        #     auth=(store.wc_consumer_key, store.wc_consumer_secret)
        # )

        logger.info(
            f"[STUB] Order status lookup for store {store.id}, order #{order_id}"
        )

        # Simulate: if order_id is numeric and < 10000, pretend it exists
        try:
            oid = int(order_id)
            if oid < 10000:
                return {
                    "order_id": order_id,
                    "status": WC_STATUS_MAP.get("processing", "Unknown"),
                    "items": ["Sample Product ×1"],
                    "total": "49.99",
                    "found": True,
                    "error": None,
                }
        except ValueError:
            pass

        return {
            "order_id": order_id,
            "found": False,
            "status": None,
            "items": [],
            "total": None,
            "error": f"I couldn't find order #{order_id}. "
            f"Please check your order number.",
        }
