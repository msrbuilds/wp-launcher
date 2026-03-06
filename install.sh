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

# ─── Pre-flight checks ──────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  err "This script must be run as root (or with sudo)."
  exit 1
fi

banner "WP Launcher — One-Click Installer"

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
# !! IMPORTANT: Change this to your repository URL before distributing !!
REPO_URL="${WP_LAUNCHER_REPO:-https://github.com/msrbuilds/wp-launcher.git}"

if [ -f "docker-compose.yml" ] && grep -q "wp-launcher" docker-compose.yml 2>/dev/null; then
  PROJECT_DIR="$(pwd)"
  ok "Running inside existing WP Launcher directory"
else
  DEFAULT_DIR="/opt/wp-launcher"
  echo ""
  read -rp "$(echo -e "${CYAN}Install directory${NC} [${DEFAULT_DIR}]: ")" INSTALL_DIR
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

# --- Domain ---
echo -e "${BOLD}Domain Setup${NC}"
echo "  Your launcher will run at https://YOUR_DOMAIN"
echo "  Demo sites will be at https://*.YOUR_DOMAIN"
echo "  The API will be at https://api.YOUR_DOMAIN"
echo ""
read -rp "$(echo -e "${CYAN}Enter your domain${NC} (e.g. demo.example.com): ")" DOMAIN
while [ -z "$DOMAIN" ]; do
  err "Domain is required."
  read -rp "$(echo -e "${CYAN}Enter your domain${NC}: ")" DOMAIN
done

# --- Let's Encrypt email ---
echo ""
read -rp "$(echo -e "${CYAN}Email for Let's Encrypt SSL${NC}: ")" ACME_EMAIL
while [ -z "$ACME_EMAIL" ]; do
  err "Email is required for SSL certificates."
  read -rp "$(echo -e "${CYAN}Email for Let's Encrypt SSL${NC}: ")" ACME_EMAIL
done

# --- SSL method ---
echo ""
echo -e "${BOLD}SSL Certificate Method${NC}"
echo "  1) Cloudflare DNS challenge (recommended — supports wildcard *.${DOMAIN})"
echo "  2) HTTP challenge (simpler — but each demo subdomain needs its own cert)"
echo ""
read -rp "$(echo -e "${CYAN}Choose SSL method${NC} [1]: ")" SSL_METHOD
SSL_METHOD="${SSL_METHOD:-1}"

CF_API_EMAIL=""
CF_DNS_API_TOKEN=""
if [ "$SSL_METHOD" = "1" ]; then
  echo ""
  echo "  Cloudflare DNS challenge lets Traefik obtain a wildcard certificate"
  echo "  for *.${DOMAIN} automatically. You need a Cloudflare API token with"
  echo "  Zone:DNS:Edit permissions."
  echo ""
  read -rp "$(echo -e "${CYAN}Cloudflare account email${NC}: ")" CF_API_EMAIL
  while [ -z "$CF_API_EMAIL" ]; do
    err "Cloudflare email is required."
    read -rp "$(echo -e "${CYAN}Cloudflare account email${NC}: ")" CF_API_EMAIL
  done
  read -rp "$(echo -e "${CYAN}Cloudflare DNS API token${NC}: ")" CF_DNS_API_TOKEN
  while [ -z "$CF_DNS_API_TOKEN" ]; do
    err "Cloudflare API token is required."
    read -rp "$(echo -e "${CYAN}Cloudflare DNS API token${NC}: ")" CF_DNS_API_TOKEN
  done
fi

# --- SMTP ---
echo ""
echo -e "${BOLD}SMTP Settings${NC} (for sending verification emails)"
echo "  Leave blank to use the built-in Mailpit dev mailer (dev only)."
echo ""
read -rp "$(echo -e "${CYAN}SMTP host${NC} (blank = Mailpit): ")" SMTP_HOST
SMTP_PORT=""
SMTP_SECURE=""
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""

if [ -n "$SMTP_HOST" ]; then
  read -rp "$(echo -e "${CYAN}SMTP port${NC} [587]: ")" SMTP_PORT
  SMTP_PORT="${SMTP_PORT:-587}"
  read -rp "$(echo -e "${CYAN}SMTP secure (true/false)${NC} [false]: ")" SMTP_SECURE
  SMTP_SECURE="${SMTP_SECURE:-false}"
  read -rp "$(echo -e "${CYAN}SMTP username${NC}: ")" SMTP_USER
  read -rsp "$(echo -e "${CYAN}SMTP password${NC}: ")" SMTP_PASS
  echo ""
  read -rp "$(echo -e "${CYAN}SMTP from address${NC} [WP Launcher <noreply@${DOMAIN}>]: ")" SMTP_FROM
  SMTP_FROM="${SMTP_FROM:-WP Launcher <noreply@${DOMAIN}>}"
fi

# ─── 4. Generate secrets ─────────────────────────────────────────────────────
banner "Generating Secrets"

gen_secret() { openssl rand -base64 32 | tr -d '/+=' | head -c 40; }

API_KEY="$(gen_secret)"
JWT_SECRET="$(gen_secret)"
PROVISIONER_INTERNAL_KEY="$(gen_secret)"

ok "API_KEY generated"
ok "JWT_SECRET generated"
ok "PROVISIONER_INTERNAL_KEY generated"

# ─── 5. Write .env ──────────────────────────────────────────────────────────
banner "Writing .env"

cat > "$PROJECT_DIR/.env" <<ENVFILE
# WP Launcher — generated by install.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")

NODE_ENV=production

# Domain (subdomains will be *.BASE_DOMAIN)
BASE_DOMAIN=${DOMAIN}

# Public URL (used in verification emails, links)
PUBLIC_URL=https://${DOMAIN}

# Secrets (auto-generated — keep private!)
API_KEY=${API_KEY}
JWT_SECRET=${JWT_SECRET}
PROVISIONER_INTERNAL_KEY=${PROVISIONER_INTERNAL_KEY}

# JWT token lifetime
JWT_EXPIRES_IN=7d

# CORS
CORS_ALLOWED_ORIGINS=https://${DOMAIN}

# WordPress image
WP_IMAGE=wp-launcher/wordpress:latest

# Container resource limits (per demo site)
CONTAINER_MEMORY=268435456
CONTAINER_CPU=0.5

# SMTP
SMTP_HOST=${SMTP_HOST:-mailpit}
SMTP_PORT=${SMTP_PORT:-1025}
SMTP_SECURE=${SMTP_SECURE:-false}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM=${SMTP_FROM:-WP Launcher <noreply@${DOMAIN}>}

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
      sniStrict: true
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

# ─── 8. Create data directory ────────────────────────────────────────────────
mkdir -p "$PROJECT_DIR/data"
ok "Data directory ready"

# ─── 9. Build WordPress image ────────────────────────────────────────────────
banner "Building WordPress Image"

docker build -t wp-launcher/wordpress:latest "$PROJECT_DIR/wordpress"
ok "WordPress base image built"

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

# ─── 10. Create Docker network (if not exists) ──────────────────────────────
if ! docker network inspect wp-launcher-network &>/dev/null; then
  docker network create wp-launcher-network
  ok "Created Docker network: wp-launcher-network"
fi

# ─── 11. Start services ─────────────────────────────────────────────────────
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
echo "    docker compose logs -f       # View logs"
echo "    docker compose down          # Stop all services"
echo "    docker compose up -d         # Start all services"
echo "    docker compose ps            # Check service status"
echo ""
echo "  Config files:"
echo "    .env                          # Environment configuration"
echo "    traefik/traefik.yml           # Traefik static config"
echo "    products/*.json               # Product configurations"
echo ""
echo -e "${YELLOW}  IMPORTANT: Make sure your DNS records are configured${NC}"
echo -e "${YELLOW}  before visiting the site. SSL certs will be issued${NC}"
echo -e "${YELLOW}  automatically once DNS is pointing to this server.${NC}"
echo ""
