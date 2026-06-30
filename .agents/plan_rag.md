# WooCS.ai — RAG Implementation Plan

This plan consolidates all tasks related to the LlamaIndex integration, embedding generation, and prompt construction.

## Embedding Pipeline (`store/tasks.py`)
- [ ] Implement `build_document()` logic for Products (inline variations, max 1500 tokens).
- [ ] Implement `build_document()` logic for FAQs.
- [ ] Integrate LlamaIndex to generate embeddings via Anthropic Haiku and save to `pgvector`.

## RAG Pipeline (`chat/services.py`)
- [ ] Query `pgvector` via LlamaIndex for top-5 context nodes.
- [ ] Calculate confidence score (cosine similarity of top-1 node > 0.65 threshold).
- [ ] Build Prompt (inject context, order data, and history) and call Claude Haiku.
- [ ] Add `CUSTOMER IS CURRENTLY VIEWING` section to prompt template
- [ ] Conditionally omit section when no primary product is present
- [ ] Verify Haiku prioritizes primary product section over additional context in test queries
- [ ] Unit test: product page + on-topic question → primary_product used, confidence high
- [ ] Unit test: product page + off-topic question → retrieval used, primary_product ignored in answer
- [ ] Unit test: product_id present but not found in DB → falls back to product_name hint, does not crash
