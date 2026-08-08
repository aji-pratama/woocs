# WooCS.ai — Agent Guide

This directory is the static brain for AI-assisted development. Keep only durable
instructions, technical invariants, and path-scoped rules in `.agents`. Product
documentation, plans, decisions, and project history belong in `_docs`.

Before making changes, read these sources in order:

1. `.agents/rules/main.md`
2. `_docs/PRD.md`
3. The relevant plan under `_docs/plans/`
4. The relevant path-scoped rule under `.agents/rules/`

## Technical Invariants

These facts MUST NOT be changed without a new architecture decision:

### Runtime Model
- **Django backend** runs **directly on the host** (not in a container).
- **Infrastructure services** (PostgreSQL, MySQL, WordPress) run in Docker via `compose.dev.yml`.
- **React widget** dev server runs directly on the host (`npm run dev` in `plugin/widget/`).
- **No container rebuilds needed** for code changes. Backend and widget changes are hot-reloaded.

### Directory Layout
```
woocs/
├── .agents/          # Static AI instructions and rules
├── _docs/            # Product docs, plans, history, and reference material
├── backend/          # Django project (host process)
│   ├── config/       # Django settings, URLs
│   ├── common/       # Shared logic, TaskRecord, custom Postgres task backend
│   ├── store/        # Store model, registration API, catalog ingest
│   ├── billing/      # Store-owned subscription and Polar integration
│   └── chat/         # ChatSession, ChatMessage, RAG pipeline, escalation
├── plugin/           # WordPress plugin (PHP)
│   └── widget/       # React/Vite widget (host process)
├── compose.dev.yml   # Docker Compose for infra only
├── Makefile          # Dev orchestration
└── README.md
```

### Documentation Layout

```text
_docs/
├── PRD.md            # Product requirements; product source of truth
├── CHANGELOG.md      # Completed work and project history
├── plans/            # Active roadmap and feature implementation plans
└── archive/          # Superseded or historical planning documents
```

### Port Map
| Service | Port | Notes |
|---|---|---|
| Django dev server | 8000 | `make dev-api` |
| Vite dev server | 5173 | `make dev-widget` |
| WordPress | 8080 | `make infra-up` |
| PostgreSQL | 5432 | `make infra-up` |
| MySQL | 3306 | `make infra-up` |

### Django Architecture
- **4 apps**: `common`, `store`, `chat`, `billing`
- **API layer**: Django Ninja — endpoints are prefixed with `/api/stores/` (plugin calls) and `/api/widget/` (widget calls)
- **Async tasks**: Django 6 Tasks framework + Custom Postgres backend — all heavy work offloaded to `db_worker`
- **Database**: PostgreSQL 15 + pgvector extension — all domain models use UUID primary keys
- **Auth model**: Static API key per store (hashed SHA-256 in DB), sent as `X-API-Key` header for `/api/stores/`. `/api/widget/` endpoints are keyless (scoped by `store_id`).
- **Billing model**: A `Subscription` belongs directly to one `Store` and is reconciled from Polar webhooks. Access is one active/inactive gate. Do not add capabilities, usage ledgers, merchant accounts, or membership before a concrete requirement needs them.

### WordPress Plugin Architecture
- Plugin resides in `plugin/` directory
- Bind-mounted into WP container at `/var/www/html/wp-content/plugins/woocs-ai`
- Plugin communicates with Django via `X-API-Key` authenticated HTTP calls
- Widget JS bundle is built via `make wp-build` and served from `plugin/assets/woocs-widget.js`

### External Services
- **LlamaIndex**: the single LLM and embedding interface
- **Anthropic, OpenAI, or Gemini**: configurable chat generation
- **OpenAI or Gemini**: configurable embeddings
- **Django ORM + pgvector**: tenant-scoped retrieval and confidence scoring
- **SMTP (Gmail)**: escalation email delivery

### AI Architecture
- Keep AI code lean: business services call only LlamaIndex interfaces.
- Select models through `AI_MODELS`; never branch on providers in business logic.
- Provider SDK details must not leak into `chat` or `store`.
- Keep retrieval, tenant isolation, confidence, and escalation explicit in Django.
- Do not add agent workflows, tools, or extra RAG abstractions until a product requirement needs them.

---

## Development Commands
```bash
make infra-up              # Start all containers
make backend-install       # pip install deps
make backend-migrate       # Run Django migrations
make dev-api               # Django dev server
make dev-worker            # Django DB task worker
make dev-widget            # Vite dev server
make dev                   # All of the above in parallel (infra + api + worker + widget)
make wp-build              # Build widget + zip plugin
make db-dump               # Dump Postgres to fixtures/init.sql
```
