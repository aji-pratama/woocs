.PHONY: help \
        dev dev-plugin dev-api dev-worker dev-widget \
        infra-up infra-down infra-logs \
        dev-setup dev-clean dev-hard-clean db-init db-dump \
        wp-build cf-dev cf-deploy \
        test-all test-api test-widget test-plugin \
        lint lint-api lint-widget lint-plugin

CLOUD_API_URL ?= https://woocs.bisatekno-id.workers.dev

# Use Podman socket if podman.sock does not exist
PODMAN_SOCK := $(shell podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null)
export podman_HOST := $(if $(PODMAN_SOCK),unix://$(PODMAN_SOCK),unix:///var/run/podman.sock)

CONTAINER ?= podman

COMPOSE_ENV := $(if $(wildcard api/.env),--env-file api/.env,)
COMPOSE := $(CONTAINER) compose -f compose.dev.yml $(COMPOSE_ENV)

# ─── Help ────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "WooCS.ai — Development Commands"
	@echo "================================"
	@echo ""
	@echo "  Development Modes"
	@echo "  ─────────────────────────────"
	@echo "  dev                   Start full stack locally (infra + api + worker + widget)"
	@echo "  dev-plugin            Start plugin only with Cloud API (infra + widget)"
	@echo "  dev-api               Start local Hono API server"
	@echo "  dev-worker            Start local background task worker"
	@echo "  dev-widget            Start Vite widget dev server"
	@echo ""
	@echo "  Infrastructure & Environment"
	@echo "  ─────────────────────────────"
	@echo "  infra-up              Start Podman containers (WordPress, MySQL, Postgres)"
	@echo "  infra-down            Stop containers"
	@echo "  infra-logs            Tail container logs"
	@echo "  dev-setup             Initial setup (dependencies, containers, migrations, WP)"
	@echo "  dev-clean             Remove containers and volumes"
	@echo "  dev-hard-clean        Remove all containers, images, and volumes"
	@echo "  db-init               Initialize database (pgvector, migrate, and verify)"
	@echo "  db-dump               Dump Postgres database to fixtures/init.sql"
	@echo ""
	@echo "  Build & Deployment"
	@echo "  ─────────────────────────────"
	@echo "  wp-build              Build widget bundle and package plugin zip (woocs.zip)"
	@echo "  cf-dev                Simulate Cloudflare Workers locally (wrangler dev)"
	@echo "  cf-deploy             Deploy Hono backend to Cloudflare Workers"
	@echo ""
	@echo "  Quality & Testing"
	@echo "  ─────────────────────────────"
	@echo "  test-all              Run all test suites (API + Widget + Plugin)"
	@echo "  lint                  Run all linters (TypeScript + PHP)"
	@echo ""

# ─── Development Modes ───────────────────────────────────────────────────────
# Full-stack local development (infra + local Hono API + local worker + Vite widget)
dev: infra-up
	@echo "Configuring WordPress for local API (http://host.containers.internal:8001)..."
	@podman exec woocs_wp_db mysql -u wordpress -pwordpress_dev wordpress -e "INSERT INTO wp_options (option_name, option_value, autoload) VALUES ('woocs_api_url', 'http://host.containers.internal:8001', 'yes') ON DUPLICATE KEY UPDATE option_value = 'http://host.containers.internal:8001';" 2>/dev/null || true
	@echo "Infrastructure started. Launching host services..."
	@trap 'kill 0' EXIT; \
	$(MAKE) dev-api & \
	$(MAKE) dev-worker & \
	$(MAKE) dev-widget & \
	wait

# Plugin-only development (WordPress + Widget dev server connected to Cloud API)
dev-plugin: infra-up
	@echo "Configuring WordPress to use Cloud API: $(CLOUD_API_URL)..."
	@podman exec woocs_wp_db mysql -u wordpress -pwordpress_dev wordpress -e "INSERT INTO wp_options (option_name, option_value, autoload) VALUES ('woocs_api_url', '$(CLOUD_API_URL)', 'yes') ON DUPLICATE KEY UPDATE option_value = '$(CLOUD_API_URL)';" 2>/dev/null || true
	@echo "WordPress storefront running at: http://localhost:8080"
	@echo "Starting widget dev server connected to $(CLOUD_API_URL)..."
	@VITE_API_URL="$(CLOUD_API_URL)" $(MAKE) dev-widget

dev-api:
	cd api && npm run dev

dev-worker:
	cd api && npm run worker

dev-widget:
	rm -f plugin/assets/woocs-widget.*
	cd plugin/widget && npm run dev

# ─── Infrastructure ──────────────────────────────────────────────────────────
infra-up:
	$(COMPOSE) up -d

infra-down:
	$(COMPOSE) down

infra-logs:
	$(COMPOSE) logs -f

# ─── Setup & Database ────────────────────────────────────────────────────────
dev-setup:
	@echo "Setting up development environment..."
	cd plugin/widget && npm install
	cd api && npm install
	$(MAKE) infra-up
	@echo "Waiting for databases to be ready..."
	@sleep 5
	cd api && npx drizzle-kit migrate
	@chmod +x plugin/scripts/dev.sh && ./plugin/scripts/dev.sh
	@echo "✅ Setup complete! You can now run 'make dev' or 'make dev-plugin'."

dev-clean:
	@echo "Cleaning containers and volumes..."
	$(COMPOSE) down -v --remove-orphans

dev-hard-clean:
	@echo "⚠️  WARNING: This will remove all containers, volumes, networks, and images for this project."
	@read -p "Are you sure you want to proceed? [y/N] " ans && if [ "$${ans:-N}" = "y" ] || [ "$${ans:-N}" = "Y" ]; then \
		$(COMPOSE) down --rmi all -v --remove-orphans; \
		echo "Hard clean complete."; \
	else \
		echo "Aborted."; \
	fi

db-init:
	cd api && npm run db:init

db-dump:
	@mkdir -p fixtures
	podman exec woocs_backend_db pg_dump -U woocs woocs > fixtures/init.sql
	@echo "Dumped backend DB to fixtures/init.sql"

# ─── Build & Deployment ──────────────────────────────────────────────────────
wp-build:
	cd plugin/widget && npm run build
	mkdir -p plugin/assets
	cp plugin/widget/dist/assets/*.js plugin/assets/woocs-widget.js 2>/dev/null || \
	  cp plugin/widget/dist/woocs-widget.umd.js plugin/assets/woocs-widget.js 2>/dev/null || true
	cp plugin/widget/dist/assets/*.css plugin/assets/woocs-widget.css 2>/dev/null || true
	rm -f woocs.zip
	zip -r woocs.zip plugin/ -x "plugin/widget/*" -x "plugin/scripts/*" -x "plugin/dist/*"

cf-dev:
	cd api && npm run cf:dev

cf-deploy:
	cd api && npm run cf:deploy

# ─── Testing & Quality ───────────────────────────────────────────────────────
lint-api:
	@echo "Linting API (TypeScript)..."
	cd api && npx tsc --noEmit

lint-widget:
	@echo "Linting Widget (TypeScript)..."
	cd plugin/widget && npx tsc --noEmit

lint-plugin:
	@echo "Linting Plugin (PHP syntax check) via Podman..."
	$(CONTAINER) run --rm -v $$(pwd)/plugin:/app -w /app php:8.2-cli bash -c 'for f in $$(find src/ woocs.php -name "*.php"); do php -l $$f > /dev/null || exit 1; done'

lint: lint-api lint-widget lint-plugin
	@echo "✅ All linting checks passed!"

test-api:
	@echo "Running API tests..."
	cd api && npm test

test-widget:
	@echo "Running Widget tests..."
	cd plugin/widget && npm test

test-plugin:
	@echo "Installing Plugin dependencies via Podman..."
	$(CONTAINER) run --rm -v $(PWD)/plugin:/app -w /app composer install
	@echo "Running Plugin tests via Podman..."
	$(CONTAINER) run --rm -v $(PWD)/plugin:/app -w /app php:8.3-cli ./vendor/bin/phpunit

test-all:
	@echo "Running all tests..."
	$(MAKE) test-api
	$(MAKE) test-widget
	$(MAKE) test-plugin
	@echo "✅ All tests passed!"
