#!/usr/bin/env bash
set -euo pipefail

# WP Launcher Update Script
# Usage: bash scripts/update.sh
#   or:  wpl update (if installed via install.sh)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  WP Launcher — Update${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Show current version
CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
info "Current version: v${CURRENT_VERSION} (${CURRENT_COMMIT})"

# Check for uncommitted changes
if ! git diff --quiet 2>/dev/null; then
  warn "You have uncommitted changes. Stashing..."
  git stash
fi

# Pull latest
info "Pulling latest changes..."
if git pull --ff-only; then
  ok "Code updated"
else
  err "Fast-forward merge failed. You may need to resolve conflicts manually."
  exit 1
fi

NEW_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
info "New version: v${NEW_VERSION} (${NEW_COMMIT})"

# Generate version.json
info "Generating version info..."
bash scripts/generate-version.sh

# Rebuild and restart containers
info "Rebuilding containers..."
docker compose build api dashboard

info "Restarting services..."
docker compose up -d api dashboard

# Wait for API to be healthy
info "Waiting for API to start..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    ok "API is healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    warn "API did not respond within 30s — check logs with: docker compose logs api"
  fi
  sleep 1
done

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Update complete! v${CURRENT_VERSION} → v${NEW_VERSION}${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
