.PHONY: help \
        infra-up infra-down infra-logs \
        api-install api-dev api-worker api-test api-db-generate api-db-migrate api-db-studio \
        widget-install dev-widget wp-build wp-dev-setup \
        dev dev-setup dev-clean dev-hard-clean db-dump

# Use Podman socket if podman.sock does not exist
PODMAN_SOCK := $(shell podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null)
export podman_HOST := $(if $(PODMAN_SOCK),unix://$(PODMAN_SOCK),unix:///var/run/podman.sock)

# ─── Help ────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "WooCS.ai — Development Commands"
	@echo "================================"
	@echo ""
	@echo "  Infrastructure (podman)"
	@echo "  ─────────────────────────────"
	@echo "  infra-up              Start all containers"
	@echo "  infra-down            Stop and remove containers"
	@echo "  infra-logs            Tail container logs"
	@echo ""
	@echo "  Hono API (TypeScript — runs on host)"
	@echo "  ─────────────────────────────"
	@echo "  api-install           npm install in api/"
	@echo "  api-dev               Start Hono dev server"
	@echo "  api-worker            Start Hono task worker"
	@echo "  api-test              Run Vitest test suite"
	@echo "  api-db-generate       Generate Drizzle SQL migrations"
	@echo "  api-db-migrate        Apply Drizzle migrations"
	@echo "  api-db-studio         Launch Drizzle Studio"
	@echo ""
	@echo "  Widget (React/Vite — runs on host)"
	@echo "  ─────────────────────────────"
	@echo "  widget-install        npm install in widget/"
	@echo "  dev-widget            Start Vite dev server"
	@echo "  wp-build              Build widget bundle and package plugin zip"
	@echo ""
	@echo "  All-in-one"
	@echo "  ─────────────────────────────"
	@echo "  dev                   Start everything (infra + api + worker + widget)"
	@echo ""

COMPOSE_ENV := $(if $(wildcard api/.env),--env-file api/.env,)
COMPOSE := podman compose -f compose.dev.yml $(COMPOSE_ENV)

# ─── Infrastructure ──────────────────────────────────────────────────────────
infra-up:
	$(COMPOSE) up -d

infra-down:
	$(COMPOSE) down

infra-logs:
	$(COMPOSE) logs -f

# ─── Hono API (TypeScript) ───────────────────────────────────────────────────
api-install:
	cd api && npm install

api-dev:
	cd api && npm run dev

api-worker:
	cd api && npm run worker

api-test:
	cd api && npm test

api-db-generate:
	cd api && npx drizzle-kit generate

api-db-migrate:
	cd api && npx drizzle-kit migrate

api-db-studio:
	cd api && npx drizzle-kit studio

# ─── Widget ──────────────────────────────────────────────────────────────────
widget-install:
	cd plugin/widget && npm install

dev-widget:
	rm -f plugin/assets/woocs-widget.*
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
	$(MAKE) api-dev & \
	$(MAKE) api-worker & \
	$(MAKE) dev-widget & \
	wait

dev-hard-clean:
	@echo "⚠️  WARNING: This will remove all containers, volumes, networks, and images for this project."
	@read -p "Are you sure you want to proceed? [y/N] " ans && if [ "$${ans:-N}" = "y" ] || [ "$${ans:-N}" = "Y" ]; then \
		$(COMPOSE) down --rmi all -v --remove-orphans; \
		echo "Hard clean complete."; \
	else \
		echo "Aborted."; \
	fi

dev-clean:
	@echo "Cleaning containers and volumes..."
	$(COMPOSE) down -v --remove-orphans

dev-setup:
	@echo "Setting up development environment..."
	$(MAKE) widget-install
	$(MAKE) api-install
	$(MAKE) infra-up
	@echo "Waiting for databases to be ready..."
	@sleep 5
	$(MAKE) api-db-migrate
	$(MAKE) wp-dev-setup
	@echo "✅ Setup complete! You can now run 'make dev' to start all services."

# ─── Database ────────────────────────────────────────────────────────────────
db-dump:
	@mkdir -p fixtures
	podman exec woocs_backend_db pg_dump -U woocs woocs > fixtures/init.sql
	@echo "Dumped backend DB to fixtures/init.sql"

# ─── Tests ───────────────────────────────────────────────────────────────────
test-api:
	@echo "Running API tests..."
	cd api && npm test

test-widget:
	@echo "Running Widget tests..."
	cd plugin/widget && npm test

test-plugin:
	@echo "Installing Plugin dependencies via Docker..."
	docker run --rm -v $(PWD)/plugin:/app -w /app composer install
	@echo "Running Plugin tests via Docker..."
	docker run --rm -v $(PWD)/plugin:/app -w /app php:8.2-cli ./vendor/bin/phpunit

test-all:
	@echo "Running all tests..."
	$(MAKE) test-api
	$(MAKE) test-widget
	$(MAKE) test-plugin
	@echo "✅ All tests passed!"
