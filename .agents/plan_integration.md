# WooCS.ai — Integration & UI/UX Plan

This document details the end-to-end integration strategy and UI/UX state machine across the Plugin, Backend, and Widget, mapped directly from `PRD_v0.md`.

## 1. Plugin ↔ Backend Integration (Completed)
- [x] Settings Registration: Intercept admin-post to call `POST /api/stores/register/` and store API keys.
- [x] Catalog Sync Engine: Extract WC products & FAQs, format to schema, send to `POST /api/stores/sync/`.
- [x] Sync Status Polling: AJAX handlers to fetch sync status from `GET /api/stores/sync/status/`.

## 2. Backend ↔ Chat & LLM Integration (Upcoming)
- [ ] **Embedding Pipeline (`store/tasks.py`)**
  - [ ] Implement `build_document()` logic for Products (inline variations, max 1500 tokens).
  - [ ] Implement `build_document()` logic for FAQs.
  - [ ] Integrate LlamaIndex to generate embeddings via Anthropic Haiku and save to `pgvector`.
- [ ] **RAG Pipeline (`chat/services.py`)**
  - [ ] Implement Keyword Triggers (refund, damage, broken, lawsuit → immediate escalation).
  - [ ] Query `pgvector` via LlamaIndex for top-5 context nodes.
  - [ ] Calculate confidence score (cosine similarity of top-1 node > 0.65 threshold).
  - [ ] Build Prompt (inject context, order data, and history) and call Claude Haiku.
- [ ] **Order Service (`chat/services.py`)**
  - [ ] Implement live WooCommerce REST API call to fetch order status using stored credentials.
  - [ ] Map WC status to customer-facing labels (e.g., `completed` → `Delivered`).
- [ ] **Escalation Mechanism**
  - [ ] Implement `send_escalation_email` Celery task.
  - [ ] Flag ChatMessage as escalated on low confidence or keyword trigger.

## 3. Widget UI/UX State Machine (React)
The widget is a React application built with Vite, injected via `wp_localize_script`. It communicates exclusively with `/api/widget/*` endpoints.

### Core Components
- [ ] **C-01 Bubble Launcher**: Fixed position (bottom right/left configurable), click to open panel.
- [ ] **C-02 Panel Header**: Bot avatar, name ("Store assistant"), online status dot, close button.
- [ ] **C-03 Message Thread**: Left-aligned (bot) / Right-aligned (user), auto-scrolls to latest message.
- [ ] **C-09 Input Bar**: Text input, send button (disabled during await), dynamic placeholders based on context.
- [ ] **C-10 Panel Footer**: "Powered by WooCS.ai".

### Interaction & Feedback
- [ ] **C-08 Typing Indicator**: 
  - `0–8s`: Animated dots.
  - `8s+`: "Still looking…".
  - `15s+`: "Taking too long — try again" (with retry button).
- [ ] **C-04 Quick Replies Bar**: Contextual pill buttons (e.g., "Check my order", "Return policy", "Browse products").

### Dynamic Rich Cards (Inline Bot Messages)
- [ ] **C-05 Product Card**: Rendered when a product query is matched.
  - Image, name, variation attributes.
  - Price (hidden if empty or $0).
  - Stock status badge (Green: In stock, Amber: Low stock, Red: Out of stock).
  - "View product" CTA (opens in same tab).
- [ ] **C-06 Order Status Card**: Rendered when an order number (`#\d+`) is detected.
  - Order number, mapped status, line items (names only), and total.
- [ ] **C-07 Escalation Bubble**: Rendered on low confidence or keyword trigger.
  - Amber background, warning icon.
  - Fixed message: "I'm not sure about this. Want me to connect you with the team?"
  - CTAs: **"Talk to someone"** (triggers email) vs **"No thanks"** (dismisses).
