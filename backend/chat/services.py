import logging
import re
from typing import Any, Optional, Tuple
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
        4. Order intent check → proxy to WC API if matched
        5. RAG pipeline (stub) → evaluate confidence
        6. Save assistant message
        7. Return response dict with response_type for widget rendering
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
                "I'm not sure about this. Want me to connect you with the team?"
            )
            ChatMessage.objects.create(
                session=session,
                role="assistant",
                content=escalation_msg,
                escalated=True,
                escalation_reason="keyword_trigger",
                response_type="escalation",
            )
            return {
                "answer": escalation_msg,
                "confidence": None,
                "escalated": True,
                "escalation_reason": "keyword_trigger",
                "session_id": session_id,
                "response_type": "escalation",
                "metadata": None,
            }

        # 2. Order intent check (bypass RAG, proxy to WC)
        order_id = cls.detect_order_intent(message)
        if order_id:
            order_result = OrderService.get_order_status(store, order_id)
            if order_result["found"]:
                answer = f"Here's the status for order #{order_id}."
            else:
                answer = order_result["error"]

            ChatMessage.objects.create(
                session=session,
                role="assistant",
                content=answer,
                confidence_score=1.0 if order_result["found"] else None,
                response_type="order_card" if order_result["found"] else "text",
                metadata=order_result if order_result["found"] else None,
            )
            return {
                "answer": answer,
                "confidence": 1.0 if order_result["found"] else None,
                "escalated": False,
                "escalation_reason": None,
                "session_id": session_id,
                "response_type": "order_card" if order_result["found"] else "text",
                "metadata": order_result if order_result["found"] else None,
            }

        # 3. RAG pipeline (STUB for PoC)
        answer, confidence, product_data = cls._rag_query_stub(
            store, message, session
        )

        # 4. Evaluate confidence
        if confidence < CONFIDENCE_THRESHOLD:
            escalation_msg = (
                "I'm not sure about this. Want me to connect you with the team?"
            )
            ChatMessage.objects.create(
                session=session,
                role="assistant",
                content=escalation_msg,
                confidence_score=confidence,
                escalated=True,
                escalation_reason="low_confidence",
                response_type="escalation",
            )
            return {
                "answer": escalation_msg,
                "confidence": confidence,
                "escalated": True,
                "escalation_reason": "low_confidence",
                "session_id": session_id,
                "response_type": "escalation",
                "metadata": None,
            }

        # 5. Normal response — determine if product card should render
        response_type = "product_card" if product_data else "text"

        ChatMessage.objects.create(
            session=session,
            role="assistant",
            content=answer,
            confidence_score=confidence,
            response_type=response_type,
            metadata=product_data,
        )
        return {
            "answer": answer,
            "confidence": confidence,
            "escalated": False,
            "escalation_reason": None,
            "session_id": session_id,
            "response_type": response_type,
            "metadata": product_data,
        }

    @staticmethod
    def _rag_query_stub(
        store: Store, message: str, session: ChatSession
    ) -> Tuple[str, float, Optional[dict[str, Any]]]:
        """
        STUB: Simulates the RAG pipeline.
        In production, this will:
        1. Embed the query via Claude Haiku
        2. Search pgvector via LlamaIndex (top-k=5)
        3. Build prompt with context + conversation history
        4. Call Claude Haiku for generation
        5. Return (answer, confidence_score, product_metadata_or_none)

        For PoC validation, returns a canned response with product data if available.
        """
        # For FE rendering tests, we'll return a hardcoded dummy product
        product_data = {
            "name": "Classic Navy Hoodie",
            "price": "34.99",
            "stock_status": "instock",
            "stock_quantity": 5,
            "wc_url": "https://example.com/product/123",
            "image_url": "https://placehold.co/400x300/e2e8f0/475569?text=Hoodie",
        }
        return (
            "Yes! Here's what I found:",
            0.85,
            product_data,
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
            "error": (
                f"I couldn't find order #{order_id}. "
                f"Please check your order number."
            ),
        }
