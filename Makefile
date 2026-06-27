.PHONY: help \
        infra-up infra-down infra-logs \
        backend-install backend-migrate backend-createsuperuser backend-format \
        dev-api dev-celery dev-widget widget-install \
        dev wp-build db-dump

PYTHON  = backend/.venv/bin/python
PIP     = backend/.venv/bin/pip
CELERY  = backend/.venv/bin/celery

# Use Podman socket if docker.sock does not exist
PODMAN_SOCK := $(shell podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null)
export DOCKER_HOST := $(if $(PODMAN_SOCK),unix://$(PODMAN_SOCK),unix:///var/run/docker.sock)

# ─── Help ────────────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "WooCS.ai — Development Commands"
	@echo "================================"
	@echo ""
	@echo "  Infrastructure (Docker)"
	@echo "  ─────────────────────────────"
	@echo "  infra-up              Start all containers (postgres, mysql, wp, redis)"
	@echo "  infra-down            Stop and remove containers"
	@echo "  infra-logs            Tail container logs"
	@echo ""
	@echo "  Backend (Django — runs on host)"
	@echo "  ─────────────────────────────"
	@echo "  backend-install       Create .venv and pip install"
	@echo "  backend-migrate       Run Django migrations"
	@echo "  backend-createsuperuser  Create Django admin user"
	@echo "  backend-format        Format Python code (PEP8)"
	@echo "  dev-api               Start Django dev server (port 8000)"
	@echo "  dev-celery            Start Celery worker"
	@echo ""
	@echo "  Widget (React/Vite — runs on host)"
	@echo "  ─────────────────────────────"
	@echo "  widget-install        npm install in widget/"
	@echo "  dev-widget            Start Vite dev server (port 5173)"
	@echo "  wp-build              Build widget bundle and package plugin zip"
	@echo ""
	@echo "  All-in-one"
	@echo "  ─────────────────────────────"
	@echo "  dev                   Start everything (infra + api + celery + widget)"
	@echo ""
	@echo "  Database"
	@echo "  ─────────────────────────────"
	@echo "  db-dump               Dump backend_db to fixtures/init.sql"
	@echo ""

# ─── Infrastructure ──────────────────────────────────────────────────────────

infra-up:
	docker compose -f compose.dev.yml up -d

infra-down:
	docker compose -f compose.dev.yml down

infra-logs:
	docker compose -f compose.dev.yml logs -f

# ─── Backend ─────────────────────────────────────────────────────────────────

backend-install:
	@test -d backend/.venv || python3 -m venv backend/.venv
	$(PIP) install --upgrade pip -q
	$(PIP) install -r backend/requirements.txt

backend-migrate:
	cd backend && $(abspath $(PYTHON)) manage.py migrate

backend-createsuperuser:
	cd backend && $(abspath $(PYTHON)) manage.py createsuperuser

backend-format:
	@chmod +x backend/scripts/formatter.sh
	@./backend/scripts/formatter.sh

dev-api:
	cd backend && $(abspath $(PYTHON)) manage.py runserver

dev-celery:
	cd backend && $(abspath $(CELERY)) -A config worker -l info

# ─── Widget ──────────────────────────────────────────────────────────────────

widget-install:
	cd widget && npm install

dev-widget:
	cd widget && npm run dev

wp-build:
	cd widget && npm run build
	mkdir -p plugin/assets
	cp widget/dist/assets/*.js plugin/assets/woocs-widget.js 2>/dev/null || \
	  cp widget/dist/woocs-widget.umd.js plugin/assets/woocs-widget.js 2>/dev/null || true
	rm -f woocs.zip
	zip -r woocs.zip plugin/

wp-dev-setup:
	@chmod +x plugin/scripts/dev.sh
	@./plugin/scripts/dev.sh

# ─── All-in-one ──────────────────────────────────────────────────────────────

dev: infra-up
	@echo "Infrastructure started. Launching host services..."
	@trap 'kill 0' EXIT; \
	$(MAKE) dev-api & \
	$(MAKE) dev-celery & \
	$(MAKE) dev-widget & \
	wait

# ─── Database ────────────────────────────────────────────────────────────────

db-dump:
	@mkdir -p fixtures
	docker exec woocs_backend_db pg_dump -U woocs woocs > fixtures/init.sql
	@echo "Dumped backend DB to fixtures/init.sql"
