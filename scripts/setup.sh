#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== WP Launcher Setup ==="

# Generate a random secret
gen_secret() { openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64; }

# Copy .env if it doesn't exist
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"

    # Generate random secrets
    API_KEY=$(gen_secret)
    JWT_SECRET=$(gen_secret)
    PROVISIONER_KEY=$(gen_secret)

    # Detect OS-compatible sed in-place flag
    if sed --version 2>/dev/null | grep -q GNU; then
        SED_I=(sed -i)
    else
        SED_I=(sed -i '')
    fi

    # Replace placeholder values
    "${SED_I[@]}" "s|^API_KEY=.*|API_KEY=${API_KEY}|" "$PROJECT_DIR/.env"
    "${SED_I[@]}" "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "$PROJECT_DIR/.env"
    "${SED_I[@]}" "s|^PROVISIONER_INTERNAL_KEY=.*|PROVISIONER_INTERNAL_KEY=${PROVISIONER_KEY}|" "$PROJECT_DIR/.env"

    # Set local dev defaults
    "${SED_I[@]}" "s|^NODE_ENV=.*|NODE_ENV=development|" "$PROJECT_DIR/.env"
    "${SED_I[@]}" "s|^BASE_DOMAIN=.*|BASE_DOMAIN=localhost|" "$PROJECT_DIR/.env"
    "${SED_I[@]}" "s|^PUBLIC_URL=.*|PUBLIC_URL=http://localhost|" "$PROJECT_DIR/.env"
    "${SED_I[@]}" "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=http://localhost|" "$PROJECT_DIR/.env"
    "${SED_I[@]}" "s|^ACME_EMAIL=.*|ACME_EMAIL=dev@localhost.test|" "$PROJECT_DIR/.env"

    # Set SMTP to use built-in Mailpit
    "${SED_I[@]}" "s|^SMTP_HOST=.*|SMTP_HOST=mailpit|" "$PROJECT_DIR/.env"
    "${SED_I[@]}" "s|^SMTP_PORT=.*|SMTP_PORT=1025|" "$PROJECT_DIR/.env"
    "${SED_I[@]}" "s|^SMTP_SECURE=.*|SMTP_SECURE=false|" "$PROJECT_DIR/.env"
    "${SED_I[@]}" "s|^SMTP_USER=.*|SMTP_USER=|" "$PROJECT_DIR/.env"
    "${SED_I[@]}" "s|^SMTP_PASS=.*|SMTP_PASS=|" "$PROJECT_DIR/.env"

    # Set PRODUCT_ASSETS_PATH to the project's product-assets directory
    "${SED_I[@]}" "s|^PRODUCT_ASSETS_PATH=.*|PRODUCT_ASSETS_PATH=${PROJECT_DIR}/product-assets|" "$PROJECT_DIR/.env"

    echo "[setup] Created .env with generated secrets and local dev defaults"
    echo "[setup] API Key: ${API_KEY}"
else
    echo "[setup] .env already exists, skipping."
fi

# Create required directories
mkdir -p "$PROJECT_DIR/data"
mkdir -p "$PROJECT_DIR/templates"
mkdir -p "$PROJECT_DIR/products"
mkdir -p "$PROJECT_DIR/product-assets"
echo "[setup] Directories ready."

# Build WordPress image
echo "[setup] Building WordPress Docker image..."
bash "$SCRIPT_DIR/build-wp-image.sh"

# Note: docker compose creates the network automatically with correct labels.
# Do NOT create it manually — that causes label mismatches on startup.

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Start services:  docker compose up -d"
echo "  2. Open dashboard:  http://localhost"
echo "  3. View emails:     http://localhost:8025  (Mailpit)"
echo "  4. Admin API key:   check .env for API_KEY value"
echo ""
