#!/usr/bin/env bash
# Install the WP Launcher update watcher as a systemd service
# Run once during installation or after update

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if systemd is available
if ! command -v systemctl &>/dev/null; then
  err "systemd not found. The update watcher requires systemd."
  echo "You can still update manually with: wpl update"
  exit 0
fi

# Make watcher executable
chmod +x "$PROJECT_DIR/scripts/update-watcher.sh"

SERVICE_NAME="wp-launcher-updater"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

info "Installing update watcher service..."

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=WP Launcher Update Watcher
Documentation=https://github.com/msrbuilds/wp-launcher
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${PROJECT_DIR}
ExecStart=${PROJECT_DIR}/scripts/update-watcher.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=wp-launcher-updater

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd, enable and start
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" --quiet
systemctl restart "$SERVICE_NAME"

# Verify
if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Update watcher service installed and running"
  echo "  Service: ${SERVICE_NAME}"
  echo "  Status:  systemctl status ${SERVICE_NAME}"
  echo "  Logs:    journalctl -u ${SERVICE_NAME} -f"
else
  err "Service installed but failed to start"
  echo "  Check: systemctl status ${SERVICE_NAME}"
  exit 1
fi
