#!/usr/bin/env bash
# Generate version.json from package.json and git info
# Called during build and by update.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Read version from package.json (try node first, fallback to grep)
VERSION=""
VERSION=$(node -p "require('./package.json').version" 2>/dev/null) || true
if [ -z "$VERSION" ]; then
  VERSION=$(grep -m1 '"version"' package.json 2>/dev/null | sed 's/.*"version" *: *"\([^"]*\)".*/\1/') || true
fi
VERSION="${VERSION:-0.0.0}"
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_FULL=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT_DATE=$(git log -1 --format=%ci 2>/dev/null || echo "unknown")
COMMIT_MSG=$(git log -1 --format=%s 2>/dev/null || echo "")

cat > "$ROOT_DIR/version.json" <<EOF
{
  "version": "${VERSION}",
  "commit": "${COMMIT}",
  "commitFull": "${COMMIT_FULL}",
  "branch": "${BRANCH}",
  "buildDate": "${BUILD_DATE}",
  "commitDate": "${COMMIT_DATE}",
  "commitMessage": "${COMMIT_MSG}"
}
EOF

# Also copy into packages/api so Docker build context (./packages/api) can include it
cp "$ROOT_DIR/version.json" "$ROOT_DIR/packages/api/version.json"

echo "Generated version.json: v${VERSION} (${COMMIT})"
