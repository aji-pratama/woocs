import re
from typing import Any
from uuid import UUID

from store.models import Store

from ..models import ChatMessage, ChatSession
from .order_service import OrderService
from .rag_service import RagService

ESCALATION_KEYWORDS = ("refund", "damage", "broken", "lawsuit")
CONFIDENCE_THRESHOLD = 0.65
ESCALATION_MESSAGE = "I'm not sure about this. Want me to connect you with the team?"


class ChatService:
    """Orchestrates keyword, order, retrieval, generation, and escalation flows."""

    @staticmethod
    def get_or_create_session(store: Store, session_id: UUID) -> ChatSession:
        session, _ = ChatSession.objects.get_or_create(
            store=store, session_id=session_id
        )
        return session

    @staticmethod
    def check_keywords(message: str) -> bool:
        message_lower = message.lower()
        return any(keyword in message_lower for keyword in ESCALATION_KEYWORDS)

    @staticmethod
    def detect_order_intent(message: str) -> str | None:
        match = re.search(r"#(\d+)", message) or re.search(
            r"order\s+(\d+)", message, re.IGNORECASE
        )
        return match.group(1) if match else None

    @classmethod
    def handle_message(
        cls,
        store: Store,
        session_id: UUID,
        message: str,
        page_context: Any | None = None,
    ) -> dict[str, Any]:
        session = cls.get_or_create_session(store, session_id)
        ChatMessage.objects.create(session=session, role="user", content=message)

        if cls.check_keywords(message):
            return cls._save_escalation(
                session=session,
                session_id=session_id,
                confidence=None,
                reason="keyword_trigger",
                context_used="keyword_trigger",
                page_context=page_context,
            )

        order_id = cls.detect_order_intent(message)
        if order_id:
            return cls._handle_order(session, session_id, store, order_id, page_context)

        result = RagService.query(
            store=store,
            message=message,
            session=session,
            page_context=page_context,
        )
        if result.confidence < CONFIDENCE_THRESHOLD:
            return cls._save_escalation(
                session=session,
                session_id=session_id,
                confidence=result.confidence,
                reason="low_confidence",
                context_used=result.context_used,
                page_context=page_context,
            )

        response_type = "product_card" if result.product_data else "text"
        metadata = dict(result.product_data or {})
        metadata.update(
            {
                "page_context": cls._serialize_page_context(page_context),
                "context_used": result.context_used,
            }
        )
        ChatMessage.objects.create(
            session=session,
            role="assistant",
            content=result.answer,
            confidence_score=result.confidence,
            response_type=response_type,
            metadata=metadata,
        )
        return {
            "answer": result.answer,
            "confidence": result.confidence,
            "escalated": False,
            "escalation_reason": None,
            "session_id": session_id,
            "response_type": response_type,
            "metadata": result.product_data,
            "context_used": result.context_used,
        }

    @classmethod
    def _handle_order(
        cls,
        session: ChatSession,
        session_id: UUID,
        store: Store,
        order_id: str,
        page_context: Any | None,
    ) -> dict[str, Any]:
        result = OrderService.get_order_status(store, order_id)
        found = bool(result["found"])
        answer = (
            f"Here's the status for order #{order_id}."
            if found
            else str(result["error"])
        )
        metadata = dict(result) if found else {}
        metadata.update(
            {
                "page_context": cls._serialize_page_context(page_context),
                "context_used": "order_lookup",
            }
        )
        ChatMessage.objects.create(
            session=session,
            role="assistant",
            content=answer,
            confidence_score=1.0 if found else None,
            response_type="order_card" if found else "text",
            metadata=metadata,
        )
        return {
            "answer": answer,
            "confidence": 1.0 if found else None,
            "escalated": False,
            "escalation_reason": None,
            "session_id": session_id,
            "response_type": "order_card" if found else "text",
            "metadata": result if found else None,
            "context_used": "order_lookup",
        }

    @classmethod
    def _save_escalation(
        cls,
        *,
        session: ChatSession,
        session_id: UUID,
        confidence: float | None,
        reason: str,
        context_used: str,
        page_context: Any | None,
    ) -> dict[str, Any]:
        ChatMessage.objects.create(
            session=session,
            role="assistant",
            content=ESCALATION_MESSAGE,
            confidence_score=confidence,
            escalated=True,
            escalation_reason=reason,
            response_type="escalation",
            metadata={
                "page_context": cls._serialize_page_context(page_context),
                "context_used": context_used,
            },
        )
        return {
            "answer": ESCALATION_MESSAGE,
            "confidence": confidence,
            "escalated": True,
            "escalation_reason": reason,
            "session_id": session_id,
            "response_type": "escalation",
            "metadata": None,
            "context_used": context_used,
        }

    @staticmethod
    def _serialize_page_context(page_context: Any | None) -> dict[str, Any] | None:
        if page_context is None:
            return None
        if hasattr(page_context, "model_dump"):
            return page_context.model_dump()
        if hasattr(page_context, "dict"):
            return page_context.dict()
        return None
