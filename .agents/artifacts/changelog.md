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
