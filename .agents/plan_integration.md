# WooCS.ai — Integration & UI/UX Plan

This document details the end-to-end integration strategy and UI/UX state machine across the Plugin, Backend, and Widget, mapped directly from `PRD_v0.md`.

## 2. Backend ↔ Chat & LLM Integration (Upcoming)
- [ ] **Embedding Pipeline (`store/tasks.py`)**
  - [ ] Implement `build_document()` logic for Products (inline variations, max 1500 tokens).
  - [ ] Implement `build_document()` logic for FAQs.
  - [ ] Integrate LlamaIndex to generate embeddings via Anthropic Haiku and save to `pgvector`.
- [ ] **RAG Pipeline (`chat/services.py`)**
  - [x] Implement Keyword Triggers (refund, damage, broken, lawsuit → immediate escalation).
  - [ ] Query `pgvector` via LlamaIndex for top-5 context nodes.
  - [ ] Calculate confidence score (cosine similarity of top-1 node > 0.65 threshold).
  - [ ] Build Prompt (inject context, order data, and history) and call Claude Haiku.
- [x] **Order Service (`chat/services.py`)**
  - [x] Implement live WooCommerce REST API call to fetch order status using stored credentials.
  - [x] Map WC status to customer-facing labels (e.g., `completed` → `Delivered`).

## 3. Widget UI/UX State Machine (React) [Completed]
The widget is a React application built with Vite, injected via `wp_localize_script`. It communicates exclusively with `/api/widget/*` endpoints.
