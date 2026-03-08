ARG PHP_VERSION=8.3
FROM wordpress:6.9-php${PHP_VERSION}-apache

# Install required system packages (unzip for plugins, default-mysql-client for MySQL health checks)
RUN apt-get update && apt-get install -y --no-install-recommends unzip default-mysql-client && rm -rf /var/lib/apt/lists/*

# Install wp-cli
RUN curl -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
    && chmod +x /usr/local/bin/wp

# Install SQLite Database Integration plugin
RUN curl -L https://downloads.wordpress.org/plugin/sqlite-database-integration.zip -o /tmp/sqlite.zip \
    && unzip /tmp/sqlite.zip -d /usr/src/wordpress/wp-content/plugins/ \
    && rm /tmp/sqlite.zip

# NOTE: db.php drop-in is copied at runtime by entrypoint.sh only when DB_ENGINE=sqlite
# Do NOT copy it here — it would override MySQL/MariaDB connections

# Copy MU-plugins for admin restrictions and branding
COPY mu-plugins/ /usr/src/wordpress/wp-content/mu-plugins/

# Copy custom wp-config
COPY wp-config-docker.php /usr/src/wordpress/wp-config-docker.php

# Copy custom entrypoint
COPY entrypoint.sh /usr/local/bin/wp-launcher-entrypoint.sh
RUN chmod +x /usr/local/bin/wp-launcher-entrypoint.sh

# Environment defaults
ENV DB_ENGINE=sqlite \
    WORDPRESS_DB_DIR=/var/www/html/wp-content/database \
    WP_SITE_TITLE="Demo Site" \
    WP_ADMIN_USER=demo \
    WP_ADMIN_PASSWORD=demo123 \
    WP_ADMIN_EMAIL=demo@example.com \
    WP_DEMO_EXPIRES_AT="" \
    WP_DEMO_LANDING_PAGE=""

ENTRYPOINT ["wp-launcher-entrypoint.sh"]
CMD ["apache2-foreground"]
