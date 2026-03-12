#!/bin/bash
set -euo pipefail

# ── PHP Configuration ──────────────────────────────────────────────────────
# Apply php.ini overrides from PHP_* env vars before Apache starts
PHP_INI_CUSTOM="/usr/local/etc/php/conf.d/99-wp-launcher.ini"
{
  echo "; WP Launcher runtime PHP overrides"
  [ -n "${PHP_MEMORY_LIMIT:-}" ]          && echo "memory_limit = ${PHP_MEMORY_LIMIT}"
  [ -n "${PHP_UPLOAD_MAX_FILESIZE:-}" ]    && echo "upload_max_filesize = ${PHP_UPLOAD_MAX_FILESIZE}"
  [ -n "${PHP_POST_MAX_SIZE:-}" ]          && echo "post_max_size = ${PHP_POST_MAX_SIZE}"
  [ -n "${PHP_MAX_EXECUTION_TIME:-}" ]     && echo "max_execution_time = ${PHP_MAX_EXECUTION_TIME}"
  [ -n "${PHP_MAX_INPUT_VARS:-}" ]         && echo "max_input_vars = ${PHP_MAX_INPUT_VARS}"
  [ -n "${PHP_MAX_INPUT_TIME:-}" ]         && echo "max_input_time = ${PHP_MAX_INPUT_TIME}"
  [ -n "${PHP_DISPLAY_ERRORS:-}" ]         && echo "display_errors = ${PHP_DISPLAY_ERRORS}"
  [ -n "${PHP_ERROR_REPORTING:-}" ]        && echo "error_reporting = ${PHP_ERROR_REPORTING}"
  [ -n "${PHP_MAX_FILE_UPLOADS:-}" ]       && echo "max_file_uploads = ${PHP_MAX_FILE_UPLOADS}"
} > "$PHP_INI_CUSTOM"
echo "[wp-launcher] PHP ini overrides written to ${PHP_INI_CUSTOM}"

# Enable/disable PHP extensions from PHP_EXTENSIONS env (comma-separated)
# Available: redis, xdebug, sockets, calendar, pcntl, ldap, gettext
# Always-on (in image): gd, imagick, intl, zip, exif, bcmath, opcache, mysqli, pdo_sqlite, sodium
if [ -n "${PHP_EXTENSIONS:-}" ]; then
    IFS=',' read -ra EXTS <<< "$PHP_EXTENSIONS"
    for ext in "${EXTS[@]}"; do
        ext=$(echo "$ext" | xargs)  # trim whitespace
        [ -z "$ext" ] && continue
        if find /usr/local/lib/php/extensions/ -name "${ext}.so" 2>/dev/null | grep -q .; then
            # Xdebug is a Zend extension and needs special loading + config
            if [ "$ext" = "xdebug" ]; then
                {
                    echo "zend_extension=xdebug.so"
                    echo "[xdebug]"
                    echo "xdebug.mode = ${XDEBUG_MODE:-debug}"
                    echo "xdebug.start_with_request = ${XDEBUG_START_WITH_REQUEST:-yes}"
                    echo "xdebug.client_host = ${XDEBUG_CLIENT_HOST:-host.docker.internal}"
                    echo "xdebug.client_port = ${XDEBUG_CLIENT_PORT:-9003}"
                } >> "$PHP_INI_CUSTOM"
                echo "[wp-launcher] Xdebug enabled (mode=${XDEBUG_MODE:-debug})"
            else
                echo "extension=${ext}.so" >> "$PHP_INI_CUSTOM"
            fi
            echo "[wp-launcher] Enabled PHP extension: ${ext}"
        else
            echo "[wp-launcher] Warning: extension '${ext}' not found, skipping"
        fi
    done
fi

# Run the original WordPress entrypoint first
docker-entrypoint.sh apache2-foreground &
WP_PID=$!

# Wait for WordPress files to be ready
echo "[wp-launcher] Waiting for WordPress to be ready..."
until [ -f /var/www/html/wp-includes/version.php ]; do
    sleep 1
done

DB_ENGINE="${DB_ENGINE:-sqlite}"

if [ "$DB_ENGINE" = "mysql" ] || [ "$DB_ENGINE" = "mariadb" ]; then
    # MySQL/MariaDB mode — remove SQLite drop-in and plugin from both source and live dirs
    # Remove from source first so docker-entrypoint.sh can't re-copy it
    rm -f /usr/src/wordpress/wp-content/db.php
    rm -rf /usr/src/wordpress/wp-content/plugins/sqlite-database-integration
    rm -f /var/www/html/wp-content/db.php
    rm -rf /var/www/html/wp-content/plugins/sqlite-database-integration

    # Wait for database to be fully ready (up to 120s — MySQL 8.4 can take 30-60s on first init)
    DB_HOST="${WORDPRESS_DB_HOST:-localhost}"
    DB_USER="${WORDPRESS_DB_USER:-wordpress}"
    DB_PASS="${WORDPRESS_DB_PASSWORD:-wordpress}"
    DB_NAME="${WORDPRESS_DB_NAME:-wordpress}"

    echo "[wp-launcher] Waiting for ${DB_ENGINE} at ${DB_HOST}..."
    DB_READY=false
    for i in $(seq 1 120); do
        # Use --connect-timeout to prevent hanging; check exit code (not grep — --silent suppresses output)
        if mysqladmin ping -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" --connect-timeout=3 2>/dev/null; then
            # Server is up — now check if the database actually exists and accepts queries
            if mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" --connect-timeout=3 -e "USE ${DB_NAME};" 2>/dev/null; then
                echo "[wp-launcher] ${DB_ENGINE} is ready — database '${DB_NAME}' accessible (after ${i}s)."
                DB_READY=true
                break
            else
                [ "$((i % 10))" = "0" ] && echo "[wp-launcher] Server up but database '${DB_NAME}' not ready yet (${i}s)..."
            fi
        else
            [ "$((i % 15))" = "0" ] && echo "[wp-launcher] Still waiting for ${DB_ENGINE} at ${DB_HOST} (${i}s)..."
        fi
        sleep 1
    done
    if [ "$DB_READY" = "false" ]; then
        echo "[wp-launcher] ERROR: ${DB_ENGINE} at ${DB_HOST} did not become ready after 120s."
    fi
else
    # SQLite mode — set up database directory and drop-in
    mkdir -p "${WORDPRESS_DB_DIR:-/var/www/html/wp-content/database}"
    chown www-data:www-data "${WORDPRESS_DB_DIR:-/var/www/html/wp-content/database}"

    # Copy db.php drop-in from the SQLite plugin
    if [ -f /var/www/html/wp-content/plugins/sqlite-database-integration/db.copy ]; then
        cp -n /var/www/html/wp-content/plugins/sqlite-database-integration/db.copy /var/www/html/wp-content/db.php 2>/dev/null || true
    elif [ -f /usr/src/wordpress/wp-content/plugins/sqlite-database-integration/db.copy ]; then
        cp -n /usr/src/wordpress/wp-content/plugins/sqlite-database-integration/db.copy /var/www/html/wp-content/db.php 2>/dev/null || true
    fi
fi

# Ensure mu-plugins are in place
if [ -d /usr/src/wordpress/wp-content/mu-plugins ]; then
    cp -rn /usr/src/wordpress/wp-content/mu-plugins/* /var/www/html/wp-content/mu-plugins/ 2>/dev/null || true
fi

# Determine the site URL
WP_SITE_URL="${WP_SITE_URL:-http://localhost}"

# Wait for WordPress to respond
echo "[wp-launcher] Waiting for WordPress HTTP response..."
for i in $(seq 1 30); do
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost/" | grep -qE "200|302|301"; then
        break
    fi
    sleep 1
done

# Final cleanup: remove SQLite artifacts again in case docker-entrypoint.sh re-copied them
if [ "$DB_ENGINE" = "mysql" ] || [ "$DB_ENGINE" = "mariadb" ]; then
    rm -f /var/www/html/wp-content/db.php
    rm -rf /var/www/html/wp-content/plugins/sqlite-database-integration
fi

# Remove any stale ready marker from a previous run
rm -f /var/www/html/.wp-launcher-ready

# Helper: trim whitespace from comma-separated items into a bash array
parse_csv() {
    local input="$1"
    local -n arr=$2
    IFS=',' read -ra RAW <<< "$input"
    for item in "${RAW[@]}"; do
        local trimmed
        trimmed=$(echo "$item" | xargs)
        [ -n "$trimmed" ] && arr+=("$trimmed")
    done
}

# Install WordPress if not already installed
if ! wp core is-installed --path=/var/www/html --allow-root 2>/dev/null; then
    echo "[wp-launcher] Installing WordPress..."
    WP_INSTALLED=false
    for attempt in 1 2 3; do
        if wp core install \
            --path=/var/www/html \
            --url="${WP_SITE_URL}" \
            --title="${WP_SITE_TITLE:-Demo Site}" \
            --admin_user="${WP_ADMIN_USER:-demo}" \
            --admin_password="${WP_ADMIN_PASSWORD:-demo123}" \
            --admin_email="${WP_ADMIN_EMAIL:-demo@example.com}" \
            --skip-email \
            --allow-root 2>&1; then
            WP_INSTALLED=true
            break
        else
            echo "[wp-launcher] wp core install attempt ${attempt} failed, retrying in 5s..."
            sleep 5
        fi
    done
    if [ "$WP_INSTALLED" = "false" ]; then
        echo "[wp-launcher] ERROR: wp core install failed after 3 attempts."
    fi

    if [ "$DB_ENGINE" != "mysql" ] && [ "$DB_ENGINE" != "mariadb" ]; then
        echo "[wp-launcher] Activating SQLite Database Integration plugin..."
        wp plugin activate sqlite-database-integration --path=/var/www/html --allow-root 2>/dev/null || true
    fi

    # Install and activate plugins (from wp.org, URL, or local zip)
    # WP-CLI supports multiple slugs/paths in one command — much faster than one-at-a-time
    if [ -n "${WP_INSTALL_PLUGINS_ACTIVATE:-}" ]; then
        PLUGINS=()
        parse_csv "$WP_INSTALL_PLUGINS_ACTIVATE" PLUGINS
        if [ ${#PLUGINS[@]} -gt 0 ]; then
            echo "[wp-launcher] Installing + activating ${#PLUGINS[@]} plugins..."
            wp plugin install "${PLUGINS[@]}" --activate --path=/var/www/html --allow-root 2>&1 || echo "[wp-launcher] Warning: some plugins failed to install+activate"
        fi
    fi

    if [ -n "${WP_INSTALL_PLUGINS:-}" ]; then
        PLUGINS=()
        parse_csv "$WP_INSTALL_PLUGINS" PLUGINS
        if [ ${#PLUGINS[@]} -gt 0 ]; then
            echo "[wp-launcher] Installing ${#PLUGINS[@]} plugins..."
            wp plugin install "${PLUGINS[@]}" --path=/var/www/html --allow-root 2>&1 || echo "[wp-launcher] Warning: some plugins failed to install"
        fi
    fi

    # Activate plugins by slug (for plugins already present in the image)
    if [ -n "${WP_ACTIVATE_PLUGINS:-}" ]; then
        PLUGINS=()
        parse_csv "$WP_ACTIVATE_PLUGINS" PLUGINS
        if [ ${#PLUGINS[@]} -gt 0 ]; then
            echo "[wp-launcher] Activating ${#PLUGINS[@]} plugins..."
            wp plugin activate "${PLUGINS[@]}" --path=/var/www/html --allow-root 2>/dev/null || true
        fi
    fi

    # Remove unwanted plugins (batch)
    if [ -n "${WP_REMOVE_PLUGINS:-}" ]; then
        PLUGINS=()
        parse_csv "$WP_REMOVE_PLUGINS" PLUGINS
        if [ ${#PLUGINS[@]} -gt 0 ]; then
            echo "[wp-launcher] Removing ${#PLUGINS[@]} plugins..."
            wp plugin delete "${PLUGINS[@]}" --path=/var/www/html --allow-root 2>/dev/null || true
        fi
    fi

    # Install themes (batch)
    if [ -n "${WP_INSTALL_THEMES:-}" ]; then
        THEMES=()
        parse_csv "$WP_INSTALL_THEMES" THEMES
        if [ ${#THEMES[@]} -gt 0 ]; then
            echo "[wp-launcher] Installing ${#THEMES[@]} themes..."
            wp theme install "${THEMES[@]}" --path=/var/www/html --allow-root 2>&1 || echo "[wp-launcher] Warning: some themes failed to install"
        fi
    fi

    # Set active theme if specified
    if [ -n "${WP_ACTIVE_THEME:-}" ]; then
        echo "[wp-launcher] Activating theme: $WP_ACTIVE_THEME"
        wp theme activate "$WP_ACTIVE_THEME" --path=/var/www/html --allow-root 2>/dev/null || true
    fi

    # Import demo content if provided
    if [ -f /var/www/html/wp-content/demo-content.xml ]; then
        echo "[wp-launcher] Importing demo content..."
        wp plugin install wordpress-importer --activate --path=/var/www/html --allow-root 2>/dev/null || true
        wp import /var/www/html/wp-content/demo-content.xml --authors=create --path=/var/www/html --allow-root 2>/dev/null || true
    fi

    # Set permalink structure
    wp rewrite structure '/%postname%/' --path=/var/www/html --allow-root 2>/dev/null || true
    wp rewrite flush --path=/var/www/html --allow-root 2>/dev/null || true

    echo "[wp-launcher] WordPress installation complete!"
else
    echo "[wp-launcher] WordPress already installed."
fi

# Ensure wp-content is writable by Apache (media uploads, plugin updates, etc.)
chown -R www-data:www-data /var/www/html/wp-content
chmod -R 755 /var/www/html/wp-content

# Write ready marker — dashboard polls this to know ALL setup (plugins, themes, etc.) is done
echo "ready" > /var/www/html/.wp-launcher-ready
echo "[wp-launcher] Ready marker written."

# Keep the container running with the Apache process
wait $WP_PID
