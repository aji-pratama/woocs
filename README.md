# WooCS.ai

> AI-powered customer support assistant for WooCommerce — PoC

WooCS.ai is a three-layer system that brings zero-setup RAG-based chat support to WooCommerce stores. A WordPress plugin syncs the product catalog to a Hono JS backend, which handles RAG retrieval and chat generation via Claude Haiku. A React widget is injected into the storefront for customers to interact with.

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
│  Hono JS backend (host)                                   │
│  Hono-ninja API  +  Background Worker workers                     │
│  Apps: store · chat                                      │
└──────┬──────────────────────────────┬────────────────────┘
       │                              │
┌──────▼──────┐              ┌────────▼───────┐
│ PostgreSQL  │              │  Redis         │
│ 15+pgvector │              │  (Background Worker broker│
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
| Backend | Hono 5.x + Hono Ninja |
| Task Queue | Background Worker + Redis |
| Database | PostgreSQL 15 + pgvector |
| RAG | LlamaIndex + Claude Haiku (Anthropic) |
| Containers | Docker Compose (infra only) |

---

## Port Allocation

| Service | Port | Notes |
|---|---|---|
| Hono API | `8000` | `npm run dev:api` |
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

npm install
npm run migrate
npm run setup
```

### 3. Start backend services

```bash
# In separate terminals:
npm run dev:api       # Hono dev server → http://localhost:8000
make dev-Background Worker    # Background Worker worker
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
├── backend/          # Hono JS backend (runs on host)
│   ├── config/       # Hono project config + Background Worker
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
make dev                   # Start EVERYTHING (containers, API, Background Worker, Vite) in parallel
```
*Note: If port 5173 is in use, Vite will automatically try 5174.*

### Individual Commands

```bash
make infra-up              # Start PostgreSQL, MySQL, Redis, WordPress
npm run dev:api               # Start Hono dev server
make dev-Background Worker            # Start Background Worker worker
make dev-widget            # Start Vite dev server
```

### Setup & Build

```bash
npm install       # Install Node dependencies
npm run migrate       # Run Hono migrations
make wp-build              # Build widget and package plugin into woocs.zip
make db-dump               # Dump Postgres data to fixtures/init.sql
```

---

### UI Mock Testing (AI_MOCK_MODE)

To test the Widget UI scenarios without making actual requests to the AI API (saving costs and avoiding latency), you can enable the mock mode. 
Add this to your `api/.env` file:
```env
AI_MOCK_MODE=true
```

Once enabled, restart the API server. You can then trigger specific UI scenarios by typing these exact keywords in the widget chat:
- `mock_product` - Simulates an AI response returning a single product, rendering a Product Card.
- `mock_carousel` - Simulates an AI response returning multiple products, rendering a Product Carousel.
- `mock_escalate` - Simulates a low-confidence AI response, triggering the escalation flow.
- `mock_error` - Simulates an internal AI service error to test error handling.

---

## PoC Scope

See [PRD](./_docs/PRD.md) for the full specification.

**Hypotheses to validate:**
- H1: 100+ products synced and embedded in < 3 min
- H2: 15/20 manual queries answered correctly without hallucination
- H3: Escalation fires correctly on keyword/low-confidence triggers
