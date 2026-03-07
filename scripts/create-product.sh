#!/bin/bash
###############################################################################
# WP Launcher — Interactive Product Creator
#
# Usage:
#   bash scripts/create-product.sh
#
# What it does:
#   1. Collects product info step by step (name, database, plugins, themes, etc.)
#   2. Creates the product JSON config in products/
#   3. Creates the product-assets directory for local plugin/theme zips
#   4. Builds the Docker image for the product
#   5. Tells you what to do next (upload zip files, restart API)
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PRODUCTS_DIR="$PROJECT_DIR/products"
ASSETS_DIR="$PROJECT_DIR/product-assets"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }
banner(){ echo -e "\n${BOLD}═══ $* ═══${NC}\n"; }

banner "WP Launcher — Product Creator"

# ─── Step 1: Product ID & Name ──────────────────────────────────────────────
echo -e "${BOLD}Step 1: Basic Info${NC}"
echo "  The product ID is used internally (URL-safe, lowercase, no spaces)."
echo "  Example: my-awesome-plugin, theme-developer-kit"
echo ""

read -rp "$(echo -e "${CYAN}Product ID${NC}: ")" PRODUCT_ID
while [ -z "$PRODUCT_ID" ]; do
  err "Product ID is required."
  read -rp "$(echo -e "${CYAN}Product ID${NC}: ")" PRODUCT_ID
done

# Sanitize: lowercase, replace spaces/underscores with dashes
PRODUCT_ID=$(echo "$PRODUCT_ID" | tr '[:upper:]' '[:lower:]' | tr ' _' '-' | tr -cd 'a-z0-9-')

# Check if product already exists
if [ -f "$PRODUCTS_DIR/${PRODUCT_ID}.json" ]; then
  warn "Product '$PRODUCT_ID' already exists at products/${PRODUCT_ID}.json"
  read -rp "$(echo -e "${YELLOW}Overwrite? (y/N)${NC}: ")" OVERWRITE
  if [ "$OVERWRITE" != "y" ] && [ "$OVERWRITE" != "Y" ]; then
    echo "Aborted."
    exit 0
  fi
fi

echo ""
read -rp "$(echo -e "${CYAN}Product display name${NC}: ")" PRODUCT_NAME
PRODUCT_NAME="${PRODUCT_NAME:-$PRODUCT_ID}"

# ─── Step 2: Database Engine ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Step 2: Database Engine${NC}"
echo "  1) SQLite   — fastest startup, no external DB needed (recommended)"
echo "  2) MySQL    — traditional WordPress database"
echo "  3) MariaDB  — MySQL-compatible alternative"
echo ""

read -rp "$(echo -e "${CYAN}Choose database${NC} [1]: ")" DB_CHOICE
DB_CHOICE="${DB_CHOICE:-1}"

case "$DB_CHOICE" in
  2) DATABASE="mysql" ;;
  3) DATABASE="mariadb" ;;
  *) DATABASE="sqlite" ;;
esac
ok "Database: $DATABASE"

# ─── Step 3: WordPress Settings ─────────────────────────────────────────────
echo ""
echo -e "${BOLD}Step 3: WordPress Settings${NC}"
echo ""

read -rp "$(echo -e "${CYAN}WordPress version${NC} [6.9]: ")" WP_VERSION
WP_VERSION="${WP_VERSION:-6.9}"

read -rp "$(echo -e "${CYAN}Locale${NC} [en_US]: ")" WP_LOCALE
WP_LOCALE="${WP_LOCALE:-en_US}"

# ─── Step 4: Plugins ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Step 4: Plugins${NC}"
echo "  Add plugins from different sources. You can add multiple of each type."
echo ""

PLUGINS_JSON="[]"
ACTIVATE_SLUGS=()

# WordPress.org plugins
echo -e "  ${BOLD}WordPress.org plugins${NC} (installed from wp.org repository)"
echo "  Enter plugin slugs, one per line. Empty line to finish."
echo ""
while true; do
  read -rp "$(echo -e "  ${CYAN}Plugin slug${NC} (blank to finish): ")" WP_PLUGIN_SLUG
  [ -z "$WP_PLUGIN_SLUG" ] && break
  PLUGINS_JSON=$(node -e "
    const j=$PLUGINS_JSON;
    j.push({source:'wordpress.org',slug:'$WP_PLUGIN_SLUG',activate:true});
    console.log(JSON.stringify(j));
  " 2>/dev/null || echo "$PLUGINS_JSON")
  ACTIVATE_SLUGS+=("$WP_PLUGIN_SLUG")
  ok "  Added: $WP_PLUGIN_SLUG (wordpress.org)"
done

# URL plugins
echo ""
echo -e "  ${BOLD}URL plugins${NC} (downloaded from a direct URL to a .zip)"
echo "  Enter full URLs, one per line. Empty line to finish."
echo ""
while true; do
  read -rp "$(echo -e "  ${CYAN}Plugin URL${NC} (blank to finish): ")" PLUGIN_URL
  [ -z "$PLUGIN_URL" ] && break
  PLUGINS_JSON=$(node -e "
    const j=$PLUGINS_JSON;
    j.push({source:'url',url:'$PLUGIN_URL',activate:true});
    console.log(JSON.stringify(j));
  " 2>/dev/null || echo "$PLUGINS_JSON")
  ok "  Added: $PLUGIN_URL"
done

# Local plugins
echo ""
echo -e "  ${BOLD}Local plugins${NC} (zip files you'll upload to product-assets/${PRODUCT_ID}/plugins/)"
echo "  Enter zip filenames (e.g. my-plugin.zip), one per line. Empty line to finish."
echo "  You'll upload the actual files after this script finishes."
echo ""

LOCAL_PLUGIN_FILES=()
while true; do
  read -rp "$(echo -e "  ${CYAN}Plugin zip filename${NC} (blank to finish): ")" LOCAL_PLUGIN
  [ -z "$LOCAL_PLUGIN" ] && break
  # Ensure .zip extension
  [[ "$LOCAL_PLUGIN" != *.zip ]] && LOCAL_PLUGIN="${LOCAL_PLUGIN}.zip"
  LOCAL_PATH="product-assets/${PRODUCT_ID}/plugins/${LOCAL_PLUGIN}"
  PLUGINS_JSON=$(node -e "
    const j=$PLUGINS_JSON;
    j.push({source:'local',path:'$LOCAL_PATH',activate:true});
    console.log(JSON.stringify(j));
  " 2>/dev/null || echo "$PLUGINS_JSON")
  LOCAL_PLUGIN_FILES+=("$LOCAL_PLUGIN")
  ok "  Added: $LOCAL_PLUGIN (local — upload later)"
done

# Plugins to remove
echo ""
echo -e "  ${BOLD}Remove default plugins${NC}"
read -rp "$(echo -e "  ${CYAN}Plugins to remove${NC} [hello,akismet]: ")" REMOVE_PLUGINS
REMOVE_PLUGINS="${REMOVE_PLUGINS:-hello,akismet}"

# Build remove array
REMOVE_JSON="[]"
if [ -n "$REMOVE_PLUGINS" ]; then
  IFS=',' read -ra RP <<< "$REMOVE_PLUGINS"
  for p in "${RP[@]}"; do
    p=$(echo "$p" | xargs)
    REMOVE_JSON=$(node -e "
      const j=$REMOVE_JSON;
      j.push('$p');
      console.log(JSON.stringify(j));
    " 2>/dev/null || echo "$REMOVE_JSON")
  done
fi

# ─── Step 5: Themes ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Step 5: Themes${NC}"
echo ""

THEMES_JSON="[]"
ACTIVE_THEME=""

# WordPress.org themes
echo -e "  ${BOLD}WordPress.org themes${NC}"
echo "  Enter theme slugs, one per line. Empty line to finish."
echo ""
while true; do
  read -rp "$(echo -e "  ${CYAN}Theme slug${NC} (blank to finish): ")" WP_THEME_SLUG
  [ -z "$WP_THEME_SLUG" ] && break
  THEMES_JSON=$(node -e "
    const j=$THEMES_JSON;
    j.push({source:'wordpress.org',slug:'$WP_THEME_SLUG'});
    console.log(JSON.stringify(j));
  " 2>/dev/null || echo "$THEMES_JSON")
  ok "  Added: $WP_THEME_SLUG (wordpress.org)"
done

# Local themes
echo ""
echo -e "  ${BOLD}Local themes${NC} (zip files you'll upload to product-assets/${PRODUCT_ID}/themes/)"
echo ""

LOCAL_THEME_FILES=()
while true; do
  read -rp "$(echo -e "  ${CYAN}Theme zip filename${NC} (blank to finish): ")" LOCAL_THEME
  [ -z "$LOCAL_THEME" ] && break
  [[ "$LOCAL_THEME" != *.zip ]] && LOCAL_THEME="${LOCAL_THEME}.zip"
  LOCAL_PATH="product-assets/${PRODUCT_ID}/themes/${LOCAL_THEME}"
  THEMES_JSON=$(node -e "
    const j=$THEMES_JSON;
    j.push({source:'local',path:'$LOCAL_PATH'});
    console.log(JSON.stringify(j));
  " 2>/dev/null || echo "$THEMES_JSON")
  LOCAL_THEME_FILES+=("$LOCAL_THEME")
  ok "  Added: $LOCAL_THEME (local — upload later)"
done

# Active theme
echo ""
read -rp "$(echo -e "  ${CYAN}Active theme slug${NC} (blank = WordPress default): ")" ACTIVE_THEME

# Themes to remove
read -rp "$(echo -e "  ${CYAN}Themes to remove${NC} (comma-separated, blank = none): ")" REMOVE_THEMES
REMOVE_THEMES_JSON="[]"
if [ -n "$REMOVE_THEMES" ]; then
  IFS=',' read -ra RT <<< "$REMOVE_THEMES"
  for t in "${RT[@]}"; do
    t=$(echo "$t" | xargs)
    REMOVE_THEMES_JSON=$(node -e "
      const j=$REMOVE_THEMES_JSON;
      j.push('$t');
      console.log(JSON.stringify(j));
    " 2>/dev/null || echo "$REMOVE_THEMES_JSON")
  done
fi

# ─── Step 6: Demo Settings ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Step 6: Demo Settings${NC}"
echo ""

read -rp "$(echo -e "${CYAN}Default expiration${NC} [1h]: ")" DEFAULT_EXP
DEFAULT_EXP="${DEFAULT_EXP:-1h}"

read -rp "$(echo -e "${CYAN}Max expiration${NC} [24h]: ")" MAX_EXP
MAX_EXP="${MAX_EXP:-24h}"

read -rp "$(echo -e "${CYAN}Max concurrent sites${NC} [10]: ")" MAX_SITES
MAX_SITES="${MAX_SITES:-10}"

read -rp "$(echo -e "${CYAN}Admin username${NC} [demo]: ")" ADMIN_USER
ADMIN_USER="${ADMIN_USER:-demo}"

read -rp "$(echo -e "${CYAN}Admin email${NC} [demo@example.com]: ")" ADMIN_EMAIL
ADMIN_EMAIL="${ADMIN_EMAIL:-demo@example.com}"

read -rp "$(echo -e "${CYAN}Landing page after login${NC} (blank = wp-admin): ")" LANDING_PAGE

# ─── Step 7: Branding ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Step 7: Branding${NC}"
echo ""

read -rp "$(echo -e "${CYAN}Product description${NC} (shown on dashboard): ")" DESCRIPTION

read -rp "$(echo -e "${CYAN}Banner text${NC} [This is a temporary demo site. It will expire in {time_remaining}.]: ")" BANNER_TEXT
BANNER_TEXT="${BANNER_TEXT:-This is a temporary demo site. It will expire in \{time_remaining\}.}"

read -rp "$(echo -e "${CYAN}Logo URL${NC} (blank = none): ")" LOGO_URL
read -rp "$(echo -e "${CYAN}Image URL${NC} (product card image, blank = none): ")" IMAGE_URL

# ─── Step 8: Restrictions ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Step 8: Restrictions${NC}"
echo ""

read -rp "$(echo -e "${CYAN}Disable file modifications?${NC} [Y/n]: ")" DISABLE_MODS
DISABLE_MODS="${DISABLE_MODS:-Y}"
if [ "$DISABLE_MODS" = "y" ] || [ "$DISABLE_MODS" = "Y" ]; then
  DISABLE_FILE_MODS="true"
else
  DISABLE_FILE_MODS="false"
fi

read -rp "$(echo -e "${CYAN}Hidden menu items${NC} [tools.php]: ")" HIDDEN_MENUS
HIDDEN_MENUS="${HIDDEN_MENUS:-tools.php}"

HIDDEN_MENUS_JSON="[]"
if [ -n "$HIDDEN_MENUS" ]; then
  IFS=',' read -ra HM <<< "$HIDDEN_MENUS"
  for m in "${HM[@]}"; do
    m=$(echo "$m" | xargs)
    HIDDEN_MENUS_JSON=$(node -e "
      const j=$HIDDEN_MENUS_JSON;
      j.push('$m');
      console.log(JSON.stringify(j));
    " 2>/dev/null || echo "$HIDDEN_MENUS_JSON")
  done
fi

# ─── Generate JSON config ────────────────────────────────────────────────────
banner "Creating Product Config"

# Build the active theme field for entrypoint
ACTIVE_THEME_JSON=""
if [ -n "$ACTIVE_THEME" ]; then
  ACTIVE_THEME_JSON="\"active\": \"${ACTIVE_THEME}\","
fi

# Use node to build properly formatted JSON
CONFIG_JSON=$(PRODUCT_NAME_VAL="$PRODUCT_NAME" BANNER_TEXT_VAL="$BANNER_TEXT" DESCRIPTION_VAL="$DESCRIPTION" node -e "
const config = {
  id: '$PRODUCT_ID',
  name: process.env.PRODUCT_NAME_VAL || '$PRODUCT_ID',
  wordpress: {
    version: '$WP_VERSION',
    locale: '$WP_LOCALE'
  },
  plugins: {
    preinstall: $PLUGINS_JSON,
    remove: $REMOVE_JSON
  },
  themes: {
    install: $THEMES_JSON,
    remove: $REMOVE_THEMES_JSON
  },
  demo: {
    default_expiration: '$DEFAULT_EXP',
    max_expiration: '$MAX_EXP',
    max_concurrent_sites: $MAX_SITES,
    admin_user: '$ADMIN_USER',
    admin_email: '$ADMIN_EMAIL',
    landing_page: '$LANDING_PAGE'
  },
  database: '$DATABASE',
  restrictions: {
    disable_file_mods: $DISABLE_FILE_MODS,
    hidden_menu_items: $HIDDEN_MENUS_JSON,
    blocked_capabilities: [
      'install_plugins',
      'install_themes',
      'edit_plugins',
      'edit_themes',
      'update_core',
      'export',
      'import'
    ]
  },
  branding: {
    banner_text: process.env.BANNER_TEXT_VAL || '',
    logo_url: '$LOGO_URL',
    description: process.env.DESCRIPTION_VAL || '',
    image_url: '$IMAGE_URL'
  },
  docker: {
    image: 'wp-launcher/${PRODUCT_ID}:latest'
  }
};
$([ -n "$ACTIVE_THEME" ] && echo "config.themes.active = '$ACTIVE_THEME';" || true)
console.log(JSON.stringify(config, null, 2));
")

# Write config file
echo "$CONFIG_JSON" > "$PRODUCTS_DIR/${PRODUCT_ID}.json"
ok "Config written to products/${PRODUCT_ID}.json"

# ─── Create asset directories ────────────────────────────────────────────────
PRODUCT_ASSETS="$ASSETS_DIR/$PRODUCT_ID"
mkdir -p "$PRODUCT_ASSETS/plugins"
mkdir -p "$PRODUCT_ASSETS/themes"
ok "Asset directories created at product-assets/${PRODUCT_ID}/"

# ─── Build Docker image ─────────────────────────────────────────────────────
HAS_LOCAL_FILES=false
if [ ${#LOCAL_PLUGIN_FILES[@]} -gt 0 ] || [ ${#LOCAL_THEME_FILES[@]} -gt 0 ]; then
  HAS_LOCAL_FILES=true
fi

if [ "$HAS_LOCAL_FILES" = "true" ]; then
  warn "Skipping Docker image build — you need to upload local files first."
  echo ""
  echo -e "${BOLD}Upload your files to:${NC}"
  for f in "${LOCAL_PLUGIN_FILES[@]}"; do
    echo -e "  ${CYAN}product-assets/${PRODUCT_ID}/plugins/${f}${NC}"
  done
  for f in "${LOCAL_THEME_FILES[@]}"; do
    echo -e "  ${CYAN}product-assets/${PRODUCT_ID}/themes/${f}${NC}"
  done
  echo ""
  echo "Then build the image:"
  echo -e "  ${GREEN}bash scripts/build-wp-image.sh ${PRODUCT_ID}${NC}"
else
  echo ""
  read -rp "$(echo -e "${CYAN}Build Docker image now?${NC} [Y/n]: ")" BUILD_NOW
  BUILD_NOW="${BUILD_NOW:-Y}"
  if [ "$BUILD_NOW" = "y" ] || [ "$BUILD_NOW" = "Y" ]; then
    banner "Building Docker Image"
    bash "$SCRIPT_DIR/build-wp-image.sh" "$PRODUCT_ID"
    ok "Docker image built: wp-launcher/${PRODUCT_ID}:latest"
  else
    echo ""
    echo "Build later with:"
    echo -e "  ${GREEN}bash scripts/build-wp-image.sh ${PRODUCT_ID}${NC}"
  fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
banner "Product Created!"

echo -e "${GREEN}${BOLD}"
echo "  Product: $PRODUCT_NAME ($PRODUCT_ID)"
echo "  Database: $DATABASE"
echo "  Config: products/${PRODUCT_ID}.json"
echo "  Assets: product-assets/${PRODUCT_ID}/"
echo "  Image: wp-launcher/${PRODUCT_ID}:latest"
echo -e "${NC}"

if [ "$HAS_LOCAL_FILES" = "true" ]; then
  echo -e "${YELLOW}${BOLD}  Next steps:${NC}"
  echo "  1. Upload your plugin/theme zip files to product-assets/${PRODUCT_ID}/"
  echo "  2. Build the image:  bash scripts/build-wp-image.sh ${PRODUCT_ID}"
  echo "  3. Restart the API:  docker compose restart api"
  echo ""
else
  echo -e "${YELLOW}${BOLD}  Next steps:${NC}"
  echo "  1. Restart the API to pick up the new product:  docker compose restart api"
  echo ""
fi

echo "  The product will appear on the dashboard automatically."
echo ""
