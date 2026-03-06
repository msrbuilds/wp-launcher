<?php
/**
 * Migration package builder.
 *
 * Creates, queries, and cleans up migration packages by wrapping the
 * backup engine with migration-specific path filtering.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/migration
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Migration_Package
 *
 * @since 1.0.0
 */
class FiveDPBR_Migration_Package {

	/**
	 * Create a migration package using the backup engine.
	 *
	 * @since 1.0.0
	 *
	 * @param array $args Package arguments.
	 * @return array|WP_Error Package info or error.
	 */
	public static function create( $args = array() ) {
		// Allow long execution — backup creation is synchronous here.
		set_time_limit( 0 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged

		$defaults = array(
			'include_db'      => true,
			'include_plugins' => true,
			'include_themes'  => true,
			'include_uploads' => true,
		);

		$args = wp_parse_args( $args, $defaults );

		// Determine backup type based on includes.
		$include_files = $args['include_plugins'] || $args['include_themes'] || $args['include_uploads'];

		if ( $args['include_db'] && $include_files ) {
			$backup_type = 'full';
		} elseif ( $args['include_db'] && ! $include_files ) {
			$backup_type = 'database';
		} elseif ( ! $args['include_db'] && $include_files ) {
			$backup_type = 'files';
		} else {
			return new WP_Error(
				'nothing_selected',
				__( 'No migration content selected.', '5dp-backup-restore' )
			);
		}

		// Build include paths as RELATIVE paths (relative to ABSPATH).
		// enumerate_files() compares patterns against relative paths, so
		// absolute paths would never match → 0 files backed up.
		$include_paths = array();
		$abspath_norm  = wp_normalize_path( untrailingslashit( ABSPATH ) );

		// For full backups with ALL content selected, pass empty include_paths
		// to back up everything. Only filter when partially selected.
		$all_files = $args['include_plugins'] && $args['include_themes'] && $args['include_uploads'];

		if ( ! $all_files ) {
			if ( $args['include_plugins'] ) {
				$include_paths[] = str_replace( $abspath_norm . '/', '', wp_normalize_path( WP_PLUGIN_DIR ) );
			}

			if ( $args['include_themes'] ) {
				$include_paths[] = str_replace( $abspath_norm . '/', '', wp_normalize_path( get_theme_root() ) );
			}

			if ( $args['include_uploads'] ) {
				$upload_dir = wp_upload_dir();
				if ( ! empty( $upload_dir['basedir'] ) ) {
					$include_paths[] = str_replace( $abspath_norm . '/', '', wp_normalize_path( $upload_dir['basedir'] ) );
				}
			}
		}

		FiveDPBR_Logger::info(
			'migration',
			sprintf(
				'Creating migration package: type=%s, include_paths=%s',
				$backup_type,
				! empty( $include_paths ) ? implode( ', ', $include_paths ) : '(all files)'
			)
		);

		// Create backup via the backup engine — run SYNCHRONOUSLY.
		// We bypass the normal background dispatch / poll / sleep cycle and
		// drive process_chunk() in a tight loop so migrations are fast.
		$backup_engine = new FiveDPBR_Backup_Engine();

		$backup_args = array(
			'type'                 => $backup_type,
			'name'                 => sprintf(
				/* translators: %s: Date/time */
				__( 'Migration Package — %s', '5dp-backup-restore' ),
				wp_date( 'Y-m-d H:i:s' )
			),
			'storage_destinations' => array( 'local' ),
			'include_paths'        => $include_paths,
			'exclude_paths'        => array(),
		);

		$job_id = $backup_engine->start( $backup_args );

		if ( is_wp_error( $job_id ) ) {
			return $job_id;
		}

		// Run the backup synchronously — tight loop, no sleep, no time limit.
		$job      = FiveDPBR_Job_Manager::get_job( $job_id );
		$job_data = $job ? ( json_decode( $job->data, true ) ?: array() ) : array();

		if ( empty( $job_data ) ) {
			return new WP_Error( 'job_lost', __( 'Migration package job was lost.', '5dp-backup-restore' ) );
		}

		FiveDPBR_Job_Manager::update_job( $job_id, array( 'status' => 'running' ) );

		$max_iterations = 50000; // Safety cap.
		$backup_id      = '';

		for ( $i = 0; $i < $max_iterations; $i++ ) {
			$result = $backup_engine->run_chunk_sync( $job_id, $job_data );

			if ( is_wp_error( $result ) ) {
				FiveDPBR_Job_Manager::update_job( $job_id, array(
					'status'       => 'failed',
					'current_step' => $result->get_error_message(),
				) );
				return new WP_Error(
					'package_failed',
					sprintf(
						/* translators: %s: Error message */
						__( 'Migration package creation failed: %s', '5dp-backup-restore' ),
						$result->get_error_message()
					)
				);
			}

			if ( true === $result ) {
				// Completed — read backup_id from updated job data.
				$final_job = FiveDPBR_Job_Manager::get_job( $job_id );
				if ( $final_job ) {
					$final_data = json_decode( $final_job->data, true );
					$backup_id  = isset( $final_data['backup_id'] ) ? $final_data['backup_id'] : '';
				}
				break;
			}

			// $result is updated job_data — continue processing.
			if ( is_array( $result ) ) {
				$job_data = $result;
			}
		}

		if ( empty( $backup_id ) ) {
			return new WP_Error( 'timeout', __( 'Migration package creation did not complete.', '5dp-backup-restore' ) );
		}

		$package = self::get_package_info( $backup_id );

		if ( ! is_wp_error( $package ) ) {
			FiveDPBR_Logger::info(
				'migration',
				sprintf(
					'Migration package ready: %s (%s, %d files).',
					$backup_id,
					size_format( $package['total_size'] ),
					count( $package['file_paths'] )
				)
			);
		}

		return $package;
	}

	/**
	 * Get information about an existing migration package.
	 *
	 * @since 1.0.0
	 *
	 * @param string $backup_id The backup ID.
	 * @return array|WP_Error Package info or error.
	 */
	public static function get_package_info( $backup_id ) {
		$backup = FiveDPBR_Backup_Engine::get_backup( $backup_id );

		if ( ! $backup ) {
			return new WP_Error(
				'not_found',
				__( 'Migration package not found.', '5dp-backup-restore' ),
				array( 'status' => 404 )
			);
		}

		$backup_dir = FiveDPBR_Environment::get_backup_dir() . '/' . $backup_id;

		if ( ! is_dir( $backup_dir ) ) {
			return new WP_Error(
				'dir_missing',
				__( 'Migration package directory not found.', '5dp-backup-restore' ),
				array( 'status' => 404 )
			);
		}

		// Build the list of absolute file paths.
		$stored_paths = ! empty( $backup->file_paths ) ? json_decode( $backup->file_paths, true ) : array();
		$file_paths   = array();

		if ( is_array( $stored_paths ) ) {
			foreach ( $stored_paths as $filename ) {
				$full_path = trailingslashit( $backup_dir ) . $filename;
				if ( file_exists( $full_path ) ) {
					$file_paths[] = $full_path;
				}
			}
		}

		// Load manifest if available.
		$manifest_path = trailingslashit( $backup_dir ) . 'manifest.json';
		$manifest      = array();

		if ( file_exists( $manifest_path ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$manifest_json = file_get_contents( $manifest_path );
			$manifest      = json_decode( $manifest_json, true );

			if ( ! is_array( $manifest ) ) {
				$manifest = array();
			}
		}

		return array(
			'backup_id'  => $backup_id,
			'file_paths' => $file_paths,
			'manifest'   => $manifest,
			'total_size' => isset( $backup->total_size ) ? (int) $backup->total_size : 0,
			'created_at' => isset( $backup->created_at ) ? $backup->created_at : '',
		);
	}

	/**
	 * Clean up a migration package by removing its files.
	 *
	 * @since 1.0.0
	 *
	 * @param string $backup_id The backup ID.
	 * @return true|WP_Error True on success or error.
	 */
	public static function cleanup( $backup_id ) {
		if ( empty( $backup_id ) ) {
			return new WP_Error( 'missing_id', __( 'Backup ID is required.', '5dp-backup-restore' ) );
		}

		$result = FiveDPBR_Backup_Engine::delete_backup( $backup_id );

		if ( ! $result ) {
			return new WP_Error(
				'cleanup_failed',
				__( 'Failed to clean up migration package.', '5dp-backup-restore' )
			);
		}

		FiveDPBR_Logger::info(
			'migration',
			sprintf( 'Migration package %s cleaned up.', $backup_id )
		);

		return true;
	}
}
