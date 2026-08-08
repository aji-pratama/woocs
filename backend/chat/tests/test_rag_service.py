from types import SimpleNamespace
from unittest.mock import Mock, patch

from chat.services import RagService
from store.models import FAQ, Product


def test_build_prompt_prioritizes_current_product() -> None:
    product = Product(
        name="Classic Hoodie",
        description="Soft cotton",
        price="34.99",
        stock_status="instock",
        categories=["Clothing"],
    )

    prompt = RagService._build_prompt(
        message="Do you have this in medium?",
        products=[product],
        faqs=[],
        history=[SimpleNamespace(role="user", content="Earlier message")],
        primary_product=product,
    )

    assert "CUSTOMER IS CURRENTLY VIEWING:" in prompt
    assert "Classic Hoodie" in prompt
    assert prompt.index("CUSTOMER IS CURRENTLY VIEWING:") < prompt.index(
        "RETRIEVED CATALOG CONTEXT:"
    )


def test_build_prompt_omits_current_product_without_page_context() -> None:
    faq = FAQ(question="Do you accept returns?", answer="Yes, within 30 days.")

    prompt = RagService._build_prompt(
        message="What is your return policy?",
        products=[],
        faqs=[faq],
        history=[],
        primary_product=None,
    )

    assert "CUSTOMER IS CURRENTLY VIEWING:" not in prompt
    assert "Do you accept returns?" in prompt


@patch("chat.services.rag_service.get_embed_model")
def test_query_returns_safe_low_confidence_result_when_provider_fails(
    get_embed_model: Mock,
) -> None:
    get_embed_model.return_value.get_query_embedding.side_effect = RuntimeError(
        "provider unavailable"
    )

    result = RagService.query(
        store=Mock(),
        message="Is this available?",
        session=Mock(),
    )

    assert result.confidence == 0.0
    assert result.context_used == "error"
    assert "trouble" in result.answer.lower()
