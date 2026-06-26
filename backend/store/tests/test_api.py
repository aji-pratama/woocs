import pytest
from ninja.testing import TestClient

from store.api import router
from store.models import Store
from store.services import StoreService


@pytest.fixture
def api_client():
    return TestClient(router)


@pytest.fixture
def store_and_key():
    store, raw_key, _ = StoreService.register_or_update_store(wc_url="https://test.com")
    return store, raw_key


@pytest.mark.django_db
class TestStoreAPI:
    def test_register_store(self, api_client):
        response = api_client.post("/register/", json={"wc_url": "https://test.com"})
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert "store_id" in data
        assert "api_key" in data

    def test_register_store_existing_key(self, api_client, store_and_key):
        store, raw_key = store_and_key
        response = api_client.post(
            "/register/", json={"wc_url": "https://new-test.com", "api_key": raw_key}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert data["store_name"] == "new-test.com"
        assert data["api_key"] is None  # Should not return key again

    def test_sync_unauthorized(self, api_client):
        response = api_client.post("/sync/", json={"products": [], "faqs": []})
        assert response.status_code == 401

    def test_sync_authorized(self, api_client, store_and_key, mocker):
        # Mock the celery task delay so we don't actually queue it during tests
        mock_delay = mocker.patch("store.api.ingest_catalog.delay")
        mock_delay.return_value.id = "fake-task-id"

        store, raw_key = store_and_key
        headers = {"X-API-Key": raw_key}

        payload = {
            "products": [{"wc_id": 1, "name": "Test", "price": 10.0}],
            "faqs": [],
        }

        response = api_client.post("/sync/", json=payload, headers=headers)
        assert response.status_code == 202
        assert response.json()["status"] == "processing"

        mock_delay.assert_called_once_with(store.id)

    def test_sync_status(self, api_client, store_and_key):
        store, raw_key = store_and_key
        headers = {"X-API-Key": raw_key}

        response = api_client.get("/sync/status/", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["products_count"] == 0
        assert data["status"] == "pending"
