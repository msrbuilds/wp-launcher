<?php
/**
 * The core plugin class.
 *
 * Orchestrates all plugin components by loading dependencies,
 * setting the locale, and registering admin hooks.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR
 *
 * @since 1.0.0
 */
class FiveDPBR {

	/**
	 * The loader that registers all hooks for the plugin.
	 *
	 * @since 1.0.0
	 * @var   FiveDPBR_Loader
	 */
	protected $loader;

	/**
	 * Initialize the plugin.
	 *
	 * @since 1.0.0
	 */
	public function __construct() {
		$this->load_dependencies();
		$this->set_locale();
		$this->define_admin_hooks();
	}

	/**
	 * Load required dependencies.
	 *
	 * @since 1.0.0
	 */
	private function load_dependencies() {
		// Core.
		require_once FDPBR_PLUGIN_DIR . 'includes/class-fdpbr-loader.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/class-fdpbr-i18n.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/class-fdpbr-settings.php';

		// Utilities.
		require_once FDPBR_PLUGIN_DIR . 'includes/util/class-fdpbr-logger.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/util/class-fdpbr-helper.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/util/class-fdpbr-encryption.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/util/class-fdpbr-notifications.php';

		// Background processing.
		require_once FDPBR_PLUGIN_DIR . 'includes/background/class-fdpbr-environment.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/background/class-fdpbr-job-manager.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/background/class-fdpbr-background-processor.php';

		// Backup engine.
		require_once FDPBR_PLUGIN_DIR . 'includes/backup/class-fdpbr-db-exporter.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/backup/class-fdpbr-file-archiver.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/backup/class-fdpbr-backup-manifest.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/backup/class-fdpbr-packager.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/backup/class-fdpbr-backup-engine.php';

		// Restore engine.
		require_once FDPBR_PLUGIN_DIR . 'includes/restore/class-fdpbr-file-extractor.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/restore/class-fdpbr-db-importer.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/restore/class-fdpbr-search-replace.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/restore/class-fdpbr-restore-engine.php';

		// Migration engine.
		require_once FDPBR_PLUGIN_DIR . 'includes/migration/class-fdpbr-migration-package.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/migration/class-fdpbr-migration-api.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/migration/class-fdpbr-migration-engine.php';

		// REST API.
		require_once FDPBR_PLUGIN_DIR . 'api/class-fdpbr-rest-controller.php';

		// Staging engine.
		require_once FDPBR_PLUGIN_DIR . 'includes/staging/class-fdpbr-staging-clone.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/staging/class-fdpbr-staging-tracker.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/staging/class-fdpbr-staging-sync.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/staging/class-fdpbr-staging-engine.php';

		// Database helper.
		require_once FDPBR_PLUGIN_DIR . 'includes/class-fdpbr-database.php';

		// Storage providers.
		require_once FDPBR_PLUGIN_DIR . 'includes/storage/interface-fdpbr-storage.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/storage/class-fdpbr-storage-manager.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/storage/class-fdpbr-storage-local.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/storage/class-fdpbr-storage-s3.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/storage/class-fdpbr-storage-gcs.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/storage/class-fdpbr-storage-gdrive.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/storage/class-fdpbr-storage-dropbox.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/storage/class-fdpbr-storage-onedrive.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/storage/class-fdpbr-storage-ftp.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/storage/class-fdpbr-storage-sftp.php';
		require_once FDPBR_PLUGIN_DIR . 'includes/storage/class-fdpbr-storage-webdav.php';

		// Admin.
		require_once FDPBR_PLUGIN_DIR . 'admin/class-fdpbr-admin.php';

		$this->loader = new FiveDPBR_Loader();
	}

	/**
	 * Set the plugin locale for internationalization.
	 *
	 * @since 1.0.0
	 */
	private function set_locale() {
		$i18n = new FiveDPBR_I18n();
		$this->loader->add_action( 'init', $i18n, 'load_plugin_textdomain' );
	}

	/**
	 * Register all admin-related hooks.
	 *
	 * @since 1.0.0
	 */
	private function define_admin_hooks() {
		$admin    = new FiveDPBR_Admin();
		$settings = new FiveDPBR_Settings();

		$this->loader->add_action( 'admin_enqueue_scripts', $admin, 'enqueue_styles' );
		$this->loader->add_action( 'admin_enqueue_scripts', $admin, 'enqueue_scripts' );

		// Settings hooks are registered via init() which uses add_action directly.
		$settings->init();

		// Job manager AJAX handlers.
		FiveDPBR_Job_Manager::register_ajax_handlers();

		// Backup engine.
		$backup_engine = new FiveDPBR_Backup_Engine();
		$backup_engine->register_ajax();

		// Restore engine.
		$restore_engine = new FiveDPBR_Restore_Engine();
		$restore_engine->register_ajax();

		// Storage manager.
		FiveDPBR_Storage_Manager::init();
		FiveDPBR_Storage_Manager::register_ajax();

		// Migration engine.
		$migration_engine = new FiveDPBR_Migration_Engine();
		$migration_engine->register_ajax();

		// Migration API (incoming REST endpoints).
		FiveDPBR_Migration_API::init();

		// REST controller (staging sync endpoints).
		FiveDPBR_REST_Controller::init();

		// Staging engine.
		$staging_engine = new FiveDPBR_Staging_Engine();
		$staging_engine->register_ajax();

		// Staging change tracker.
		FiveDPBR_Staging_Tracker::init();

		// Log AJAX handlers.
		add_action( 'wp_ajax_fdpbr_get_logs', array( $this, 'ajax_get_logs' ) );
		add_action( 'wp_ajax_fdpbr_clear_logs', array( $this, 'ajax_clear_logs' ) );

		// Dashboard AJAX.
		add_action( 'wp_ajax_fdpbr_get_dashboard_data', array( $this, 'ajax_get_dashboard_data' ) );

		// Email notifications.
		FiveDPBR_Notifications::init();

		// Stale job check via cron.
		$this->loader->add_action( 'fdpbr_stale_job_check', new FiveDPBR_Job_Manager(), 'handle_stale_jobs' );

		// Schedule stale job check if not already scheduled.
		if ( ! wp_next_scheduled( 'fdpbr_stale_job_check' ) ) {
			wp_schedule_event( time(), 'five_minutes', 'fdpbr_stale_job_check' );
		}
	}

	/**
	 * Register custom cron schedules.
	 *
	 * @param array $schedules Existing schedules.
	 * @return array
	 */
	public static function add_cron_schedules( $schedules ) {
		$schedules['five_minutes'] = array(
			'interval' => 300,
			'display'  => __( 'Every 5 Minutes', '5dp-backup-restore' ),
		);

		return $schedules;
	}

	/**
	 * Run the loader to execute all registered hooks.
	 *
	 * @since 1.0.0
	 */
	public function run() {
		$this->loader->run();
	}

	/**
	 * Get the loader instance.
	 *
	 * @since  1.0.0
	 * @return FiveDPBR_Loader
	 */
	public function get_loader() {
		return $this->loader;
	}

	/**
	 * AJAX: Get logs.
	 */
	public function ajax_get_logs() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$level   = isset( $_POST['level'] ) ? sanitize_text_field( wp_unslash( $_POST['level'] ) ) : '';
		$context = isset( $_POST['context'] ) ? sanitize_text_field( wp_unslash( $_POST['context'] ) ) : '';
		$page    = isset( $_POST['page'] ) ? (int) $_POST['page'] : 1;

		$logs  = FiveDPBR_Logger::get_logs( compact( 'level', 'context', 'page' ) );
		$total = FiveDPBR_Logger::get_count( compact( 'level', 'context' ) );

		wp_send_json_success( array(
			'logs'  => $logs,
			'total' => $total,
		) );
	}

	/**
	 * AJAX: Clear all logs.
	 */
	public function ajax_clear_logs() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		FiveDPBR_Logger::clear_all();
		wp_send_json_success( array( 'message' => __( 'Logs cleared.', '5dp-backup-restore' ) ) );
	}

	/**
	 * AJAX: Get dashboard data.
	 */
	public function ajax_get_dashboard_data() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$backups   = FiveDPBR_Backup_Engine::get_backups( array( 'per_page' => 5 ) );
		$schedules = FiveDPBR_Database::get_schedules( true );
		$staging   = FiveDPBR_Database::get_staging_sites();
		$status    = FiveDPBR_Environment::get_system_status();

		$recent = array();
		foreach ( $backups as $b ) {
			$recent[] = array(
				'backup_id'    => $b->backup_id,
				'name'         => $b->name,
				'type'         => $b->type,
				'status'       => $b->status,
				'total_size'   => FiveDPBR_Helper::format_bytes( (int) $b->total_size ),
				'created_at'   => $b->created_at,
			);
		}

		wp_send_json_success( array(
			'total_backups'    => FiveDPBR_Backup_Engine::get_count(),
			'active_schedules' => count( $schedules ),
			'staging_sites'    => count( $staging ),
			'recent_backups'   => $recent,
			'system_status'    => $status,
		) );
	}
}
