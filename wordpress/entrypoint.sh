#!/bin/bash
set -euo pipefail

# ── Security: reject default credentials in agency mode ───────────────────
if [ "${WP_LOCAL_MODE:-}" != "true" ] && [ "${WP_ADMIN_PASSWORD:-}" = "demo123" ]; then
    echo "[wp-launcher] FATAL: Default admin password 'demo123' is not allowed in agency mode."
    echo "[wp-launcher] Set WP_ADMIN_PASSWORD to a unique value for each site."
    exit 1
fi

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

# ── Email (msmtp) Configuration ──────────────────────────────────────────
# Route PHP mail() through msmtp to the configured SMTP server (e.g. Mailpit)
MSMTP_HOST="${WP_SMTP_HOST:-mailpit}"
MSMTP_PORT="${WP_SMTP_PORT:-1025}"
MSMTP_FROM="${WP_SMTP_FROM:-noreply@localhost}"

cat > /etc/msmtprc <<MSMTP
account default
host ${MSMTP_HOST}
port ${MSMTP_PORT}
from ${MSMTP_FROM}
auth off
tls off
MSMTP
chmod 644 /etc/msmtprc

# Tell PHP to use msmtp for sending mail
echo "sendmail_path = /usr/bin/msmtp -t" >> "$PHP_INI_CUSTOM"
echo "[wp-launcher] Email relay configured (${MSMTP_HOST}:${MSMTP_PORT})"

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

# Wait for WordPress core files to be fully copied by docker-entrypoint.sh
echo "[wp-launcher] Waiting for WordPress to be ready..."
until [ -f /var/www/html/wp-load.php ] && [ -f /var/www/html/wp-includes/version.php ] && [ -f /var/www/html/index.php ]; do
    sleep 1
done
echo "[wp-launcher] WordPress core files ready."

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

    # Use PHP mysqli to test connection — the MariaDB CLI client doesn't support
    # MySQL 8.4's caching_sha2_password auth, but PHP's mysqli extension does.
    echo "[wp-launcher] Waiting for ${DB_ENGINE} at ${DB_HOST}..."
    DB_READY=false
    for i in $(seq 1 90); do
        if php -r "
            \$c = @new mysqli('$DB_HOST', '$DB_USER', '$DB_PASS', '$DB_NAME');
            exit(\$c->connect_errno ? 1 : 0);
        " 2>/dev/null; then
            echo "[wp-launcher] ${DB_ENGINE} is ready (after ${i}s)."
            DB_READY=true
            break
        fi
        [ "$((i % 15))" = "0" ] && echo "[wp-launcher] Still waiting for ${DB_ENGINE} at ${DB_HOST} (${i}s)..."
        sleep 1
    done
    if [ "$DB_READY" = "false" ]; then
        echo "[wp-launcher] ERROR: ${DB_ENGINE} at ${DB_HOST} did not become ready after 90s."
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

    # ── Fast staged install ──────────────────────────────────────────────────
    # When wp-cli cache exists, bypass wp-cli install entirely: unzip to /tmp
    # (fast overlay fs) then bulk-copy to wp-content (one op vs thousands of
    # small file writes through Docker Desktop's file sharing layer).
    # Falls back to wp-cli for first-time installs, URL-based, or local zips.

    CACHE_DIR="${WP_CLI_CACHE_DIR:-/var/www/.wp-cli-cache}"

    fast_plugin_install() {
        local ref="$1"
        local activate="$2"
        local slug=""

        # Only optimize simple slugs (wordpress.org plugins) — not URLs or paths
        if [[ "$ref" != *"/"* ]] && [[ "$ref" != *"."* ]]; then
            slug="$ref"
            local cached_zip=""
            if [ -d "$CACHE_DIR/plugin" ]; then
                cached_zip=$(ls -t "$CACHE_DIR/plugin/${slug}"-*.zip 2>/dev/null | head -1)
            fi

            if [ -n "$cached_zip" ]; then
                echo "[wp-launcher]   → $slug (cached)"
                local stage="/tmp/staged-plugins"
                mkdir -p "$stage"
                unzip -qo "$cached_zip" -d "$stage/" 2>/dev/null
                if [ -d "$stage/$slug" ]; then
                    cp -a "$stage/$slug" /var/www/html/wp-content/plugins/
                    rm -rf "$stage/$slug"
                    if [ "$activate" = "true" ]; then
                        wp plugin activate "$slug" --path=/var/www/html --allow-root 2>&1 || true
                    fi
                    return 0
                fi
                rm -rf "$stage/$slug"
            fi
        fi

        # Fallback: wp-cli install (first-time download, URLs, local zips)
        echo "[wp-launcher]   → $ref"
        if [ "$activate" = "true" ]; then
            wp plugin install "$ref" --activate --path=/var/www/html --allow-root 2>&1 || echo "[wp-launcher]   ⚠ Failed: $ref"
        else
            wp plugin install "$ref" --path=/var/www/html --allow-root 2>&1 || echo "[wp-launcher]   ⚠ Failed: $ref"
        fi
    }

    fast_theme_install() {
        local ref="$1"
        local slug=""

        if [[ "$ref" != *"/"* ]] && [[ "$ref" != *"."* ]]; then
            slug="$ref"
            local cached_zip=""
            if [ -d "$CACHE_DIR/theme" ]; then
                cached_zip=$(ls -t "$CACHE_DIR/theme/${slug}"-*.zip 2>/dev/null | head -1)
            fi

            if [ -n "$cached_zip" ]; then
                echo "[wp-launcher]   → $slug (cached)"
                local stage="/tmp/staged-themes"
                mkdir -p "$stage"
                unzip -qo "$cached_zip" -d "$stage/" 2>/dev/null
                if [ -d "$stage/$slug" ]; then
                    cp -a "$stage/$slug" /var/www/html/wp-content/themes/
                    rm -rf "$stage/$slug"
                    return 0
                fi
                rm -rf "$stage/$slug"
            fi
        fi

        echo "[wp-launcher]   → $ref"
        wp theme install "$ref" --path=/var/www/html --allow-root 2>&1 || echo "[wp-launcher]   ⚠ Failed: $ref"
    }

    # Install and activate plugins (from wp.org, URL, or local zip)
    # Install one-at-a-time so a failure/fatal in one plugin doesn't block the rest
    if [ -n "${WP_INSTALL_PLUGINS_ACTIVATE:-}" ]; then
        PLUGINS=()
        parse_csv "$WP_INSTALL_PLUGINS_ACTIVATE" PLUGINS
        if [ ${#PLUGINS[@]} -gt 0 ]; then
            echo "[wp-launcher] Installing + activating ${#PLUGINS[@]} plugins..."
            for plugin in "${PLUGINS[@]}"; do
                fast_plugin_install "$plugin" "true"
            done
        fi
    fi

    if [ -n "${WP_INSTALL_PLUGINS:-}" ]; then
        PLUGINS=()
        parse_csv "$WP_INSTALL_PLUGINS" PLUGINS
        if [ ${#PLUGINS[@]} -gt 0 ]; then
            echo "[wp-launcher] Installing ${#PLUGINS[@]} plugins..."
            for plugin in "${PLUGINS[@]}"; do
                fast_plugin_install "$plugin" "false"
            done
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

    # Install themes
    if [ -n "${WP_INSTALL_THEMES:-}" ]; then
        THEMES=()
        parse_csv "$WP_INSTALL_THEMES" THEMES
        if [ ${#THEMES[@]} -gt 0 ]; then
            echo "[wp-launcher] Installing ${#THEMES[@]} themes..."
            for theme in "${THEMES[@]}"; do
                fast_theme_install "$theme"
            done
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

# Background sync: copy plugins/themes to host directory for direct file access.
# Runs AFTER the ready marker so the site is usable immediately while files sync.
# When done, writes a sync-complete marker so the API can upgrade to bind mounts.
if [ "${WP_HOST_SYNC:-}" = "true" ] && [ -d "/var/www/host-files" ]; then
    (
        echo "[wp-launcher] Syncing plugins and themes to host..."
        mkdir -p /var/www/host-files/plugins /var/www/host-files/themes
        cp -a /var/www/html/wp-content/plugins/. /var/www/host-files/plugins/ 2>/dev/null || true
        cp -a /var/www/html/wp-content/themes/. /var/www/host-files/themes/ 2>/dev/null || true
        echo "synced" > /var/www/html/.wp-launcher-synced
        echo "[wp-launcher] Host sync complete."
    ) &
fi

# Keep the container running with the Apache process
wait $WP_PID
