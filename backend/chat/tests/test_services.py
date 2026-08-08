import uuid

import pytest

from chat.models import ChatMessage, ChatSession
from chat.services import ChatService, OrderService, RagResult
from store.models import Store


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
        assert result["response_type"] == "escalation"
        assert result["session_id"] == self.session_id

        # Should have 2 messages: user + assistant escalation
        session = ChatSession.objects.get(store=self.store, session_id=self.session_id)
        assert session.messages.count() == 2

    def test_handle_message_normal_with_products(self, mocker):
        mocker.patch(
            "chat.services.chat_service.RagService.query",
            return_value=RagResult(
                answer="Test Product is available.",
                confidence=0.9,
                product_data={"name": "Test Product"},
                context_used="retrieval",
            ),
        )

        result = ChatService.handle_message(
            store=self.store,
            session_id=self.session_id,
            message="Do you have blue hoodie?",
        )
        assert result["escalated"] is False
        assert result["confidence"] >= 0.65
        assert result["answer"] is not None
        assert result["response_type"] == "product_card"
        assert result["metadata"] is not None
        assert result["metadata"]["name"] == "Test Product"

    def test_handle_message_low_confidence_no_products(self, mocker):
        mocker.patch(
            "chat.services.chat_service.RagService.query",
            return_value=RagResult(
                answer="No relevant context.",
                confidence=0.2,
                product_data=None,
                context_used="retrieval",
            ),
        )
        result = ChatService.handle_message(
            store=self.store,
            session_id=self.session_id,
            message="Tell me about your products",
        )
        assert result["escalated"] is True
        assert result["escalation_reason"] == "low_confidence"
        assert result["response_type"] == "escalation"

    def test_handle_message_order_intent(self, mocker):
        mocker.patch(
            "chat.services.chat_service.OrderService.get_order_status",
            return_value={
                "order_id": "4821",
                "status": "Processing your order",
                "items": [],
                "total": "10.00",
                "found": True,
                "error": None,
            },
        )
        result = ChatService.handle_message(
            store=self.store,
            session_id=self.session_id,
            message="Where is my order #4821?",
        )
        assert result["escalated"] is False
        assert result["response_type"] == "order_card"
        assert result["metadata"] is not None
        assert result["metadata"]["order_id"] == "4821"

    def test_handle_message_order_not_found(self, mocker):
        mocker.patch(
            "chat.services.chat_service.OrderService.get_order_status",
            return_value={
                "order_id": "99999",
                "status": None,
                "items": [],
                "total": None,
                "found": False,
                "error": "Order not found.",
            },
        )
        result = ChatService.handle_message(
            store=self.store,
            session_id=self.session_id,
            message="Where is my order #99999?",
        )
        assert result["escalated"] is False
        assert result["response_type"] == "text"
        assert result["metadata"] is None


@pytest.mark.django_db
class TestOrderService:
    def setup_method(self):
        self.store = Store.objects.create(
            api_key_hash="hash",
            wc_url="https://test.com",
            wc_consumer_key="key",
            wc_consumer_secret="secret",
        )

    def test_order_found(self, mocker):
        response = mocker.Mock(status_code=200)
        response.json.return_value = {
            "status": "processing",
            "line_items": [{"name": "Hoodie", "quantity": 1}],
            "total": "34.99",
        }
        mocker.patch("chat.services.order_service.requests.get", return_value=response)
        result = OrderService.get_order_status(self.store, "1234")
        assert result["found"] is True
        assert result["order_id"] == "1234"
        assert result["status"] is not None

    def test_order_not_found(self, mocker):
        mocker.patch(
            "chat.services.order_service.requests.get",
            return_value=mocker.Mock(status_code=404),
        )
        result = OrderService.get_order_status(self.store, "99999")
        assert result["found"] is False
        assert result["error"] is not None
