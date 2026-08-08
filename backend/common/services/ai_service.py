from typing import Any

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.utils.module_loading import import_string
from llama_index.core.base.embeddings.base import BaseEmbedding
from llama_index.core.llms import LLM

def get_ai_model_config(kind: str, alias: str) -> dict[str, Any]:
    model_config = getattr(settings, "AI_MODELS", {}).get(kind, {}).get(alias)
    if model_config is None:
        raise ImproperlyConfigured(f"Unknown {kind} AI model: {alias}")
    return dict(model_config)


def build_ai_component(kind: str, alias: str) -> LLM | BaseEmbedding:
    config = get_ai_model_config(kind, alias)
    component_class = import_string(config.pop("class"))
    api_key_setting = config.pop("api_key_setting", None)
    api_key_parameter = config.pop("api_key_parameter", "api_key")
    if api_key_setting:
        api_key = getattr(settings, api_key_setting, "")
        if not api_key:
            raise ImproperlyConfigured(f"{api_key_setting} is required for {alias}")
        config[api_key_parameter] = api_key
    return component_class(**config)


def get_llm(alias: str | None = None) -> LLM:
    selected_alias = alias or settings.AI_CHAT_MODEL
    component = build_ai_component("chats", selected_alias)
    if not isinstance(component, LLM):
        raise ImproperlyConfigured(f"{selected_alias} is not a LlamaIndex LLM")
    return component


def get_embed_model(alias: str | None = None) -> BaseEmbedding:
    selected_alias = alias or settings.AI_EMBEDDING_MODEL
    component = build_ai_component("embeddings", selected_alias)
    if not isinstance(component, BaseEmbedding):
        raise ImproperlyConfigured(
            f"{selected_alias} is not a LlamaIndex embedding model"
        )
    return component
