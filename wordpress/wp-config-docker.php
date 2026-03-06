<?php
/**
 * WP Launcher - WordPress Configuration
 *
 * This file is used instead of the default wp-config.php for demo sites.
 * It configures WordPress to use SQLite and disables file modifications.
 */

// SQLite configuration
define( 'DB_DIR', getenv( 'WORDPRESS_DB_DIR' ) ?: __DIR__ . '/wp-content/database/' );
define( 'DB_FILE', 'wordpress.db' );

// Dummy MySQL constants (required by WordPress but unused with SQLite)
define( 'DB_NAME', 'wordpress' );
define( 'DB_USER', '' );
define( 'DB_PASSWORD', '' );
define( 'DB_HOST', '' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

// Authentication keys and salts - generated per container via environment
define( 'AUTH_KEY',         getenv( 'WORDPRESS_AUTH_KEY' )         ?: 'wp-launcher-default-auth-key-change-me' );
define( 'SECURE_AUTH_KEY',  getenv( 'WORDPRESS_SECURE_AUTH_KEY' )  ?: 'wp-launcher-default-secure-auth-key' );
define( 'LOGGED_IN_KEY',    getenv( 'WORDPRESS_LOGGED_IN_KEY' )    ?: 'wp-launcher-default-logged-in-key' );
define( 'NONCE_KEY',        getenv( 'WORDPRESS_NONCE_KEY' )        ?: 'wp-launcher-default-nonce-key' );
define( 'AUTH_SALT',        getenv( 'WORDPRESS_AUTH_SALT' )        ?: 'wp-launcher-default-auth-salt' );
define( 'SECURE_AUTH_SALT', getenv( 'WORDPRESS_SECURE_AUTH_SALT' ) ?: 'wp-launcher-default-secure-auth-salt' );
define( 'LOGGED_IN_SALT',   getenv( 'WORDPRESS_LOGGED_IN_SALT' )   ?: 'wp-launcher-default-logged-in-salt' );
define( 'NONCE_SALT',       getenv( 'WORDPRESS_NONCE_SALT' )       ?: 'wp-launcher-default-nonce-salt' );

// Table prefix
$table_prefix = getenv( 'WORDPRESS_TABLE_PREFIX' ) ?: 'wp_';

// Demo site restrictions
define( 'DISALLOW_FILE_MODS', true );
define( 'DISALLOW_FILE_EDIT', true );
define( 'AUTOMATIC_UPDATER_DISABLED', true );
define( 'WP_AUTO_UPDATE_CORE', false );

// Disable cron (demo sites don't need scheduled tasks)
define( 'DISABLE_WP_CRON', true );

// Debug settings
define( 'WP_DEBUG', (bool) getenv( 'WP_DEBUG' ) );
define( 'WP_DEBUG_LOG', (bool) getenv( 'WP_DEBUG' ) );
define( 'WP_DEBUG_DISPLAY', false );

// Site URL from environment
if ( getenv( 'WP_SITE_URL' ) ) {
    define( 'WP_HOME', getenv( 'WP_SITE_URL' ) );
    define( 'WP_SITEURL', getenv( 'WP_SITE_URL' ) );
}

// Memory limits
define( 'WP_MEMORY_LIMIT', '128M' );
define( 'WP_MAX_MEMORY_LIMIT', '256M' );

// Absolute path to the WordPress directory
if ( ! defined( 'ABSPATH' ) ) {
    define( 'ABSPATH', __DIR__ . '/' );
}

// Sets up WordPress vars and included files
require_once ABSPATH . 'wp-settings.php';
