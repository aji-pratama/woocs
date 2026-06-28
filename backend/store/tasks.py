import logging
from uuid import UUID

from django.tasks import task
from django.utils import timezone

from .models import Store

logger = logging.getLogger(__name__)


def generate_pseudo_embedding(text: str) -> list[float]:
    """
    Generates a deterministic pseudo-random vector of length 1536 for PoC.
    In production, replace with LlamaIndex embedding model (e.g. Voyage/OpenAI).
    """
    import hashlib
    # Create a 1536-dimensional vector based on the hash of the text
    h = hashlib.sha256(text.encode('utf-8')).digest()
    vector = []
    for i in range(1536):
        # Generate a float between -1 and 1
        val = (h[i % 32] / 128.0) - 1.0
        # Add slight variation based on position
        val = val * (1.0 - (i % 10) / 100.0)
        vector.append(val)
    
    # Normalize the vector
    magnitude = sum(x*x for x in vector) ** 0.5
    if magnitude > 0:
        vector = [x / magnitude for x in vector]
    return vector


@task()
def ingest_catalog(store_id: UUID):
    """
    Django task to build documents from Products/FAQs, generate embeddings,
    and save the vectors to pgvector.
    """
    logger.info(f"Starting catalog ingestion for store_id: {store_id}")

    try:
        store = Store.objects.get(id=store_id)

        # 1. Embed Products
        products = store.products.filter(embedding__isnull=True)
        logger.info(f"Found {products.count()} products to embed.")
        for product in products:
            text = f"Product: {product.name}. Description: {product.description}. Price: {product.price}. Status: {product.stock_status}. Categories: {', '.join(product.categories)}."
            product.embedding = generate_pseudo_embedding(text)
            product.save(update_fields=['embedding', 'synced_at'])

        # 2. Embed FAQs
        faqs = store.faqs.filter(embedding__isnull=True)
        logger.info(f"Found {faqs.count()} FAQs to embed.")
        for faq in faqs:
            text = f"Q: {faq.question}\nA: {faq.answer}"
            faq.embedding = generate_pseudo_embedding(text)
            faq.save(update_fields=['embedding', 'updated_at'])

        # Update synced_at timestamp
        store.last_synced_at = timezone.now()
        store.save(update_fields=['last_synced_at'])

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
