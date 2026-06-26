# WooCS.ai — Development Plan

> **Note:** Scaffolding, Phase 1, and Phase 2 have been completed and moved to `.agents/artifacts/changelog.md`.

## Next: Feature Development

### Phase 3 — Chat & RAG
- [ ] `chat/models.py` — `ChatSession`, `ChatMessage` (with `confidence_score`, `escalated`, `escalation_reason`)
- [ ] `chat/schemas.py` — request/response Pydantic schemas for `/chat/` and `/order-status/` endpoints
- [ ] `chat/services.py` — core RAG pipeline (keyword check, `pgvector` search via LlamaIndex, Claude Haiku LLM call, confidence evaluation)
- [ ] `chat/api.py` — `POST /api/widget/chat/` (keyless, scoped by `store_id`) and `GET /api/widget/order-status/` (passes through to WC API)
- [ ] `chat/tasks.py` — Celery task for async escalation email dispatch via SMTP
- [ ] Automated Tests (`test_models`, `test_services`, `test_api`, `test_tasks` for `chat` app)
- [ ] Migrations + `make backend-migrate`

### Phase 4 — Widget UI (React/Vite)
- [ ] `widget/src/api/` — API client logic (fetch from `/api/widget/*`)
- [ ] `widget/src/components/C01_Bubble.jsx` — Floating bubble launcher
- [ ] `widget/src/components/C02_Header.jsx` — Chat panel header
- [ ] `widget/src/components/C03_Thread.jsx` — Message thread layout
- [ ] `widget/src/components/C05_ProductCard.jsx` — Inline product layout
- [ ] `widget/src/components/C06_OrderCard.jsx` — Inline order status layout
- [ ] `widget/src/components/C07_Escalation.jsx` — Warning bubble with CTAs
- [ ] `widget/src/components/C08_Typing.jsx` — Loading indicator
- [ ] `widget/src/components/C09_Input.jsx` — Text input bar
- [ ] `widget/src/components/C10_Footer.jsx` — "Powered by WooCS.ai"
- [ ] `make wp-build` — bundle JS for WordPress injection

### Phase 5 — WordPress Plugin (PHP)
- [ ] `plugin/woocs-ai.php` — Main plugin entry point and enqueuing widget JS bundle
- [ ] Settings Page (`A1`) — Connection status, API key input, widget toggle
- [ ] Sync Status Page (`A2`) — Displays products, FAQs counts, and trigger manual sync
- [ ] FAQ Manager Page (`A3`) — CRUD for FAQs natively in WordPress
- [ ] Widget Preview Page (`A4`) — Live test the widget inside WP Admin
