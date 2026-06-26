import pytest

from store.models import FAQ, Product, Store
from store.tasks import ingest_catalog


@pytest.mark.django_db
class TestTasks:
    def test_ingest_catalog_success(self, mocker):
        store = Store.objects.create(api_key_hash="hash", wc_url="https://test.com")

        # Create some items without embeddings
        Product.objects.create(store=store, wc_id=1, name="Test Product")
        FAQ.objects.create(store=store, question="Test Q", answer="Test A")

        # Mock time.sleep to avoid waiting during tests
        mocker.patch("time.sleep", return_value=None)

        assert store.last_synced_at is None

        result = ingest_catalog(store.id)

        assert result["status"] == "completed"
        assert result["products"] == 1
        assert result["faqs"] == 1

        # Refresh from db
        store.refresh_from_db()
        assert store.last_synced_at is not None

    def test_ingest_catalog_store_not_found(self):
        import uuid

        result = ingest_catalog(uuid.uuid4())

        assert result["status"] == "error"
        assert result["message"] == "Store not found"
