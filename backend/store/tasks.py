import logging
from uuid import UUID

from django.tasks import task
from django.utils import timezone

from common.services import get_embed_model

from .models import FAQ, Product, Store

logger = logging.getLogger(__name__)


def build_product_document(product: Product) -> str:
    variations = []
    for variation in product.variations.all():
        attributes = ", ".join(
            f"{name}={value}" for name, value in variation.attributes.items()
        )
        variations.append(
            f"[{attributes}; price={variation.price}; stock={variation.stock_quantity}]"
        )
    return "\n".join(
        [
            f"Product: {product.name}",
            f"Description: {product.description or ''}",
            f"Price: {product.price}",
            f"Stock status: {product.stock_status}",
            f"Categories: {', '.join(product.categories)}",
            f"Tags: {', '.join(product.tags)}",
            f"Variations: {' '.join(variations)}",
        ]
    )


def build_faq_document(faq: FAQ) -> str:
    return f"Question: {faq.question}\nAnswer: {faq.answer}"


@task()
def ingest_catalog(store_id: UUID):
    """
    Django task to build documents from Products/FAQs, generate embeddings,
    and save the vectors to pgvector.
    """
    logger.info(f"Starting catalog ingestion for store_id: {store_id}")

    try:
        store = Store.objects.get(id=store_id)

        embed_model = get_embed_model()
        products = list(
            store.products.filter(embedding__isnull=True).prefetch_related("variations")
        )
        faqs = list(store.faqs.filter(embedding__isnull=True))
        logger.info("Found %s products and %s FAQs to embed", len(products), len(faqs))

        if products:
            product_embeddings = embed_model.get_text_embedding_batch(
                [build_product_document(product) for product in products]
            )
            for product, embedding in zip(products, product_embeddings, strict=True):
                product.embedding = embedding
                product.save(update_fields=["embedding", "synced_at"])

        if faqs:
            faq_embeddings = embed_model.get_text_embedding_batch(
                [build_faq_document(faq) for faq in faqs]
            )
            for faq, embedding in zip(faqs, faq_embeddings, strict=True):
                faq.embedding = embedding
                faq.save(update_fields=["embedding", "updated_at"])

        # Update synced_at timestamp
        store.last_synced_at = timezone.now()
        store.save(update_fields=['last_synced_at'])

        logger.info(
            f"Successfully completed catalog ingestion for store_id: {store_id}"
        )
        return {
            "status": "completed",
            "products": len(products),
            "faqs": len(faqs),
        }

    except Store.DoesNotExist:
        logger.error(f"Store {store_id} not found for catalog ingestion.")
        return {"status": "error", "message": "Store not found"}
    except Exception as e:
        logger.error(f"Error during catalog ingestion for store {store_id}: {str(e)}")
        return {"status": "error", "message": str(e)}
