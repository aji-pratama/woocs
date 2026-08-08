from unittest.mock import Mock, patch

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings
from llama_index.core.base.embeddings.base import BaseEmbedding
from llama_index.core.llms import LLM

from common.services.ai_service import (
    build_ai_component,
    get_ai_model_config,
    get_embed_model,
    get_llm,
)

AI_MODELS = {
    "chats": {
        "test-chat": {
            "class": "llama_index.core.llms.MockLLM",
            "max_tokens": 64,
        }
    },
    "embeddings": {
        "test-embedding": {
            "class": "llama_index.core.embeddings.MockEmbedding",
            "embed_dim": 1024,
        }
    },
}


@override_settings(AI_MODELS=AI_MODELS)
def test_get_ai_model_config_returns_named_models() -> None:
    assert get_ai_model_config("chats", "test-chat")["max_tokens"] == 64
    assert get_ai_model_config("embeddings", "test-embedding")["embed_dim"] == 1024


@override_settings(AI_MODELS=AI_MODELS)
def test_get_ai_model_config_rejects_unknown_alias() -> None:
    with pytest.raises(ImproperlyConfigured, match="Unknown chats AI model"):
        get_ai_model_config("chats", "missing")


@override_settings(
    AI_MODELS=AI_MODELS,
    AI_CHAT_MODEL="test-chat",
    AI_EMBEDDING_MODEL="test-embedding",
)
def test_factories_return_llamaindex_interfaces() -> None:
    assert isinstance(get_llm(), LLM)
    assert isinstance(get_embed_model(), BaseEmbedding)


@override_settings(
    OPENAI_API_KEY="openai-test-key",
    AI_MODELS={
        "embeddings": {
            "catalog": {
                "class": "provider.Embedding",
                "model": "text-embedding-3-small",
                "api_key_setting": "OPENAI_API_KEY",
            }
        }
    },
)
@patch("common.services.ai_service.import_string")
def test_component_factory_injects_provider_specific_api_key(
    import_string: Mock,
) -> None:
    component_class = import_string.return_value

    build_ai_component("embeddings", "catalog")

    import_string.assert_called_once_with("provider.Embedding")
    component_class.assert_called_once_with(
        model="text-embedding-3-small",
        api_key="openai-test-key",
    )
from django.contrib import admin
from django.test import SimpleTestCase

from billing.models import PolarWebhookEvent, Subscription
from chat.models import ChatMessage, ChatSession
from common.models import TaskRecord
from store.models import FAQ, Product, ProductVariation, Store


class AdminRegistryTest(SimpleTestCase):
    def test_all_domain_models_are_registered(self):
        models = {
            Store,
            Product,
            ProductVariation,
            FAQ,
            ChatSession,
            ChatMessage,
            Subscription,
            PolarWebhookEvent,
            TaskRecord,
        }

        assert models <= set(admin.site._registry)
