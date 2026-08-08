# WooCS.ai — RAG Implementation Plan

This plan consolidates the lean LlamaIndex integration, embedding generation, retrieval, and prompt construction.

## Embedding Pipeline (`store/tasks.py`)
- [x] Implement `build_document()` logic for Products with inline variations.
- [x] Implement `build_document()` logic for FAQs.
- [x] Integrate configurable LlamaIndex embedding models and save 1024-dimensional embeddings to `pgvector`.

## RAG Pipeline (`chat/services/`)
- [x] Query `pgvector` through the Django ORM for top-5 tenant-scoped Product and FAQ results.
- [x] Calculate confidence from the top cosine distance with the 0.65 escalation threshold.
- [x] Build the grounded prompt with context and history and call the selected LlamaIndex LLM.
- [x] Add `CUSTOMER IS CURRENTLY VIEWING` to the prompt when applicable.
- [x] Omit the current-product section when no primary product is present.
- [x] Verify the primary-product section precedes additional retrieval context.
- [ ] Unit test: product page + on-topic question → primary_product used, confidence high
- [ ] Unit test: product page + off-topic question → retrieval used, primary_product ignored in answer
- [ ] Unit test: product_id present but not found in DB → falls back to product_name hint, does not crash
