import uuid

import pytest
from ninja.testing import TestClient

from chat.api import router
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
    Product.objects.create(store=store, wc_id=1, name="Blue Hoodie", price=34.99)
    return store


@pytest.mark.django_db
class TestChatAPI:
    def test_chat_normal_response(self, api_client, store_with_products):
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
        # Mock celery task so we don't actually queue
        mocker.patch("chat.api.send_escalation_email.delay")

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

    def test_order_status_found(self, api_client, store_with_products):
        response = api_client.get(
            f"/order-status/?store_id={store_with_products.id}&order_id=1234"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["found"] is True
        assert data["order_id"] == "1234"

    def test_order_status_not_found(self, api_client, store_with_products):
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
