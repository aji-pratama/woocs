import pytest

from store.models import FAQ, Product, ProductVariation, Store
from store.schemas import FAQIn, ProductIn, SyncRequestIn, VariationIn
from store.services import StoreService, SyncService


@pytest.mark.django_db
class TestStoreService:
    def test_generate_api_key(self):
        key = StoreService.generate_api_key()
        assert len(key) == 48

    def test_hash_api_key(self):
        key = "test_key"
        hash_val = StoreService.hash_api_key(key)
        assert len(hash_val) == 64
        assert hash_val != key

    def test_register_new_store(self):
        url = "https://example.com"
        store, raw_key, is_valid = StoreService.register_or_update_store(wc_url=url)
        assert is_valid is True
        assert store is not None
        assert raw_key is not None
        assert store.wc_url == url
        assert store.subscription_status == "trial"

    def test_update_existing_store(self):
        url = "https://example.com"
        store, raw_key, _ = StoreService.register_or_update_store(wc_url=url)

        # Now update it with the generated raw_key
        new_url = "https://new-example.com"
        updated_store, new_raw_key, is_valid = StoreService.register_or_update_store(
            wc_url=new_url, api_key=raw_key
        )
        assert is_valid is True
        assert updated_store.id == store.id
        assert updated_store.wc_url == new_url
        assert new_raw_key is None  # Should not generate a new key

    def test_invalid_api_key(self):
        store, raw_key, is_valid = StoreService.register_or_update_store(
            wc_url="https://example.com", api_key="invalid_key"
        )
        assert is_valid is False
        assert store is None


@pytest.mark.django_db
class TestSyncService:
    def test_process_sync_payload(self):
        store = Store.objects.create(api_key_hash="hash", wc_url="https://test.com")

        payload = SyncRequestIn(
            products=[
                ProductIn(
                    wc_id=1,
                    name="Test Product",
                    price=10.0,
                    variations=[
                        VariationIn(
                            wc_variation_id=101, attributes={"color": "red"}, price=10.0
                        )
                    ],
                )
            ],
            faqs=[FAQIn(question="Test Q", answer="Test A")],
        )

        p_count, v_count, f_count = SyncService.process_sync_payload(store, payload)

        assert p_count == 1
        assert v_count == 1
        assert f_count == 1

        assert Product.objects.count() == 1
        assert ProductVariation.objects.count() == 1
        assert FAQ.objects.count() == 1
