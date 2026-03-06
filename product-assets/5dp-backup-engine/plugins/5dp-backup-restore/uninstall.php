<?php
/**
 * Fired when the plugin is uninstalled.
 *
 * @package FiveDPBR
 * @since   1.0.0
 */

// If uninstall not called from WordPress, exit.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;

// Delete plugin options.
delete_option( 'fdpbr_settings' );
delete_option( 'fdpbr_storage_destinations' );
delete_option( 'fdpbr_version' );
delete_option( 'fdpbr_db_version' );
delete_option( 'fdpbr_dir_secret' );
delete_option( 'fdpbr_migration_key' );

// Delete all transients with fdpbr_ prefix.
// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
$wpdb->query(
	$wpdb->prepare(
		"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
		$wpdb->esc_like( '_transient_fdpbr_' ) . '%',
		$wpdb->esc_like( '_transient_timeout_fdpbr_' ) . '%'
	)
);
// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching

// Drop custom tables.
// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}fdpbr_backups" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}fdpbr_schedules" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}fdpbr_jobs" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}fdpbr_staging" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}fdpbr_change_log" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}fdpbr_logs" );
// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange

// Delete backup directory.
$backup_dir = WP_CONTENT_DIR . '/5dp-backups';

if ( is_dir( $backup_dir ) ) {
	require_once ABSPATH . 'wp-admin/includes/file.php';
	WP_Filesystem();
	global $wp_filesystem;

	if ( $wp_filesystem ) {
		$wp_filesystem->delete( $backup_dir, true );
	}
}

// Delete staging directories.
$staging_dir = WP_CONTENT_DIR . '/staging';
if ( is_dir( $staging_dir ) ) {
	require_once ABSPATH . 'wp-admin/includes/file.php';
	if ( ! function_exists( 'WP_Filesystem' ) ) {
		WP_Filesystem();
	}
	global $wp_filesystem;
	if ( $wp_filesystem ) {
		$wp_filesystem->delete( $staging_dir, true );
	}
}
