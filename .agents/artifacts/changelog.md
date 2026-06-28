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
