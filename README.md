# WooCS.ai

AI-powered customer support assistant for WooCommerce stores with automated RAG retrieval and multi-provider AI chat failover.

For full technical specifications and architecture diagrams, see [`_docs/architecture.md`](./_docs/architecture.md) and [`_docs/PRD.md`](./_docs/PRD.md).

---

## Tech Stack & Ports

| Component | Technology | Local Port | Dev Command |
|---|---|---|---|
| **API Backend** | Hono JS + TypeScript (Node / Cloudflare) | `8001` | `make dev-api` (or `npm run dev` in `api/`) |
| **Storefront Widget** | React 18 + Vite | `5173` | `make dev-widget` |
| **WordPress + WooCommerce** | PHP 8.1+ | `8080` | `make infra-up` |
| **Database** | PostgreSQL 15 + `pgvector` | `5432` | `make infra-up` |
| **WordPress DB** | MySQL 8.0 | `3306` | `make infra-up` |

---

## Quickstart

### Prerequisites
- **Node.js** 20+
- **Podman** or **Docker** (with Compose)
- **PHP** 8.1+ (optional, for direct plugin development)

### 1. Setup & Installation
```bash
# Run one-command setup (install dependencies, launch containers, run DB migrations)
make dev-setup

# Copy and configure environment variables
cp api/.env.example api/.env
```

### 2. Run Development Environment
```bash
# Start FULL stack (Containers + API + Worker + Vite Widget)
make dev

# Or start Plugin-only mode (Containers + Widget connected to Cloud API)
make dev-plugin
```

---

## Common Dev Commands

```bash
# Infrastructure
make infra-up        # Start Postgres, MySQL, and WordPress containers
make infra-down      # Stop all containers
make infra-logs      # Follow container logs

# Host Processes
make dev-api         # Run Hono API server (http://localhost:8001)
make dev-worker      # Run background sync & embedding worker
make dev-widget      # Run Vite widget server (http://localhost:5173)

# Testing & Linting
make test-all        # Run all test suites across API, Widget, and Plugin
make lint            # Run TypeScript & PHP linters

# Build & Release
make wp-build        # Build React widget bundle and generate plugin zip (woocs.zip)
make db-dump         # Dump PostgreSQL schema and data to fixtures/init.sql
```

---

## Local Services & URLs

- **WordPress Admin**: [http://localhost:8080/wp-admin](http://localhost:8080/wp-admin) (`admin` / `admin`)
- **Storefront**: [http://localhost:8080](http://localhost:8080)
- **Internal Health Check**:
  ```bash
  curl -s -H "X-Health-Key: woocs-secret-health-key-2026" \
    http://localhost:8001/api/internal/health-check-9x7f2k
  ```

---

## Testing Utilities

### Widget UI Mock Keywords (`AI_MOCK_MODE`)
Set `AI_MOCK_MODE=true` in `api/.env` to test widget components without calling external LLMs:
- `mock_product` → Test single Product Card with "Add to Cart".
- `mock_carousel` → Test Product Recommendation Carousel.
- `mock_escalate` → Test Human Escalation form.
- `mock_error` → Test Server Error & Retry UI.

---

## Documentation Index

- **System Architecture & Diagrams**: [`_docs/architecture.md`](./_docs/architecture.md)
- **Product Requirements & Business Specs**: [`_docs/PRD.md`](./_docs/PRD.md)
- **Roadmap & Active Tasks**: [`_docs/plans/roadmap.md`](./_docs/plans/roadmap.md)
