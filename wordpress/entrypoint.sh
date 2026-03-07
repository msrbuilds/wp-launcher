#!/bin/bash
set -euo pipefail

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

    # Wait for database to be ready
    echo "[wp-launcher] Waiting for ${DB_ENGINE} at ${WORDPRESS_DB_HOST:-localhost}..."
    for i in $(seq 1 60); do
        if mysqladmin ping -h "${WORDPRESS_DB_HOST:-localhost}" -u "${WORDPRESS_DB_USER:-wordpress}" -p"${WORDPRESS_DB_PASSWORD:-wordpress}" --silent 2>/dev/null; then
            echo "[wp-launcher] ${DB_ENGINE} is ready."
            break
        fi
        sleep 1
    done
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

# Install WordPress if not already installed
if ! wp core is-installed --path=/var/www/html --allow-root 2>/dev/null; then
    echo "[wp-launcher] Installing WordPress..."
    wp core install \
        --path=/var/www/html \
        --url="${WP_SITE_URL}" \
        --title="${WP_SITE_TITLE:-Demo Site}" \
        --admin_user="${WP_ADMIN_USER:-demo}" \
        --admin_password="${WP_ADMIN_PASSWORD:-demo123}" \
        --admin_email="${WP_ADMIN_EMAIL:-demo@example.com}" \
        --skip-email \
        --allow-root

    if [ "$DB_ENGINE" != "mysql" ] && [ "$DB_ENGINE" != "mariadb" ]; then
        echo "[wp-launcher] Activating SQLite Database Integration plugin..."
        wp plugin activate sqlite-database-integration --path=/var/www/html --allow-root 2>/dev/null || true
    fi

    # Activate pre-installed plugins (skip SQLite and mu-plugins)
    if [ -n "${WP_ACTIVATE_PLUGINS:-}" ]; then
        IFS=',' read -ra PLUGINS <<< "$WP_ACTIVATE_PLUGINS"
        for plugin in "${PLUGINS[@]}"; do
            plugin=$(echo "$plugin" | xargs) # trim whitespace
            echo "[wp-launcher] Activating plugin: $plugin"
            wp plugin activate "$plugin" --path=/var/www/html --allow-root 2>/dev/null || true
        done
    fi

    # Remove unwanted plugins
    if [ -n "${WP_REMOVE_PLUGINS:-}" ]; then
        IFS=',' read -ra REMOVE_PLUGINS <<< "$WP_REMOVE_PLUGINS"
        for plugin in "${REMOVE_PLUGINS[@]}"; do
            plugin=$(echo "$plugin" | xargs)
            echo "[wp-launcher] Removing plugin: $plugin"
            wp plugin delete "$plugin" --path=/var/www/html --allow-root 2>/dev/null || true
        done
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

# Keep the container running with the Apache process
wait $WP_PID
