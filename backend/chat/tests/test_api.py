import uuid

import pytest
from ninja.testing import TestClient

from billing.models import Subscription
from chat.api import router
from chat.services import RagResult
from store.models import Product, Store
from store.services import StoreService


@pytest.fixture
def api_client():
    return TestClient(router)


@pytest.fixture
def store_with_products():
    store = Store.objects.create(
        api_key_hash="hash",
        wc_url="https://test.com",
        merchant_email="merchant@test.com",
    )
    Subscription.start_trial(store)
    Product.objects.create(store=store, wc_id=1, name="Blue Hoodie", price=34.99)
    return store


@pytest.mark.django_db
class TestChatAPI:
    def test_chat_normal_response(self, api_client, store_with_products, mocker):
        mocker.patch(
            "chat.services.chat_service.RagService.query",
            return_value=RagResult(
                answer="The Blue Hoodie is available.",
                confidence=0.9,
                product_data={"name": "Blue Hoodie"},
                context_used="retrieval",
            ),
        )
        response = api_client.post(
            "/chat/",
            json={
                "store_id": str(store_with_products.id),
                "session_id": str(uuid.uuid4()),
                "message": "Do you have blue hoodie?",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["escalated"] is False
        assert data["answer"] is not None
        assert "session_id" in data

    def test_chat_keyword_escalation(self, api_client, store_with_products, mocker):
        task = mocker.Mock()
        mocker.patch("chat.api.send_escalation_email", task)

        response = api_client.post(
            "/chat/",
            json={
                "store_id": str(store_with_products.id),
                "session_id": str(uuid.uuid4()),
                "message": "I want a refund",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["escalated"] is True
        assert data["escalation_reason"] == "keyword_trigger"
        task.enqueue.assert_called_once()

    def test_chat_invalid_store(self, api_client):
        response = api_client.post(
            "/chat/",
            json={
                "store_id": str(uuid.uuid4()),
                "session_id": str(uuid.uuid4()),
                "message": "Hello",
            },
        )
        assert response.status_code == 404

    def test_chat_is_denied_when_store_subscription_is_revoked(
        self, api_client, store_with_products
    ):
        subscription = store_with_products.subscription
        subscription.plan_key = "starter"
        subscription.status = Subscription.Status.REVOKED
        subscription.save(update_fields=["plan_key", "status"])

        response = api_client.post(
            "/chat/",
            json={
                "store_id": str(store_with_products.id),
                "session_id": str(uuid.uuid4()),
                "message": "Hello",
            },
        )

        assert response.status_code == 402

    def test_order_status_found(self, api_client, store_with_products, mocker):
        mocker.patch(
            "chat.api.OrderService.get_order_status",
            return_value={
                "order_id": "1234",
                "status": "Processing your order",
                "items": [],
                "total": "34.99",
                "found": True,
                "error": None,
            },
        )
        response = api_client.get(
            f"/order-status/?store_id={store_with_products.id}&order_id=1234"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["found"] is True
        assert data["order_id"] == "1234"

    def test_order_status_not_found(self, api_client, store_with_products, mocker):
        mocker.patch(
            "chat.api.OrderService.get_order_status",
            return_value={
                "order_id": "99999",
                "status": None,
                "items": [],
                "total": None,
                "found": False,
                "error": "Order not found.",
            },
        )
        response = api_client.get(
            f"/order-status/?store_id={store_with_products.id}&order_id=99999"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["found"] is False

    def test_order_status_invalid_store(self, api_client):
        response = api_client.get(
            f"/order-status/?store_id={uuid.uuid4()}&order_id=1234"
        )
        assert response.status_code == 404
