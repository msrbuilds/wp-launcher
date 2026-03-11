#!/bin/bash
###############################################################################
# WP Launcher — One-Click VPS Installer
#
# Usage:
#   curl -sSL https://scripts.msrbuilds.com/wplauncher/install.sh | bash
#   — or —
#   bash install.sh
#
# What it does:
#   1. Checks / installs Docker & Docker Compose
#   2. Clones the repository (or uses the current directory)
#   3. Prompts for domain, email, SMTP settings
#   4. Generates strong random secrets
#   5. Configures Traefik for automatic Let's Encrypt SSL
#   6. Builds the WordPress Docker image
#   7. Starts all services
###############################################################################
set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }
banner(){ echo -e "\n${BOLD}═══ $* ═══${NC}\n"; }

# Wrapper for read that always reads from /dev/tty (works with curl | bash)
prompt() { read "$@" < /dev/tty; }

# ─── Pre-flight checks ──────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  err "This script must be run as root (or with sudo)."
  exit 1
fi

banner "WP Launcher — One-Click Installer"

# ─── 0. Ensure sufficient memory (add swap on low-RAM servers) ───────────────
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
SWAP_TOTAL_KB=$(grep SwapTotal /proc/meminfo | awk '{print $2}')
if [ "$TOTAL_MEM_KB" -lt 3000000 ] && [ "$SWAP_TOTAL_KB" -lt 1000000 ]; then
  info "Low memory detected ($(( TOTAL_MEM_KB / 1024 ))MB RAM). Adding 2GB swap..."
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "2GB swap added"
  else
    ok "Swap file already exists"
  fi
fi

# ─── 1. Docker ───────────────────────────────────────────────────────────────
install_docker() {
  if command -v docker &>/dev/null; then
    ok "Docker is already installed ($(docker --version))"
  else
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    ok "Docker installed"
  fi

  # Ensure Docker Compose v2 plugin is available
  if docker compose version &>/dev/null; then
    ok "Docker Compose plugin found ($(docker compose version --short))"
  else
    info "Installing Docker Compose plugin..."
    apt-get update -qq && apt-get install -y -qq docker-compose-plugin
    ok "Docker Compose plugin installed"
  fi
}

install_docker

# Ensure git is available (needed for cloning / updates)
if ! command -v git &>/dev/null; then
  info "Installing git..."
  apt-get update -qq && apt-get install -y -qq git
  ok "git installed"
fi

# Ensure openssl is available (needed for secret generation)
if ! command -v openssl &>/dev/null; then
  info "Installing openssl..."
  apt-get update -qq && apt-get install -y -qq openssl
  ok "openssl installed"
fi

# ─── 2. Project directory ────────────────────────────────────────────────────
REPO_URL="${WP_LAUNCHER_REPO:-https://github.com/msrbuilds/wp-launcher.git}"

if [ -f "docker-compose.yml" ] && grep -q "wp-launcher" docker-compose.yml 2>/dev/null; then
  PROJECT_DIR="$(pwd)"
  ok "Running inside existing WP Launcher directory"
else
  DEFAULT_DIR="/opt/wp-launcher"
  echo ""
  prompt -rp "$(echo -e "${CYAN}Install directory${NC} [${DEFAULT_DIR}]: ")" INSTALL_DIR
  INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"

  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Pulling latest changes..."
    cd "$INSTALL_DIR"
    git pull --ff-only
  else
    info "Cloning WP Launcher to $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi
  PROJECT_DIR="$INSTALL_DIR"
fi

cd "$PROJECT_DIR"
ok "Working directory: $PROJECT_DIR"

# ─── 3. Collect configuration ────────────────────────────────────────────────
banner "Configuration"

# --- App Mode ---
echo -e "${BOLD}App Mode${NC}"
echo "  1) Agency mode  — users register with email, auth required (SaaS / client demos)"
echo "  2) Local mode   — no auth, no limits, open access (personal / dev use)"
echo ""
prompt -rp "$(echo -e "${CYAN}Choose app mode${NC} [1]: ")" MODE_CHOICE
MODE_CHOICE="${MODE_CHOICE:-1}"

if [ "$MODE_CHOICE" = "2" ]; then
  APP_MODE="local"
  ok "Mode: local (no auth, no limits)"
else
  APP_MODE="agency"
  ok "Mode: agency (email auth, rate limits)"
fi
echo ""

# --- Domain ---
echo -e "${BOLD}Domain Setup${NC}"
echo "  Your launcher will run at https://YOUR_DOMAIN"
echo "  Demo sites will be at https://*.YOUR_DOMAIN"
echo "  The API will be at https://api.YOUR_DOMAIN"
echo ""
prompt -rp "$(echo -e "${CYAN}Enter your domain${NC} (e.g. demo.example.com): ")" DOMAIN
while [ -z "$DOMAIN" ]; do
  err "Domain is required."
  prompt -rp "$(echo -e "${CYAN}Enter your domain${NC}: ")" DOMAIN
done

# --- Let's Encrypt email ---
echo ""
prompt -rp "$(echo -e "${CYAN}Email for Let's Encrypt SSL${NC}: ")" ACME_EMAIL
while [ -z "$ACME_EMAIL" ]; do
  err "Email is required for SSL certificates."
  prompt -rp "$(echo -e "${CYAN}Email for Let's Encrypt SSL${NC}: ")" ACME_EMAIL
done

# --- SSL method ---
echo ""
echo -e "${BOLD}SSL Certificate Method${NC}"
echo "  1) Cloudflare DNS challenge (recommended — supports wildcard *.${DOMAIN})"
echo "  2) HTTP challenge (simpler — but each demo subdomain needs its own cert)"
echo ""
prompt -rp "$(echo -e "${CYAN}Choose SSL method${NC} [1]: ")" SSL_METHOD
SSL_METHOD="${SSL_METHOD:-1}"

CF_API_EMAIL=""
CF_DNS_API_TOKEN=""
if [ "$SSL_METHOD" = "1" ]; then
  echo ""
  echo "  Cloudflare DNS challenge lets Traefik obtain a wildcard certificate"
  echo "  for *.${DOMAIN} automatically. You need a Cloudflare API token with"
  echo "  Zone:DNS:Edit permissions."
  echo ""
  prompt -rp "$(echo -e "${CYAN}Cloudflare account email${NC}: ")" CF_API_EMAIL
  while [ -z "$CF_API_EMAIL" ]; do
    err "Cloudflare email is required."
    prompt -rp "$(echo -e "${CYAN}Cloudflare account email${NC}: ")" CF_API_EMAIL
  done
  prompt -rp "$(echo -e "${CYAN}Cloudflare DNS API token${NC}: ")" CF_DNS_API_TOKEN
  while [ -z "$CF_DNS_API_TOKEN" ]; do
    err "Cloudflare API token is required."
    prompt -rp "$(echo -e "${CYAN}Cloudflare DNS API token${NC}: ")" CF_DNS_API_TOKEN
  done
fi

# --- Email ---
echo ""
echo -e "${BOLD}Email Settings${NC} (for sending verification emails)"
echo ""
echo "  1) SMTP         — Standard email (ports 587/465). May be blocked by some VPS providers."
echo "  2) Brevo API    — HTTP API over port 443. Works everywhere, even when SMTP is blocked."
echo "  3) Mailpit      — Built-in dev mailer (dev/testing only, no real emails sent)"
echo ""
prompt -rp "$(echo -e "${CYAN}Email provider${NC} [1]: ")" EMAIL_CHOICE
EMAIL_CHOICE="${EMAIL_CHOICE:-1}"

EMAIL_PROVIDER="smtp"
SMTP_HOST=""
SMTP_PORT=""
SMTP_SECURE=""
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
BREVO_API_KEY=""

if [ "$EMAIL_CHOICE" = "2" ]; then
  EMAIL_PROVIDER="brevo"
  echo ""
  echo -e "  ${YELLOW}Get your API key from: Brevo Dashboard > Settings > SMTP & API > API Keys${NC}"
  echo -e "  ${YELLOW}The key starts with 'xkeysib-' and is different from the SMTP password.${NC}"
  prompt -rp "$(echo -e "${CYAN}Brevo API key${NC}: ")" BREVO_API_KEY
  echo -e "  ${YELLOW}Format: Name <email> (e.g. WP Launcher <noreply@${DOMAIN}>)${NC}"
  prompt -rp "$(echo -e "${CYAN}From address${NC} [WP Launcher <noreply@${DOMAIN}>]: ")" SMTP_FROM
  SMTP_FROM="${SMTP_FROM:-WP Launcher <noreply@${DOMAIN}>}"
  # Auto-wrap plain email addresses in Name <email> format
  if [[ "$SMTP_FROM" =~ ^[^\ \<]+@[^\ \>]+$ ]]; then
    SMTP_FROM="WP Launcher <${SMTP_FROM}>"
    echo -e "  ${YELLOW}Auto-formatted to: ${SMTP_FROM}${NC}"
  fi
  ok "Using Brevo HTTP API (port 443 — no SMTP port needed)"
elif [ "$EMAIL_CHOICE" = "3" ]; then
  EMAIL_PROVIDER="smtp"
  SMTP_HOST="mailpit"
  SMTP_PORT="1025"
  ok "Using Mailpit (dev only — emails visible at http://localhost:8025)"
else
  EMAIL_PROVIDER="smtp"
  prompt -rp "$(echo -e "${CYAN}SMTP host${NC}: ")" SMTP_HOST
  if [ -n "$SMTP_HOST" ]; then
    prompt -rp "$(echo -e "${CYAN}SMTP port${NC} [587]: ")" SMTP_PORT
    SMTP_PORT="${SMTP_PORT:-587}"
    echo -e "  ${YELLOW}Note: Port 587 = STARTTLS (secure=false), Port 465 = Implicit TLS (secure=true)${NC}"
    if [ "$SMTP_PORT" = "465" ]; then
      SMTP_SECURE_DEFAULT="true"
    else
      SMTP_SECURE_DEFAULT="false"
    fi
    prompt -rp "$(echo -e "${CYAN}SMTP secure (true/false)${NC} [$SMTP_SECURE_DEFAULT]: ")" SMTP_SECURE
    SMTP_SECURE="${SMTP_SECURE:-$SMTP_SECURE_DEFAULT}"
    prompt -rp "$(echo -e "${CYAN}SMTP username${NC}: ")" SMTP_USER
    prompt -rsp "$(echo -e "${CYAN}SMTP password${NC}: ")" SMTP_PASS
    echo ""
    echo -e "  ${YELLOW}Format: Name <email> (e.g. WP Launcher <noreply@${DOMAIN}>)${NC}"
    prompt -rp "$(echo -e "${CYAN}SMTP from address${NC} [WP Launcher <noreply@${DOMAIN}>]: ")" SMTP_FROM
    SMTP_FROM="${SMTP_FROM:-WP Launcher <noreply@${DOMAIN}>}"
    # Auto-wrap plain email addresses in Name <email> format
    if [[ "$SMTP_FROM" =~ ^[^\ \<]+@[^\ \>]+$ ]]; then
      SMTP_FROM="WP Launcher <${SMTP_FROM}>"
      echo -e "  ${YELLOW}Auto-formatted to: ${SMTP_FROM}${NC}"
    fi
  fi
fi

# --- Site Limits ---
if [ "$APP_MODE" = "local" ]; then
  MAX_SITES_PER_USER=0
  MAX_TOTAL_SITES=0
  ok "Site limits: unlimited (local mode)"
else
  echo ""
  echo -e "${BOLD}Site Limits${NC}"
  prompt -rp "$(echo -e "${CYAN}Max sites per user${NC} [3]: ")" MAX_SITES_PER_USER
  MAX_SITES_PER_USER="${MAX_SITES_PER_USER:-3}"
  prompt -rp "$(echo -e "${CYAN}Max total sites (global)${NC} [50]: ")" MAX_TOTAL_SITES
  MAX_TOTAL_SITES="${MAX_TOTAL_SITES:-50}"
fi

# --- Admin API Key ---
echo ""
echo -e "${BOLD}Admin Panel Access${NC}"
echo "  The admin API key is used to access the admin dashboard panel."
echo "  You can set your own or leave blank to auto-generate one."
echo ""
prompt -rp "$(echo -e "${CYAN}Admin API key${NC} (blank = auto-generate): ")" CUSTOM_API_KEY

# ─── 4. Generate secrets ─────────────────────────────────────────────────────
banner "Generating Secrets"

gen_secret() { openssl rand -base64 32 | tr -d '/+=' | head -c 40; }

if [ -n "$CUSTOM_API_KEY" ]; then
  API_KEY="$CUSTOM_API_KEY"
  ok "API_KEY set (user-provided)"
else
  API_KEY="$(gen_secret)"
  ok "API_KEY generated"
fi
JWT_SECRET="$(gen_secret)"
PROVISIONER_INTERNAL_KEY="$(gen_secret)"

ok "JWT_SECRET generated"
ok "PROVISIONER_INTERNAL_KEY generated"

# ─── 5. Write .env ──────────────────────────────────────────────────────────
banner "Writing .env"

# Set resource limits based on mode
if [ "$APP_MODE" = "local" ]; then
  CONTAINER_MEMORY=0
  CONTAINER_CPU=0
  JWT_EXPIRES_IN=30d
else
  CONTAINER_MEMORY=268435456
  CONTAINER_CPU=0.5
  JWT_EXPIRES_IN=7d
fi

cat > "$PROJECT_DIR/.env" <<ENVFILE
# WP Launcher — generated by install.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")

NODE_ENV=production
APP_MODE=${APP_MODE}

# Domain (subdomains will be *.BASE_DOMAIN)
BASE_DOMAIN=${DOMAIN}

# Public URL (used in verification emails, links)
PUBLIC_URL=https://${DOMAIN}

# Secrets (auto-generated — keep private!)
API_KEY=${API_KEY}
JWT_SECRET=${JWT_SECRET}
PROVISIONER_INTERNAL_KEY=${PROVISIONER_INTERNAL_KEY}

# JWT token lifetime
JWT_EXPIRES_IN=${JWT_EXPIRES_IN}

# CORS
CORS_ALLOWED_ORIGINS=https://${DOMAIN}

# WordPress image
WP_IMAGE=wp-launcher/wordpress:latest

# Site limits
MAX_SITES_PER_USER=${MAX_SITES_PER_USER}
MAX_TOTAL_SITES=${MAX_TOTAL_SITES}

# Container resource limits (per demo site)
CONTAINER_MEMORY=${CONTAINER_MEMORY}
CONTAINER_CPU=${CONTAINER_CPU}

# Product assets path (host path for bind-mounting local plugins/themes into containers)
PRODUCT_ASSETS_PATH=${PROJECT_DIR}/product-assets

# Dashboard UI
CARD_LAYOUT=full

# TLS for demo site containers (production)
ENABLE_TLS=true
CERT_RESOLVER=letsencrypt

# Email
EMAIL_PROVIDER=${EMAIL_PROVIDER}
SMTP_HOST=${SMTP_HOST:-mailpit}
SMTP_PORT=${SMTP_PORT:-1025}
SMTP_SECURE=${SMTP_SECURE:-false}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM="${SMTP_FROM:-WP Launcher <noreply@${DOMAIN}>}"
BREVO_API_KEY=${BREVO_API_KEY:-}

# Let's Encrypt
ACME_EMAIL=${ACME_EMAIL}

# Cloudflare (for DNS challenge / wildcard certs)
CF_API_EMAIL=${CF_API_EMAIL}
CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}
ENVFILE

chmod 600 "$PROJECT_DIR/.env"
ok ".env written (permissions: 600)"

# ─── 6. Configure Traefik for production SSL ─────────────────────────────────
banner "Configuring Traefik"

# --- Static config ---
if [ "$SSL_METHOD" = "1" ]; then
  # Cloudflare DNS challenge — wildcard cert
  cat > "$PROJECT_DIR/traefik/traefik.yml" <<'YAML'
api:
  dashboard: true
  insecure: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https

  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: "${ACME_EMAIL}"
      storage: /acme/acme.json
      dnsChallenge:
        provider: cloudflare
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: wp-launcher-network
    watch: true

  file:
    directory: "/etc/traefik/dynamic"
    watch: true

log:
  level: INFO

accessLog: {}
YAML

  # Replace the placeholder with the actual email
  sed -i "s/\${ACME_EMAIL}/${ACME_EMAIL}/g" "$PROJECT_DIR/traefik/traefik.yml"

else
  # HTTP challenge
  cat > "$PROJECT_DIR/traefik/traefik.yml" <<YAML
api:
  dashboard: true
  insecure: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https

  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: "${ACME_EMAIL}"
      storage: /acme/acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: wp-launcher-network
    watch: true

  file:
    directory: "/etc/traefik/dynamic"
    watch: true

log:
  level: INFO

accessLog: {}
YAML
fi

ok "traefik.yml configured ($([ "$SSL_METHOD" = "1" ] && echo "Cloudflare DNS" || echo "HTTP") challenge)"

# --- Dynamic config: add TLS defaults ---
cat > "$PROJECT_DIR/traefik/dynamic/tls.yml" <<YAML
tls:
  options:
    default:
      minVersion: VersionTLS12
      sniStrict: false
YAML

ok "TLS options configured (min TLS 1.2)"

# ─── 7. Update docker-compose.yml for production ─────────────────────────────
banner "Updating Docker Compose"

# We need to add Traefik labels for HTTPS + cert resolver,
# and Cloudflare env vars if using DNS challenge.
# Instead of sed-surgery, write a docker-compose.override.yml

OVERRIDE="$PROJECT_DIR/docker-compose.override.yml"

USE_MAILPIT=false
if [ -z "$SMTP_HOST" ] || [ "$SMTP_HOST" = "mailpit" ]; then
  USE_MAILPIT=true
fi

if [ "$SSL_METHOD" = "1" ]; then
  cat > "$OVERRIDE" <<'YAML'
# Production overrides — generated by install.sh
services:
  traefik:
    environment:
      - CF_API_EMAIL=${CF_API_EMAIL}
      - CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN}

  api:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.${BASE_DOMAIN}`)"
      - "traefik.http.routers.api.entrypoints=websecure"
      - "traefik.http.routers.api.tls=true"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.routers.api.tls.domains[0].main=${BASE_DOMAIN}"
      - "traefik.http.routers.api.tls.domains[0].sans=*.${BASE_DOMAIN}"
      - "traefik.http.routers.api.middlewares=security-headers@file,rate-limit@file"
      - "traefik.http.services.api.loadbalancer.server.port=3000"

  dashboard:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`${BASE_DOMAIN}`)"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.tls=true"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.dashboard.tls.domains[0].main=${BASE_DOMAIN}"
      - "traefik.http.routers.dashboard.tls.domains[0].sans=*.${BASE_DOMAIN}"
      - "traefik.http.routers.dashboard.middlewares=security-headers@file"
      - "traefik.http.services.dashboard.loadbalancer.server.port=80"
YAML
else
  cat > "$OVERRIDE" <<'YAML'
# Production overrides — generated by install.sh
services:
  api:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.${BASE_DOMAIN}`)"
      - "traefik.http.routers.api.entrypoints=websecure"
      - "traefik.http.routers.api.tls=true"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.routers.api.middlewares=security-headers@file,rate-limit@file"
      - "traefik.http.services.api.loadbalancer.server.port=3000"

  dashboard:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`${BASE_DOMAIN}`)"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.tls=true"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.dashboard.middlewares=security-headers@file"
      - "traefik.http.services.dashboard.loadbalancer.server.port=80"
YAML
fi

# Disable mailpit in production when using external SMTP
if [ "$USE_MAILPIT" = "false" ]; then
  cat >> "$OVERRIDE" <<'YAML'

  mailpit:
    profiles:
      - dev
YAML
fi

ok "docker-compose.override.yml written"

# ─── 8. Create data & templates directories ──────────────────────────────────
mkdir -p "$PROJECT_DIR/data"
mkdir -p "$PROJECT_DIR/templates"
ok "Data and templates directories ready"

# ─── 9. Build WordPress image ────────────────────────────────────────────────
banner "Building WordPress Image"

bash "$PROJECT_DIR/scripts/build-wp-image.sh"
ok "WordPress base images built (all PHP versions)"

# Build product-specific images if product configs exist
for config in "$PROJECT_DIR"/products/*.json; do
  [ -f "$config" ] || continue
  PRODUCT_ID="$(basename "$config" .json)"
  [ "$PRODUCT_ID" = "_default" ] && continue

  info "Building product image: $PRODUCT_ID"
  bash "$PROJECT_DIR/scripts/build-wp-image.sh" "$PRODUCT_ID" || {
    warn "Failed to build product image for $PRODUCT_ID (continuing...)"
  }
done

# ─── 10. Install wpl CLI command ──────────────────────────────────────────────
banner "Installing CLI"

chmod +x "$PROJECT_DIR/bin/wpl"

if [ -d "/usr/local/bin" ]; then
  ln -sf "$PROJECT_DIR/bin/wpl" /usr/local/bin/wpl
  ok "Installed 'wpl' command to /usr/local/bin/wpl"
elif [ -d "$HOME/.local/bin" ]; then
  ln -sf "$PROJECT_DIR/bin/wpl" "$HOME/.local/bin/wpl"
  ok "Installed 'wpl' command to ~/.local/bin/wpl"
else
  mkdir -p "$HOME/.local/bin"
  ln -sf "$PROJECT_DIR/bin/wpl" "$HOME/.local/bin/wpl"
  ok "Installed 'wpl' command to ~/.local/bin/wpl"
fi

# Build Node.js CLI if available (for interactive dashboard)
if command -v node &>/dev/null && command -v npm &>/dev/null; then
  if [ -f "$PROJECT_DIR/packages/cli/package.json" ]; then
    info "Building CLI dashboard..."
    (cd "$PROJECT_DIR/packages/cli" && npm install --silent && npx tsc 2>/dev/null) && \
      ok "CLI dashboard built" || \
      warn "CLI dashboard build failed — bash fallback will be used"
  fi
fi

# ─── 11. Start services ────────────────────────────────────────────────────
# Note: docker compose creates the network automatically with correct labels.
# Do NOT create it manually — that causes label mismatches.
banner "Starting Services"

docker compose up -d --build

ok "All services started!"

# ─── 12. Summary ─────────────────────────────────────────────────────────────
banner "Installation Complete!"

echo -e "${GREEN}${BOLD}"
echo "  WP Launcher is now running!"
echo ""
echo "  Dashboard:  https://${DOMAIN}"
echo "  API:        https://api.${DOMAIN}"
echo ""
echo "  Admin API key: ${API_KEY}"
echo -e "${NC}"
echo ""
SERVER_IP="$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo '<YOUR_SERVER_IP>')"
echo "  DNS Records required (point both to ${SERVER_IP}):"
echo "    A    ${DOMAIN}       -> ${SERVER_IP}"
echo "    A    *.${DOMAIN}     -> ${SERVER_IP}"
echo ""
if [ "$SSL_METHOD" = "1" ]; then
  echo "  SSL: Wildcard cert via Cloudflare DNS challenge"
else
  echo "  SSL: Individual certs via HTTP challenge"
  echo "  Note: Each demo subdomain will request its own cert on first visit."
fi
echo ""
echo "  Useful commands:"
echo "    wpl status                   # Check service status"
echo "    wpl logs [service]           # View logs"
echo "    wpl stop                     # Stop all services"
echo "    wpl start                    # Start all services"
echo "    wpl rebuild                  # Rebuild and restart"
echo "    wpl sites                    # List active demo sites"
echo ""
echo "  Config files:"
echo "    .env                          # Environment configuration"
echo "    traefik/traefik.yml           # Traefik static config"
echo "    products/*.json               # Product configurations"
echo "    templates/*.json              # Site templates"
echo ""
echo -e "${YELLOW}  IMPORTANT: Make sure your DNS records are configured${NC}"
echo -e "${YELLOW}  before visiting the site. SSL certs will be issued${NC}"
echo -e "${YELLOW}  automatically once DNS is pointing to this server.${NC}"
echo ""
if [ "$SSL_METHOD" = "1" ]; then
  echo -e "${YELLOW}  CLOUDFLARE USERS: Set your SSL/TLS mode to 'Full' (not 'Full Strict')${NC}"
  echo -e "${YELLOW}  until the Let's Encrypt cert is issued. You can check progress with:${NC}"
  echo -e "${YELLOW}    docker compose logs traefik | grep -i acme${NC}"
  echo ""
fi
