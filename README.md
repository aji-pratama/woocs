# WooCS.ai

> AI-powered customer support assistant for WooCommerce — PoC

WooCS.ai is a three-layer system that brings zero-setup RAG-based chat support to WooCommerce stores. A WordPress plugin syncs the product catalog to a Django backend, which handles RAG retrieval and chat generation via Claude Haiku. A React widget is injected into the storefront for customers to interact with.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Storefront (customer-facing)                            │
│  React widget  →  POST /api/widget/chat/                 │
│                →  GET  /api/widget/order-status/         │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼───────────────────────────────────┐
│  Django Backend (host)                                   │
│  django-ninja API  +  Celery workers                     │
│  Apps: store · chat                                      │
└──────┬──────────────────────────────┬────────────────────┘
       │                              │
┌──────▼──────┐              ┌────────▼───────┐
│ PostgreSQL  │              │  Redis         │
│ 15+pgvector │              │  (Celery broker│
│ (containers)│              │   + backend)   │
└─────────────┘              └────────────────┘

┌──────────────────────────────────────────────────────────┐
│  WordPress Plugin (PHP)                                  │
│  Pulls WC catalog  →  POST /api/stores/sync/             │
│  Admin UI: Settings · Sync · FAQs · Preview              │
└──────────────────────────────────────────────────────────┘
```

---

## Stack

| Layer | Technology |
|---|---|
| WP Plugin | PHP 8.1 |
| Widget | React + Vite |
| Backend | Django 5.x + Django Ninja |
| Task Queue | Celery + Redis |
| Database | PostgreSQL 15 + pgvector |
| RAG | LlamaIndex + Claude Haiku (Anthropic) |
| Containers | Docker Compose (infra only) |

---

## Port Allocation

| Service | Port | Notes |
|---|---|---|
| Django API | `8000` | `make dev-api` |
| Vite (Widget) | `5173` | `make dev-widget` |
| WordPress | `8080` | `make infra-up` |
| PostgreSQL | `5432` | `make infra-up` |
| MySQL | `3306` | `make infra-up` |
| Redis | `6379` | `make infra-up` |

---

## Quickstart

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker + Docker Compose

### 1. Start infrastructure

```bash
make infra-up
```

Starts: PostgreSQL (port 5432), MySQL (port 3306), WordPress (port 8080), Redis (port 6379).

### 2. Set up backend

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your settings

make backend-install
make backend-migrate
make backend-createsuperuser
```

### 3. Start backend services

```bash
# In separate terminals:
make dev-api       # Django dev server → http://localhost:8000
make dev-celery    # Celery worker
```

### 4. Start widget

```bash
make widget-install
make dev-widget    # Vite dev server → http://localhost:5173
```

### 5. Access WordPress

WordPress is available at http://localhost:8080. The `plugin/` directory is bind-mounted into the WP container — install and activate **WooCS.ai** from WP Admin › Plugins.

---

## Directory Layout

```
woocs/
├── backend/          # Django backend (runs on host)
│   ├── config/       # Django project config + Celery
│   ├── store/        # Store model, registration API, catalog ingest
│   ├── chat/         # RAG chat + escalation app
│   └── requirements.txt
├── plugin/           # WordPress plugin (PHP)
├── widget/           # React widget (Vite)
├── compose.dev.yml   # Docker Compose for infra services
└── Makefile          # Dev orchestration
```

---

## Development Flow

The project is orchestrated entirely via `make`.

### Daily Development

```bash
make dev                   # Start EVERYTHING (containers, API, Celery, Vite) in parallel
```
*Note: If port 5173 is in use, Vite will automatically try 5174.*

### Individual Commands

```bash
make infra-up              # Start PostgreSQL, MySQL, Redis, WordPress
make dev-api               # Start Django dev server
make dev-celery            # Start Celery worker
make dev-widget            # Start Vite dev server
```

### Setup & Build

```bash
make backend-install       # Install Python dependencies
make backend-migrate       # Run Django migrations
make wp-build              # Build widget and package plugin into woocs.zip
make db-dump               # Dump Postgres data to fixtures/init.sql
```

---

## PoC Scope

See [PRD v0](.docs/PRD_v0.md) for full specification.

**Hypotheses to validate:**
- H1: 100+ products synced and embedded in < 3 min
- H2: 15/20 manual queries answered correctly without hallucination
- H3: Escalation fires correctly on keyword/low-confidence triggers
