# WooCS.ai

> AI-powered customer support assistant for WooCommerce — PoC

WooCS.ai is a three-layer system that brings zero-setup RAG-based chat support to WooCommerce stores. A WordPress plugin syncs the product catalog to a Django backend, which handles RAG retrieval and chat generation via Claude Haiku. A React widget is injected into the storefront for customers to interact with.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Storefront (customer-facing)                            │
│  React widget  →  POST /api/chat/                        │
│                →  GET  /api/order-status/                │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼───────────────────────────────────┐
│  Django Backend (host)                                   │
│  django-ninja API  +  Celery workers                     │
│  Apps: stores · sync · catalog · chat                    │
└──────┬──────────────────────────────┬────────────────────┘
       │                              │
┌──────▼──────┐              ┌────────▼───────┐
│ PostgreSQL  │              │  Redis         │
│ 15+pgvector │              │  (Celery broker│
│ (containers)│              │   + backend)   │
└─────────────┘              └────────────────┘

┌──────────────────────────────────────────────────────────┐
│  WordPress Plugin (PHP)                                  │
│  Pulls WC catalog  →  POST /api/sync/                    │
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
│   ├── stores/       # Store registration app
│   ├── sync/         # Catalog ingest app
│   ├── catalog/      # Product / FAQ / embedding app
│   ├── chat/         # RAG chat + escalation app
│   └── requirements.txt
├── plugin/           # WordPress plugin (PHP)
├── widget/           # React widget (Vite)
├── compose.dev.yml   # Docker Compose for infra services
└── Makefile          # Dev orchestration
```

---

## All-in-one

```bash
make dev
```

Starts containers + Django + Celery + Vite in parallel.

---

## Build & Package Plugin

```bash
make wp-build
```

Builds the widget bundle, copies it into `plugin/assets/`, and zips `plugin/` as `woocs.zip` for WP Admin upload.

---

## PoC Scope

See [PRD v0](.docs/PRD_v0.md) for full specification.

**Hypotheses to validate:**
- H1: 100+ products synced and embedded in < 3 min
- H2: 15/20 manual queries answered correctly without hallucination
- H3: Escalation fires correctly on keyword/low-confidence triggers
