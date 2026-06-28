import logging
from uuid import UUID

from django.tasks import task
from django.utils import timezone

from .models import Store

logger = logging.getLogger(__name__)


@task()
def ingest_catalog(store_id: UUID):
    """
    Django task to build documents from Products/FAQs, call Claude Haiku to embed,
    and save the vectors to pgvector.

    Stub implementation for PoC testing.
    """
    logger.info(f"Starting catalog ingestion for store_id: {store_id}")

    try:
        store = Store.objects.get(id=store_id)

        # 1. Fetch all products without embeddings
        products = store.products.filter(embedding__isnull=True)
        logger.info(f"Found {products.count()} products to embed.")

        # 2. Fetch all FAQs without embeddings
        faqs = store.faqs.filter(embedding__isnull=True)
        logger.info(f"Found {faqs.count()} FAQs to embed.")

        # TODO: Implement actual Anthropic Haiku embedding generation
        # For now, we just simulate success by generating a dummy vector if needed,
        # but since pgvector requires exact dimensions, we will just skip updating
        # the actual vector field in this stub, or we can generate a zero vector.

        # Simulate processing time
        import time

        time.sleep(2)

        # Update synced_at timestamp
        store.last_synced_at = timezone.now()
        store.save()

        logger.info(
            f"Successfully completed catalog ingestion for store_id: {store_id}"
        )
        return {
            "status": "completed",
            "products": products.count(),
            "faqs": faqs.count(),
        }

    except Store.DoesNotExist:
        logger.error(f"Store {store_id} not found for catalog ingestion.")
        return {"status": "error", "message": "Store not found"}
    except Exception as e:
        logger.error(f"Error during catalog ingestion for store {store_id}: {str(e)}")
        return {"status": "error", "message": str(e)}
