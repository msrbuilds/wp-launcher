<?php
/**
 * Staging engine orchestrator.
 *
 * Coordinates the staging site lifecycle: creation, cloning, configuration,
 * deletion, and synchronization. Extends the abstract background processor
 * for chunked execution of long-running staging operations.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/staging
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Staging_Engine
 *
 * @since 1.0.0
 */
class FiveDPBR_Staging_Engine extends FiveDPBR_Background_Processor {

	/**
	 * Constructor.
	 */
	public function __construct() {
		parent::__construct( 'fdpbr_staging' );
	}

	/**
	 * Get logging context.
	 *
	 * @return string
	 */
	protected function get_context() {
		return 'staging';
	}

	/**
	 * Create a new staging site.
	 *
	 * @param array $args Staging arguments.
	 * @return string|WP_Error Job ID or error.
	 */
	public function create_staging( $args = array() ) {
		global $wpdb;

		$defaults = array(
			'name'       => '',
			'type'       => 'subdirectory',
			'source_url' => site_url(),
		);

		$args = wp_parse_args( $args, $defaults );

		if ( empty( $args['name'] ) ) {
			$args['name'] = 'staging';
		}

		// Sanitize the staging name for use as a directory and prefix.
		$safe_name = sanitize_title( $args['name'] );

		if ( empty( $safe_name ) ) {
			return new WP_Error( 'invalid_name', __( 'Invalid staging site name.', '5dp-backup-restore' ) );
		}

		// Check for duplicate name in DB.
		$staging_table = $wpdb->prefix . 'fdpbr_staging';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$exists = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$staging_table} WHERE name = %s AND status != 'deleted'",
				$safe_name
			)
		);

		if ( $exists ) {
			return new WP_Error( 'duplicate_name', __( 'A staging site with this name already exists.', '5dp-backup-restore' ) );
		}

		// Check if directory already exists on disk.
		$target_dir = untrailingslashit( ABSPATH ) . '/' . $safe_name;

		if ( is_dir( $target_dir ) ) {
			return new WP_Error(
				'dir_exists',
				sprintf(
					/* translators: %s: Directory name */
					__( 'The directory "%s" already exists. Please choose a different name.', '5dp-backup-restore' ),
					$safe_name
				)
			);
		}

		// Generate staging prefix (e.g., stg1_).
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$count          = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$staging_table}" );
		$staging_prefix = 'stg' . ( $count + 1 ) . '_';

		// Staging directory as a subdirectory of ABSPATH.
		$staging_dir = untrailingslashit( ABSPATH ) . '/' . $safe_name;
		$staging_url = untrailingslashit( site_url() ) . '/' . $safe_name;

		// Create staging record.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$inserted = $wpdb->insert(
			$staging_table,
			array(
				'name'           => $safe_name,
				'type'           => $args['type'],
				'source_url'     => untrailingslashit( $args['source_url'] ),
				'staging_url'    => $staging_url,
				'staging_prefix' => $staging_prefix,
				'staging_dir'    => $staging_dir,
				'status'         => 'creating',
				'created_at'     => current_time( 'mysql', true ),
			),
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
		);

		if ( ! $inserted ) {
			return new WP_Error( 'db_error', __( 'Could not create staging record.', '5dp-backup-restore' ) );
		}

		$staging_id = $wpdb->insert_id;

		// Build job data.
		$job_data = array(
			'staging_id'     => $staging_id,
			'name'           => $safe_name,
			'type'           => $args['type'],
			'source_url'     => untrailingslashit( $args['source_url'] ),
			'source_prefix'  => $wpdb->prefix,
			'staging_prefix' => $staging_prefix,
			'staging_dir'    => $staging_dir,
			'phase'          => 'clone_db',
			'clone_state'    => null,
			'file_state'     => null,
		);

		// Create job.
		$job_id = FiveDPBR_Job_Manager::create_job( array(
			'type' => 'staging',
			'data' => $job_data,
		) );

		if ( ! $job_id ) {
			return new WP_Error( 'job_create', __( 'Cannot create staging job.', '5dp-backup-restore' ) );
		}

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'Staging site "%s" creation started (prefix: %s).', $safe_name, $staging_prefix )
		);

		// Dispatch for background processing.
		$this->dispatch( $job_id, $job_data );

		return $job_id;
	}

	/**
	 * Process a single chunk of staging work.
	 *
	 * @param array $data Current job state.
	 * @return true|array|WP_Error True if completed, updated data array to continue, WP_Error on failure.
	 */
	protected function process_chunk( $data ) {
		$phase = $data['phase'];

		switch ( $phase ) {
			case 'clone_db':
				return $this->phase_clone_db( $data );

			case 'copy_files':
				return $this->phase_copy_files( $data );

			case 'configure':
				return $this->phase_configure( $data );

			case 'complete':
				return $this->phase_complete( $data );

			default:
				return new WP_Error( 'unknown_phase', sprintf( 'Unknown staging phase: %s', $phase ) );
		}
	}

	/**
	 * Phase: Clone the database tables.
	 *
	 * Copies all WordPress tables with a staging prefix using CREATE TABLE ... SELECT.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error Updated data.
	 */
	private function phase_clone_db( $data ) {
		$this->update_progress( 5, __( 'Cloning database...', '5dp-backup-restore' ) );

		$source_prefix  = $data['source_prefix'];
		$staging_prefix = $data['staging_prefix'];

		// Get all tables with the source prefix.
		$tables = FiveDPBR_Helper::get_wp_tables();

		if ( empty( $tables ) ) {
			return new WP_Error( 'no_tables', __( 'No database tables found to clone.', '5dp-backup-restore' ) );
		}

		$result = FiveDPBR_Staging_Clone::clone_database( $source_prefix, $staging_prefix, $tables );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$this->update_progress( 30, __( 'Database cloned.', '5dp-backup-restore' ) );

		$data['phase'] = 'copy_files';
		return $data;
	}

	/**
	 * Phase: Copy files to the staging directory.
	 *
	 * Copies the full WordPress installation (ABSPATH) to the staging subdirectory.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error Updated data.
	 */
	private function phase_copy_files( $data ) {
		$staging_dir  = $data['staging_dir'];
		$staging_name = $data['name'];

		// Initialize file state if this is the first pass.
		if ( empty( $data['file_state'] ) ) {
			$data['file_state'] = array(
				'source_dir'  => ABSPATH,
				'dest_dir'    => $staging_dir,
				'files_done'  => 0,
				'total_files' => 0,
				'initialized' => false,
			);
		}

		$file_state = $data['file_state'];
		$done       = $file_state['files_done'];
		$total      = max( $file_state['total_files'], 1 );

		$this->update_progress(
			30 + (int) ( ( $done / $total ) * 40 ),
			sprintf(
				/* translators: 1: Files done, 2: Total files */
				__( 'Copying files (%1$d/%2$d)...', '5dp-backup-restore' ),
				$done,
				$total
			)
		);

		// Exclude patterns.
		// Absolute paths for staging dirs (so "staging" name doesn't match plugin subdirs).
		// Simple names for files that should be excluded at any level.
		$abspath = untrailingslashit( ABSPATH );
		$exclude = array(
			// Absolute: staging dir itself + wp-config + htaccess at root.
			$abspath . '/' . $staging_name,
			$abspath . '/wp-config.php',
			$abspath . '/.htaccess',
			// Simple names: excluded at any level.
			'5dp-backups',
			'upgrade',
			'debug.log',
			'object-cache.php',
			'db.php',
		);

		// Also exclude any other staging directories (absolute paths).
		global $wpdb;
		$staging_table = $wpdb->prefix . 'fdpbr_staging';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$other_staging = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT name FROM {$staging_table} WHERE name != %s AND status != 'deleted'",
				$staging_name
			)
		);

		foreach ( $other_staging as $other_name ) {
			$exclude[] = $abspath . '/' . $other_name;
		}

		$result = FiveDPBR_Staging_Clone::clone_files( ABSPATH, $staging_dir, $exclude );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$data['file_state']['files_done']  = $result;
		$data['file_state']['total_files'] = $result;

		$this->update_progress( 70, __( 'Files copied.', '5dp-backup-restore' ) );

		$data['phase'] = 'configure';
		return $data;
	}

	/**
	 * Phase: Configure the staging site.
	 *
	 * Updates site_url and home in the staging database, creates wp-config.php
	 * for the staging subdirectory with the staging table prefix.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error Updated data.
	 */
	private function phase_configure( $data ) {
		global $wpdb;

		$this->update_progress( 75, __( 'Configuring staging site...', '5dp-backup-restore' ) );

		$staging_prefix = $data['staging_prefix'];
		$staging_dir    = $data['staging_dir'];
		$source_url     = $data['source_url'];
		$staging_url    = untrailingslashit( site_url() ) . '/' . $data['name'];
		$staging_options = $staging_prefix . 'options';

		// Run search-replace on staging tables to update URLs.
		// For same-domain staging, use a single exact URL replacement only.
		// get_migration_pairs() generates protocol-relative (//domain) and JSON-escaped
		// variants that overlap — e.g., after replacing https://domain → https://domain/staging,
		// the //domain pair matches the result and doubles to //domain/staging/staging.
		if ( $source_url !== $staging_url ) {
			$staging_tables = array();
			$all_tables     = FiveDPBR_Helper::get_wp_tables();

			// Skip plugin's own tables — they contain metadata URLs that must not be rewritten.
			$skip_suffixes = array( 'fdpbr_staging', 'fdpbr_backups', 'fdpbr_jobs', 'fdpbr_logs', 'fdpbr_schedules', 'fdpbr_change_log' );

			foreach ( $all_tables as $table ) {
				$table_suffix = substr( $table, strlen( $wpdb->prefix ) );
				if ( in_array( $table_suffix, $skip_suffixes, true ) ) {
					continue;
				}
				$staging_table_name = str_replace( $wpdb->prefix, $staging_prefix, $table );
				$staging_tables[]   = $staging_table_name;
			}

			// Single exact replacement — no protocol-relative or JSON-escaped variants.
			FiveDPBR_Search_Replace::run( $source_url, $staging_url, $staging_tables );

			// JSON-escaped variant (for serialized data containing \/ escaped URLs).
			$old_escaped = str_replace( '/', '\\/', $source_url );
			$new_escaped = str_replace( '/', '\\/', $staging_url );
			if ( $old_escaped !== $new_escaped ) {
				FiveDPBR_Search_Replace::run( $old_escaped, $new_escaped, $staging_tables );
			}
		}

		// Force-set siteurl and home AFTER search-replace to guarantee correct values.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->update(
			$staging_options,
			array( 'option_value' => $staging_url ),
			array( 'option_name' => 'siteurl' )
		);

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->update(
			$staging_options,
			array( 'option_value' => $staging_url ),
			array( 'option_name' => 'home' )
		);

		// Delete rewrite_rules so WordPress regenerates them for the staging subdirectory.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->delete( $staging_options, array( 'option_name' => 'rewrite_rules' ) );

		// Remap prefix-dependent meta keys in usermeta and options.
		// WordPress stores capabilities as {prefix}capabilities, {prefix}user_level in usermeta
		// and {prefix}user_roles in options. Without remapping, WordPress can't find the
		// current user's capabilities and shows "Sorry, you are not allowed to access this page."
		$old_prefix     = $wpdb->prefix;
		$staging_umeta  = $staging_prefix . 'usermeta';

		if ( $old_prefix !== $staging_prefix ) {
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQLPlaceholders.UnquotedComplexPlaceholder
			$wpdb->query(
				$wpdb->prepare(
					"UPDATE {$staging_umeta} SET meta_key = REPLACE( meta_key, %s, %s ) WHERE meta_key LIKE %s",
					$old_prefix,
					$staging_prefix,
					$wpdb->esc_like( $old_prefix ) . '%'
				)
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQLPlaceholders.UnquotedComplexPlaceholder

			// Rename user_roles option key from {old_prefix}user_roles to {staging_prefix}user_roles.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->update(
				$staging_options,
				array( 'option_name' => $staging_prefix . 'user_roles' ),
				array( 'option_name' => $old_prefix . 'user_roles' )
			);
		}

		// Create wp-config.php for the staging site.
		// Read the source wp-config.php and modify it.
		$source_config_path = ABSPATH . 'wp-config.php';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$config_content = file_get_contents( $source_config_path );

		if ( false === $config_content ) {
			return new WP_Error( 'config_read', __( 'Could not read source wp-config.php.', '5dp-backup-restore' ) );
		}

		// Replace the table prefix.
		$config_content = preg_replace(
			'/\$table_prefix\s*=\s*[\'"][^\'"]*[\'"]\s*;/',
			"\$table_prefix = '{$staging_prefix}';",
			$config_content,
			1
		);

		// Remove any hardcoded WP_SITEURL / WP_HOME constants (e.g., Laragon auto-config).
		// These override the DB siteurl/home and break subdirectory staging sites.
		$config_content = preg_replace(
			'/^\s*define\s*\(\s*[\'"]WP_SITEURL[\'"]\s*,.+?\)\s*;\s*$/m',
			'',
			$config_content
		);
		$config_content = preg_replace(
			'/^\s*define\s*\(\s*[\'"]WP_HOME[\'"]\s*,.+?\)\s*;\s*$/m',
			'',
			$config_content
		);

		// Add staging identification constants right after the opening PHP tag.
		$staging_constants  = "\n// 5DP Staging site configuration.\n";
		$staging_constants .= "define( 'FDPBR_IS_STAGING', true );\n";
		$staging_constants .= "define( 'FDPBR_STAGING_NAME', " . var_export( $data['name'], true ) . " );\n";
		$staging_constants .= "define( 'FDPBR_STAGING_PREFIX', " . var_export( $staging_prefix, true ) . " );\n\n";

		$config_content = preg_replace(
			'/^(<\?php\s*)/i',
			'$1' . $staging_constants,
			$config_content,
			1
		);

		$config_path = trailingslashit( $staging_dir ) . 'wp-config.php';

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		$written = file_put_contents( $config_path, $config_content );

		if ( false === $written ) {
			return new WP_Error( 'config_write', __( 'Could not write staging wp-config.php.', '5dp-backup-restore' ) );
		}

		// Create .htaccess with correct RewriteBase for the staging subdirectory.
		$htaccess_content  = "# BEGIN WordPress\n";
		$htaccess_content .= "<IfModule mod_rewrite.c>\n";
		$htaccess_content .= "RewriteEngine On\n";
		$htaccess_content .= "RewriteBase /" . $data['name'] . "/\n";
		$htaccess_content .= "RewriteRule ^index\\.php$ - [L]\n";
		$htaccess_content .= "RewriteCond %{REQUEST_FILENAME} !-f\n";
		$htaccess_content .= "RewriteCond %{REQUEST_FILENAME} !-d\n";
		$htaccess_content .= "RewriteRule . /" . $data['name'] . "/index.php [L]\n";
		$htaccess_content .= "</IfModule>\n";
		$htaccess_content .= "# END WordPress\n";

		$htaccess_path = trailingslashit( $staging_dir ) . '.htaccess';

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $htaccess_path, $htaccess_content );

		$this->update_progress( 90, __( 'Staging site configured.', '5dp-backup-restore' ) );

		$data['phase'] = 'complete';
		return $data;
	}

	/**
	 * Phase: Complete staging site creation.
	 *
	 * Updates the staging record status to 'active'.
	 *
	 * @param array $data Job data.
	 * @return true
	 */
	private function phase_complete( $data ) {
		global $wpdb;

		$this->update_progress( 95, __( 'Finalizing staging site...', '5dp-backup-restore' ) );

		$staging_table = $wpdb->prefix . 'fdpbr_staging';

		// Update status on the LIVE fdpbr_staging table.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update(
			$staging_table,
			array( 'status' => 'active' ),
			array( 'id' => $data['staging_id'] ),
			array( '%s' ),
			array( '%d' )
		);

		// Also update status in the STAGING copy of fdpbr_staging so the staging
		// site's own admin doesn't show "Creating" badge.
		$stg_staging_table = $data['staging_prefix'] . 'fdpbr_staging';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->update(
			$stg_staging_table,
			array( 'status' => 'active' ),
			array( 'id' => $data['staging_id'] ),
			array( '%s' ),
			array( '%d' )
		);

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'Staging site "%s" created successfully.', $data['name'] )
		);

		// Initialize change tracking for the new staging site.
		FiveDPBR_Staging_Tracker::init();

		return true;
	}

	/**
	 * Delete a staging site.
	 *
	 * Removes the staging database tables, files, and record.
	 *
	 * @param int $staging_id Staging site ID.
	 * @return bool|WP_Error True on success, WP_Error on failure.
	 */
	public function delete_staging( $staging_id ) {
		global $wpdb;

		$staging_table = $wpdb->prefix . 'fdpbr_staging';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$staging = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$staging_table} WHERE id = %d", $staging_id )
		);

		if ( ! $staging ) {
			return new WP_Error( 'not_found', __( 'Staging site not found.', '5dp-backup-restore' ) );
		}

		// Remove clone (tables and files).
		$result = FiveDPBR_Staging_Clone::remove_clone( $staging->staging_prefix, $staging->staging_dir );

		if ( is_wp_error( $result ) ) {
			FiveDPBR_Logger::error(
				'staging',
				sprintf( 'Error removing staging clone "%s": %s', $staging->name, $result->get_error_message() )
			);
		}

		// Clear change log entries.
		FiveDPBR_Staging_Tracker::clear_changes( $staging_id );

		// Update record status.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update(
			$staging_table,
			array( 'status' => 'deleted' ),
			array( 'id' => $staging_id ),
			array( '%s' ),
			array( '%d' )
		);

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'Staging site "%s" deleted.', $staging->name )
		);

		return true;
	}

	// =========================================================================
	// Static Helpers
	// =========================================================================

	/**
	 * Get all staging site records.
	 *
	 * @param array $args Query arguments.
	 * @return array
	 */
	public static function get_staging_sites( $args = array() ) {
		global $wpdb;

		$defaults = array(
			'status'   => '',
			'per_page' => 20,
			'page'     => 1,
			'order'    => 'DESC',
		);

		$args   = wp_parse_args( $args, $defaults );
		$table  = $wpdb->prefix . 'fdpbr_staging';
		$where  = "status != 'deleted'";
		$values = array();

		if ( ! empty( $args['status'] ) ) {
			$where   .= ' AND status = %s';
			$values[] = $args['status'];
		}

		$order  = 'ASC' === strtoupper( $args['order'] ) ? 'ASC' : 'DESC';
		$offset = ( max( 1, (int) $args['page'] ) - 1 ) * (int) $args['per_page'];

		$sql      = "SELECT * FROM {$table} WHERE {$where} ORDER BY created_at {$order} LIMIT %d OFFSET %d";
		$values[] = (int) $args['per_page'];
		$values[] = $offset;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return $wpdb->get_results( $wpdb->prepare( $sql, $values ) );
	}

	/**
	 * Get a single staging site record.
	 *
	 * @param int $staging_id Staging site ID.
	 * @return object|null
	 */
	public static function get_staging_site( $staging_id ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		return $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}fdpbr_staging WHERE id = %d",
				$staging_id
			)
		);
	}

	// =========================================================================
	// AJAX Handlers
	// =========================================================================

	/**
	 * Register AJAX handlers.
	 */
	public function register_ajax() {
		add_action( 'wp_ajax_fdpbr_create_staging', array( $this, 'ajax_create_staging' ) );
		add_action( 'wp_ajax_fdpbr_delete_staging', array( $this, 'ajax_delete_staging' ) );
		add_action( 'wp_ajax_fdpbr_sync_staging', array( $this, 'ajax_sync_staging' ) );
		add_action( 'wp_ajax_fdpbr_get_staging_sites', array( $this, 'ajax_get_staging_sites' ) );
		add_action( 'wp_ajax_fdpbr_pair_remote', array( $this, 'ajax_pair_remote' ) );
		add_action( 'wp_ajax_fdpbr_remote_sync', array( $this, 'ajax_remote_sync' ) );
		add_action( 'wp_ajax_fdpbr_get_change_log', array( $this, 'ajax_get_change_log' ) );
	}

	/**
	 * AJAX: Create a staging site.
	 */
	public function ajax_create_staging() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$name = isset( $_POST['name'] ) ? sanitize_text_field( wp_unslash( $_POST['name'] ) ) : '';
		$type = isset( $_POST['type'] ) ? sanitize_text_field( wp_unslash( $_POST['type'] ) ) : 'subdirectory';

		$result = $this->create_staging( array(
			'name' => $name,
			'type' => $type,
		) );

		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => $result->get_error_message() ) );
		}

		wp_send_json_success( array(
			'message' => __( 'Staging site creation started.', '5dp-backup-restore' ),
			'job_id'  => $result,
		) );
	}

	/**
	 * AJAX: Delete a staging site.
	 */
	public function ajax_delete_staging() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$staging_id = isset( $_POST['staging_id'] ) ? absint( $_POST['staging_id'] ) : 0;

		if ( ! $staging_id ) {
			wp_send_json_error( array( 'message' => __( 'Missing staging ID.', '5dp-backup-restore' ) ) );
		}

		$result = $this->delete_staging( $staging_id );

		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => $result->get_error_message() ) );
		}

		wp_send_json_success( array( 'message' => __( 'Staging site deleted.', '5dp-backup-restore' ) ) );
	}

	/**
	 * AJAX: Sync a staging site.
	 */
	public function ajax_sync_staging() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$staging_id = isset( $_POST['staging_id'] ) ? absint( $_POST['staging_id'] ) : 0;
		$direction  = isset( $_POST['direction'] ) ? sanitize_text_field( wp_unslash( $_POST['direction'] ) ) : 'to_live';

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'AJAX sync request: staging_id=%d, direction=%s, sync_db=%s, sync_files=%s',
				$staging_id,
				$direction,
				isset( $_POST['sync_db'] ) ? $_POST['sync_db'] : 'not_set',
				isset( $_POST['sync_files'] ) ? $_POST['sync_files'] : 'not_set'
			)
		);

		if ( ! $staging_id ) {
			wp_send_json_error( array( 'message' => __( 'Missing staging ID.', '5dp-backup-restore' ) ) );
		}

		$options = array(
			'sync_db'           => isset( $_POST['sync_db'] ) ? (bool) $_POST['sync_db'] : true,
			'sync_files'        => isset( $_POST['sync_files'] ) ? (bool) $_POST['sync_files'] : true,
			'selective_tables'  => isset( $_POST['selective_tables'] ) && is_array( $_POST['selective_tables'] )
				? array_map( 'sanitize_text_field', wp_unslash( $_POST['selective_tables'] ) )
				: array(),
			'selective_dirs'    => isset( $_POST['selective_dirs'] ) && is_array( $_POST['selective_dirs'] )
				? array_map( 'sanitize_text_field', wp_unslash( $_POST['selective_dirs'] ) )
				: array(),
		);

		if ( 'to_live' === $direction ) {
			$result = FiveDPBR_Staging_Sync::sync_to_live( $staging_id, $options );
		} else {
			$result = FiveDPBR_Staging_Sync::sync_to_staging( $staging_id, $options );
		}

		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => $result->get_error_message() ) );
		}

		wp_send_json_success( array(
			'message' => __( 'Sync completed.', '5dp-backup-restore' ),
			'report'  => $result,
		) );
	}

	/**
	 * AJAX: Get staging sites list.
	 */
	public function ajax_get_staging_sites() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$sites = self::get_staging_sites();
		$list  = array();

		foreach ( $sites as $site ) {
			$list[] = array(
				'id'           => (int) $site->id,
				'name'         => $site->name,
				'type'         => $site->type,
				'status'       => $site->status,
				'staging_url'  => $site->staging_url,
				'created_at'   => $site->created_at,
				'completed_at' => $site->completed_at,
			);
		}

		wp_send_json_success( array( 'sites' => $list ) );
	}

	/**
	 * AJAX: Pair with a remote site for local-live sync.
	 */
	public function ajax_pair_remote() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$remote_url = isset( $_POST['remote_url'] ) ? esc_url_raw( wp_unslash( $_POST['remote_url'] ) ) : '';
		$remote_key = isset( $_POST['remote_key'] ) ? sanitize_text_field( wp_unslash( $_POST['remote_key'] ) ) : '';

		if ( empty( $remote_url ) || empty( $remote_key ) ) {
			wp_send_json_error( array( 'message' => __( 'Remote URL and API key are required.', '5dp-backup-restore' ) ) );
		}

		// Verify connection to remote site.
		$response = wp_remote_get(
			trailingslashit( $remote_url ) . 'wp-json/fdpbr/v1/staging/ping',
			array(
				'headers' => array(
					'X-FDPBR-Key' => $remote_key,
				),
				'timeout' => 15,
			)
		);

		if ( is_wp_error( $response ) ) {
			wp_send_json_error( array( 'message' => $response->get_error_message() ) );
		}

		$code = wp_remote_retrieve_response_code( $response );

		if ( 200 !== $code ) {
			wp_send_json_error( array(
				'message' => sprintf(
					/* translators: %d: HTTP status code */
					__( 'Remote site returned HTTP %d. Please verify the URL and API key.', '5dp-backup-restore' ),
					$code
				),
			) );
		}

		// Store pairing information.
		$pairings   = get_option( 'fdpbr_remote_pairings', array() );
		$pairing_id = 'pair_' . substr( bin2hex( random_bytes( 4 ) ), 0, 8 );

		$pairings[ $pairing_id ] = array(
			'remote_url' => untrailingslashit( $remote_url ),
			'remote_key' => $remote_key,
			'paired_at'  => current_time( 'mysql', true ),
		);

		update_option( 'fdpbr_remote_pairings', $pairings );

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'Remote site paired: %s', $remote_url )
		);

		wp_send_json_success( array(
			'message'    => __( 'Remote site paired successfully.', '5dp-backup-restore' ),
			'pairing_id' => $pairing_id,
		) );
	}

	/**
	 * AJAX: Remote sync (pull/push/two-way).
	 */
	public function ajax_remote_sync() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$direction  = isset( $_POST['direction'] ) ? sanitize_text_field( wp_unslash( $_POST['direction'] ) ) : '';
		$remote_url = isset( $_POST['remote_url'] ) ? esc_url_raw( wp_unslash( $_POST['remote_url'] ) ) : '';
		$remote_key = isset( $_POST['remote_key'] ) ? sanitize_text_field( wp_unslash( $_POST['remote_key'] ) ) : '';

		if ( ! in_array( $direction, array( 'push', 'pull', 'two_way' ), true ) ) {
			wp_send_json_error( array( 'message' => __( 'Invalid sync direction.', '5dp-backup-restore' ) ) );
		}

		if ( empty( $remote_url ) || empty( $remote_key ) ) {
			wp_send_json_error( array( 'message' => __( 'Remote URL and key are required.', '5dp-backup-restore' ) ) );
		}

		$result = FiveDPBR_Staging_Sync::sync_remote( array(
			'remote_url' => $remote_url,
			'remote_key' => $remote_key,
			'direction'  => $direction,
			'sync_db'    => true,
			'sync_files' => true,
		) );

		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => $result->get_error_message() ) );
		}

		wp_send_json_success( array(
			'message' => __( 'Remote sync completed.', '5dp-backup-restore' ),
			'report'  => $result,
		) );
	}

	/**
	 * AJAX: Get change log entries with pagination and filters.
	 */
	public function ajax_get_change_log() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		global $wpdb;

		$staging_id  = isset( $_POST['staging_id'] ) ? absint( $_POST['staging_id'] ) : 0;
		$source      = isset( $_POST['source'] ) ? sanitize_key( $_POST['source'] ) : '';
		$synced      = isset( $_POST['synced'] ) ? sanitize_key( $_POST['synced'] ) : '';
		$change_type = isset( $_POST['change_type'] ) ? sanitize_key( $_POST['change_type'] ) : '';
		$offset      = isset( $_POST['offset'] ) ? absint( $_POST['offset'] ) : 0;
		$per_page    = 50;

		// Build UNION of live + staging change log tables.
		$live_log     = $wpdb->prefix . 'fdpbr_change_log';
		$union_parts  = array( "SELECT * FROM {$live_log}" );
		$staging_table = $wpdb->prefix . 'fdpbr_staging';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$active_sites = $wpdb->get_results( "SELECT staging_prefix FROM {$staging_table} WHERE status = 'active'" );
		if ( $active_sites ) {
			foreach ( $active_sites as $_stg ) {
				$stg_log = $_stg->staging_prefix . 'fdpbr_change_log';
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $stg_log ) );
				if ( $exists ) {
					$union_parts[] = "SELECT * FROM {$stg_log}";
				}
			}
		}
		$table       = '(' . implode( ' UNION ALL ', $union_parts ) . ') AS combined_log';
		$where_parts = array( '1=1' );
		$values      = array();

		if ( $staging_id ) {
			$where_parts[] = 'staging_id = %d';
			$values[]      = $staging_id;
		}
		if ( '' !== $source && in_array( $source, array( 'live', 'staging' ), true ) ) {
			$where_parts[] = 'source = %s';
			$values[]      = $source;
		}
		if ( '' !== $synced ) {
			$where_parts[] = 'synced = %d';
			$values[]      = ( 'synced' === $synced ) ? 1 : 0;
		}
		if ( '' !== $change_type && in_array( $change_type, array( 'create', 'update', 'delete' ), true ) ) {
			$where_parts[] = 'change_type = %s';
			$values[]      = $change_type;
		}

		$where_sql = implode( ' AND ', $where_parts );

		// Get total count.
		$count_values = $values;
		if ( ! empty( $count_values ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$total = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}", $count_values ) );
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
		}

		// Get paginated results.
		$values[] = $per_page;
		$values[] = $offset;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$results = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE {$where_sql} ORDER BY detected_at DESC LIMIT %d OFFSET %d",
				$values
			)
		);

		$entries = array();
		foreach ( $results as $row ) {
			$data  = json_decode( $row->object_data, true );
			$label = '';
			$icon  = 'admin-generic';

			switch ( $row->object_type ) {
				case 'post':
					$label = isset( $data['post_title'] ) ? $data['post_title'] : 'Post #' . $row->object_id;
					$icon  = 'admin-post';
					break;
				case 'option':
					$label = isset( $data['option_name'] ) ? $data['option_name'] : 'Option';
					$icon  = 'admin-generic';
					break;
				case 'term':
					$label = isset( $data['name'] ) ? $data['name'] : 'Term #' . $row->object_id;
					$icon  = 'tag';
					break;
				case 'nav_menu':
					$label = 'Menu #' . $row->object_id;
					$icon  = 'menu';
					break;
				case 'widget':
					$label = isset( $data['option_name'] ) ? $data['option_name'] : 'Widget';
					$icon  = 'welcome-widgets-menus';
					break;
				default:
					$label = $row->object_type . ' #' . $row->object_id;
			}

			$entries[] = array(
				'id'          => (int) $row->id,
				'source'      => $row->source,
				'change_type' => $row->change_type,
				'object_type' => $row->object_type,
				'label'       => $label,
				'icon'        => $icon,
				'synced'      => (int) $row->synced,
				'detected_at' => $row->detected_at,
				'time_ago'    => human_time_diff( strtotime( $row->detected_at ) ),
			);
		}

		wp_send_json_success( array(
			'entries'  => $entries,
			'total'    => $total,
			'offset'   => $offset,
			'per_page' => $per_page,
			'has_more' => ( $offset + $per_page ) < $total,
		) );
	}
}
