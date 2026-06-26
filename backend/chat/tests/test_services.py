import uuid

import pytest

from chat.models import ChatMessage, ChatSession
from chat.services import ESCALATION_KEYWORDS, ChatService, OrderService
from store.models import Product, Store


@pytest.mark.django_db
class TestChatService:
    def setup_method(self):
        self.store = Store.objects.create(
            api_key_hash="hash", wc_url="https://test.com"
        )
        self.session_id = uuid.uuid4()

    def test_get_or_create_session(self):
        session = ChatService.get_or_create_session(self.store, self.session_id)
        assert session is not None
        assert session.session_id == self.session_id

        # Calling again should return same session
        session2 = ChatService.get_or_create_session(self.store, self.session_id)
        assert session.id == session2.id

    def test_keyword_detection(self):
        assert ChatService.check_keywords("I want a refund") is True
        assert ChatService.check_keywords("This item is broken") is True
        assert ChatService.check_keywords("damaged product") is True
        assert ChatService.check_keywords("I will file a lawsuit") is True
        assert ChatService.check_keywords("Do you have blue hoodie?") is False

    def test_detect_order_intent(self):
        assert ChatService.detect_order_intent("Where is order #1234?") == "1234"
        assert ChatService.detect_order_intent("order 5678 status") == "5678"
        assert ChatService.detect_order_intent("Do you have blue hoodie?") is None

    def test_handle_message_keyword_escalation(self):
        result = ChatService.handle_message(
            store=self.store,
            session_id=self.session_id,
            message="I want a refund for this broken item",
        )
        assert result["escalated"] is True
        assert result["escalation_reason"] == "keyword_trigger"
        assert result["session_id"] == self.session_id

        # Should have 2 messages: user + assistant escalation
        session = ChatSession.objects.get(store=self.store, session_id=self.session_id)
        assert session.messages.count() == 2

    def test_handle_message_normal_with_products(self):
        # Create a product so the stub returns high confidence
        Product.objects.create(store=self.store, wc_id=1, name="Test Product")

        result = ChatService.handle_message(
            store=self.store,
            session_id=self.session_id,
            message="Do you have blue hoodie?",
        )
        assert result["escalated"] is False
        assert result["confidence"] >= 0.65
        assert result["answer"] is not None

    def test_handle_message_low_confidence_no_products(self):
        # No products → stub returns low confidence → escalation
        result = ChatService.handle_message(
            store=self.store,
            session_id=self.session_id,
            message="Tell me about your products",
        )
        assert result["escalated"] is True
        assert result["escalation_reason"] == "low_confidence"


@pytest.mark.django_db
class TestOrderService:
    def setup_method(self):
        self.store = Store.objects.create(
            api_key_hash="hash", wc_url="https://test.com"
        )

    def test_order_found(self):
        result = OrderService.get_order_status(self.store, "1234")
        assert result["found"] is True
        assert result["order_id"] == "1234"
        assert result["status"] is not None

    def test_order_not_found(self):
        result = OrderService.get_order_status(self.store, "99999")
        assert result["found"] is False
        assert result["error"] is not None
