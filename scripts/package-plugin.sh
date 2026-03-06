#!/bin/bash
set -euo pipefail

# Package a local plugin directory into a zip file for product-assets.
#
# Usage:
#   ./scripts/package-plugin.sh <plugin-dir> [output-dir]
#
# Examples:
#   ./scripts/package-plugin.sh /path/to/5dp-backup-restore product-assets/5dp-backup-engine/plugins/
#   ./scripts/package-plugin.sh /path/to/elementor product-assets/elementor-mcp/plugins/
#
# If output-dir is omitted, the zip is created next to the source directory.

PLUGIN_DIR="${1:-}"
OUTPUT_DIR="${2:-}"

if [ -z "$PLUGIN_DIR" ]; then
    echo "Usage: $0 <plugin-directory> [output-directory]"
    echo ""
    echo "Package a WordPress plugin directory into a .zip file"
    echo "suitable for product-assets/."
    exit 1
fi

if [ ! -d "$PLUGIN_DIR" ]; then
    echo "ERROR: Not a directory: $PLUGIN_DIR"
    exit 1
fi

# Resolve to absolute path and get the plugin folder name
PLUGIN_DIR="$(cd "$PLUGIN_DIR" && pwd)"
PLUGIN_NAME="$(basename "$PLUGIN_DIR")"
PARENT_DIR="$(dirname "$PLUGIN_DIR")"

# Determine output location
if [ -n "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"
    ZIP_PATH="$(cd "$OUTPUT_DIR" && pwd)/${PLUGIN_NAME}.zip"
else
    ZIP_PATH="${PARENT_DIR}/${PLUGIN_NAME}.zip"
fi

# Remove existing zip if present
rm -f "$ZIP_PATH"

# Create the zip from the parent directory so the archive contains
# the plugin folder at the top level (e.g. 5dp-backup-restore/...)
echo "Packaging: $PLUGIN_NAME"
echo "  Source:  $PLUGIN_DIR"
echo "  Output:  $ZIP_PATH"

cd "$PARENT_DIR"
zip -r "$ZIP_PATH" "$PLUGIN_NAME" \
    -x "${PLUGIN_NAME}/.git/*" \
    -x "${PLUGIN_NAME}/node_modules/*" \
    -x "${PLUGIN_NAME}/.claude/*" \
    -x "${PLUGIN_NAME}/.DS_Store" \
    -x "${PLUGIN_NAME}/**/.DS_Store" \
    -x "${PLUGIN_NAME}/Thumbs.db"

ZIP_SIZE=$(du -h "$ZIP_PATH" | cut -f1)
echo ""
echo "Done! ${PLUGIN_NAME}.zip (${ZIP_SIZE})"
