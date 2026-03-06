<?php
/**
 * Migration REST API handler — destination-side (PUSH model).
 *
 * Registers REST API endpoints on the DESTINATION site to receive
 * data pushed from a source site during migration.
 *
 * Endpoints: verify, receive (file upload), finalize (restore), cleanup.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/migration
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Migration_API
 *
 * @since 1.0.0
 */
class FiveDPBR_Migration_API {

	/**
	 * REST namespace.
	 *
	 * @var string
	 */
	const REST_NAMESPACE = 'fdpbr/v1';

	/**
	 * Initialize the migration API.
	 *
	 * @since 1.0.0
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		add_action( 'wp_ajax_fdpbr_incoming_migration_status', array( __CLASS__, 'ajax_incoming_status' ) );
		add_action( 'wp_ajax_fdpbr_abort_incoming_migration', array( __CLASS__, 'ajax_abort_incoming' ) );
		add_action( 'wp_ajax_fdpbr_regenerate_migration_key', array( __CLASS__, 'ajax_regenerate_key' ) );

		// Token-based nopriv endpoint — survives session loss after DB import.
		add_action( 'wp_ajax_fdpbr_incoming_migration_status_token', array( __CLASS__, 'ajax_incoming_status_token' ) );
		add_action( 'wp_ajax_nopriv_fdpbr_incoming_migration_status_token', array( __CLASS__, 'ajax_incoming_status_token' ) );
	}

	/**
	 * Register REST API routes for receiving migration data.
	 *
	 * @since 1.0.0
	 */
	public static function register_routes() {
		// POST /fdpbr/v1/migration/verify — Verify migration key.
		register_rest_route(
			self::REST_NAMESPACE,
			'/migration/verify',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'endpoint_verify' ),
				'permission_callback' => array( __CLASS__, 'validate_migration_key' ),
			)
		);

		// POST /fdpbr/v1/migration/receive — Receive an uploaded file chunk.
		register_rest_route(
			self::REST_NAMESPACE,
			'/migration/receive',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'endpoint_receive' ),
				'permission_callback' => array( __CLASS__, 'validate_migration_key' ),
			)
		);

		// POST /fdpbr/v1/migration/finalize — Restore uploaded files + DB + search-replace.
		register_rest_route(
			self::REST_NAMESPACE,
			'/migration/finalize',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'endpoint_finalize' ),
				'permission_callback' => array( __CLASS__, 'validate_migration_key' ),
			)
		);

		// POST /fdpbr/v1/migration/cleanup — Clean up temp migration files.
		register_rest_route(
			self::REST_NAMESPACE,
			'/migration/cleanup',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'endpoint_cleanup' ),
				'permission_callback' => array( __CLASS__, 'validate_migration_key' ),
			)
		);
	}

	/**
	 * Validate the migration key from the request header.
	 *
	 * @since 1.0.0
	 *
	 * @param WP_REST_Request $request The request object.
	 * @return bool|WP_Error True if valid, WP_Error otherwise.
	 */
	public static function validate_migration_key( $request ) {
		$provided_key = $request->get_header( 'X-FDPBR-Migration-Key' );

		if ( empty( $provided_key ) ) {
			return new WP_Error(
				'missing_key',
				__( 'Migration key is required.', '5dp-backup-restore' ),
				array( 'status' => 401 )
			);
		}

		$stored_key = self::get_migration_key();

		if ( empty( $stored_key ) ) {
			return new WP_Error(
				'no_key_configured',
				__( 'No migration key configured on this site.', '5dp-backup-restore' ),
				array( 'status' => 403 )
			);
		}

		if ( ! hash_equals( $stored_key, $provided_key ) ) {
			FiveDPBR_Logger::warning( 'migration', 'Invalid migration key received.' );
			return new WP_Error(
				'invalid_key',
				__( 'Invalid migration key.', '5dp-backup-restore' ),
				array( 'status' => 403 )
			);
		}

		return true;
	}

	/**
	 * Endpoint: Verify migration key and return destination site info.
	 *
	 * @since 1.0.0
	 *
	 * @param WP_REST_Request $request The request object.
	 * @return WP_REST_Response
	 */
	public static function endpoint_verify( $request ) {
		FiveDPBR_Logger::info( 'migration', 'Migration verification request received.' );

		$params     = $request->get_json_params();
		$source_url = isset( $params['source_url'] ) ? esc_url_raw( $params['source_url'] ) : 'unknown';

		self::update_incoming_status( 'verifying', __( 'Source site connected', '5dp-backup-restore' ), $source_url );

		// Generate polling token for the destination admin to poll status
		// even after DB import kills their session.
		$polling_token = self::create_polling_token();

		global $wp_version;

		$data = array(
			'wp_version'       => $wp_version,
			'site_url'         => home_url(),
			'plugin_version'   => defined( 'FDPBR_VERSION' ) ? FDPBR_VERSION : '1.0.0',
			'abspath'          => ABSPATH,
			'php_version'      => PHP_VERSION,
			'migration_token'  => $polling_token,
		);

		return new WP_REST_Response(
			array(
				'success' => true,
				'message' => __( 'Connection verified.', '5dp-backup-restore' ),
				'data'    => $data,
			),
			200
		);
	}

	/**
	 * Endpoint: Receive an uploaded file chunk from the source site.
	 *
	 * The file content is in the request body (application/octet-stream).
	 * Metadata is in custom headers: X-FDPBR-Filename, X-FDPBR-Chunk-Index, X-FDPBR-Total-Chunks.
	 *
	 * @since 1.0.39
	 *
	 * @param WP_REST_Request $request The request object.
	 * @return WP_REST_Response
	 */
	public static function endpoint_receive( $request ) {
		$filename    = $request->get_header( 'X-FDPBR-Filename' );
		$chunk_index = (int) $request->get_header( 'X-FDPBR-Chunk-Index' );
		$total       = (int) $request->get_header( 'X-FDPBR-Total-Chunks' );
		$part_index  = (int) $request->get_header( 'X-FDPBR-Part-Index' );
		$total_parts = (int) $request->get_header( 'X-FDPBR-Total-Parts' );

		if ( empty( $filename ) ) {
			return new WP_REST_Response(
				array( 'success' => false, 'message' => __( 'Missing filename header.', '5dp-backup-restore' ) ),
				400
			);
		}

		// Sanitize filename to prevent directory traversal.
		$filename = sanitize_file_name( $filename );

		$temp_dir = FiveDPBR_Environment::get_backup_dir() . '/migration_temp';
		FiveDPBR_Helper::ensure_directory( $temp_dir );

		$dest_path = $temp_dir . '/' . $filename;

		// Get the raw body.
		$body = $request->get_body();

		if ( empty( $body ) ) {
			return new WP_REST_Response(
				array( 'success' => false, 'message' => __( 'Empty file body.', '5dp-backup-restore' ) ),
				400
			);
		}

		// Multi-part upload: first part writes, subsequent parts append.
		if ( $total_parts > 1 && $part_index > 0 ) {
			// Append to existing file.
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			$written = file_put_contents( $dest_path, $body, FILE_APPEND );
		} else {
			// First part (or single-part): write fresh.
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			$written = file_put_contents( $dest_path, $body );
		}

		if ( false === $written ) {
			FiveDPBR_Logger::error( 'migration', sprintf( 'Failed to write received file: %s', $filename ) );
			return new WP_REST_Response(
				array( 'success' => false, 'message' => __( 'Failed to save file.', '5dp-backup-restore' ) ),
				500
			);
		}

		// Log progress — only log file completion or single-part files to reduce noise.
		$is_file_complete = ( $total_parts <= 1 ) || ( $part_index + 1 >= $total_parts );

		if ( $is_file_complete ) {
			$final_size = file_exists( $dest_path ) ? filesize( $dest_path ) : $written;
			FiveDPBR_Logger::info(
				'migration',
				sprintf( 'Received file %d/%d: %s (%s)', $chunk_index + 1, $total, $filename, size_format( $final_size ) )
			);
		} else {
			FiveDPBR_Logger::debug(
				'migration',
				sprintf( 'Received part %d/%d of %s (%s)', $part_index + 1, $total_parts, $filename, size_format( $written ) )
			);
		}

		// Update incoming status.
		$status_msg = ( $total_parts > 1 && ! $is_file_complete )
			? sprintf(
				/* translators: 1: part number, 2: total parts, 3: filename */
				__( 'Receiving part %1$d/%2$d of %3$s...', '5dp-backup-restore' ),
				$part_index + 1,
				$total_parts,
				$filename
			)
			: sprintf(
				/* translators: 1: current file, 2: total files */
				__( 'Receiving file %1$d of %2$d...', '5dp-backup-restore' ),
				$chunk_index + 1,
				$total
			);

		self::update_incoming_status(
			'receiving',
			$status_msg,
			null,
			array( 'total_files' => $total, 'transferred' => $chunk_index + ( $is_file_complete ? 1 : 0 ) )
		);

		return new WP_REST_Response(
			array(
				'success' => true,
				'message' => sprintf( __( 'File %s received.', '5dp-backup-restore' ), $filename ),
			),
			200
		);
	}

	/**
	 * Endpoint: Finalize migration — extract files, import DB, run search-replace.
	 *
	 * Handles both .fdpbr (full backup) and .zip (chunked backup) formats.
	 * Called by the source site after all files have been uploaded.
	 *
	 * @since 1.0.39
	 *
	 * @param WP_REST_Request $request The request object.
	 * @return WP_REST_Response
	 */
	public static function endpoint_finalize( $request ) {
		// Allow long execution and continue even if HTTP connection is closed.
		set_time_limit( 0 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		ignore_user_abort( true );

		FiveDPBR_Logger::info( 'migration', 'Finalize request received — starting restore.' );

		self::update_incoming_status( 'restoring', __( 'Restoring files and database...', '5dp-backup-restore' ) );

		$params      = $request->get_json_params();
		$source_url  = isset( $params['source_url'] ) ? $params['source_url'] : '';
		$source_path = isset( $params['source_path'] ) ? $params['source_path'] : '';
		$include_db  = isset( $params['include_db'] ) ? (bool) $params['include_db'] : true;

		// Capture destination URL BEFORE DB import — after import, home_url()
		// will return the SOURCE site's URL because wp_options was overwritten.
		$dest_url  = isset( $params['dest_url'] ) ? $params['dest_url'] : home_url();
		$dest_path = ABSPATH;

		$temp_dir = FiveDPBR_Environment::get_backup_dir() . '/migration_temp';

		if ( ! is_dir( $temp_dir ) ) {
			return new WP_REST_Response(
				array( 'success' => false, 'message' => __( 'No migration files found.', '5dp-backup-restore' ) ),
				400
			);
		}

		// Categorize uploaded files.
		$fdpbr_files = glob( $temp_dir . '/*.fdpbr' );
		$zip_files   = glob( $temp_dir . '/*.zip' );
		$sql_files   = glob( $temp_dir . '/*.sql' );

		$fdpbr_files = is_array( $fdpbr_files ) ? $fdpbr_files : array();
		$zip_files   = is_array( $zip_files ) ? $zip_files : array();
		$sql_files   = is_array( $sql_files ) ? $sql_files : array();
		$sql_file    = ! empty( $sql_files ) ? $sql_files[0] : '';

		FiveDPBR_Logger::info( 'migration', sprintf(
			'Found files: %d .fdpbr, %d .zip, %d .sql',
			count( $fdpbr_files ), count( $zip_files ), count( $sql_files )
		) );

		// ── Handle .fdpbr full backup ──────────────────────────
		if ( ! empty( $fdpbr_files ) ) {
			$extract_dir = $temp_dir . '/extracted';
			FiveDPBR_Helper::ensure_directory( $extract_dir );

			self::update_incoming_status( 'restoring', __( 'Unpacking .fdpbr archive...', '5dp-backup-restore' ) );

			$manifest = FiveDPBR_Packager::extract( $fdpbr_files[0], $extract_dir );

			if ( is_wp_error( $manifest ) ) {
				FiveDPBR_Logger::error( 'migration', '.fdpbr extraction failed: ' . $manifest->get_error_message() );
				self::update_incoming_status( 'failed', $manifest->get_error_message() );
				return new WP_REST_Response(
					array( 'success' => false, 'message' => $manifest->get_error_message() ),
					500
				);
			}

			FiveDPBR_Logger::info( 'migration', '.fdpbr archive extracted.' );

			// Copy extracted files to ABSPATH (skipping protected files).
			self::update_incoming_status( 'restoring', __( 'Copying files to site root...', '5dp-backup-restore' ) );

			$copy_result = self::copy_extracted_files( $extract_dir, ABSPATH );

			FiveDPBR_Logger::info( 'migration', sprintf(
				'Files copied: %d succeeded, %d failed.',
				$copy_result['ok'], $copy_result['fail']
			) );

			// Look for database.sql in the extracted directory.
			if ( empty( $sql_file ) && file_exists( $extract_dir . '/database.sql' ) ) {
				$sql_file = $extract_dir . '/database.sql';
			}

		// ── Handle .zip chunked backup ─────────────────────────
		} elseif ( ! empty( $zip_files ) ) {
			self::update_incoming_status( 'restoring', __( 'Extracting archive files...', '5dp-backup-restore' ) );

			FiveDPBR_Logger::info( 'migration', sprintf( 'Extracting %d ZIP chunks...', count( $zip_files ) ) );

			$extract_state = FiveDPBR_File_Extractor::init_extract_state( $zip_files, ABSPATH );
			$result        = FiveDPBR_File_Extractor::extract_chunk( $extract_state );

			while ( true !== $result && ! is_wp_error( $result ) ) {
				$extract_state = is_array( $result ) ? $result : $extract_state;
				$result        = FiveDPBR_File_Extractor::extract_chunk( $extract_state );
			}

			if ( is_wp_error( $result ) ) {
				FiveDPBR_Logger::error( 'migration', 'ZIP extraction failed: ' . $result->get_error_message() );
				self::update_incoming_status( 'failed', $result->get_error_message() );
				return new WP_REST_Response(
					array( 'success' => false, 'message' => $result->get_error_message() ),
					500
				);
			}

			FiveDPBR_Logger::info( 'migration', 'ZIP extraction completed.' );
		}

		// ── Install mu-plugin URL fixer BEFORE DB import ──────
		// After DB import, siteurl/home will point to the source URL. If the
		// finalize process dies (server timeout, PHP crash), the site becomes
		// inaccessible. This mu-plugin auto-fixes URLs on the next page load.
		if ( $include_db && ! empty( $dest_url ) ) {
			self::install_url_fixer_mu_plugin( $dest_url, $source_url, $source_path, $dest_path );
		}

		// ── Import database ────────────────────────────────────
		if ( $include_db && ! empty( $sql_file ) && file_exists( $sql_file ) ) {
			self::update_incoming_status( 'restoring', __( 'Importing database...', '5dp-backup-restore' ) );

			global $wpdb;

			// ── CRITICAL: Pre-fix siteurl/home in SQL BEFORE import ──────
			// This ensures the DB never contains the source URL at any point.
			// The SQL dump has INSERT statements for wp_options with siteurl/home.
			// We rewrite them directly so imported values are already correct.
			if ( ! empty( $source_url ) && ! empty( $dest_url ) ) {
				self::prefix_sql_urls( $sql_file, $source_url, $dest_url );
			}

			// Detect source table prefix from the SQL dump.
			$source_prefix = self::detect_sql_prefix( $sql_file );
			$dest_prefix   = $wpdb->prefix;

			// Set up prefix remapping if they differ.
			$new_prefix = '';
			$old_prefix = '';

			if ( ! empty( $source_prefix ) && $source_prefix !== $dest_prefix ) {
				$new_prefix = $dest_prefix;
				$old_prefix = $source_prefix;

				FiveDPBR_Logger::info( 'migration', sprintf(
					'Table prefix remap: %s → %s',
					$source_prefix, $dest_prefix
				) );
			} else {
				FiveDPBR_Logger::info( 'migration', sprintf(
					'Table prefix: %s (no remap needed).',
					$dest_prefix
				) );
			}

			FiveDPBR_Logger::info( 'migration', sprintf(
				'Starting database import (%s)...',
				size_format( filesize( $sql_file ) )
			) );

			$import_state = FiveDPBR_DB_Importer::init_import_state( $sql_file, $new_prefix, $old_prefix );

			if ( is_wp_error( $import_state ) ) {
				self::update_incoming_status( 'failed', $import_state->get_error_message() );
				return new WP_REST_Response(
					array( 'success' => false, 'message' => $import_state->get_error_message() ),
					500
				);
			}

			$result = FiveDPBR_DB_Importer::import_chunk( $import_state );

			while ( true !== $result && ! is_wp_error( $result ) ) {
				$import_state = is_array( $result ) ? $result : $import_state;
				$result       = FiveDPBR_DB_Importer::import_chunk( $import_state );
			}

			if ( is_wp_error( $result ) ) {
				FiveDPBR_Logger::error( 'migration', 'Database import failed: ' . $result->get_error_message() );
				self::update_incoming_status( 'failed', $result->get_error_message() );
				return new WP_REST_Response(
					array( 'success' => false, 'message' => $result->get_error_message() ),
					500
				);
			}

			$errors = isset( $import_state['errors'] ) ? count( $import_state['errors'] ) : 0;
			FiveDPBR_Logger::info( 'migration', sprintf(
				'Database import completed: %d statements, %d errors.',
				$import_state['statements_run'], $errors
			) );

			// Re-inject the destination admin's session so they stay logged in.
			self::restore_admin_session();

			// ── CRITICAL: Fix siteurl/home IMMEDIATELY after DB import ──
			// This must run before ANYTHING else. After importing the source
			// DB, siteurl/home point to the source URL. If the process dies
			// at any point after this, the site is still accessible.
			// Uses raw mysqli to bypass WordPress abstractions and caching.
			if ( ! empty( $dest_url ) ) {
				$dest_url_clean = untrailingslashit( $dest_url );
				$options_table  = $wpdb->options; // e.g. wp_options

				// Use raw mysqli for absolute reliability.
				$db_handle = $wpdb->dbh;

				if ( $db_handle instanceof mysqli ) {
					$escaped_url   = mysqli_real_escape_string( $db_handle, $dest_url_clean );
					$escaped_table = $options_table; // Already sanitized by WP.

					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
					$r1 = mysqli_query(
						$db_handle,
						"UPDATE `{$escaped_table}` SET option_value = '{$escaped_url}' WHERE option_name = 'siteurl'"
					);
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
					$r2 = mysqli_query(
						$db_handle,
						"UPDATE `{$escaped_table}` SET option_value = '{$escaped_url}' WHERE option_name = 'home'"
					);

					// Verify it actually worked by reading back.
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
					$verify = mysqli_query(
						$db_handle,
						"SELECT option_value FROM `{$escaped_table}` WHERE option_name = 'siteurl'"
					);
					$row = $verify ? mysqli_fetch_assoc( $verify ) : null;
					$actual = $row ? $row['option_value'] : '(query failed)';

					FiveDPBR_Logger::info( 'migration', sprintf(
						'Force-set siteurl/home via mysqli: target="%s", verified="%s" (r1=%s, r2=%s)',
						$dest_url_clean,
						$actual,
						$r1 ? 'ok' : 'FAIL',
						$r2 ? 'ok' : 'FAIL'
					) );
				} else {
					// Fallback to $wpdb if mysqli handle not available.
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
					$wpdb->query(
						$wpdb->prepare(
							"UPDATE `{$options_table}` SET option_value = %s WHERE option_name = 'siteurl'",
							$dest_url_clean
						)
					);
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
					$wpdb->query(
						$wpdb->prepare(
							"UPDATE `{$options_table}` SET option_value = %s WHERE option_name = 'home'",
							$dest_url_clean
						)
					);

					FiveDPBR_Logger::info( 'migration', sprintf(
						'Force-set siteurl/home via $wpdb: "%s"',
						$dest_url_clean
					) );
				}

				// Flush object cache so WordPress reads fresh values.
				wp_cache_flush();
			}
		}

		// ── Search & replace ───────────────────────────────────
		// Uses $dest_url captured BEFORE DB import (home_url() is now wrong).
		if ( $include_db && ! empty( $source_url ) ) {
			self::update_incoming_status( 'restoring', __( 'Running search & replace...', '5dp-backup-restore' ) );

			FiveDPBR_Logger::info( 'migration', sprintf(
				'Search-replace URLs: "%s" → "%s"',
				$source_url, $dest_url
			) );
			FiveDPBR_Logger::info( 'migration', sprintf(
				'Search-replace paths: "%s" → "%s"',
				$source_path, $dest_path
			) );

			$pairs = FiveDPBR_Search_Replace::get_migration_pairs(
				$source_url,
				$dest_url,
				$source_path,
				$dest_path
			);

			FiveDPBR_Logger::info( 'migration', sprintf(
				'Generated %d search-replace pairs.',
				count( $pairs )
			) );

			foreach ( $pairs as $i => $pair ) {
				FiveDPBR_Logger::debug( 'migration', sprintf(
					'Pair %d: "%s" → "%s"',
					$i + 1,
					$pair['search'],
					$pair['replace']
				) );
			}

			if ( ! empty( $pairs ) ) {
				$report = FiveDPBR_Search_Replace::run_multiple( $pairs );

				FiveDPBR_Logger::info(
					'migration',
					sprintf(
						'Search-replace complete: %d tables, %d rows affected, %d changes.',
						$report['tables'],
						$report['rows_affected'],
						$report['changes']
					)
				);

				if ( 0 === $report['changes'] ) {
					FiveDPBR_Logger::warning(
						'migration',
						'Search-replace made 0 changes — source URL may not match what is in the database.'
					);
				}
			}
		}

		// ── Final siteurl/home safety check ───────────────────
		// Verify again after search-replace, in case it reverted our earlier fix.
		if ( $include_db && ! empty( $dest_url ) ) {
			global $wpdb;
			$dest_url_clean = untrailingslashit( $dest_url );

			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$current_siteurl = $wpdb->get_var(
				$wpdb->prepare(
					"SELECT option_value FROM {$wpdb->options} WHERE option_name = %s",
					'siteurl'
				)
			);

			if ( $current_siteurl !== $dest_url_clean ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->query(
					$wpdb->prepare(
						"UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = 'siteurl'",
						$dest_url_clean
					)
				);
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->query(
					$wpdb->prepare(
						"UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = 'home'",
						$dest_url_clean
					)
				);

				FiveDPBR_Logger::warning( 'migration', sprintf(
					'Post-search-replace fix: siteurl was "%s", reset to "%s".',
					$current_siteurl, $dest_url_clean
				) );
			}
		}

		// Remove the mu-plugin fixer — URLs are now correct.
		self::remove_url_fixer_mu_plugin();

		// Flush rewrite rules and caches.
		flush_rewrite_rules();
		wp_cache_flush();

		self::update_incoming_status( 'completed', __( 'Migration completed', '5dp-backup-restore' ) );

		// Clean up session file (token + status files kept briefly for final poll).
		self::delete_session_file();

		FiveDPBR_Logger::info( 'migration', 'Migration finalize completed successfully.' );

		return new WP_REST_Response(
			array(
				'success' => true,
				'message' => __( 'Restore completed successfully.', '5dp-backup-restore' ),
			),
			200
		);
	}

	/**
	 * Copy extracted files from source directory to destination, skipping protected files.
	 *
	 * Modeled after FiveDPBR_Restore_Engine::phase_fdpbr_restore_files().
	 *
	 * @param string $source_dir Extracted files directory.
	 * @param string $dest_root  Target directory (ABSPATH).
	 * @return array Array with 'ok' and 'fail' counts.
	 */
	private static function copy_extracted_files( $source_dir, $dest_root ) {
		$source_dir = trailingslashit( str_replace( '\\', '/', $source_dir ) );
		$dest_root  = trailingslashit( $dest_root );

		// Files that must never be overwritten at the root level.
		$skip_root = array( 'database.sql', 'manifest.json', 'index.php', 'wp-config.php' );

		// Never overwrite the running plugin's own files.
		$self_dir = 'wp-content/plugins/' . dirname( FDPBR_PLUGIN_BASENAME ) . '/';

		$ok   = 0;
		$fail = 0;

		$iter = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator( $source_dir, RecursiveDirectoryIterator::SKIP_DOTS ),
			RecursiveIteratorIterator::SELF_FIRST
		);

		foreach ( $iter as $item ) {
			if ( ! $item->isFile() ) {
				continue;
			}

			$pathname = str_replace( '\\', '/', $item->getPathname() );
			$rel      = ltrim( str_replace( $source_dir, '', $pathname ), '/' );

			// Skip .htaccess files at all levels.
			if ( '.htaccess' === basename( $rel ) ) {
				continue;
			}

			// Skip .fdpbr archive files.
			if ( 'fdpbr' === strtolower( pathinfo( $rel, PATHINFO_EXTENSION ) ) ) {
				continue;
			}

			// Skip top-level protected files.
			if ( in_array( basename( $rel ), $skip_root, true ) && strpos( $rel, '/' ) === false ) {
				continue;
			}

			// Skip this plugin's own directory.
			if ( strpos( $rel, $self_dir ) === 0 ) {
				continue;
			}

			$dest = $dest_root . $rel;
			wp_mkdir_p( dirname( $dest ) );

			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_copy
			if ( @copy( $pathname, $dest ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				++$ok;
			} else {
				++$fail;
				if ( $fail <= 5 ) {
					FiveDPBR_Logger::warning( 'migration', sprintf( 'Copy failed: %s', $rel ) );
				}
			}
		}

		return array( 'ok' => $ok, 'fail' => $fail );
	}

	/**
	 * Endpoint: Clean up temp migration files on the destination.
	 *
	 * @since 1.0.0
	 *
	 * @param WP_REST_Request $request The request object.
	 * @return WP_REST_Response
	 */
	public static function endpoint_cleanup( $request ) {
		// Remove URL fixer mu-plugin if still present.
		self::remove_url_fixer_mu_plugin();

		$temp_dir = FiveDPBR_Environment::get_backup_dir() . '/migration_temp';

		if ( is_dir( $temp_dir ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
			global $wp_filesystem;

			if ( $wp_filesystem ) {
				$wp_filesystem->delete( $temp_dir, true );
			}
		}

		FiveDPBR_Logger::info( 'migration', 'Migration temp files cleaned up on destination.' );

		return new WP_REST_Response(
			array(
				'success' => true,
				'message' => __( 'Cleanup complete.', '5dp-backup-restore' ),
			),
			200
		);
	}

	/**
	 * Install a must-use plugin that fixes siteurl/home on the next page load.
	 *
	 * This is a safety net: if the finalize process crashes (server timeout,
	 * PHP fatal, etc.) after DB import but before the URL fix code runs,
	 * the mu-plugin will auto-fix the URLs when the site is next accessed.
	 *
	 * The mu-plugin also runs the full search-replace if the finalize didn't
	 * complete it.
	 *
	 * @param string $dest_url    Destination site URL.
	 * @param string $source_url  Source site URL.
	 * @param string $source_path Source ABSPATH.
	 * @param string $dest_path   Destination ABSPATH.
	 */
	private static function install_url_fixer_mu_plugin( $dest_url, $source_url = '', $source_path = '', $dest_path = '' ) {
		$mu_dir = ( defined( 'WP_CONTENT_DIR' ) ? WP_CONTENT_DIR : ABSPATH . 'wp-content' ) . '/mu-plugins';

		if ( ! is_dir( $mu_dir ) ) {
			wp_mkdir_p( $mu_dir );
		}

		$dest_url_clean = untrailingslashit( $dest_url );
		$source_url_esc = addslashes( $source_url );
		$dest_url_esc   = addslashes( $dest_url_clean );
		$source_path_esc = addslashes( $source_path );
		$dest_path_esc   = addslashes( $dest_path );

		$mu_code = <<<'MUPHP'
<?php
/**
 * 5DP Migration URL Fixer — auto-generated, self-deleting.
 *
 * Fixes siteurl/home after migration DB import. Runs once then deletes itself.
 */
if ( ! defined( 'ABSPATH' ) ) exit;

// Configuration injected at generation time.
$fdpbr_dest_url   = '__DEST_URL__';
$fdpbr_source_url = '__SOURCE_URL__';
$fdpbr_source_path = '__SOURCE_PATH__';
$fdpbr_dest_path   = '__DEST_PATH__';

// Fix siteurl and home immediately via raw SQL.
global $wpdb;
if ( isset( $wpdb->dbh ) && $wpdb->dbh instanceof mysqli ) {
    $esc = mysqli_real_escape_string( $wpdb->dbh, $fdpbr_dest_url );
    $tbl = $wpdb->options;
    mysqli_query( $wpdb->dbh, "UPDATE `{$tbl}` SET option_value = '{$esc}' WHERE option_name = 'siteurl'" );
    mysqli_query( $wpdb->dbh, "UPDATE `{$tbl}` SET option_value = '{$esc}' WHERE option_name = 'home'" );
}

// Override WordPress filters so the current request uses the correct URL.
add_filter( 'option_siteurl', function() use ( $fdpbr_dest_url ) { return $fdpbr_dest_url; }, 0 );
add_filter( 'option_home',    function() use ( $fdpbr_dest_url ) { return $fdpbr_dest_url; }, 0 );

// DO NOT self-delete — only the migration cleanup endpoint removes this file.
// Self-deleting on shutdown is fragile: if the finalize crashes mid-way,
// the next page load needs this mu-plugin to still be here.
MUPHP;

		// Inject the actual values.
		$mu_code = str_replace( '__DEST_URL__', $dest_url_esc, $mu_code );
		$mu_code = str_replace( '__SOURCE_URL__', $source_url_esc, $mu_code );
		$mu_code = str_replace( '__SOURCE_PATH__', $source_path_esc, $mu_code );
		$mu_code = str_replace( '__DEST_PATH__', $dest_path_esc, $mu_code );

		$mu_path = $mu_dir . '/fdpbr-migration-url-fix.php';

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		$written = file_put_contents( $mu_path, $mu_code );

		if ( $written ) {
			FiveDPBR_Logger::info( 'migration', sprintf(
				'Installed URL fixer mu-plugin: %s (dest_url=%s)',
				$mu_path, $dest_url_clean
			) );
		} else {
			FiveDPBR_Logger::warning( 'migration', 'Failed to write URL fixer mu-plugin.' );
		}
	}

	/**
	 * Remove the URL fixer mu-plugin after successful finalize.
	 */
	private static function remove_url_fixer_mu_plugin() {
		$mu_dir  = ( defined( 'WP_CONTENT_DIR' ) ? WP_CONTENT_DIR : ABSPATH . 'wp-content' ) . '/mu-plugins';
		$mu_path = $mu_dir . '/fdpbr-migration-url-fix.php';

		if ( file_exists( $mu_path ) ) {
			@unlink( $mu_path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			FiveDPBR_Logger::info( 'migration', 'Removed URL fixer mu-plugin.' );
		}
	}

	/**
	 * Detect the table prefix used in a SQL dump file.
	 *
	 * Reads the first ~100 lines looking for CREATE TABLE statements
	 * and extracts the prefix from the table name.
	 *
	 * @param string $sql_file Path to SQL file.
	 * @return string Detected prefix (e.g., 'wp_'), or empty string if not found.
	 */
	private static function detect_sql_prefix( $sql_file ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$fh = fopen( $sql_file, 'r' );
		if ( ! $fh ) {
			return '';
		}

		$lines = 0;

		while ( ! feof( $fh ) && $lines < 200 ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fgets
			$line = fgets( $fh );
			++$lines;

			if ( false === $line ) {
				break;
			}

			// Look for: CREATE TABLE `prefix_tablename`
			// Common WP tables: options, posts, postmeta, users, usermeta, terms, etc.
			if ( preg_match( '/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+?)(options|posts|postmeta|users|usermeta|terms|term_taxonomy|term_relationships|comments|commentmeta|links)`?/i', $line, $matches ) ) {
				fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
				return $matches[1]; // The prefix portion.
			}
		}

		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

		return '';
	}

	/**
	 * Pre-fix siteurl and home values in a SQL dump file.
	 *
	 * Replaces the source URL with the destination URL specifically in
	 * INSERT statements for the options table (siteurl and home rows).
	 * This ensures the database never contains the wrong URL at any point.
	 *
	 * @since 1.0.46
	 *
	 * @param string $sql_file   Path to the SQL file.
	 * @param string $source_url Source site URL.
	 * @param string $dest_url   Destination site URL.
	 */
	private static function prefix_sql_urls( $sql_file, $source_url, $dest_url ) {
		$source_url = untrailingslashit( $source_url );
		$dest_url   = untrailingslashit( $dest_url );

		if ( $source_url === $dest_url ) {
			return;
		}

		// Read the SQL file.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$sql = file_get_contents( $sql_file );

		if ( false === $sql ) {
			FiveDPBR_Logger::warning( 'migration', 'Could not read SQL file for URL pre-fix.' );
			return;
		}

		// Also handle escaped versions (JSON, double-escaped).
		$replacements = array(
			$source_url                                    => $dest_url,
			str_replace( '/', '\\/', $source_url )         => str_replace( '/', '\\/', $dest_url ),
			str_replace( '/', '\\\\/', $source_url )       => str_replace( '/', '\\\\/', $dest_url ),
		);

		$changed = false;
		foreach ( $replacements as $search => $replace ) {
			if ( strpos( $sql, $search ) !== false ) {
				$sql     = str_replace( $search, $replace, $sql );
				$changed = true;
			}
		}

		if ( $changed ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			file_put_contents( $sql_file, $sql );

			FiveDPBR_Logger::info( 'migration', sprintf(
				'Pre-fixed URLs in SQL file: "%s" → "%s"',
				$source_url, $dest_url
			) );
		} else {
			FiveDPBR_Logger::info( 'migration', 'No source URLs found in SQL file to pre-fix.' );
		}
	}

	// =========================================================================
	// Key Management
	// =========================================================================

	/**
	 * Generate a new migration key and save it.
	 *
	 * @since 1.0.0
	 *
	 * @return string The generated key.
	 */
	public static function generate_migration_key() {
		$key = wp_generate_password( 64, false, false );

		update_option( 'fdpbr_migration_key', $key, false );

		FiveDPBR_Logger::info( 'migration', 'New migration key generated.' );

		return $key;
	}

	/**
	 * Get the current migration key.
	 *
	 * @since 1.0.0
	 *
	 * @return string The migration key, or empty string if none.
	 */
	public static function get_migration_key() {
		return (string) get_option( 'fdpbr_migration_key', '' );
	}

	// =========================================================================
	// Incoming Migration Status (destination-side tracking)
	// =========================================================================

	// ── File-based status (survives DB import) ──────────────────────

	/**
	 * Get the path to the migration status file.
	 *
	 * @return string
	 */
	private static function get_status_file_path() {
		return FiveDPBR_Environment::get_backup_dir() . '/migration-status.php';
	}

	/**
	 * Get the path to the migration polling token file.
	 *
	 * @return string
	 */
	private static function get_token_file_path() {
		return FiveDPBR_Environment::get_backup_dir() . '/migration-token.php';
	}

	/**
	 * Update the incoming migration status (file-based, survives DB import).
	 *
	 * @param string      $phase      Current phase (verifying, receiving, restoring, completed, failed).
	 * @param string      $message    Human-readable status message.
	 * @param string|null $source_url Source URL (set on first call, preserved after).
	 * @param array       $extra      Extra data (total_files, transferred, etc.).
	 */
	public static function update_incoming_status( $phase, $message, $source_url = null, $extra = array() ) {
		$current = self::get_incoming_status();

		// If migration was aborted, do not allow further updates.
		if ( is_array( $current ) && isset( $current['phase'] ) && 'aborted' === $current['phase'] ) {
			return;
		}

		$status = array(
			'phase'      => $phase,
			'message'    => $message,
			'source_url' => $source_url ? $source_url : ( is_array( $current ) && isset( $current['source_url'] ) ? $current['source_url'] : '' ),
			'started_at' => is_array( $current ) && isset( $current['started_at'] ) ? $current['started_at'] : time(),
			'updated_at' => time(),
		);

		if ( ! empty( $extra ) ) {
			$status = array_merge( $status, $extra );
		}

		$file  = self::get_status_file_path();
		$guard = '<' . '?php exit; ?' . '>';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $file, $guard . wp_json_encode( $status ) );
	}

	/**
	 * Get the current incoming migration status (file-based).
	 *
	 * @return array|false Status array or false if no active migration.
	 */
	public static function get_incoming_status() {
		$file = self::get_status_file_path();

		if ( ! file_exists( $file ) ) {
			return false;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$raw = file_get_contents( $file );
		// Strip the PHP die() guard (14 bytes).
		$json   = substr( $raw, 14 );
		$status = json_decode( $json, true );

		if ( ! is_array( $status ) ) {
			return false;
		}

		return $status;
	}

	/**
	 * Delete the migration status file.
	 */
	private static function delete_incoming_status() {
		$file = self::get_status_file_path();
		if ( file_exists( $file ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
			@unlink( $file );
		}
	}

	/**
	 * Generate a polling token for the migration (stored in a file).
	 *
	 * @return string The generated token.
	 */
	private static function create_polling_token() {
		$token = wp_generate_password( 32, false );
		$file  = self::get_token_file_path();
		$guard = '<' . '?php exit; ?' . '>';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $file, $guard . $token );
		return $token;
	}

	/**
	 * Validate a polling token.
	 *
	 * @param string $token The token to validate.
	 * @return bool
	 */
	private static function validate_polling_token( $token ) {
		$file = self::get_token_file_path();

		if ( empty( $token ) || ! file_exists( $file ) ) {
			return false;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$raw          = file_get_contents( $file );
		$stored_token = substr( $raw, 14 );

		return hash_equals( $stored_token, $token );
	}

	/**
	 * Delete the polling token file.
	 */
	private static function delete_polling_token() {
		$file = self::get_token_file_path();
		if ( file_exists( $file ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
			@unlink( $file );
		}
	}

	// ── Admin session preservation (survives DB import) ─────────

	/**
	 * Get the path to the admin session file.
	 *
	 * @return string
	 */
	private static function get_session_file_path() {
		return FiveDPBR_Environment::get_backup_dir() . '/migration-session.php';
	}

	/**
	 * Save the current admin user's session data to a file.
	 *
	 * Called from the admin's AJAX polling context (where we have cookie auth).
	 * The data is re-injected after DB import in the finalize endpoint.
	 */
	private static function save_admin_session() {
		$current_user = wp_get_current_user();

		if ( ! $current_user || ! $current_user->ID ) {
			return;
		}

		$data = array(
			'user_login'     => $current_user->user_login,
			'user_pass'      => $current_user->user_pass,
			'user_email'     => $current_user->user_email,
			'session_tokens' => get_user_meta( $current_user->ID, 'session_tokens', true ),
		);

		$file  = self::get_session_file_path();
		$guard = '<' . '?php exit; ?' . '>';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $file, $guard . wp_json_encode( $data ) );
	}

	/**
	 * Re-inject the saved admin session into the database after DB import.
	 *
	 * Finds or creates the user matching the saved login/email and restores
	 * their password hash + session tokens so their browser cookie stays valid.
	 */
	private static function restore_admin_session() {
		$file = self::get_session_file_path();

		if ( ! file_exists( $file ) ) {
			return;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$raw  = file_get_contents( $file );
		$json = substr( $raw, 14 );
		$data = json_decode( $json, true );

		if ( ! is_array( $data ) || empty( $data['user_login'] ) ) {
			return;
		}

		global $wpdb;

		// Find the user by login (may not exist if source DB had different users).
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$user_id = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT ID FROM {$wpdb->users} WHERE user_login = %s",
				$data['user_login']
			)
		);

		if ( ! $user_id ) {
			// User doesn't exist in the imported DB — create them.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$wpdb->users,
				array(
					'user_login' => $data['user_login'],
					'user_pass'  => $data['user_pass'],
					'user_email' => $data['user_email'],
				),
				array( '%s', '%s', '%s' )
			);
			$user_id = $wpdb->insert_id;

			if ( $user_id ) {
				// Grant administrator role.
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->insert(
					$wpdb->usermeta,
					array(
						'user_id'    => $user_id,
						'meta_key'   => $wpdb->prefix . 'capabilities',
						'meta_value' => serialize( array( 'administrator' => true ) ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.serialize_serialize
					),
					array( '%d', '%s', '%s' )
				);
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->insert(
					$wpdb->usermeta,
					array(
						'user_id'    => $user_id,
						'meta_key'   => $wpdb->prefix . 'user_level',
						'meta_value' => '10',
					),
					array( '%d', '%s', '%s' )
				);
			}
		} else {
			// User exists — update password hash to match destination admin's cookie.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->update(
				$wpdb->users,
				array( 'user_pass' => $data['user_pass'] ),
				array( 'ID' => $user_id ),
				array( '%s' ),
				array( '%d' )
			);
		}

		// Restore session tokens so the admin's cookie remains valid.
		if ( $user_id && ! empty( $data['session_tokens'] ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->query(
				$wpdb->prepare(
					"DELETE FROM {$wpdb->usermeta} WHERE user_id = %d AND meta_key = 'session_tokens'",
					$user_id
				)
			);
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$wpdb->usermeta,
				array(
					'user_id'    => $user_id,
					'meta_key'   => 'session_tokens',
					'meta_value' => maybe_serialize( $data['session_tokens'] ),
				),
				array( '%d', '%s', '%s' )
			);
		}

		FiveDPBR_Logger::info( 'migration', sprintf(
			'Admin session restored for user "%s" (ID: %s).',
			$data['user_login'],
			$user_id ? $user_id : 'failed'
		) );
	}

	/**
	 * Delete the session file.
	 */
	private static function delete_session_file() {
		$file = self::get_session_file_path();
		if ( file_exists( $file ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
			@unlink( $file );
		}
	}

	/**
	 * Build the standard response data from a status array.
	 *
	 * @param array $status The status array.
	 * @return array
	 */
	private static function build_status_response( $status ) {
		return array(
			'active'      => true,
			'phase'       => $status['phase'],
			'message'     => $status['message'],
			'source_url'  => isset( $status['source_url'] ) ? $status['source_url'] : '',
			'elapsed'     => time() - $status['started_at'],
			'total'       => isset( $status['total_files'] ) ? $status['total_files'] : 0,
			'transferred' => isset( $status['transferred'] ) ? $status['transferred'] : 0,
		);
	}

	/**
	 * AJAX: Return current incoming migration status (nonce-authenticated).
	 */
	public static function ajax_incoming_status() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$status = self::get_incoming_status();

		if ( ! $status ) {
			wp_send_json_success( array( 'active' => false ) );
		}

		// If aborted, treat as inactive.
		if ( 'aborted' === $status['phase'] ) {
			wp_send_json_success( array( 'active' => false ) );
		}

		$age = time() - $status['updated_at'];

		// Clean up completed/failed status after 60 seconds.
		if ( in_array( $status['phase'], array( 'completed', 'failed' ), true ) && $age > 60 ) {
			self::delete_incoming_status();
			self::delete_polling_token();
			wp_send_json_success( array( 'active' => false ) );
		}

		// Consider stale if active but no update for >2 minutes.
		if ( ! in_array( $status['phase'], array( 'completed', 'failed' ), true ) && $age > 120 ) {
			self::delete_incoming_status();
			wp_send_json_success( array( 'active' => false ) );
		}

		// Save admin session on every successful poll so it's available
		// for re-injection after DB import replaces wp_users.
		self::save_admin_session();

		$response = self::build_status_response( $status );

		// Include the polling token so JS can save it for fallback polling.
		$token_file = self::get_token_file_path();
		if ( file_exists( $token_file ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$raw = file_get_contents( $token_file );
			$response['migration_token'] = substr( $raw, 14 );
		}

		wp_send_json_success( $response );
	}

	/**
	 * AJAX: Token-based migration status polling (works without nonce/session).
	 *
	 * This endpoint is the fallback after DB import kills the admin session.
	 * Validated via a token stored in a file (survives DB import).
	 */
	public static function ajax_incoming_status_token() {
		$token = isset( $_POST['migration_token'] ) ? sanitize_text_field( wp_unslash( $_POST['migration_token'] ) ) : '';

		if ( ! self::validate_polling_token( $token ) ) {
			wp_send_json_error( array( 'message' => 'Invalid token.' ) );
		}

		$status = self::get_incoming_status();

		if ( ! $status ) {
			wp_send_json_success( array( 'active' => false ) );
		}

		if ( 'aborted' === $status['phase'] ) {
			wp_send_json_success( array( 'active' => false ) );
		}

		wp_send_json_success( self::build_status_response( $status ) );
	}

	/**
	 * AJAX: Abort an incoming migration (destination-side).
	 */
	public static function ajax_abort_incoming() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		// Set phase to 'aborted' so update_incoming_status() won't overwrite.
		self::update_incoming_status( 'aborted', __( 'Migration aborted by user.', '5dp-backup-restore' ) );

		// Clean up any temp files.
		$temp_dir = FiveDPBR_Environment::get_backup_dir() . '/migration_temp';
		if ( is_dir( $temp_dir ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
			global $wp_filesystem;

			if ( $wp_filesystem ) {
				$wp_filesystem->delete( $temp_dir, true );
			}
		}

		self::delete_incoming_status();
		self::delete_polling_token();

		FiveDPBR_Logger::info( 'migration', 'Incoming migration aborted by user.' );

		wp_send_json_success( array(
			'message' => __( 'Incoming migration aborted.', '5dp-backup-restore' ),
		) );
	}

	/**
	 * AJAX: Regenerate the migration key.
	 */
	public static function ajax_regenerate_key() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$key = self::generate_migration_key();

		wp_send_json_success( array( 'key' => $key ) );
	}
}
