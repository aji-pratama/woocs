import logging
from dataclasses import dataclass
from typing import Any

from llama_index.core.llms import ChatMessage, MessageRole
from pgvector.django import CosineDistance

from common.services import get_embed_model, get_llm
from store.models import FAQ, Product, Store

from ..models import ChatSession

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RagResult:
    answer: str
    confidence: float
    product_data: dict[str, Any] | None
    context_used: str


class RagService:
    """Retrieves tenant-scoped catalog context and generates grounded answers."""

    system_prompt = (
        "You are a concise WooCommerce store assistant. Answer only from the "
        "provided catalog context. If the context is insufficient, say so."
    )

    @classmethod
    def query(
        cls,
        *,
        store: Store,
        message: str,
        session: ChatSession,
        page_context: Any | None = None,
    ) -> RagResult:
        try:
            return cls._query(
                store=store,
                message=message,
                session=session,
                page_context=page_context,
            )
        except Exception:
            logger.exception("RAG query failed for store %s", store.id)
            return RagResult(
                answer="Sorry, I'm having trouble searching the catalog right now.",
                confidence=0.0,
                product_data=None,
                context_used="error",
            )

    @classmethod
    def _query(
        cls,
        *,
        store: Store,
        message: str,
        session: ChatSession,
        page_context: Any | None = None,
    ) -> RagResult:
        query_embedding = get_embed_model().get_query_embedding(message)
        primary_product = cls._get_primary_product(store, page_context)

        if primary_product and cls._is_page_context_question(message, primary_product):
            products = [primary_product]
            faqs: list[FAQ] = []
            confidence = 0.95
            context_used = "page_context"
        else:
            products = list(
                store.products.filter(embedding__isnull=False)
                .annotate(distance=CosineDistance("embedding", query_embedding))
                .order_by("distance")[:5]
            )
            faqs = list(
                store.faqs.filter(embedding__isnull=False)
                .annotate(distance=CosineDistance("embedding", query_embedding))
                .order_by("distance")[:5]
            )
            confidence = cls._top_confidence(products, faqs)
            context_used = "retrieval"

        if not products and not faqs:
            return RagResult(
                answer="I couldn't find relevant information in the store catalog.",
                confidence=0.0,
                product_data=None,
                context_used=context_used,
            )

        history = session.get_last_n_messages(n=10)
        prompt = cls._build_prompt(
            message=message,
            products=products,
            faqs=faqs,
            history=history,
            primary_product=primary_product if context_used == "page_context" else None,
        )
        response = get_llm().chat(
            [
                ChatMessage(role=MessageRole.SYSTEM, content=cls.system_prompt),
                ChatMessage(role=MessageRole.USER, content=prompt),
            ]
        )
        answer = response.message.content or ""
        product_data = cls._product_data(store, products[0]) if products else None
        return RagResult(answer, confidence, product_data, context_used)

    @staticmethod
    def _get_primary_product(store: Store, page_context: Any | None) -> Product | None:
        product_id = getattr(page_context, "product_id", None)
        if not product_id:
            return None
        return Product.objects.filter(store=store, wc_id=product_id).first()

    @staticmethod
    def _is_page_context_question(message: str, product: Product) -> bool:
        message_lower = message.lower()
        context_terms = ("this", "it", "size", "stock", "color", "price", "how much")
        return product.name.lower() in message_lower or any(
            term in message_lower for term in context_terms
        )

    @staticmethod
    def _top_confidence(products: list[Product], faqs: list[FAQ]) -> float:
        distances = [float(item.distance) for item in [*products, *faqs]]
        if not distances:
            return 0.0
        return max(0.0, min(1.0, 1.0 - min(distances)))

    @staticmethod
    def _build_prompt(
        *,
        message: str,
        products: list[Product],
        faqs: list[FAQ],
        history: list[Any],
        primary_product: Product | None,
    ) -> str:
        sections = [f"CUSTOMER QUESTION:\n{message}"]
        if primary_product:
            sections.append(
                "CUSTOMER IS CURRENTLY VIEWING:\n"
                f"{RagService._product_document(primary_product)}"
            )
        if history:
            history_text = "\n".join(
                f"{item.role}: {item.content}" for item in history[:-1]
            )
            if history_text:
                sections.append(f"RECENT CONVERSATION:\n{history_text}")
        context = [RagService._product_document(product) for product in products]
        context.extend(f"FAQ: {faq.question}\nAnswer: {faq.answer}" for faq in faqs)
        sections.append("RETRIEVED CATALOG CONTEXT:\n" + "\n---\n".join(context))
        return "\n\n".join(sections)

    @staticmethod
    def _product_document(product: Product) -> str:
        return (
            f"Product: {product.name}\nDescription: {product.description or ''}\n"
            f"Price: {product.price}\nStock: {product.stock_status}\n"
            f"Categories: {', '.join(product.categories)}"
        )

    @staticmethod
    def _product_data(store: Store, product: Product) -> dict[str, Any]:
        return {
            "name": product.name,
            "price": str(product.price),
            "stock_status": product.stock_status,
            "stock_quantity": product.stock_quantity,
            "wc_url": f"{store.wc_url.rstrip('/')}/?p={product.wc_id}",
        }
