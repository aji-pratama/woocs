.PHONY: help \
        infra-up infra-down infra-logs \
        backend-install backend-migrate backend-createsuperuser backend-format \
        dev-api dev-celery dev-widget widget-install \
        dev wp-build db-dump

PYTHON  = backend/.venv/bin/python
PIP     = backend/.venv/bin/pip

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
	@echo "  dev-worker            Start Django DB task worker"
	@echo ""
	@echo "  Widget (React/Vite — runs on host)"
	@echo "  ─────────────────────────────"
	@echo "  widget-install        npm install in widget/"
	@echo "  dev-widget            Start Vite dev server (port 5173)"
	@echo "  wp-build              Build widget bundle and package plugin zip"
	@echo ""
	@echo "  All-in-one"
	@echo "  ─────────────────────────────"
	@echo "  dev                   Start everything (infra + api + worker + widget)"
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

dev-worker:
	cd backend && $(abspath $(PYTHON)) manage.py db_worker

# ─── Widget ──────────────────────────────────────────────────────────────────

widget-install:
	cd plugin/widget && npm install

dev-widget:
	rm -rf plugin/assets
	cd plugin/widget && npm run dev

wp-build:
	cd plugin/widget && npm run build
	mkdir -p plugin/assets
	cp plugin/widget/dist/assets/*.js plugin/assets/woocs-widget.js 2>/dev/null || \
	  cp plugin/widget/dist/woocs-widget.umd.js plugin/assets/woocs-widget.js 2>/dev/null || true
	cp plugin/widget/dist/assets/*.css plugin/assets/woocs-widget.css 2>/dev/null || true
	rm -f woocs.zip
	zip -r woocs.zip plugin/ -x "plugin/widget/*" -x "plugin/scripts/*" -x "plugin/dist/*"

wp-dev-setup:
	@chmod +x plugin/scripts/dev.sh
	@./plugin/scripts/dev.sh

# ─── All-in-one ──────────────────────────────────────────────────────────────

dev: infra-up
	@echo "Infrastructure started. Launching host services..."
	@trap 'kill 0' EXIT; \
	$(MAKE) dev-api & \
	$(MAKE) dev-worker & \
	$(MAKE) dev-widget & \
	wait

dev-hard-clean:
	@echo "⚠️  WARNING: This will remove all containers, volumes, networks, and images for this project."
	@read -p "Are you sure you want to proceed? [y/N] " ans && if [ "$${ans:-N}" = "y" ] || [ "$${ans:-N}" = "Y" ]; then \
		docker compose -f compose.dev.yml down --rmi all -v --remove-orphans; \
		echo "Hard clean complete."; \
	else \
		echo "Aborted."; \
	fi

dev-clean:
	@echo "Cleaning containers and volumes..."
	docker compose -f compose.dev.yml down -v --remove-orphans

dev-setup:
	@echo "Setting up development environment..."
	$(MAKE) widget-install
	$(MAKE) backend-install
	$(MAKE) infra-up
	@echo "Waiting for databases to be ready..."
	@sleep 5
	$(MAKE) backend-migrate
	$(MAKE) wp-dev-setup
	@echo "✅ Setup complete! You can now run 'make dev' to start all services."

# ─── Database ────────────────────────────────────────────────────────────────

db-dump:
	@mkdir -p fixtures
	docker exec woocs_backend_db pg_dump -U woocs woocs > fixtures/init.sql
	@echo "Dumped backend DB to fixtures/init.sql"
