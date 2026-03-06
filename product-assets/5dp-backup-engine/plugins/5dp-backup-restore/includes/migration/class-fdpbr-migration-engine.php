<?php
/**
 * Migration engine orchestrator — PUSH model.
 *
 * Runs on the SOURCE site. Packages local data and pushes it to the
 * destination site's REST API endpoints for restoration.
 *
 * Phases: connect → package → transfer → remote_restore → cleanup
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/migration
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Migration_Engine
 *
 * @since 1.0.0
 */
class FiveDPBR_Migration_Engine extends FiveDPBR_Background_Processor {

	/**
	 * Constructor.
	 */
	public function __construct() {
		parent::__construct( 'fdpbr_migration' );
	}

	/**
	 * Get logging context.
	 *
	 * @return string
	 */
	protected function get_context() {
		return 'migration';
	}

	/**
	 * Start a new migration.
	 *
	 * @param array $args Migration arguments.
	 * @return string|WP_Error Job ID or error.
	 */
	public function start( $args = array() ) {
		$defaults = array(
			'source_url'      => '',
			'dest_url'        => '',
			'migration_key'   => '',
			'include_db'      => true,
			'include_plugins' => true,
			'include_themes'  => true,
			'include_uploads' => true,
		);

		$args = wp_parse_args( $args, $defaults );

		if ( empty( $args['dest_url'] ) ) {
			return new WP_Error( 'missing_dest', __( 'Destination URL is required.', '5dp-backup-restore' ) );
		}

		if ( empty( $args['migration_key'] ) ) {
			return new WP_Error( 'missing_key', __( 'Migration key is required.', '5dp-backup-restore' ) );
		}

		// Build job data.
		$job_data = array(
			'source_url'      => untrailingslashit( $args['source_url'] ),
			'dest_url'        => untrailingslashit( $args['dest_url'] ),
			'migration_key'   => $args['migration_key'],
			'include_db'      => (bool) $args['include_db'],
			'include_plugins' => (bool) $args['include_plugins'],
			'include_themes'  => (bool) $args['include_themes'],
			'include_uploads' => (bool) $args['include_uploads'],
			'phase'           => 'connect',
			'backup_id'       => '',
			'file_list'       => array(),
			'transfer_index'  => 0,
			'remote_info'     => array(),
		);

		// Preserve auth data if provided.
		if ( ! empty( $args['_auth_preserve'] ) ) {
			$job_data['_auth_preserve'] = $args['_auth_preserve'];
		}

		if ( ! empty( $args['_migration_token_file'] ) ) {
			$job_data['_migration_token_file'] = $args['_migration_token_file'];
		}

		// Create job.
		$job_id = FiveDPBR_Job_Manager::create_job( array(
			'type' => 'migration',
			'data' => $job_data,
		) );

		if ( ! $job_id ) {
			return new WP_Error( 'job_create', __( 'Cannot create migration job.', '5dp-backup-restore' ) );
		}

		FiveDPBR_Logger::info(
			'migration',
			sprintf( 'Migration started: pushing from %s to %s.', $args['source_url'], $args['dest_url'] )
		);

		// Dispatch for background processing.
		$this->dispatch( $job_id, $job_data );

		return $job_id;
	}

	/**
	 * Process a single chunk of migration work.
	 *
	 * @param array $data Current job state.
	 * @return true|array|WP_Error
	 */
	protected function process_chunk( $data ) {
		$phase = isset( $data['phase'] ) ? $data['phase'] : '';

		switch ( $phase ) {
			case 'connect':
				return $this->phase_connect( $data );

			case 'package':
				return $this->phase_package( $data );

			case 'transfer':
				return $this->phase_transfer( $data );

			case 'remote_restore':
				return $this->phase_remote_restore( $data );

			case 'cleanup':
				return $this->phase_cleanup( $data );

			default:
				return new WP_Error(
					'unknown_phase',
					sprintf(
						/* translators: %s: Phase name */
						__( 'Unknown migration phase: %s', '5dp-backup-restore' ),
						$phase
					)
				);
		}
	}

	/**
	 * Phase: Connect to destination site and verify migration key.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error Updated data or error.
	 */
	private function phase_connect( $data ) {
		$this->update_progress( 5, __( 'Connecting to destination site...', '5dp-backup-restore' ) );

		$dest_url = $data['dest_url'];
		$endpoint = trailingslashit( $dest_url ) . 'wp-json/fdpbr/v1/migration/verify';

		$response = wp_remote_post(
			$endpoint,
			array(
				'timeout'   => 30,
				'sslverify' => false,
				'headers'   => array(
					'X-FDPBR-Migration-Key' => $data['migration_key'],
					'Content-Type'          => 'application/json',
				),
				'body'      => wp_json_encode( array(
					'source_url' => $data['source_url'],
				) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			FiveDPBR_Logger::error(
				'migration',
				'Failed to connect to destination site: ' . $response->get_error_message()
			);
			return new WP_Error(
				'connect_failed',
				sprintf(
					/* translators: %s: Error message */
					__( 'Cannot connect to destination site: %s', '5dp-backup-restore' ),
					$response->get_error_message()
				)
			);
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $code || empty( $body['success'] ) ) {
			$message = isset( $body['message'] ) ? $body['message'] : __( 'Unknown error.', '5dp-backup-restore' );
			FiveDPBR_Logger::error( 'migration', 'Destination verification failed: ' . $message );
			return new WP_Error( 'verify_failed', $message );
		}

		// Store destination site info.
		$data['remote_info'] = isset( $body['data'] ) ? $body['data'] : array();

		FiveDPBR_Logger::info(
			'migration',
			sprintf(
				'Connected to destination site (WP %s, plugin %s).',
				isset( $data['remote_info']['wp_version'] ) ? $data['remote_info']['wp_version'] : 'unknown',
				isset( $data['remote_info']['plugin_version'] ) ? $data['remote_info']['plugin_version'] : 'unknown'
			)
		);

		$data['phase'] = 'package';
		return $data;
	}

	/**
	 * Phase: Create migration package locally on the source site.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error Updated data or error.
	 */
	private function phase_package( $data ) {
		$this->update_progress( 10, __( 'Creating migration package...', '5dp-backup-restore' ) );

		$package = FiveDPBR_Migration_Package::create( array(
			'include_db'      => $data['include_db'],
			'include_plugins' => $data['include_plugins'],
			'include_themes'  => $data['include_themes'],
			'include_uploads' => $data['include_uploads'],
		) );

		if ( is_wp_error( $package ) ) {
			FiveDPBR_Logger::error( 'migration', 'Package creation failed: ' . $package->get_error_message() );
			return new WP_Error( 'package_failed', $package->get_error_message() );
		}

		$data['backup_id']      = $package['backup_id'];
		$data['file_list']      = $package['file_paths'];
		$data['transfer_index'] = 0;

		FiveDPBR_Logger::info(
			'migration',
			sprintf( 'Migration package created: %s (%d files).', $data['backup_id'], count( $data['file_list'] ) )
		);

		$data['phase'] = 'transfer';
		return $data;
	}

	/**
	 * Maximum chunk size for file upload (10 MB).
	 *
	 * @var int
	 */
	const UPLOAD_CHUNK_SIZE = 10485760;

	/**
	 * Phase: Upload package files to the destination site.
	 *
	 * Large files are split into chunks to avoid PHP memory limits.
	 * Each call uploads one chunk; the job loops back until done.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error Updated data or error.
	 */
	private function phase_transfer( $data ) {
		$total = count( $data['file_list'] );
		$index = (int) $data['transfer_index'];

		if ( $index >= $total ) {
			$data['phase'] = 'remote_restore';
			return $data;
		}

		$file_path = $data['file_list'][ $index ];

		if ( ! file_exists( $file_path ) ) {
			FiveDPBR_Logger::error( 'migration', sprintf( 'File not found: %s', $file_path ) );
			return new WP_Error( 'file_missing', sprintf( __( 'Package file not found: %s', '5dp-backup-restore' ), basename( $file_path ) ) );
		}

		$file_size   = filesize( $file_path );
		$chunk_size  = self::UPLOAD_CHUNK_SIZE;
		$total_parts = max( 1, (int) ceil( $file_size / $chunk_size ) );
		$part_index  = isset( $data['chunk_part'] ) ? (int) $data['chunk_part'] : 0;
		$byte_offset = $part_index * $chunk_size;

		// Calculate overall progress (25–60%).
		$file_progress = ( $index + ( $part_index / max( $total_parts, 1 ) ) ) / max( $total, 1 );
		$this->update_progress(
			25 + (int) ( $file_progress * 35 ),
			sprintf(
				/* translators: 1: Current file, 2: Total files, 3: Human-readable size */
				__( 'Uploading file %1$d of %2$d (%3$s)...', '5dp-backup-restore' ),
				$index + 1,
				$total,
				size_format( $file_size )
			)
		);

		// Read only this chunk from the file.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$fh = fopen( $file_path, 'rb' );
		if ( ! $fh ) {
			return new WP_Error( 'file_read', sprintf( __( 'Cannot read file: %s', '5dp-backup-restore' ), basename( $file_path ) ) );
		}

		if ( $byte_offset > 0 ) {
			fseek( $fh, $byte_offset );
		}

		$chunk_data = fread( $fh, $chunk_size );
		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

		if ( false === $chunk_data || '' === $chunk_data ) {
			return new WP_Error( 'file_read', sprintf( __( 'Cannot read chunk from: %s', '5dp-backup-restore' ), basename( $file_path ) ) );
		}

		$dest_url = $data['dest_url'];
		$endpoint = trailingslashit( $dest_url ) . 'wp-json/fdpbr/v1/migration/receive';

		$response = wp_remote_post(
			$endpoint,
			array(
				'timeout'   => 300,
				'sslverify' => false,
				'headers'   => array(
					'X-FDPBR-Migration-Key' => $data['migration_key'],
					'Content-Type'          => 'application/octet-stream',
					'X-FDPBR-Filename'      => basename( $file_path ),
					'X-FDPBR-Chunk-Index'   => (string) $index,
					'X-FDPBR-Total-Chunks'  => (string) $total,
					'X-FDPBR-Part-Index'    => (string) $part_index,
					'X-FDPBR-Total-Parts'   => (string) $total_parts,
				),
				'body'      => $chunk_data,
			)
		);

		// Free memory.
		unset( $chunk_data );

		if ( is_wp_error( $response ) ) {
			FiveDPBR_Logger::error(
				'migration',
				sprintf( 'Failed to upload file %d part %d: %s', $index + 1, $part_index + 1, $response->get_error_message() )
			);
			return new WP_Error( 'upload_failed', $response->get_error_message() );
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $code || empty( $body['success'] ) ) {
			$message = isset( $body['message'] ) ? $body['message'] : __( 'Upload failed.', '5dp-backup-restore' );
			return new WP_Error( 'upload_error', $message );
		}

		$next_part = $part_index + 1;

		if ( $next_part >= $total_parts ) {
			// This file is fully uploaded — move to next file.
			FiveDPBR_Logger::info(
				'migration',
				sprintf( 'Uploaded file %d/%d: %s (%s)', $index + 1, $total, basename( $file_path ), size_format( $file_size ) )
			);

			$data['transfer_index'] = $index + 1;
			$data['chunk_part']     = 0;

			if ( $data['transfer_index'] >= $total ) {
				$data['phase'] = 'remote_restore';
			}
		} else {
			// More parts to upload for this file.
			$data['chunk_part'] = $next_part;

			FiveDPBR_Logger::debug(
				'migration',
				sprintf( 'Uploaded part %d/%d of file %s', $next_part, $total_parts, basename( $file_path ) )
			);
		}

		return $data;
	}

	/**
	 * Phase: Tell destination to restore the uploaded files.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error Updated data or error.
	 */
	private function phase_remote_restore( $data ) {
		$this->update_progress( 65, __( 'Restoring on destination site...', '5dp-backup-restore' ) );

		$dest_url = $data['dest_url'];
		$endpoint = trailingslashit( $dest_url ) . 'wp-json/fdpbr/v1/migration/finalize';

		// Use a short timeout (30s). The destination runs ignore_user_abort(true)
		// so it continues even if this connection drops. This prevents the source
		// from holding a PHP worker for minutes (which breaks the source site on
		// shared hosting with limited PHP-FPM workers).
		$response = wp_remote_post(
			$endpoint,
			array(
				'timeout'   => 30,
				'sslverify' => false,
				'headers'   => array(
					'X-FDPBR-Migration-Key' => $data['migration_key'],
					'Content-Type'          => 'application/json',
				),
				'body'      => wp_json_encode( array(
					'source_url'  => $data['source_url'],
					'source_path' => ABSPATH,
					'dest_url'    => $data['dest_url'],
					'include_db'  => $data['include_db'],
				) ),
			)
		);

		// A timeout is EXPECTED — the destination may take minutes to finalize.
		// The destination continues via ignore_user_abort(true). We treat timeouts
		// as success and let the cleanup phase verify completion.
		if ( is_wp_error( $response ) ) {
			$error_msg = $response->get_error_message();

			// Timeouts are expected — the destination will continue in the background.
			if ( strpos( $error_msg, 'timed out' ) !== false || strpos( $error_msg, 'timeout' ) !== false ) {
				FiveDPBR_Logger::info(
					'migration',
					'Finalize request timed out (expected) — destination continues in background.'
				);
				$data['phase'] = 'cleanup';
				return $data;
			}

			FiveDPBR_Logger::error(
				'migration',
				'Remote restore failed: ' . $error_msg
			);
			return new WP_Error( 'remote_restore_failed', $error_msg );
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $code || empty( $body['success'] ) ) {
			$message = isset( $body['message'] ) ? $body['message'] : __( 'Remote restore failed.', '5dp-backup-restore' );
			FiveDPBR_Logger::error( 'migration', 'Destination restore error: ' . $message );
			return new WP_Error( 'restore_error', $message );
		}

		FiveDPBR_Logger::info( 'migration', 'Destination site restore completed successfully.' );

		$data['phase'] = 'cleanup';
		return $data;
	}

	/**
	 * Phase: Clean up local package and tell destination to clean up temp files.
	 *
	 * @param array $data Job data.
	 * @return true
	 */
	private function phase_cleanup( $data ) {
		$this->update_progress( 95, __( 'Finalizing migration...', '5dp-backup-restore' ) );

		// Clean up local migration package.
		if ( ! empty( $data['backup_id'] ) ) {
			FiveDPBR_Migration_Package::cleanup( $data['backup_id'] );
			FiveDPBR_Logger::info( 'migration', 'Local migration package cleaned up.' );
		}

		// Tell destination to clean up temp files.
		if ( ! empty( $data['dest_url'] ) ) {
			$endpoint = trailingslashit( $data['dest_url'] ) . 'wp-json/fdpbr/v1/migration/cleanup';

			wp_remote_post(
				$endpoint,
				array(
					'timeout'   => 30,
					'sslverify' => false,
					'headers'   => array(
						'X-FDPBR-Migration-Key' => $data['migration_key'],
						'Content-Type'          => 'application/json',
					),
					'body'      => wp_json_encode( array(
						'action' => 'cleanup',
					) ),
				)
			);
		}

		// Keep the migration token file alive for the final poll response.
		if ( ! empty( $data['_migration_token_file'] ) ) {
			wp_schedule_single_event(
				time() + 300,
				'fdpbr_cleanup_migration_token',
				array( $data['_migration_token_file'] )
			);
		}

		FiveDPBR_Logger::info( 'migration', 'Migration completed successfully.' );

		return true;
	}

	/**
	 * Delete the migration token file (called via scheduled event).
	 *
	 * @param string $file Path to the token file.
	 */
	public function cleanup_migration_token( $file ) {
		if ( ! empty( $file ) && file_exists( $file ) ) {
			@unlink( $file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}
	}

	// =========================================================================
	// AJAX Handlers
	// =========================================================================

	/**
	 * Register AJAX handlers.
	 *
	 * @since 1.0.0
	 */
	public function register_ajax() {
		add_action( 'wp_ajax_fdpbr_start_migration', array( $this, 'ajax_start_migration' ) );
		add_action( 'wp_ajax_fdpbr_test_migration_connection', array( $this, 'ajax_test_migration_connection' ) );
		add_action( 'wp_ajax_fdpbr_migration_log', array( $this, 'ajax_migration_log' ) );

		// Token-based progress polling (survives session loss after DB import).
		add_action( 'wp_ajax_fdpbr_migration_progress_token', array( $this, 'ajax_migration_progress_token' ) );
		add_action( 'wp_ajax_nopriv_fdpbr_migration_progress_token', array( $this, 'ajax_migration_progress_token' ) );

		// Deferred cleanup of the migration token file.
		add_action( 'fdpbr_cleanup_migration_token', array( $this, 'cleanup_migration_token' ) );
	}

	/**
	 * AJAX: Start a migration (PUSH from this site to destination).
	 *
	 * @since 1.0.0
	 */
	public function ajax_start_migration() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		// Clear previous migration logs so the activity log starts fresh.
		global $wpdb;
		$log_table = $wpdb->prefix . 'fdpbr_logs';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query( "DELETE FROM {$log_table} WHERE context = 'migration'" );

		$source_url      = isset( $_POST['source_url'] ) ? esc_url_raw( wp_unslash( $_POST['source_url'] ) ) : '';
		$dest_url        = isset( $_POST['dest_url'] ) ? esc_url_raw( wp_unslash( $_POST['dest_url'] ) ) : '';
		$migration_key   = isset( $_POST['migration_key'] ) ? sanitize_text_field( wp_unslash( $_POST['migration_key'] ) ) : '';
		$include_db      = isset( $_POST['include_db'] ) ? (bool) $_POST['include_db'] : true;
		$include_plugins = isset( $_POST['include_plugins'] ) ? (bool) $_POST['include_plugins'] : true;
		$include_themes  = isset( $_POST['include_themes'] ) ? (bool) $_POST['include_themes'] : true;
		$include_uploads = isset( $_POST['include_uploads'] ) ? (bool) $_POST['include_uploads'] : true;

		$args = array(
			'source_url'      => $source_url,
			'dest_url'        => $dest_url,
			'migration_key'   => $migration_key,
			'include_db'      => $include_db,
			'include_plugins' => $include_plugins,
			'include_themes'  => $include_themes,
			'include_uploads' => $include_uploads,
		);

		// Generate a secret token for nonce-free progress polling.
		$migration_token = wp_generate_password( 32, false );
		$token_dir       = FiveDPBR_Environment::get_backup_dir();
		$token_file      = $token_dir . '/migration-token.php';
		$php_guard       = '<' . '?php exit; ?' . '>';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $token_file, $php_guard . $migration_token );
		$args['_migration_token_file'] = $token_file;

		$result = $this->start( $args );

		if ( is_wp_error( $result ) ) {
			@unlink( $token_file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			wp_send_json_error( array( 'message' => $result->get_error_message() ) );
		}

		wp_send_json_success( array(
			'message'         => __( 'Migration started.', '5dp-backup-restore' ),
			'job_id'          => $result,
			'migration_token' => $migration_token,
		) );
	}

	/**
	 * AJAX: Test connection to the destination site.
	 *
	 * @since 1.0.0
	 */
	public function ajax_test_migration_connection() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$dest_url      = isset( $_POST['dest_url'] ) ? esc_url_raw( wp_unslash( $_POST['dest_url'] ) ) : '';
		$migration_key = isset( $_POST['migration_key'] ) ? sanitize_text_field( wp_unslash( $_POST['migration_key'] ) ) : '';

		if ( empty( $dest_url ) || empty( $migration_key ) ) {
			wp_send_json_error( array( 'message' => __( 'Destination URL and migration key are required.', '5dp-backup-restore' ) ) );
		}

		$endpoint = trailingslashit( $dest_url ) . 'wp-json/fdpbr/v1/migration/verify';

		$response = wp_remote_post(
			$endpoint,
			array(
				'timeout'   => 30,
				'sslverify' => false,
				'headers'   => array(
					'X-FDPBR-Migration-Key' => $migration_key,
					'Content-Type'          => 'application/json',
				),
				'body'      => wp_json_encode( array(
					'source_url' => home_url(),
				) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			wp_send_json_error( array(
				'message' => sprintf(
					/* translators: %s: Error message */
					__( 'Connection failed: %s', '5dp-backup-restore' ),
					$response->get_error_message()
				),
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $code || empty( $body['success'] ) ) {
			$message = isset( $body['message'] ) ? $body['message'] : __( 'Verification failed.', '5dp-backup-restore' );
			wp_send_json_error( array( 'message' => $message ) );
		}

		wp_send_json_success( array(
			'message' => __( 'Connection successful.', '5dp-backup-restore' ),
			'data'    => isset( $body['data'] ) ? $body['data'] : array(),
		) );
	}

	/**
	 * AJAX: Token-based migration progress (works without auth).
	 */
	public function ajax_migration_progress_token() {
		$token  = isset( $_POST['migration_token'] ) ? sanitize_text_field( wp_unslash( $_POST['migration_token'] ) ) : '';
		$job_id = isset( $_POST['job_id'] ) ? sanitize_text_field( wp_unslash( $_POST['job_id'] ) ) : '';

		if ( empty( $token ) || empty( $job_id ) ) {
			wp_send_json_error( array( 'message' => 'Missing token or job ID.' ) );
		}

		$token_file = FiveDPBR_Environment::get_backup_dir() . '/migration-token.php';

		if ( ! file_exists( $token_file ) ) {
			wp_send_json_error( array( 'message' => 'No active migration.' ) );
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$stored       = file_get_contents( $token_file );
		$stored_token = substr( $stored, 14 ); // Strip PHP die() guard.

		if ( ! hash_equals( $stored_token, $token ) ) {
			wp_send_json_error( array( 'message' => 'Invalid token.' ) );
		}

		$job = FiveDPBR_Job_Manager::get_job( $job_id );

		if ( ! $job ) {
			wp_send_json_error( array( 'message' => 'Job not found.' ) );
		}

		wp_send_json_success( array(
			'job_id'  => $job->job_id,
			'type'    => $job->type,
			'status'  => $job->status,
			'percent' => (int) $job->progress_percent,
			'step'    => $job->current_step,
		) );
	}

	/**
	 * AJAX: Return recent migration log entries.
	 */
	public function ajax_migration_log() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$entries = FiveDPBR_Logger::get_logs( array(
			'context'  => 'migration',
			'per_page' => 50,
			'order'    => 'ASC',
		) );

		$formatted = array();
		foreach ( $entries as $entry ) {
			$formatted[] = array(
				'id'      => $entry->id,
				'level'   => $entry->level,
				'message' => $entry->message,
				'time'    => $entry->created_at,
			);
		}

		wp_send_json_success( array( 'entries' => $formatted ) );
	}
}
