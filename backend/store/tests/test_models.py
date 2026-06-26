from django.test import TestCase

from store.models import FAQ, Product, ProductVariation, Store


class StoreModelTest(TestCase):
    def test_store_creation(self):
        store = Store.objects.create(
            api_key_hash="dummy_hash",
            wc_url="https://test.com",
            merchant_email="test@test.com",
        )
        self.assertIsNotNone(store.id)
        self.assertEqual(store.api_key_hash, "dummy_hash")
        self.assertEqual(store.subscription_status, "trial")
        self.assertEqual(str(store), f"https://test.com ({store.id})")


class CatalogModelsTest(TestCase):
    def setUp(self):
        self.store = Store.objects.create(
            api_key_hash="hash", wc_url="https://test.com"
        )
        self.product = Product.objects.create(
            store=self.store, wc_id=101, name="Test Product", price=99.99
        )

    def test_product_creation(self):
        self.assertEqual(self.product.name, "Test Product")
        self.assertEqual(self.product.store, self.store)
        self.assertEqual(str(self.product), "Test Product (WC: 101)")
        self.assertIsNone(self.product.embedding)

    def test_product_variation_creation(self):
        variation = ProductVariation.objects.create(
            product=self.product,
            wc_variation_id=202,
            attributes={"size": "M"},
            price=99.99,
        )
        self.assertEqual(variation.product, self.product)
        self.assertEqual(str(variation), "Test Product - Var 202")

    def test_faq_creation(self):
        faq = FAQ.objects.create(
            store=self.store, question="Is this a test?", answer="Yes."
        )
        self.assertEqual(faq.store, self.store)
        self.assertIn("FAQ: Is this a test?", str(faq))
