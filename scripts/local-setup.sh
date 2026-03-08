#!/usr/bin/env bash
# WP Launcher — Local Development Mode Quick Setup
# Usage: bash scripts/local-setup.sh

set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
NC="\033[0m"

echo -e "${BOLD}WP Launcher — Local Dev Setup${NC}"
echo ""

# Check for Docker
if ! command -v docker &>/dev/null; then
  echo "Docker is required. Install it from https://docs.docker.com/get-docker/"
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  echo -e "${CYAN}Creating .env for local mode...${NC}"

  API_KEY=$(openssl rand -base64 24 2>/dev/null || head -c 24 /dev/urandom | base64)
  JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
  PROV_KEY=$(openssl rand -base64 24 2>/dev/null || head -c 24 /dev/urandom | base64)

  cat > .env <<EOF
# WP Launcher — Local Development Mode
APP_MODE=local
NODE_ENV=development
BASE_DOMAIN=localhost
PUBLIC_URL=http://localhost

# Secrets (auto-generated)
API_KEY=${API_KEY}
JWT_SECRET=${JWT_SECRET}
PROVISIONER_INTERNAL_KEY=${PROV_KEY}

# WordPress
WP_IMAGE=wp-launcher/wordpress:latest
CARD_LAYOUT=full
MAX_SITES_PER_USER=0
MAX_TOTAL_SITES=0
EOF

  echo -e "${GREEN}.env created.${NC}"
else
  echo -e "${CYAN}.env already exists. Ensuring APP_MODE=local...${NC}"
  if grep -q "^APP_MODE=" .env; then
    sed -i 's/^APP_MODE=.*/APP_MODE=local/' .env
  else
    echo "APP_MODE=local" >> .env
  fi
fi

# Build WordPress base image
echo ""
echo -e "${CYAN}Building WordPress base image...${NC}"
bash scripts/build-wp-image.sh

# Start services
echo ""
echo -e "${CYAN}Starting services...${NC}"
docker compose up -d --build

echo ""
echo -e "${GREEN}${BOLD}WP Launcher (Local) is running!${NC}"
echo ""
echo -e "  Dashboard:  ${BOLD}http://localhost${NC}"
echo -e "  Mailpit:    ${BOLD}http://localhost:8025${NC}"
echo ""
echo -e "  Sites will be available at: ${BOLD}http://<name>.localhost${NC}"
echo ""
