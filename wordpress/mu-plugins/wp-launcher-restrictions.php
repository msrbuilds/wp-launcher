<?php
/**
 * Plugin Name: WP Launcher - Restrictions
 * Description: Locks down admin capabilities for demo sites. Cannot be deactivated.
 * Version: 1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Skip ALL restrictions in local mode — full WordPress functionality
if ( getenv( 'WP_LOCAL_MODE' ) === 'true' ) {
    return;
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
 * Limit upload file size and total disk usage for demo sites.
 */
add_filter( 'upload_size_limit', function () {
    // Per-file upload limit (default 2MB)
    $limit = getenv( 'WP_UPLOAD_LIMIT' );
    return $limit ? intval( $limit ) : 2 * 1024 * 1024;
} );

add_filter( 'wp_handle_upload_prefilter', function ( $file ) {
    // Total disk quota for wp-content/uploads (default 50MB)
    $quota = getenv( 'WP_DISK_QUOTA' );
    $quota = $quota ? intval( $quota ) : 100 * 1024 * 1024;

    $uploads_dir = wp_upload_dir();
    $used = wp_launcher_dir_size( $uploads_dir['basedir'] );

    if ( $used + $file['size'] > $quota ) {
        $quota_mb = round( $quota / 1024 / 1024 );
        $file['error'] = sprintf(
            'Upload quota exceeded. This demo site is limited to %dMB of uploads.',
            $quota_mb
        );
    }

    return $file;
} );

/**
 * Calculate directory size recursively.
 */
function wp_launcher_dir_size( $dir ) {
    $size = 0;
    if ( ! is_dir( $dir ) ) {
        return $size;
    }
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator( $dir, RecursiveDirectoryIterator::SKIP_DOTS )
    );
    foreach ( $iterator as $file ) {
        $size += $file->getSize();
    }
    return $size;
}

/**
 * Show disk usage in the media upload UI.
 */
add_action( 'admin_notices', function () {
    $screen = get_current_screen();
    if ( ! $screen || $screen->id !== 'upload' ) {
        return;
    }

    $quota = getenv( 'WP_DISK_QUOTA' );
    $quota = $quota ? intval( $quota ) : 100 * 1024 * 1024;

    $uploads_dir = wp_upload_dir();
    $used = wp_launcher_dir_size( $uploads_dir['basedir'] );

    $used_mb  = round( $used / 1024 / 1024, 1 );
    $quota_mb = round( $quota / 1024 / 1024 );
    $pct      = $quota > 0 ? min( 100, round( ( $used / $quota ) * 100 ) ) : 0;
    $color    = $pct > 90 ? '#dc3232' : ( $pct > 70 ? '#ffb900' : '#00a32a' );

    echo '<div class="notice notice-info"><p>';
    echo "<strong>Disk usage:</strong> {$used_mb}MB / {$quota_mb}MB ({$pct}%) ";
    echo "<span style='display:inline-block;width:100px;height:10px;background:#ddd;border-radius:3px;vertical-align:middle'>";
    echo "<span style='display:block;width:{$pct}%;height:100%;background:{$color};border-radius:3px'></span>";
    echo '</span>';
    echo '</p></div>';
} );

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
