#!/usr/bin/env bash
set -euo pipefail

# WP Launcher Update Script with Rollback
# Usage: bash scripts/update.sh
#   or:  wpl update (if installed via install.sh)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Load .env if it exists
[ -f .env ] && export $(grep -v '^#' .env | xargs 2>/dev/null) || true
API_PORT="${API_PORT:-3737}"

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

# Read version without requiring node
read_version() {
  local ver=""
  ver=$(node -p "require('./package.json').version" 2>/dev/null) && [ -n "$ver" ] && echo "$ver" && return
  ver=$(grep -m1 '"version"' package.json 2>/dev/null | sed 's/.*"version" *: *"\([^"]*\)".*/\1/') && [ -n "$ver" ] && echo "$ver" && return
  echo "unknown"
}

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  WP Launcher — Update${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Save current state for rollback
CURRENT_VERSION=$(read_version)
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
ROLLBACK_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
info "Current version: v${CURRENT_VERSION} (${CURRENT_COMMIT})"

# Rollback function
rollback() {
  echo ""
  err "Update failed! Rolling back..."

  if [ -n "$ROLLBACK_COMMIT" ]; then
    info "Restoring code to ${CURRENT_COMMIT}..."
    git checkout "$ROLLBACK_COMMIT" -- . 2>/dev/null || true
    git checkout "$ROLLBACK_COMMIT" 2>/dev/null || true

    info "Rebuilding previous version..."
    docker compose build api dashboard 2>/dev/null || true
    docker compose up -d 2>/dev/null || true

    # Restore version.json
    bash scripts/generate-version.sh 2>/dev/null || true

    ok "Rolled back to v${CURRENT_VERSION} (${CURRENT_COMMIT})"
  else
    err "Could not determine rollback commit. Manual intervention needed."
    err "Check: docker compose logs"
  fi

  # Restore stashed changes if we stashed them
  if [ "${STASHED:-false}" = "true" ]; then
    git stash pop 2>/dev/null || true
  fi

  exit 1
}

# Check for uncommitted changes
STASHED=false
if ! git diff --quiet 2>/dev/null; then
  warn "You have uncommitted changes. Stashing..."
  git stash
  STASHED=true
fi

# Pull latest
info "Pulling latest changes..."
if git pull --ff-only; then
  ok "Code updated"
else
  err "Fast-forward merge failed. You may need to resolve conflicts manually."
  if [ "$STASHED" = "true" ]; then
    git stash pop 2>/dev/null || true
  fi
  exit 1
fi

NEW_VERSION=$(read_version)
NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
info "New version: v${NEW_VERSION} (${NEW_COMMIT})"

# Generate version.json
info "Generating version info..."
bash scripts/generate-version.sh || { rollback; }

# Rebuild containers
info "Rebuilding containers..."
if ! docker compose build api dashboard; then
  err "Build failed!"
  rollback
fi

# Restart services
info "Restarting services..."
if ! docker compose up -d api dashboard; then
  err "Failed to start services!"
  rollback
fi

# Wait for API to be healthy
info "Waiting for API to start..."
HEALTHY=false
for i in $(seq 1 30); do
  if curl -sf http://localhost:${API_PORT}/health > /dev/null 2>&1; then
    HEALTHY=true
    ok "API is healthy"
    break
  fi
  sleep 1
done

if [ "$HEALTHY" = "false" ]; then
  err "API did not respond within 30 seconds!"
  warn "Checking logs..."
  docker compose logs api --tail 10 2>/dev/null || true
  echo ""
  read -p "Rollback to previous version? (y/N): " CONFIRM
  if [ "${CONFIRM:-n}" = "y" ] || [ "${CONFIRM:-n}" = "Y" ]; then
    rollback
  else
    warn "Keeping new version. Debug with: docker compose logs api"
  fi
fi

# Restore stashed changes
if [ "$STASHED" = "true" ]; then
  info "Restoring your local changes..."
  git stash pop 2>/dev/null || warn "Could not auto-restore stashed changes. Run: git stash pop"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Update complete! v${CURRENT_VERSION} → v${NEW_VERSION}${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
