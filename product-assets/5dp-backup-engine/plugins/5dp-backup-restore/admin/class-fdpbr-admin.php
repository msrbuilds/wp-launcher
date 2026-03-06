<?php
/**
 * The admin-specific functionality of the plugin.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Admin
 *
 * Handles admin-facing functionality including
 * enqueueing styles/scripts and rendering admin pages.
 *
 * @since 1.0.0
 */
class FiveDPBR_Admin {

	/**
	 * Register the admin stylesheets.
	 *
	 * @since 1.0.0
	 * @param string $hook The current admin page hook suffix.
	 */
	public function enqueue_styles( $hook ) {
		if ( false === strpos( $hook, 'fdpbr' ) ) {
			return;
		}

		wp_enqueue_style(
			'fdpbr-admin',
			FDPBR_PLUGIN_URL . 'admin/css/fdpbr-admin.css',
			array(),
			FDPBR_VERSION
		);
	}

	/**
	 * Register the admin JavaScript.
	 *
	 * @since 1.0.0
	 * @param string $hook The current admin page hook suffix.
	 */
	public function enqueue_scripts( $hook ) {
		if ( false === strpos( $hook, 'fdpbr' ) ) {
			return;
		}

		wp_enqueue_script(
			'fdpbr-admin',
			FDPBR_PLUGIN_URL . 'admin/js/fdpbr-admin.js',
			array( 'jquery' ),
			FDPBR_VERSION,
			true
		);

		wp_localize_script(
			'fdpbr-admin',
			'fdpbrAdmin',
			array(
				'ajax_url'         => admin_url( 'admin-ajax.php' ),
				'home_url'         => home_url(),
				'nonce'            => wp_create_nonce( 'fdpbr_nonce' ),
				'upload_chunk_size' => self::get_upload_chunk_size(),
				'i18n'             => array(
					'save'            => __( 'Save Settings', '5dp-backup-restore' ),
					'saving'          => __( 'Saving...', '5dp-backup-restore' ),
					'saved'           => __( 'Settings saved.', '5dp-backup-restore' ),
					'error'           => __( 'An error occurred.', '5dp-backup-restore' ),
					'network_error'   => __( 'Network error. Please try again.', '5dp-backup-restore' ),
					'backup_now'      => __( 'Backup Now', '5dp-backup-restore' ),
					'backing_up'      => __( 'Creating backup...', '5dp-backup-restore' ),
					'backup_complete' => __( 'Backup completed successfully!', '5dp-backup-restore' ),
					'backup_failed'   => __( 'Backup failed.', '5dp-backup-restore' ),
					'restoring'       => __( 'Restoring...', '5dp-backup-restore' ),
					'restore_complete' => __( 'Restore completed successfully!', '5dp-backup-restore' ),
					'restore_failed'  => __( 'Restore failed.', '5dp-backup-restore' ),
					'confirm_restore' => __( 'Are you sure you want to restore this backup? This will overwrite your current site.', '5dp-backup-restore' ),
					'confirm_delete'  => __( 'Are you sure you want to delete this backup?', '5dp-backup-restore' ),
					'testing'         => __( 'Testing connection...', '5dp-backup-restore' ),
					'test_success'    => __( 'Connection successful!', '5dp-backup-restore' ),
					'test_failed'     => __( 'Connection failed.', '5dp-backup-restore' ),
					'uploading'       => __( 'Uploading...', '5dp-backup-restore' ),
					'migrating'       => __( 'Migrating...', '5dp-backup-restore' ),
					'creating_staging' => __( 'Creating staging site...', '5dp-backup-restore' ),
					'syncing'         => __( 'Syncing...', '5dp-backup-restore' ),
				),
			)
		);

		// Page-specific scripts.
		$page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		if ( 'fdpbr-backup' === $page ) {
			wp_enqueue_script(
				'fdpbr-backup',
				FDPBR_PLUGIN_URL . 'admin/js/fdpbr-backup.js',
				array( 'jquery', 'fdpbr-admin' ),
				FDPBR_VERSION,
				true
			);
		}

		if ( 'fdpbr-restore' === $page ) {
			wp_enqueue_script(
				'fdpbr-restore',
				FDPBR_PLUGIN_URL . 'admin/js/fdpbr-restore.js',
				array( 'jquery', 'fdpbr-admin' ),
				FDPBR_VERSION,
				true
			);

			// Prevent WordPress from showing its built-in login modal during restore.
			// The DB import replaces wp_users/wp_usermeta, temporarily invalidating the
			// session. Our token-based polling handles this gracefully, but WP's heartbeat
			// auth check would still pop up the login modal without this.
			wp_dequeue_script( 'wp-auth-check' );
			wp_deregister_script( 'wp-auth-check' );
			remove_action( 'admin_footer', 'wp_auth_check_html' );
		}

		if ( 'fdpbr-migration' === $page ) {
			wp_enqueue_script(
				'fdpbr-migration',
				FDPBR_PLUGIN_URL . 'admin/js/fdpbr-migration.js',
				array( 'jquery', 'fdpbr-admin' ),
				FDPBR_VERSION,
				true
			);
		}

		if ( 'fdpbr-staging' === $page ) {
			wp_enqueue_script(
				'fdpbr-staging',
				FDPBR_PLUGIN_URL . 'admin/js/fdpbr-staging.js',
				array( 'jquery', 'fdpbr-admin' ),
				FDPBR_VERSION,
				true
			);
		}
	}

	/**
	 * Calculate the safest large chunk size for uploads.
	 *
	 * Uses WordPress's own wp_max_upload_size() (min of upload_max_filesize
	 * and post_max_size), reserves 10% headroom, and caps at 20MB.
	 *
	 * @return int Bytes.
	 */
	private static function get_upload_chunk_size() {
		$max  = wp_max_upload_size(); // bytes
		$safe = (int) floor( $max * 0.9 );

		return max(
			2 * 1024 * 1024,         // floor: 2 MB
			min( $safe, 20 * 1024 * 1024 ) // cap: 20 MB
		);
	}
}
