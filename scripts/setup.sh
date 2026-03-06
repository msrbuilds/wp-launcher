#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== WP Launcher Setup ==="

# Copy .env if it doesn't exist
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo "[setup] Created .env from .env.example"
    echo "[setup] Please edit .env with your configuration."
else
    echo "[setup] .env already exists, skipping."
fi

# Create data directory
mkdir -p "$PROJECT_DIR/data"
echo "[setup] Data directory ready."

# Install npm dependencies
echo "[setup] Installing dependencies..."
cd "$PROJECT_DIR"
npm install

# Build WordPress image
echo "[setup] Building WordPress Docker image..."
bash "$SCRIPT_DIR/build-wp-image.sh"

# Create Docker network if it doesn't exist
if ! docker network inspect wp-launcher-network >/dev/null 2>&1; then
    docker network create wp-launcher-network
    echo "[setup] Created Docker network: wp-launcher-network"
else
    echo "[setup] Docker network wp-launcher-network already exists."
fi

echo ""
echo "=== Setup complete! ==="
echo "Run 'docker compose up' to start the launcher."
