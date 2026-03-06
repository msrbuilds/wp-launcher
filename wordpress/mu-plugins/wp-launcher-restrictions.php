<?php
/**
 * Plugin Name: WP Launcher - Restrictions
 * Description: Locks down admin capabilities for demo sites. Cannot be deactivated.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Ensure wp-config constants are set as fallback.
 */
if ( ! defined( 'DISALLOW_FILE_MODS' ) ) {
    define( 'DISALLOW_FILE_MODS', true );
}
if ( ! defined( 'DISALLOW_FILE_EDIT' ) ) {
    define( 'DISALLOW_FILE_EDIT', true );
}

/**
 * Strip dangerous capabilities from all users.
 */
add_filter( 'user_has_cap', function ( $allcaps, $caps, $args ) {
    $restricted_caps = array(
        'install_plugins',
        'install_themes',
        'edit_plugins',
        'edit_themes',
        'update_plugins',
        'update_themes',
        'update_core',
        'delete_plugins',
        'delete_themes',
        'export',
        'import',
        'edit_files',
    );

    foreach ( $restricted_caps as $cap ) {
        $allcaps[ $cap ] = false;
    }

    return $allcaps;
}, 10, 3 );

/**
 * Remove restricted admin menu items.
 */
add_action( 'admin_menu', function () {
    // Remove plugin installation
    remove_submenu_page( 'plugins.php', 'plugin-install.php' );

    // Remove theme installation
    remove_submenu_page( 'themes.php', 'theme-install.php' );

    // Remove file editors
    remove_submenu_page( 'themes.php', 'theme-editor.php' );
    remove_submenu_page( 'plugins.php', 'plugin-editor.php' );

    // Remove tools menu (import/export)
    remove_menu_page( 'tools.php' );

    // Remove update page
    remove_submenu_page( 'index.php', 'update-core.php' );
}, 999 );

/**
 * Hide update nag notices.
 */
add_action( 'admin_head', function () {
    remove_action( 'admin_notices', 'update_nag', 3 );
    remove_action( 'admin_notices', 'maintenance_nag', 10 );
}, 1 );

/**
 * Block direct access to restricted admin pages.
 */
add_action( 'admin_init', function () {
    $blocked_pages = array(
        'plugin-install.php',
        'theme-install.php',
        'plugin-editor.php',
        'theme-editor.php',
        'update-core.php',
        'import.php',
        'export.php',
    );

    $current_page = basename( sanitize_text_field( $_SERVER['SCRIPT_NAME'] ?? '' ) );

    if ( in_array( $current_page, $blocked_pages, true ) ) {
        wp_die(
            '<h1>Restricted</h1><p>This action is disabled on demo sites.</p>',
            'Restricted',
            array( 'response' => 403 )
        );
    }
} );

/**
 * Block REST API write endpoints for plugins and themes.
 */
add_filter( 'rest_dispatch_request', function ( $dispatch, $request, $route ) {
    $blocked_patterns = array(
        '#/wp/v2/plugins#',
        '#/wp/v2/themes#',
    );

    foreach ( $blocked_patterns as $pattern ) {
        if ( preg_match( $pattern, $route ) && $request->get_method() !== 'GET' ) {
            return new WP_Error(
                'wp_launcher_restricted',
                'This action is disabled on demo sites.',
                array( 'status' => 403 )
            );
        }
    }

    return $dispatch;
}, 10, 3 );

/**
 * Disable automatic updates.
 */
add_filter( 'automatic_updater_disabled', '__return_true' );
add_filter( 'auto_update_plugin', '__return_false' );
add_filter( 'auto_update_theme', '__return_false' );
add_filter( 'auto_update_core', '__return_false' );

/**
 * Remove "Add New" buttons from plugin and theme list pages.
 */
add_action( 'admin_head', function () {
    echo '<style>
        .plugins-php .page-title-action,
        .themes-php .page-title-action,
        .update-php .page-title-action {
            display: none !important;
        }
    </style>';
} );
