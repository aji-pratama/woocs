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
        page_context: Optional[Any] = None,
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
                metadata={
                    "page_context": page_context.dict() if page_context else None,
                    "context_used": "keyword_trigger",
                },
            )
            return {
                "answer": escalation_msg,
                "confidence": None,
                "escalated": True,
                "escalation_reason": "keyword_trigger",
                "session_id": session_id,
                "response_type": "escalation",
                "metadata": None,
                "context_used": "keyword_trigger",
            }

        # 2. Order intent check (bypass RAG, proxy to WC)
        order_id = cls.detect_order_intent(message)
        if order_id:
            order_result = OrderService.get_order_status(store, order_id)
            if order_result["found"]:
                answer = f"Here's the status for order #{order_id}."
            else:
                answer = order_result["error"]

            metadata_dict = order_result if order_result["found"] else {}
            metadata_dict.update({
                "page_context": page_context.dict() if page_context else None,
                "context_used": "order_lookup",
            })
            
            ChatMessage.objects.create(
                session=session,
                role="assistant",
                content=answer,
                confidence_score=1.0 if order_result["found"] else None,
                response_type="order_card" if order_result["found"] else "text",
                metadata=metadata_dict,
            )
            return {
                "answer": answer,
                "confidence": 1.0 if order_result["found"] else None,
                "escalated": False,
                "escalation_reason": None,
                "session_id": session_id,
                "response_type": "order_card" if order_result["found"] else "text",
                "metadata": order_result if order_result["found"] else None,
                "context_used": "order_lookup",
            }

        # 3. RAG pipeline (STUB for PoC)
        answer, confidence, product_data, context_used = cls._rag_query_stub(
            store, message, session, page_context
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
                metadata={
                    "page_context": page_context.dict() if page_context else None,
                    "context_used": context_used,
                },
            )
            return {
                "answer": escalation_msg,
                "confidence": confidence,
                "escalated": True,
                "escalation_reason": "low_confidence",
                "session_id": session_id,
                "response_type": "escalation",
                "metadata": None,
                "context_used": context_used,
            }

        # 5. Normal response — determine if product card should render
        response_type = "product_card" if product_data else "text"

        metadata_dict = product_data.copy() if product_data else {}
        metadata_dict.update({
            "page_context": page_context.dict() if page_context else None,
            "context_used": context_used,
        })
        
        ChatMessage.objects.create(
            session=session,
            role="assistant",
            content=answer,
            confidence_score=confidence,
            response_type=response_type,
            metadata=metadata_dict,
        )
        return {
            "answer": answer,
            "confidence": confidence,
            "escalated": False,
            "escalation_reason": None,
            "session_id": session_id,
            "response_type": response_type,
            "metadata": product_data,
            "context_used": context_used,
        }

    @staticmethod
    def _rag_query_stub(
        store: Store, message: str, session: ChatSession, page_context: Optional[Any] = None
    ) -> Tuple[str, float, Optional[dict[str, Any]], str]:
        """
        PoC RAG pipeline using pgvector CosineDistance.
        Since we are using a dummy Anthropic API key, we bypass LlamaIndex/LLM calls
        and directly query pgvector using the deterministic pseudo-embedding, then
        format a deterministic response based on the top product.
        """
        try:
            from pgvector.django import CosineDistance
            from store.tasks import generate_pseudo_embedding
            from store.models import Product
            
            context_used = "retrieval"
            primary_product = None
            
            # Check for page_context product
            if page_context and page_context.product_id:
                primary_product = Product.objects.filter(
                    store=store,
                    wc_id=page_context.product_id
                ).first()
            
            # 1. Embed the query
            query_embedding = generate_pseudo_embedding(message)
            
            # 2. Search pgvector (Products)
            top_products = list(
                store.products.filter(embedding__isnull=False)
                .order_by(CosineDistance("embedding", query_embedding))[:3]
            )
            
            # Determine if the user's message is context-aware or off-topic
            # For the PoC, we will check if the message has generic words or the product name
            is_on_topic = False
            if primary_product:
                msg_lower = message.lower()
                generic_keywords = ["this", "it", "size", "stock", "color", "price", "how much"]
                if any(kw in msg_lower for kw in generic_keywords) or primary_product.name.lower() in msg_lower:
                    is_on_topic = True
            
            # If we have a primary_product AND the message is on-topic, prioritize it
            if primary_product and is_on_topic:
                best_product = primary_product
                confidence = 0.95  # High confidence since they are looking at it
                context_used = "page_context"
                
                answer = f"Since you are viewing the {best_product.name}, I can tell you it's currently {best_product.stock_status.replace('instock', 'in stock')} at ${best_product.price}."
                if best_product.description:
                    answer += f" {best_product.description[:100]}..."
            elif top_products:
                best_product = top_products[0]
                confidence = 0.85
                context_used = "retrieval"
                
                answer = f"I found the {best_product.name} in our catalog! It's currently {best_product.stock_status.replace('instock', 'in stock')} at ${best_product.price}."
                if best_product.description:
                    answer += f" {best_product.description[:100]}..."
            else:
                return (
                    "I couldn't find any relevant products in the catalog.",
                    0.4,
                    None,
                    "retrieval"
                )
                
            product_data = {
                "name": best_product.name,
                "price": str(best_product.price),
                "stock_status": best_product.stock_status,
                "stock_quantity": best_product.stock_quantity,
                "wc_url": f"{store.wc_url}/?p={best_product.wc_id}",
                "image_url": "https://placehold.co/400x300/e2e8f0/475569?text=Product",
            }
            return (answer, confidence, product_data, context_used)

        except Exception as e:
            logger.error(f"RAG query failed: {e}")
            return (
                "Sorry, I'm having trouble searching the catalog right now.",
                0.1,
                None,
                "error",
            )


class OrderService:
    """Proxies order status requests to WooCommerce REST API."""

    @staticmethod
    def get_order_status(store: Store, order_id: str) -> dict:
        """
        Fetches order status from WooCommerce REST API.
        """
        import requests
        from requests.auth import HTTPBasicAuth

        if not store.wc_url or not store.wc_consumer_key or not store.wc_consumer_secret:
            logger.warning(f"Store {store.id} missing WooCommerce credentials for order lookup")
            return {
                "order_id": order_id,
                "found": False,
                "status": None,
                "items": [],
                "total": None,
                "error": "Store configuration is incomplete. I cannot check order status right now.",
            }

        try:
            url = f"{store.wc_url.rstrip('/')}/wp-json/wc/v3/orders/{order_id}"
            response = requests.get(
                url,
                auth=HTTPBasicAuth(store.wc_consumer_key, store.wc_consumer_secret),
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                items = [f"{item.get('name', 'Product')} ×{item.get('quantity', 1)}" for item in data.get('line_items', [])]
                status_raw = data.get('status', 'unknown')
                
                return {
                    "order_id": order_id,
                    "status": WC_STATUS_MAP.get(status_raw, status_raw.capitalize()),
                    "items": items,
                    "total": str(data.get('total', '0.00')),
                    "found": True,
                    "error": None,
                }
            elif response.status_code == 404:
                return {
                    "order_id": order_id,
                    "found": False,
                    "status": None,
                    "items": [],
                    "total": None,
                    "error": f"I couldn't find order #{order_id}. Please check your order number.",
                }
            else:
                logger.error(f"WC REST API returned {response.status_code} for order {order_id}")
                return {
                    "order_id": order_id,
                    "found": False,
                    "status": None,
                    "items": [],
                    "total": None,
                    "error": "I couldn't fetch your order status at the moment. Please try again later.",
                }

        except Exception as e:
            logger.error(f"Error fetching order {order_id} for store {store.id}: {e}")
            return {
                "order_id": order_id,
                "found": False,
                "status": None,
                "items": [],
                "total": None,
                "error": "An error occurred while checking your order. Please try again later.",
            }
