<?php
/**
 * Fired during plugin activation.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Activator
 *
 * Creates custom database tables and sets default options on activation.
 *
 * @since 1.0.0
 */
class FiveDPBR_Activator {

	/**
	 * Current database schema version.
	 *
	 * @var string
	 */
	const DB_VERSION = '1.0.0';

	/**
	 * Run activation routines.
	 *
	 * @since 1.0.0
	 */
	public static function activate() {
		self::create_tables();
		self::create_backup_directory();
		self::set_defaults();
		update_option( 'fdpbr_db_version', self::DB_VERSION );
		update_option( 'fdpbr_version', FDPBR_VERSION );
	}

	/**
	 * Create all custom database tables.
	 *
	 * @since 1.0.0
	 */
	private static function create_tables() {
		global $wpdb;

		$charset_collate = $wpdb->get_charset_collate();

		$sql = array();

		// Backups table.
		$sql[] = "CREATE TABLE {$wpdb->prefix}fdpbr_backups (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			backup_id varchar(64) NOT NULL,
			name varchar(255) NOT NULL DEFAULT '',
			type varchar(20) NOT NULL DEFAULT 'full',
			status varchar(20) NOT NULL DEFAULT 'pending',
			total_size bigint(20) unsigned DEFAULT 0,
			db_size bigint(20) unsigned DEFAULT 0,
			files_size bigint(20) unsigned DEFAULT 0,
			chunk_count int(10) unsigned DEFAULT 0,
			storage_destinations text,
			file_paths text,
			manifest longtext,
			error_message text DEFAULT NULL,
			started_at datetime DEFAULT NULL,
			completed_at datetime DEFAULT NULL,
			created_by bigint(20) unsigned DEFAULT 0,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			UNIQUE KEY backup_id (backup_id),
			KEY status (status),
			KEY type (type),
			KEY created_at (created_at)
		) {$charset_collate};";

		// Schedules table.
		$sql[] = "CREATE TABLE {$wpdb->prefix}fdpbr_schedules (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			name varchar(255) NOT NULL DEFAULT '',
			type varchar(20) NOT NULL DEFAULT 'full',
			frequency varchar(20) NOT NULL DEFAULT 'daily',
			day_of_week tinyint(1) DEFAULT NULL,
			day_of_month tinyint(2) DEFAULT NULL,
			hour tinyint(2) NOT NULL DEFAULT 2,
			minute tinyint(2) NOT NULL DEFAULT 0,
			storage_destinations text,
			retention_count int(10) unsigned DEFAULT 10,
			include_tables text,
			exclude_tables text,
			include_paths text,
			exclude_paths text,
			is_active tinyint(1) NOT NULL DEFAULT 1,
			last_run datetime DEFAULT NULL,
			next_run datetime DEFAULT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY is_active (is_active),
			KEY next_run (next_run)
		) {$charset_collate};";

		// Jobs table.
		$sql[] = "CREATE TABLE {$wpdb->prefix}fdpbr_jobs (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			job_id varchar(64) NOT NULL,
			type varchar(30) NOT NULL,
			status varchar(20) NOT NULL DEFAULT 'queued',
			progress_percent tinyint(3) unsigned DEFAULT 0,
			current_step varchar(100) DEFAULT '',
			total_steps int(10) unsigned DEFAULT 0,
			completed_steps int(10) unsigned DEFAULT 0,
			data longtext,
			error_message text DEFAULT NULL,
			attempts tinyint(3) unsigned DEFAULT 0,
			max_attempts tinyint(3) unsigned DEFAULT 3,
			started_at datetime DEFAULT NULL,
			completed_at datetime DEFAULT NULL,
			heartbeat datetime DEFAULT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			UNIQUE KEY job_id (job_id),
			KEY status (status),
			KEY type (type),
			KEY heartbeat (heartbeat)
		) {$charset_collate};";

		// Staging table.
		$sql[] = "CREATE TABLE {$wpdb->prefix}fdpbr_staging (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			name varchar(255) NOT NULL DEFAULT '',
			staging_prefix varchar(64) NOT NULL,
			staging_dir varchar(512) NOT NULL,
			staging_url varchar(2083) DEFAULT '',
			source_url varchar(2083) NOT NULL,
			type varchar(20) NOT NULL DEFAULT 'subdirectory',
			status varchar(20) NOT NULL DEFAULT 'creating',
			db_tables_count int(10) unsigned DEFAULT 0,
			files_count bigint(20) unsigned DEFAULT 0,
			total_size bigint(20) unsigned DEFAULT 0,
			last_sync_at datetime DEFAULT NULL,
			last_push_at datetime DEFAULT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			UNIQUE KEY staging_prefix (staging_prefix),
			KEY status (status)
		) {$charset_collate};";

		// Change log table.
		$sql[] = "CREATE TABLE {$wpdb->prefix}fdpbr_change_log (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			staging_id bigint(20) unsigned NOT NULL,
			source varchar(10) NOT NULL DEFAULT 'live',
			change_type varchar(20) NOT NULL,
			object_type varchar(50) NOT NULL DEFAULT '',
			object_id varchar(255) DEFAULT '',
			object_data longtext DEFAULT NULL,
			detected_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			synced tinyint(1) NOT NULL DEFAULT 0,
			PRIMARY KEY  (id),
			KEY staging_id (staging_id),
			KEY source_change (source, change_type),
			KEY synced (synced),
			KEY detected_at (detected_at)
		) {$charset_collate};";

		// Logs table.
		$sql[] = "CREATE TABLE {$wpdb->prefix}fdpbr_logs (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			level varchar(10) NOT NULL DEFAULT 'info',
			context varchar(30) NOT NULL DEFAULT 'general',
			message text NOT NULL,
			data longtext DEFAULT NULL,
			user_id bigint(20) unsigned DEFAULT 0,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY level (level),
			KEY context (context),
			KEY created_at (created_at)
		) {$charset_collate};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		foreach ( $sql as $query ) {
			dbDelta( $query );
		}
	}

	/**
	 * Create the backup storage directory with security files.
	 *
	 * @since 1.0.0
	 */
	private static function create_backup_directory() {
		$backup_dir = WP_CONTENT_DIR . '/5dp-backups';

		if ( ! file_exists( $backup_dir ) ) {
			wp_mkdir_p( $backup_dir );
		}

		// .htaccess to deny direct access (Apache/LiteSpeed).
		$htaccess = $backup_dir . '/.htaccess';
		if ( ! file_exists( $htaccess ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			file_put_contents( $htaccess, "Deny from all\n" );
		}

		// index.php to prevent directory listing.
		$index = $backup_dir . '/index.php';
		if ( ! file_exists( $index ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			file_put_contents( $index, "<?php\n// Silence is golden.\n" );
		}
	}

	/**
	 * Set default plugin options.
	 *
	 * @since 1.0.0
	 */
	private static function set_defaults() {
		if ( false === get_option( 'fdpbr_settings' ) ) {
			update_option( 'fdpbr_settings', array(
				'general' => array(
					'chunk_size'          => 50,   // MB per archive chunk.
					'db_batch_size'       => 5000, // Rows per DB export batch.
					'temp_cleanup_hours'  => 24,   // Auto-clean temp files after N hours.
					'background_method'   => 'auto', // auto, action_scheduler, wp_cron, ajax.
				),
				'notifications' => array(
					'email_enabled'       => false,
					'email_recipients'    => get_option( 'admin_email' ),
					'notify_on_success'   => true,
					'notify_on_failure'   => true,
				),
				'advanced' => array(
					'debug_mode'          => false,
					'max_execution_time'  => 0,    // 0 = auto-detect.
					'exclude_paths'       => array(),
					'exclude_tables'      => array(),
				),
			) );
		}

		if ( false === get_option( 'fdpbr_storage_destinations' ) ) {
			update_option( 'fdpbr_storage_destinations', array() );
		}
	}
}
