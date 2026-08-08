import pytest

from store.models import FAQ, Product, Store
from store.tasks import build_faq_document, build_product_document, ingest_catalog


@pytest.mark.django_db
class TestTasks:
    def test_build_product_document_includes_variations(self):
        store = Store.objects.create(api_key_hash="document-hash")
        product = Product.objects.create(
            store=store,
            wc_id=10,
            name="Classic Hoodie",
            description="Soft cotton hoodie",
            price="34.99",
            categories=["Clothing"],
            tags=["cotton"],
        )
        product.variations.create(
            wc_variation_id=11,
            attributes={"size": "M", "color": "Navy"},
            stock_quantity=5,
            price="36.99",
        )

        document = build_product_document(product)

        assert "Classic Hoodie" in document
        assert "size=M" in document
        assert "color=Navy" in document
        assert "Clothing" in document

    def test_build_faq_document(self):
        store = Store.objects.create(api_key_hash="faq-document-hash")
        faq = FAQ.objects.create(store=store, question="Can I return it?", answer="Yes.")

        assert build_faq_document(faq) == "Question: Can I return it?\nAnswer: Yes."

    def test_ingest_catalog_success(self, mocker):
        store = Store.objects.create(api_key_hash="hash", wc_url="https://test.com")

        # Create some items without embeddings
        Product.objects.create(store=store, wc_id=1, name="Test Product")
        FAQ.objects.create(store=store, question="Test Q", answer="Test A")

        embed_model = mocker.Mock()
        embed_model.get_text_embedding_batch.side_effect = [
            [[0.1] * 1024],
            [[0.2] * 1024],
        ]
        mocker.patch(
            "store.tasks.get_embed_model", return_value=embed_model
        )

        assert store.last_synced_at is None

        result = ingest_catalog.func(store.id)

        assert result["status"] == "completed"
        assert result["products"] == 1
        assert result["faqs"] == 1

        # Refresh from db
        store.refresh_from_db()
        assert store.last_synced_at is not None
        assert embed_model.get_text_embedding_batch.call_count == 2

    def test_ingest_catalog_store_not_found(self):
        import uuid

        result = ingest_catalog.func(uuid.uuid4())

        assert result["status"] == "error"
        assert result["message"] == "Store not found"
