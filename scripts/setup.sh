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

# Create data and templates directories
mkdir -p "$PROJECT_DIR/data"
mkdir -p "$PROJECT_DIR/templates"
echo "[setup] Data and templates directories ready."

# Build WordPress image
echo "[setup] Building WordPress Docker image..."
bash "$SCRIPT_DIR/build-wp-image.sh"

# Note: docker compose creates the network automatically with correct labels.
# Do NOT create it manually — that causes label mismatches on startup.

echo ""
echo "=== Setup complete! ==="
echo "Run 'docker compose up -d' to start the launcher."
