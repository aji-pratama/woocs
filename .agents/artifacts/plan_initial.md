# Project Setup Plan: WooCS.ai

## Objective
Initialize the directory structure and base files for the WooCS.ai monorepo. Execute sequentially.

Everything is zero, so you most be start working based on `.docs/PRD_v0.md`

## Phase 1: Root Files & Container Infrastructure
1. Create a `Makefile` in the root directory to orchestrate local development.
2. Create `compose.dev.yml` strictly for the containerized backing services:
   - `backend_db` (PostgreSQL database with the `pgvector` extension)
   - `wp_db` (MySQL database for WordPress)
   - `wp` (WordPress app)
   - `redis` (Message broker for Celery)

3. Create the main `README.md` in the root directory.

## Phase 2: Agent Workspace & Docs
1. Update `.agents/AGENTS.md` based on `.docs/PRD_v0.md`
2. Work on `.agents/rules/*` it's copied from old project, you have to update and should be following PRD

## Phase 3: Backend (Django - Running on Host)
1. Create the `backend/` directory. This service will run directly on the host machine, connecting to the containerized Postgres and Redis.
2. Create `backend/requirements.txt` and populate it with core dependencies (`Django`, `django-ninja`, `celery`, `redis`, `psycopg2-binary`, `llama-index`).
3. Initialize a new Django project named `config` inside the `backend/` directory (ensuring `manage.py` is generated at the root of `backend/`).
4. Create `backend/README.md`.

## Phase 4: WordPress Plugin
1. Create the `plugin/` directory to house the raw PHP plugin files.
2. Create `plugin/README.md`.

## Phase 5: React Widget (Running on Host)
1. Create the `widget/` directory. This dev server will run directly on the host machine.
2. Initialize the React frontend project skeleton using Vite inside the `widget/` directory.
3. Create `widget/README.md`.

## Phase 6: Development Orchestration
1. Update the `Makefile` in the root directory with the following configuration to manage the environments, make sure it works
