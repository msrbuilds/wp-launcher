#!/usr/bin/env bash
# WP Launcher Update Watcher
# Runs as a systemd service on the host. Monitors data/update-trigger
# and executes scripts/update.sh when triggered from the dashboard.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TRIGGER_FILE="$PROJECT_DIR/data/update-trigger"
STATUS_FILE="$PROJECT_DIR/data/update-status.json"
LOG_FILE="$PROJECT_DIR/data/update.log"
LOCK_FILE="$PROJECT_DIR/data/update.lock"

# Read version without requiring node
read_version() {
  node -p "require('$PROJECT_DIR/package.json').version" 2>/dev/null \
    || grep -m1 '"version"' "$PROJECT_DIR/package.json" | sed 's/.*"version".*"\([^"]*\)".*/\1/' 2>/dev/null \
    || echo "unknown"
}

write_status() {
  local trigger_id="$1"
  local status="$2"
  local started="$3"
  local prev_ver="$4"
  local new_ver="${5:-}"
  local error="${6:-}"
  local completed=""

  if [ "$status" != "in_progress" ]; then
    completed="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  fi

  cat > "$STATUS_FILE" <<EOF
{
  "triggerId": "$trigger_id",
  "status": "$status",
  "startedAt": "$started",
  "completedAt": "$completed",
  "previousVersion": "$prev_ver",
  "newVersion": "$new_ver",
  "error": $([ -n "$error" ] && echo "\"$error\"" || echo "null")
}
EOF
}

echo "[update-watcher] Started. Watching $TRIGGER_FILE"

while true; do
  if [ -f "$TRIGGER_FILE" ] && [ ! -f "$LOCK_FILE" ]; then
    echo "[update-watcher] Trigger detected, starting update..."

    # Read trigger info
    TRIGGER_ID=$(cat "$TRIGGER_FILE" | grep -o '"triggerId"[^,]*' | cut -d'"' -f4 2>/dev/null || echo "unknown")

    # Acquire lock
    echo "$$" > "$LOCK_FILE"

    STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    PREV_VERSION="$(read_version)"

    # Write in-progress status
    write_status "$TRIGGER_ID" "in_progress" "$STARTED_AT" "$PREV_VERSION"

    # Clear old log
    echo "=== WP Launcher Update — $(date) ===" > "$LOG_FILE"

    # Run the update script
    if bash "$PROJECT_DIR/scripts/update.sh" >> "$LOG_FILE" 2>&1; then
      NEW_VERSION="$(read_version)"
      write_status "$TRIGGER_ID" "completed" "$STARTED_AT" "$PREV_VERSION" "$NEW_VERSION"
      echo "[update-watcher] Update completed: v$PREV_VERSION → v$NEW_VERSION"
    else
      EXIT_CODE=$?
      NEW_VERSION="$(read_version)"
      LAST_ERROR=$(tail -5 "$LOG_FILE" | tr '\n' ' ' | sed 's/"/\\"/g' | cut -c1-200)
      write_status "$TRIGGER_ID" "failed" "$STARTED_AT" "$PREV_VERSION" "$NEW_VERSION" "Update failed (exit $EXIT_CODE): $LAST_ERROR"
      echo "[update-watcher] Update failed with exit code $EXIT_CODE"
    fi

    # Cleanup
    rm -f "$TRIGGER_FILE" "$LOCK_FILE"
    echo "[update-watcher] Cleanup done, resuming watch..."
  fi

  sleep 3
done
