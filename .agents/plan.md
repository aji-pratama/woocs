# WooCS.ai — Development Plan

> **Note:** Scaffolding, Phase 1, and Phase 2 have been completed and moved to `.agents/artifacts/changelog.md`.

## Next: Feature Development

### Next Phase — AI & External API Integration
- [ ] `chat/services.py` — integrate LlamaIndex + Anthropic Haiku for actual RAG pipeline in `_rag_query_stub`
- [ ] `chat/services.py` — integrate WooCommerce REST API in `OrderService`
- [ ] `store/tasks.py` — implement actual catalog embedding logic for `ingest_catalog` (currently stub)


### Phase 5 — WordPress Plugin (PHP)
- [ ] `plugin/woocs-ai.php` — Main plugin entry point and enqueuing widget JS bundle
- [ ] Settings Page (`A1`) — Connection status, API key input, widget toggle
- [ ] Sync Status Page (`A2`) — Displays products, FAQs counts, and trigger manual sync
- [ ] FAQ Manager Page (`A3`) — CRUD for FAQs natively in WordPress
- [ ] Widget Preview Page (`A4`) — Live test the widget inside WP Admin
