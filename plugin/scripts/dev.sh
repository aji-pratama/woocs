#!/usr/bin/env bash

set -e

echo "🚀 Preparing WooCS WordPress Development Environment..."

CONTAINER_NAME="woocs_wp"

# Check if container is running
if ! podman ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "❌ Error: Container '${CONTAINER_NAME}' is not running."
  echo "Please start the infrastructure first using 'make infra-up'."
  exit 1
fi

echo "⏳ Waiting for WordPress to be ready..."
until podman exec ${CONTAINER_NAME} curl -s -o /dev/null -w "%{http_code}" http://localhost/wp-login.php | grep -q "200"; do
  sleep 2
done

echo "🔧 Installing WP-CLI if not present..."
podman exec -u root ${CONTAINER_NAME} bash -c "if ! command -v wp &> /dev/null; then curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp; fi"

echo "⚙️  Installing WordPress Core (if not installed)..."
podman exec -e WP_CLI_CACHE_DIR=/tmp/.wp-cli-cache -u www-data ${CONTAINER_NAME} wp core install \
  --url=localhost:8080 \
  --title="WooCS Dev Store" \
  --admin_user=admin \
  --admin_password=admin \
  --admin_email=admin@example.com \
  --skip-email \
  || echo "ℹ️  WordPress is already installed."

echo "🛍️  Installing & Activating WooCommerce..."
podman exec -e WP_CLI_CACHE_DIR=/tmp/.wp-cli-cache -u www-data ${CONTAINER_NAME} wp plugin install woocommerce --activate

echo "🔌 Activating WooCS plugin..."
podman exec -e WP_CLI_CACHE_DIR=/tmp/.wp-cli-cache -u www-data ${CONTAINER_NAME} wp plugin activate woocs || echo "ℹ️  WooCS already active."

echo "📦 Generating WooCommerce Dummy Data..."
# Create a few dummy products using WP-CLI
podman exec -e WP_CLI_CACHE_DIR=/tmp/.wp-cli-cache -u www-data ${CONTAINER_NAME} bash -c '
  if ! wp wc product list --format=ids | grep -q "[0-9]"; then
    echo "Creating dummy products..."
    wp wc product create --name="Classic Hoodie" --type="simple" --regular_price="34.99" --description="A cozy classic hoodie." --short_description="Great hoodie." --manage_stock=true --stock_quantity=5 --user=1
    wp wc product create --name="Slim Fit Jeans" --type="simple" --regular_price="49.99" --description="Comfortable slim fit jeans." --short_description="Nice jeans." --manage_stock=true --stock_quantity=12 --user=1
    wp wc product create --name="Cotton T-Shirt" --type="simple" --regular_price="19.99" --description="100% cotton t-shirt." --short_description="Basic tee." --manage_stock=true --stock_quantity=0 --user=1
  else
    echo "ℹ️  Products already exist. Skipping dummy data generation."
  fi
'

echo "✅ Dev environment ready! Log in at http://localhost:8080/wp-admin (admin/admin)"
