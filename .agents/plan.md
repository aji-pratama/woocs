# WooCS.ai — Development Plan

## Scaffolding Status
> Updated: 2026-06-26

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

## Next: Feature Development

> Start here when scaffolding is confirmed working.

### Phase 1 — Store & Auth
- [ ] `store/models.py` — Store model (UUID PK, name, api_key_hash, created_at)
- [ ] `store/api.py` — `POST /api/stores/register/` endpoint
- [ ] `store/schemas.py` — request/response Pydantic schemas
- [ ] `config/auth.py` — API key auth class for Django Ninja
- [ ] Migrations + `make backend-migrate`

### Phase 2 — Catalog Sync
- [ ] `store/models.py` — Product, ProductVariation, FAQ models (with VectorField)
- [ ] `store/api.py` — `POST /api/stores/sync/` ingest endpoint
- [ ] `store/tasks.py` — Celery embedding pipeline tasks
- [ ] Migrations

### Phase 3 — Chat & RAG
- [ ] `chat/models.py` — ChatSession, ChatMessage models
- [ ] `chat/api.py` — `POST /api/widget/chat/` widget-facing endpoint (keyless, scoped by store_id)
- [ ] `chat/rag.py` — LlamaIndex query engine + pgvector integration
- [ ] `chat/escalation.py` — email escalation via SMTP

### Phase 4 — Widget UI
- [ ] React widget UI — chat bubble, message thread, escalation form
- [ ] `make wp-build` — bundle + WordPress plugin zip

### Phase 5 — WordPress Plugin
- [ ] `plugin/woocs-ai.php` — plugin entry point, settings page, widget injection
