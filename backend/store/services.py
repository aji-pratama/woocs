import hashlib
import secrets
from typing import List, Optional, Tuple
from urllib.parse import urlparse

from .models import FAQ, Product, ProductVariation, Store
from .schemas import SyncRequestIn


class StoreService:
    @staticmethod
    def generate_api_key() -> str:
        """Generates a cryptographically random 48-character hex string."""
        return secrets.token_hex(24)

    @staticmethod
    def hash_api_key(api_key: str) -> str:
        """Returns the SHA-256 hash of the API key."""
        return hashlib.sha256(api_key.encode("utf-8")).hexdigest()

    @staticmethod
    def get_store_name_from_url(url: str) -> str:
        """Extracts a simple store name from the URL."""
        parsed = urlparse(url)
        return parsed.netloc or url

    @classmethod
    def register_or_update_store(
        cls,
        wc_url: str,
        api_key: Optional[str] = None,
        merchant_email: Optional[str] = None,
        wc_consumer_key: Optional[str] = None,
        wc_consumer_secret: Optional[str] = None,
    ) -> Tuple[Optional[Store], Optional[str], bool]:
        """
        Registers a new store or updates an existing one if the api_key is provided.
        Returns a tuple: (Store instance, raw_api_key if generated, is_valid)
        """
        # wc_url might be a string since HttpUrl converts to string when passed around,
        # but let's ensure it's a string representation.
        url_str = str(wc_url)

        if api_key:
            # Plugin-first flow or connecting an existing store
            api_key_hash = cls.hash_api_key(api_key)
            try:
                store = Store.objects.get(api_key_hash=api_key_hash)
                # Update the store's URL if it was unlinked or changed
                store.wc_url = url_str
                if merchant_email:
                    store.merchant_email = merchant_email
                if wc_consumer_key is not None:
                    store.wc_consumer_key = wc_consumer_key
                if wc_consumer_secret is not None:
                    store.wc_consumer_secret = wc_consumer_secret
                store.save()
                return store, None, True
            except Store.DoesNotExist:
                # Invalid API key
                return None, None, False
        else:
            # Web-first flow or pure new registration
            raw_key = cls.generate_api_key()
            api_key_hash = cls.hash_api_key(raw_key)

            store = Store.objects.create(
                api_key_hash=api_key_hash,
                wc_url=url_str,
                merchant_email=merchant_email,
                subscription_status="trial",
                wc_consumer_key=wc_consumer_key,
                wc_consumer_secret=wc_consumer_secret,
            )
            return store, raw_key, True


class SyncService:
    @staticmethod
    def process_sync_payload(store: Store, payload: SyncRequestIn):
        """
        Upserts products, variations, and FAQs from the sync payload.
        Returns the number of products, variations, and FAQs processed.
        """
        # We can implement a more robust upsert, but for the PoC, we will simply
        # clear existing non-embedded data or update them.
        # For simplicity, we'll update or create.

        products_count = 0
        variations_count = 0
        faqs_count = 0

        for p_in in payload.products:
            product, _ = Product.objects.update_or_create(
                store=store,
                wc_id=p_in.wc_id,
                defaults={
                    "name": p_in.name,
                    "description": p_in.description,
                    "price": p_in.price,
                    "stock_status": p_in.stock_status,
                    "stock_quantity": p_in.stock_quantity,
                    "categories": p_in.categories,
                    "tags": p_in.tags,
                },
            )
            products_count += 1

            for v_in in p_in.variations:
                ProductVariation.objects.update_or_create(
                    product=product,
                    wc_variation_id=v_in.wc_variation_id,
                    defaults={
                        "attributes": v_in.attributes,
                        "stock_quantity": v_in.stock_quantity,
                        "price": v_in.price,
                    },
                )
                variations_count += 1

        for f_in in payload.faqs:
            FAQ.objects.update_or_create(
                store=store, question=f_in.question, defaults={"answer": f_in.answer}
            )
            faqs_count += 1

        return products_count, variations_count, faqs_count
