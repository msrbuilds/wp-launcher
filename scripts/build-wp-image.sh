#!/bin/bash
set -euo pipefail

# Build custom WordPress images for WP Launcher
#
# Usage:
#   ./scripts/build-wp-image.sh                    # Build base image only
#   ./scripts/build-wp-image.sh my-product         # Build product-specific image
#   ./scripts/build-wp-image.sh my-product custom:tag

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WP_DIR="$PROJECT_DIR/wordpress"
CONFIGS_DIR="$PROJECT_DIR/products"
PRODUCT_ASSETS_DIR="$PROJECT_DIR/product-assets"

PRODUCT_ID="${1:-}"
CUSTOM_TAG="${2:-}"

# Always build the base image first
echo "=== Building base WordPress image ==="
docker build -t wp-launcher/wordpress:latest "$WP_DIR"
echo "Base image built: wp-launcher/wordpress:latest"
echo ""

# If no product specified, we're done
if [ -z "$PRODUCT_ID" ]; then
    echo "Done. To build a product-specific image:"
    echo "  ./scripts/build-wp-image.sh <product-id>"
    exit 0
fi

# Load product config
CONFIG_FILE="$CONFIGS_DIR/${PRODUCT_ID}.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: Product config not found: $CONFIG_FILE"
    exit 1
fi

TAG="${CUSTOM_TAG:-wp-launcher/${PRODUCT_ID}:latest}"
echo "=== Building product image: $PRODUCT_ID ==="
echo "Config: $CONFIG_FILE"
echo "Tag: $TAG"

# Create a temporary build context
BUILD_DIR=$(mktemp -d)
trap "rm -rf $BUILD_DIR" EXIT

# Start the product Dockerfile
cat > "$BUILD_DIR/Dockerfile" <<'DOCKERFILE'
FROM wp-launcher/wordpress:latest

DOCKERFILE

# Read plugins by source type using node
# Convert MSYS path to Windows path for node compatibility
NODE_CONFIG_FILE=$(cd "$(dirname "$CONFIG_FILE")" && pwd -W 2>/dev/null || pwd)/$(basename "$CONFIG_FILE")
read_config() {
    node -e "const c=JSON.parse(require('fs').readFileSync('${NODE_CONFIG_FILE}','utf8'));$1" 2>/dev/null || true
}

PLUGINS_WP=$(read_config "(c.plugins?.preinstall||[]).filter(p=>p.source==='wordpress.org'&&p.slug).forEach(p=>console.log(p.slug))")
PLUGINS_URL=$(read_config "(c.plugins?.preinstall||[]).filter(p=>p.source==='url'&&p.url).forEach(p=>console.log(p.url))")
PLUGINS_LOCAL=$(read_config "(c.plugins?.preinstall||[]).filter(p=>p.source==='local'&&p.path).forEach(p=>console.log(p.path))")
THEMES_WP=$(read_config "(c.themes?.install||[]).filter(t=>t.source==='wordpress.org'&&t.slug).forEach(t=>console.log(t.slug))")
THEMES_URL=$(read_config "(c.themes?.install||[]).filter(t=>t.source==='url'&&t.url).forEach(t=>console.log(t.url))")
THEMES_LOCAL=$(read_config "(c.themes?.install||[]).filter(t=>t.source==='local'&&t.path).forEach(t=>console.log(t.path))")

# Install wordpress.org plugins
for slug in $PLUGINS_WP; do
    echo "Adding wordpress.org plugin: $slug"
    cat >> "$BUILD_DIR/Dockerfile" <<EOF
RUN curl -L "https://downloads.wordpress.org/plugin/${slug}.latest-stable.zip" -o /tmp/${slug}.zip \\
    && unzip /tmp/${slug}.zip -d /usr/src/wordpress/wp-content/plugins/ \\
    && rm /tmp/${slug}.zip
EOF
done

# Install URL plugins
for url in $PLUGINS_URL; do
    FILENAME=$(basename "$url")
    echo "Adding URL plugin: $url"
    cat >> "$BUILD_DIR/Dockerfile" <<EOF
RUN curl -L "$url" -o /tmp/${FILENAME} \\
    && unzip /tmp/${FILENAME} -d /usr/src/wordpress/wp-content/plugins/ \\
    && rm /tmp/${FILENAME}
EOF
done

# Copy local plugins (zip files)
for local_path in $PLUGINS_LOCAL; do
    # Resolve relative to project dir
    RESOLVED_PATH="$PROJECT_DIR/$local_path"
    if [ -f "$RESOLVED_PATH" ] && [[ "$RESOLVED_PATH" == *.zip ]]; then
        ZIP_NAME=$(basename "$RESOLVED_PATH")
        echo "Adding local plugin (zip): $ZIP_NAME from $RESOLVED_PATH"
        cp "$RESOLVED_PATH" "$BUILD_DIR/$ZIP_NAME"
        cat >> "$BUILD_DIR/Dockerfile" <<EOF
COPY ${ZIP_NAME} /tmp/${ZIP_NAME}
RUN unzip /tmp/${ZIP_NAME} -d /usr/src/wordpress/wp-content/plugins/ \\
    && rm /tmp/${ZIP_NAME}
EOF
    elif [ -d "$RESOLVED_PATH" ]; then
        # Legacy support: plain directory (deprecated — use .zip instead)
        PLUGIN_NAME=$(basename "$RESOLVED_PATH")
        echo "WARNING: Local plugin '$PLUGIN_NAME' is a directory. Use a .zip file instead."
        echo "  Run: scripts/package-plugin.sh $RESOLVED_PATH"
        cp -r "$RESOLVED_PATH" "$BUILD_DIR/$PLUGIN_NAME"
        cat >> "$BUILD_DIR/Dockerfile" <<EOF
COPY ${PLUGIN_NAME}/ /usr/src/wordpress/wp-content/plugins/${PLUGIN_NAME}/
EOF
    else
        echo "WARNING: Local plugin not found: $RESOLVED_PATH"
    fi
done

# Install wordpress.org themes
for slug in $THEMES_WP; do
    echo "Adding wordpress.org theme: $slug"
    cat >> "$BUILD_DIR/Dockerfile" <<EOF
RUN curl -L "https://downloads.wordpress.org/theme/${slug}.latest-stable.zip" -o /tmp/${slug}.zip \\
    && unzip /tmp/${slug}.zip -d /usr/src/wordpress/wp-content/themes/ \\
    && rm /tmp/${slug}.zip
EOF
done

# Install URL themes
for url in $THEMES_URL; do
    FILENAME=$(basename "$url")
    echo "Adding URL theme: $url"
    cat >> "$BUILD_DIR/Dockerfile" <<EOF
RUN curl -L "$url" -o /tmp/${FILENAME} \\
    && unzip /tmp/${FILENAME} -d /usr/src/wordpress/wp-content/themes/ \\
    && rm /tmp/${FILENAME}
EOF
done

# Copy local themes (zip files)
for local_path in $THEMES_LOCAL; do
    RESOLVED_PATH="$PROJECT_DIR/$local_path"
    if [ -f "$RESOLVED_PATH" ] && [[ "$RESOLVED_PATH" == *.zip ]]; then
        ZIP_NAME=$(basename "$RESOLVED_PATH")
        echo "Adding local theme (zip): $ZIP_NAME from $RESOLVED_PATH"
        cp "$RESOLVED_PATH" "$BUILD_DIR/$ZIP_NAME"
        cat >> "$BUILD_DIR/Dockerfile" <<EOF
COPY ${ZIP_NAME} /tmp/${ZIP_NAME}
RUN unzip /tmp/${ZIP_NAME} -d /usr/src/wordpress/wp-content/themes/ \\
    && rm /tmp/${ZIP_NAME}
EOF
    else
        echo "WARNING: Local theme not found: $RESOLVED_PATH"
    fi
done

# Copy demo content if it exists
DEMO_CONTENT="$PRODUCT_ASSETS_DIR/$PRODUCT_ID/demo-content.xml"
if [ -f "$DEMO_CONTENT" ]; then
    echo "Adding demo content"
    cp "$DEMO_CONTENT" "$BUILD_DIR/demo-content.xml"
    cat >> "$BUILD_DIR/Dockerfile" <<EOF
COPY demo-content.xml /usr/src/wordpress/wp-content/demo-content.xml
EOF
fi

echo ""
echo "--- Generated Dockerfile ---"
cat "$BUILD_DIR/Dockerfile"
echo "----------------------------"
echo ""

# Build the product image
docker build -t "$TAG" "$BUILD_DIR"

echo ""
echo "=== Product image built: $TAG ==="
echo ""
echo "To use this image, add to your product config JSON:"
echo "  \"docker\": { \"image\": \"$TAG\" }"
