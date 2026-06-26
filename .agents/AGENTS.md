# WooCS.ai — AGENTS.md

## Technical Invariants

These facts MUST NOT be changed without a new architecture decision:

### Runtime Model
- **Django backend** runs **directly on the host** (not in a container).
- **Infrastructure services** (PostgreSQL, MySQL, WordPress, Redis) run in Docker via `compose.dev.yml`.
- **React widget** dev server runs directly on the host (`npm run dev` in `widget/`).
- **No container rebuilds needed** for code changes. Backend and widget changes are hot-reloaded.

### Directory Layout
```
woocs/
├── .agents/          # Agent workspace (plans, rules, artifacts)
├── .docs/            # Product docs (PRD, specs)
├── backend/          # Django project (host process)
│   ├── config/       # Django settings, URLs, Celery app
│   ├── store/        # Store model, registration API, catalog ingest
│   └── chat/         # ChatSession, ChatMessage, RAG pipeline, escalation
├── plugin/           # WordPress plugin (PHP)
├── widget/           # React/Vite widget (host process)
├── compose.dev.yml   # Docker Compose for infra only
├── Makefile          # Dev orchestration
└── README.md
```

### Port Map
| Service | Port | Notes |
|---|---|---|
| Django dev server | 8000 | `make dev-api` |
| Vite dev server | 5173 | `make dev-widget` |
| WordPress | 8080 | `make infra-up` |
| PostgreSQL | 5432 | `make infra-up` |
| MySQL | 3306 | `make infra-up` |
| Redis | 6379 | `make infra-up` |

### Django Architecture
- **2 apps**: `store`, `chat`
- **API layer**: Django Ninja — all endpoints under `/api/`
- **Async tasks**: Celery + Redis — all heavy work (embedding pipeline, emails) offloaded to workers
- **Database**: PostgreSQL 15 + pgvector extension — all models use UUID primary keys
- **Auth model**: Static API key per store (hashed SHA-256 in DB), sent as `X-API-Key` header. Widget endpoints are keyless (scoped by `store_id`).

### WordPress Plugin Architecture
- Plugin resides in `plugin/` directory
- Bind-mounted into WP container at `/var/www/html/wp-content/plugins/woocs-ai`
- Plugin communicates with Django via `X-API-Key` authenticated HTTP calls
- Widget JS bundle is built via `make wp-build` and served from `plugin/assets/woocs-widget.js`

### External Services
- **Anthropic API (Claude Haiku)**: used for both embeddings and chat generation
- **LlamaIndex**: query engine layer + pgvector store integration
- **SMTP (Gmail)**: escalation email delivery

---

## Development Commands
```bash
make infra-up              # Start all containers
make backend-install       # pip install deps
make backend-migrate       # Run Django migrations
make dev-api               # Django dev server
make dev-celery            # Celery worker
make dev-widget            # Vite dev server
make dev                   # All of the above in parallel
make wp-build              # Build widget + zip plugin
make db-dump               # Dump Postgres to fixtures/init.sql
```