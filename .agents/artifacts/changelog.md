# WooCS.ai — Changelog

## Scaffolding Status
> Completed: 2026-06-26

### Infrastructure
- [x] `compose.dev.yml` — PostgreSQL (pgvector), MySQL, WordPress, Redis
- [x] `Makefile` — all dev targets (infra-up, dev-api, dev-celery, dev-widget, wp-build, db-dump)
- [x] `.gitignore` — backend/.env, backend/.venv, widget/.env

### Backend (Django)
- [x] Django project initialized (`backend/config/`)
- [x] `settings.py` — PostgreSQL, decouple, Celery config
- [x] `config/celery.py` — Celery app definition
- [x] `config/__init__.py` — auto-import Celery on startup
- [x] Apps: `store`, `chat` registered in INSTALLED_APPS
- [x] `backend/.venv` — Python 3.13 virtual environment
- [x] `backend/requirements.txt` — all deps installed
- [x] `backend/.env` — dev credentials (from .env.example)

### Widget (React/Vite)
- [x] Vite + React project initialized in `widget/`
- [x] `npm install` complete

### Docs & Agent Workspace
- [x] `AGENTS.md` — updated to 2-app architecture (store, chat)
- [x] `.agents/rules/backend.md` — updated app responsibilities
- [x] `.agents/plan.md` — this file

---

## Phase 1 — Store & Auth
> Completed: 2026-06-26

- [x] `store/models.py` — Store model (UUID PK, name, api_key_hash, created_at)
- [x] `store/api.py` — `POST /api/stores/register/` endpoint
- [x] `store/schemas.py` — request/response Pydantic schemas
- [x] `config/auth.py` — API key auth class for Django Ninja
- [x] Migrations + `make backend-migrate`

---

## Phase 2 — Catalog Sync
> Completed: 2026-06-26

- [x] `store/models.py` — Product, ProductVariation, FAQ models (with VectorField)
- [x] `store/api.py` — `POST /api/stores/sync/` endpoint
- [x] `store/tasks.py` — Celery task `ingest_catalog` (stub/setup)
- [x] Vector extension migration (`VectorExtension()`)
- [x] Migrations + `make backend-migrate` & RAG
- [x] Automated Tests (`test_models`, `test_services`, `test_api`, `test_tasks`)

---

## Phase 3 — Chat & RAG
> Completed: 2026-06-27

- [x] `chat/models.py` — ChatSession, ChatMessage (with confidence_score, escalated, escalation_reason)
- [x] `chat/schemas.py` — request/response Pydantic schemas for `/chat/` and `/order-status/`
- [x] `chat/services.py` — ChatService (keyword check → RAG stub → confidence evaluation) + OrderService (WC proxy stub)
- [x] `chat/api.py` — `POST /api/widget/chat/` and `GET /api/widget/order-status/` (keyless, scoped by store_id)
- [x] `chat/tasks.py` — Celery task `send_escalation_email` (async email dispatch)
- [x] `config/urls.py` — registered chat router under `/widget/`
- [x] `config/settings.py` — added SMTP email config (console backend for PoC)
- [x] Automated Tests (23 tests across 4 test files)
- [x] Migrations + `make backend-migrate`

---

## Phase 4 — Widget UI (React/Vite)
> Completed: 2026-06-27

- [x] Extracted Lovable UI codebase and refactored TanStack Start logic to simple React
- [x] Restored Chat UI elements (Product Card, Order Card, Escalation Bubble, Typing indicators)
- [x] Integrated dynamic `store_id` fetching via `.env` (development) and `window.WooCS` (production)
- [x] Added `make wp-build` support for single JS file bundling
- [x] Set up Vite + TailwindCSS v4 configurations

---

## Phase 5 — WordPress Plugin (PHP)
> Completed: 2026-06-27

- [x] `plugin/woocs.php` — Main plugin entry point and enqueuing widget JS bundle
- [x] Settings Page (`A1`) — Connection status, API key input, widget toggle
- [x] Sync Status Page (`A2`) — Displays products, FAQs counts, and trigger manual sync
- [x] FAQ Manager Page (`A3`) — CRUD for FAQs natively in WordPress
- [x] Widget Preview Page (`A4`) — Live test the widget inside WP Admin
- [x] Integration with Django Backend (`ApiClient`, `SyncService`, `AjaxHandlers`)

---

# Plan Integration

## 1. Plugin ↔ Backend Integration (Completed)
- [x] Settings Registration: Intercept admin-post to call `POST /api/stores/register/` and store API keys.
- [x] Catalog Sync Engine: Extract WC products & FAQs, format to schema, send to `POST /api/stores/sync/`.
- [x] Sync Status Polling: AJAX handlers to fetch sync status from `GET /api/stores/sync/status/`.

### Core Components
- [x] **C-01 Bubble Launcher**: Fixed position (bottom right/left configurable), click to open panel.
- [x] **C-02 Panel Header**: Bot avatar, name ("Store assistant"), online status dot, close button.
- [x] **C-03 Message Thread**: Left-aligned (bot) / Right-aligned (user), auto-scrolls to latest message.
- [x] **C-09 Input Bar**: Text input, send button (disabled during await), dynamic placeholders based on context.
- [x] **C-10 Panel Footer**: "Powered by WooCS.ai".

### Interaction & Feedback
- [x] **C-08 Typing Indicator**: 
  - `0–8s`: Animated dots.
  - `8s+`: "Still looking…".
  - `15s+`: "Taking too long — try again" (with retry button).
- [x] **C-04 Quick Replies Bar**: Contextual pill buttons (e.g., "Check my order", "Return policy", "Browse products").

### Dynamic Rich Cards (Inline Bot Messages)
- [x] **C-05 Product Card**: Rendered when a product query is matched.
  - Image, name, variation attributes.
  - Price (hidden if empty or $0).
  - Stock status badge (Green: In stock, Amber: Low stock, Red: Out of stock).
  - "View product" CTA (opens in same tab).
- [x] **C-06 Order Status Card**: Rendered when an order number (`#\d+`) is detected.
  - Order number, mapped status, line items (names only), and total.
- [x] **C-07 Escalation Bubble**: Rendered on low confidence or keyword trigger.
  - Amber background, warning icon.
  - Fixed message: "I'm not sure about this. Want me to connect you with the team?"
  - CTAs: **"Talk to someone"** (triggers email) vs **"No thanks"** (dismisses).

- [x] **Escalation Mechanism**
  - [x] Implement `send_escalation_email` Celery task.
  - [x] Flag ChatMessage as escalated on low confidence or keyword trigger.

---

## Feedback

- [x] Move chatwidget to plugin area instead of different apps
- [x] Make widget apps able to see in a website frontend of WP & in plugin page Preview, so user can preview it
- [x] Use Django Task and Postgres as background service instead of Celery. Remove all celery stuff, again using django task, default django feature of tasks

## Part 3 — Widget: read context and adjust behavior
> Completed: 2026-06-30

- [x] Read `page_context` from `window.WooCS` on widget mount
- [x] Store in widget state (whatever state management is used — context, store, etc.)
- [x] Implement conditional greeting logic
- [x] Fallback: if `product_name` is missing but `type` is `product`, use generic product greeting: "Hi! Ask me anything about this product."
- [x] Implement conditional quick replies for idle state on product pages
- [x] Verify existing quick reply logic for post-answer states (C-04 table in Section 15) is unaffected — this only changes the *idle* state pills
- [x] Include `page_context` in every chat request payload, not just the first one
- [x] Confirm `page_context` stays accurate if customer navigates to a different product page mid-session (full page reload re-injects `window.WooCS`, so this should work automatically given WooCommerce's default non-SPA behavior — verify this assumption holds)
- [x] Add `context_used` to the existing debug overlay in A4
- [x] Confirm this overlay is PoC-only and stripped from any future production build
## Order Service (`chat/services.py`)
- [x] Implement live WooCommerce REST API call to fetch order status using stored credentials.
- [x] Map WC status to customer-facing labels (e.g., `completed` → `Delivered`).

## Widget Page Context Awareness

### Update Pydantic schemas
- [x] Add `PageContextIn` model
- [x] Add `page_context` field to `ChatRequestIn`
- [x] Add `context_used` field to `ChatResponseOut`
- [x] Confirm backward compatibility — requests without `page_context` must still work (defaults to `None`, treated as general)

### Update ChatMessage persistence
- [x] Store `page_context` and `context_used` in `ChatMessage.metadata`
- [x] Verify Django Admin C3 (chat session detail) can display this metadata for debugging

### Add settings toggle (WP Plugin)
- [x] Add checkbox field to Settings page template
- [x] Save to `wp_options['woocs_product_context_enabled']` on form submit
- [x] Default value: enabled (`true`) — this is a quality improvement, not a risky feature, so opt-out makes more sense than opt-in
- [x] Add one-line help text under the checkbox: "When enabled, the assistant gives more specific answers about the product the customer is currently viewing."

### Detect product page and build context payload (WP Plugin)
- [x] Implement `woocs_get_page_context()` function
- [x] Respect the settings toggle — return `general` immediately if disabled
- [x] Hook into existing `wp_localize_script()` call, add `page_context` key

### Frontend preview page (A4)
- [x] Embed an iframe pointing to a real product page on the merchant's storefront (or a dropdown to pick which product to preview)
- [x] Render the actual widget inside that iframe (uses real `window.WooCS` injection, so page context detection is naturally tested)
- [x] Add debug overlay showing `confidence` and `context_used` per response
- [x] Add a dropdown: "Preview as page type" with options General / Product — lets merchant manually test without navigating to an actual product page
- [x] Add "Test escalation" button (sends hardcoded refund-keyword message)
- [x] Add response latency display in ms

---

### Feedback, Plugin Page and API Integrations

- [x] `page=woocs-settings`: make it better style:
    - [x] Connection Connected need better icon
- [x] `page=woocs-preview`: when it save test control, and then I reloaded, the setings is not same, do we need to sync api?
- [x] `page=woocs-faqs`: FAQs, I cannot edit, is it just dummy?
- [x] `page=woocs-sync`: Sync Logs is not recorded in the plugin, do we need to fecth api (again)?


### Feedback, Plugin Page:
- [x] Create Dashboard page that shows all information when plugin is activated and connected, like chat count, order count, etc, and it need to refresh every 1 minute. No need complete, just like teaser, and for more detailed need to go somewhere else like other page or even the SaaS
