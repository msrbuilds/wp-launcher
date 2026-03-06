<?php
/**
 * Restore engine orchestrator.
 *
 * Coordinates the restore process: verifies backup integrity,
 * extracts files, imports database, and optionally runs search-replace.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/restore
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Restore_Engine
 *
 * @since 1.0.0
 */
class FiveDPBR_Restore_Engine extends FiveDPBR_Background_Processor {

	/**
	 * Constructor.
	 */
	public function __construct() {
		parent::__construct( 'fdpbr_restore' );
	}

	/**
	 * Override dispatch to use frontend-driven AJAX processing only.
	 *
	 * Restores must NOT run via WP Cron or Action Scheduler because:
	 * 1. Background processing can complete the entire restore (including DB import)
	 *    before the frontend fires its first poll, leaving the UI stuck at 0%.
	 * 2. DB import replaces wp_options (deactivating the plugin) and fdpbr_jobs
	 *    (losing the job record), breaking all subsequent polling.
	 * 3. WP Cron loopback is unreliable on many hosts (especially local dev).
	 *
	 * Instead, the frontend drives processing: each JS poll calls the chunk
	 * endpoint which processes one unit of work and returns progress.
	 *
	 * @param string $job_id Job ID.
	 * @param array  $data   Initial job data.
	 * @return bool
	 */
	public function dispatch( $job_id, $data = array() ) {
		$this->job_id   = $job_id;
		$this->job_data = $data;

		FiveDPBR_Logger::info(
			$this->get_context(),
			sprintf( 'Job %s ready for frontend-driven processing.', $job_id )
		);

		return true;
	}

	/**
	 * Get logging context.
	 *
	 * @return string
	 */
	protected function get_context() {
		return 'restore';
	}

	/**
	 * Start a restore from a backup.
	 *
	 * @param array $args Restore arguments.
	 * @return string|WP_Error Job ID or error.
	 */
	public function start( $args = array() ) {
		$defaults = array(
			'backup_id'      => '',
			'backup_dir'     => '',
			'restore_db'     => true,
			'restore_files'  => true,
			'search_replace' => array(), // Array of search-replace pairs.
		);

		$args = wp_parse_args( $args, $defaults );

		// Determine backup directory.
		if ( empty( $args['backup_dir'] ) && ! empty( $args['backup_id'] ) ) {
			$args['backup_dir'] = FiveDPBR_Environment::get_backup_dir() . '/' . $args['backup_id'];
		}

		if ( empty( $args['backup_dir'] ) || ! is_dir( $args['backup_dir'] ) ) {
			return new WP_Error( 'no_backup', __( 'Backup directory not found.', '5dp-backup-restore' ) );
		}

		// Load manifest.
		$manifest_path = trailingslashit( $args['backup_dir'] ) . 'manifest.json';
		$manifest      = FiveDPBR_Backup_Manifest::load( $manifest_path );

		if ( is_wp_error( $manifest ) ) {
			return $manifest;
		}

		// Build job data.
		$job_data = array(
			'backup_id'      => $args['backup_id'],
			'backup_dir'     => $args['backup_dir'],
			'manifest'       => $manifest,
			'restore_db'     => $args['restore_db'],
			'restore_files'  => $args['restore_files'],
			'search_replace' => $args['search_replace'],
			'fdpbr_source'   => isset( $args['fdpbr_source'] ) ? $args['fdpbr_source'] : '',
			'phase'          => 'verify',
			'extract_state'  => null,
			'import_state'   => null,
		);

		// Create job.
		$job_id = FiveDPBR_Job_Manager::create_job( array(
			'type' => 'restore',
			'data' => $job_data,
		) );

		if ( ! $job_id ) {
			return new WP_Error( 'job_create', __( 'Cannot create restore job.', '5dp-backup-restore' ) );
		}

		FiveDPBR_Logger::info( 'restore', sprintf( 'Restore started from backup %s.', $args['backup_id'] ) );

		$this->dispatch( $job_id, $job_data );

		return $job_id;
	}

	/**
	 * Process a single chunk of restore work.
	 *
	 * @param array $data Current job state.
	 * @return true|array|WP_Error
	 */
	protected function process_chunk( $data ) {
		switch ( $data['phase'] ) {
			case 'verify':
				return $this->phase_verify( $data );

			case 'extract':
				return $this->phase_extract( $data );

			case 'database':
				return $this->phase_database( $data );

			case 'search_replace':
				return $this->phase_search_replace( $data );

			case 'cleanup':
				return $this->phase_cleanup( $data );

			case 'fdpbr_unpack':
				return $this->phase_fdpbr_unpack( $data );

			case 'fdpbr_restore_files':
				return $this->phase_fdpbr_restore_files( $data );

			default:
				return new WP_Error( 'unknown_phase', sprintf( 'Unknown restore phase: %s', $data['phase'] ) );
		}
	}


	/**
	 * Phase: Unpack a .fdpbr archive to the backup directory.
	 *
	 * Full backup archives embed files directly (no ZIP chunks), so we extract
	 * everything to backup_dir then copy to ABSPATH via a dedicated phase.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error
	 */
	private function phase_fdpbr_unpack( $data ) {
		$this->update_progress( 8, __( 'Unpacking .fdpbr archive...', '5dp-backup-restore' ) );

		$source     = $data['fdpbr_source'];
		$backup_dir = trailingslashit( $data['backup_dir'] );
		$manifest   = $data['manifest'];

		// Extract archive contents to backup_dir.
		// This may take a while for large archives — disable PHP time limit.
		@set_time_limit( 0 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$result = FiveDPBR_Packager::extract( $source, $backup_dir );

		if ( is_wp_error( $result ) ) {
			FiveDPBR_Logger::error( 'restore', 'Failed to unpack .fdpbr archive: ' . $result->get_error_message() );
			return $result;
		}

		// Use the manifest returned by extract() if available.
		if ( is_array( $result ) ) {
			$data['manifest'] = $result;
			$manifest         = $result;
		}

		// For non-full backups the manifest already lists ZIP chunks/DB file,
		// so fall back to normal phase routing.
		if ( ! empty( $manifest['files']['chunks'] ) ) {
			if ( $data['restore_files'] ) {
				$data['phase'] = 'extract';
				$chunk_paths   = array();
				foreach ( $manifest['files']['chunks'] as $chunk ) {
					$chunk_paths[] = $backup_dir . $chunk['file'];
				}
				$data['extract_state'] = FiveDPBR_File_Extractor::init_extract_state( $chunk_paths, ABSPATH );
				return $data;
			}
			if ( $data['restore_db'] && ! empty( $manifest['database']['file'] ) ) {
				$data['phase'] = 'database';
				return $data;
			}
			return true;
		}

		// Full backup: files are extracted directly (no ZIP chunks).
		// Detect what was extracted and set up phases accordingly.
		$has_db_file    = file_exists( $backup_dir . 'database.sql' );
		$has_wp_files   = file_exists( $backup_dir . 'wp-login.php' ) ||
		                  is_dir( $backup_dir . 'wp-content' ) ||
		                  is_dir( $backup_dir . 'wp-admin' );

		FiveDPBR_Logger::file_debug( 'restore', sprintf(
			'Unpack complete: backup_dir=%s, has_db=%s, has_wp_files=%s',
			$backup_dir,
			$has_db_file ? 'YES' : 'NO',
			$has_wp_files ? 'YES' : 'NO'
		) );

		if ( $has_db_file ) {
			// Inject the database file path into the manifest so phase_database can find it.
			$data['manifest']['database']['file'] = 'database.sql';
		}

		if ( $data['restore_files'] && $has_wp_files ) {
			// Build a flat file list of everything in backup_dir except DB/manifest.
			$data['phase']              = 'fdpbr_restore_files';
			$data['fdpbr_files_dir']    = $backup_dir;
			$data['fdpbr_file_list']    = null; // will be built on first run
			return $data;
		}

		if ( $data['restore_db'] && $has_db_file ) {
			$data['phase'] = 'database';
			return $data;
		}

		return true; // Nothing to restore.
	}

	/**
	 * Phase: Copy extracted full-backup files from backup_dir to ABSPATH.
	 *
	 * Full .fdpbr backups store files raw (no ZIP). After extraction to backup_dir
	 * we copy everything (except database.sql / manifest.json) to the live ABSPATH.
	 * Runs in time-bounded chunks so it can resume across multiple AJAX polls.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error
	 */
	private function phase_fdpbr_restore_files( $data ) {
		$backup_dir = trailingslashit( $data['fdpbr_files_dir'] );
		$dest_root  = trailingslashit( ABSPATH );

		// Build file list on first run.
		if ( null === $data['fdpbr_file_list'] ) {
			// Skip site-specific files that must not be overwritten during restore.
			// wp-config.php: auth salts + DB creds for this installation.
			// .htaccess: server-specific rewrite rules; source site's rules can
			//   block AJAX requests (403) on the target, breaking the restore.
			$skip_root = array( 'database.sql', 'manifest.json', 'index.php', 'wp-config.php' );

			// Never overwrite the running plugin's own files during restore.
			// The backup may contain an older version that lacks critical restore
			// features (token-based polling, session preservation). Overwriting
			// mid-restore would break progress reporting and session handling.
			$self_dir = 'wp-content/plugins/' . dirname( FDPBR_PLUGIN_BASENAME ) . '/';

			$list = array();

			// Normalize backup_dir to forward slashes for reliable comparison.
			// On Windows, RecursiveDirectoryIterator returns backslashes but
			// WordPress paths use forward slashes — must match for str_replace.
			$normalized_dir = str_replace( '\\', '/', $backup_dir );

			$iter = new RecursiveIteratorIterator(
				new RecursiveDirectoryIterator( $backup_dir, RecursiveDirectoryIterator::SKIP_DOTS ),
				RecursiveIteratorIterator::SELF_FIRST
			);

			foreach ( $iter as $item ) {
				if ( $item->isFile() ) {
					$pathname = str_replace( '\\', '/', $item->getPathname() );
					$rel = ltrim( str_replace( $normalized_dir, '', $pathname ), '/' );

					// Skip .htaccess files at ALL levels — source site's server
					// config (rewrite rules, deny directives) can break AJAX on target.
					if ( '.htaccess' === basename( $rel ) ) {
						continue;
					}

					// Skip the .fdpbr archive file itself (it's in the extract dir).
					$ext = strtolower( pathinfo( $rel, PATHINFO_EXTENSION ) );
					if ( 'fdpbr' === $ext ) {
						continue;
					}

					// Skip top-level excluded files.
					if ( in_array( basename( $rel ), $skip_root, true ) && strpos( $rel, '/' ) === false ) {
						continue;
					}

					// Skip this plugin's own directory.
					if ( strpos( $rel, $self_dir ) === 0 ) {
						continue;
					}

					$list[] = $rel;
				}
			}

			$data['fdpbr_file_list']  = $list;
			$data['fdpbr_file_done']  = 0;
			$data['fdpbr_file_total'] = count( $list );

			FiveDPBR_Logger::info( 'restore', sprintf( 'Built file list: %d files to restore from %s', count( $list ), $backup_dir ) );
			FiveDPBR_Logger::file_debug( 'restore', sprintf( 'File list built: %d files to copy from %s to %s', count( $list ), $backup_dir, $dest_root ) );
		}

		$list  = $data['fdpbr_file_list'];
		$done  = (int) $data['fdpbr_file_done'];
		$total = (int) $data['fdpbr_file_total'];
		$start = microtime( true );

		$copy_ok   = 0;
		$copy_fail = 0;

		while ( $done < $total ) {
			$rel  = $list[ $done ];

			// Skip .htaccess files — also checked here for resumed jobs
			// whose file list was built by an older version without the skip.
			if ( '.htaccess' === basename( $rel ) ) {
				++$done;
				continue;
			}

			$src  = $backup_dir . $rel;
			$dest = $dest_root . $rel;

			wp_mkdir_p( dirname( $dest ) );

			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_copy
			if ( @copy( $src, $dest ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				++$copy_ok;
			} else {
				++$copy_fail;
				// Log the first few failures for debugging.
				if ( $copy_fail <= 3 ) {
					FiveDPBR_Logger::warning( 'restore', sprintf(
						'Copy FAILED: src=%s (exists=%s) → dest=%s',
						$src,
						file_exists( $src ) ? 'YES' : 'NO',
						$dest
					) );
				}
			}

			++$done;

			// Yield every 8 seconds to avoid timeout.
			if ( ( microtime( true ) - $start ) > 8 ) {
				break;
			}
		}

		$data['fdpbr_file_done'] = $done;
		$pct = 10 + (int) ( ( $done / max( $total, 1 ) ) * 40 );
		$this->update_progress(
			$pct,
			sprintf(
				/* translators: 1: files done, 2: total files */
				__( 'Restoring files (%1$d / %2$d)...', '5dp-backup-restore' ),
				$done,
				$total
			)
		);

		if ( $done >= $total ) {
			FiveDPBR_Logger::info( 'restore', sprintf( 'Restored %d files to ABSPATH.', $total ) );
			FiveDPBR_Logger::file_debug( 'restore', sprintf( 'File restore complete: %d total, last chunk ok=%d fail=%d', $total, $copy_ok, $copy_fail ) );

			// Transition to DB restore or cleanup.
			if ( $data['restore_db'] && ! empty( $data['manifest']['database']['file'] ) ) {
				$data['phase'] = 'database';
			} else {
				$data['phase'] = 'search_replace';
			}
		}

		return $data;
	}

	/**
	 * Phase: Verify backup integrity.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error
	 */
	private function phase_verify( $data ) {
		$this->update_progress( 5, __( 'Verifying backup integrity...', '5dp-backup-restore' ) );

		$manifest   = $data['manifest'];
		$backup_dir = $data['backup_dir'];

		FiveDPBR_Logger::file_debug( 'restore', sprintf(
			'Phase verify: backup_dir=%s, fdpbr_source=%s, restore_db=%s, restore_files=%s',
			$backup_dir,
			! empty( $data['fdpbr_source'] ) ? $data['fdpbr_source'] : 'none',
			$data['restore_db'] ? 'YES' : 'NO',
			$data['restore_files'] ? 'YES' : 'NO'
		) );

		// Skip checksum verification for .fdpbr archive restores (checksums refer to
		// separate DB/ZIP files that don't exist when restoring from a self-contained archive).
		if ( empty( $data['fdpbr_source'] ) ) {
			$result = FiveDPBR_Backup_Manifest::verify( $manifest, $backup_dir );

			if ( is_wp_error( $result ) ) {
				FiveDPBR_Logger::error( 'restore', 'Backup integrity check failed: ' . $result->get_error_message() );
				return $result;
			}
		}

		// Determine first phase.
		if ( ! empty( $data['fdpbr_source'] ) ) {
			// Must unpack the .fdpbr archive first before restoring files/DB.
			$data['phase'] = 'fdpbr_unpack';
		} elseif ( $data['restore_files'] && ! empty( $manifest['files']['chunks'] ) ) {
			$data['phase'] = 'extract';

			$chunk_paths = array();
			foreach ( $manifest['files']['chunks'] as $chunk ) {
				$chunk_paths[] = trailingslashit( $backup_dir ) . $chunk['file'];
			}

			$data['extract_state'] = FiveDPBR_File_Extractor::init_extract_state( $chunk_paths, ABSPATH );
		} elseif ( $data['restore_db'] && ! empty( $manifest['database']['file'] ) ) {
			$data['phase'] = 'database';
		} else {
			return true; // Nothing to restore.
		}

		return $data;
	}

	/**
	 * Phase: Extract files.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error
	 */
	private function phase_extract( $data ) {
		$state = $data['extract_state'];
		$done  = $state['chunks_done'];
		$total = $state['total_chunks'];

		$this->update_progress(
			10 + (int) ( ( $done / max( $total, 1 ) ) * 40 ),
			sprintf(
				/* translators: 1: Chunks done, 2: Total chunks */
				__( 'Extracting files (%1$d/%2$d chunks)...', '5dp-backup-restore' ),
				$done,
				$total
			)
		);

		$result = FiveDPBR_File_Extractor::extract_chunk( $state );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		if ( true === $result ) {
			// Files extracted, move to DB import.
			$data['extract_state'] = $state;

			if ( $data['restore_db'] && ! empty( $data['manifest']['database']['file'] ) ) {
				$data['phase'] = 'database';
			} elseif ( ! empty( $data['search_replace'] ) ) {
				$data['phase'] = 'search_replace';
			} else {
				$data['phase'] = 'cleanup';
			}

			return $data;
		}

		$data['extract_state'] = is_array( $result ) ? $result : $state;
		return $data;
	}

	/**
	 * Phase: Import database.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error
	 */
	private function phase_database( $data ) {
		$manifest   = $data['manifest'];
		$backup_dir = trailingslashit( $data['backup_dir'] );
		$sql_file   = $backup_dir . $manifest['database']['file'];

		FiveDPBR_Logger::file_debug( 'restore', sprintf(
			'Phase database: importing %s (size=%s)',
			$sql_file,
			file_exists( $sql_file ) ? size_format( filesize( $sql_file ) ) : 'NOT FOUND'
		) );

		$this->update_progress( 55, __( 'Importing database...', '5dp-backup-restore' ) );

		// Save state to file BEFORE DB import — the import will destroy the
		// fdpbr_jobs table, so this file is the only reliable state after import.
		$post_db_data = $data;
		if ( ! empty( $data['search_replace'] ) ) {
			$post_db_data['phase'] = 'search_replace';
		} else {
			$post_db_data['phase'] = 'cleanup';
		}
		$this->save_restore_state( $this->job_id, $post_db_data, 85, __( 'Database imported, finalizing...', '5dp-backup-restore' ) );

		// Import the entire SQL file in one go. Chunked importing is NOT safe
		// here because the SQL contains DROP TABLE for fdpbr_jobs — the job record
		// would be destroyed mid-import, and subsequent AJAX polls would fail with
		// "Job not found." By importing atomically, we can reinstate the job record
		// immediately after the import completes.
		@set_time_limit( 0 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$result = FiveDPBR_DB_Importer::import_full( $sql_file );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		// The DB import replaced ALL tables (wp_options, fdpbr_jobs, etc.).
		// We must reinstate critical records before anything else.
		FiveDPBR_Logger::file_debug( 'restore', 'Database import complete, reinstating job record and session.' );
		$this->reinstate_after_db_import( $data );

		if ( ! empty( $data['search_replace'] ) ) {
			$data['phase'] = 'search_replace';
		} else {
			$data['phase'] = 'cleanup';
		}

		return $data;
	}

	/**
	 * Re-inject the current user's auth session after DB import.
	 *
	 * The database import replaces wp_users and wp_usermeta, which invalidates
	 * the admin's auth cookie. This method restores the user's password hash
	 * and session tokens so the cookie remains valid.
	 *
	 * @param array $data Job data containing _auth_preserve.
	 */
	private function preserve_user_session( $data ) {
		if ( empty( $data['_auth_preserve'] ) ) {
			return;
		}

		$auth = $data['_auth_preserve'];

		if ( empty( $auth['user_login'] ) || empty( $auth['user_pass'] ) ) {
			return;
		}

		global $wpdb;

		// Flush object cache — stale after full table replacement.
		wp_cache_flush();

		// Find user by login in the newly imported database.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$user_id = $wpdb->get_var(
			$wpdb->prepare( "SELECT ID FROM {$wpdb->users} WHERE user_login = %s", $auth['user_login'] )
		);

		if ( ! $user_id ) {
			// User doesn't exist in backup — insert with admin capabilities.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$wpdb->users,
				array(
					'user_login'      => $auth['user_login'],
					'user_pass'       => $auth['user_pass'],
					'user_email'      => $auth['user_email'],
					'user_registered' => current_time( 'mysql', true ),
					'user_status'     => 0,
				)
			);
			$user_id = $wpdb->insert_id;

			if ( ! $user_id ) {
				FiveDPBR_Logger::warning( 'restore', 'Could not re-create admin user after DB import.' );
				return;
			}

			// Grant administrator role.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$wpdb->usermeta,
				array(
					'user_id'    => $user_id,
					'meta_key'   => $wpdb->prefix . 'capabilities', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
					'meta_value' => serialize( array( 'administrator' => true ) ), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value,WordPress.PHP.DiscouragedPHPFunctions.serialize_serialize
				)
			);
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->insert(
				$wpdb->usermeta,
				array(
					'user_id'    => $user_id,
					'meta_key'   => $wpdb->prefix . 'user_level', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
					'meta_value' => '10', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				)
			);
		} else {
			// User exists — update password hash to match current auth cookie.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->update(
				$wpdb->users,
				array( 'user_pass' => $auth['user_pass'] ),
				array( 'ID' => $user_id )
			);
		}

		// Restore session tokens so the existing cookie validates.
		if ( ! empty( $auth['session_tokens'] ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$existing = $wpdb->get_var(
				$wpdb->prepare(
					"SELECT umeta_id FROM {$wpdb->usermeta} WHERE user_id = %d AND meta_key = 'session_tokens'",
					$user_id
				)
			);

			$serialized = maybe_serialize( $auth['session_tokens'] );

			if ( $existing ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->update(
					$wpdb->usermeta,
					array( 'meta_value' => $serialized ), // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
					array( 'user_id' => $user_id, 'meta_key' => 'session_tokens' ) // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				);
			} else {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->insert(
					$wpdb->usermeta,
					array(
						'user_id'    => $user_id,
						'meta_key'   => 'session_tokens', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
						'meta_value' => $serialized, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
					)
				);
			}
		}

		// Flush again so WordPress picks up the restored session data.
		wp_cache_flush();

		FiveDPBR_Logger::info( 'restore', sprintf( 'Preserved admin session for user "%s" after DB import.', $auth['user_login'] ) );
	}

	/**
	 * Reinstate critical records after DB import.
	 *
	 * The SQL import drops and recreates ALL tables, which destroys:
	 * 1. The current restore job record (fdpbr_jobs table replaced).
	 * 2. Plugin activation status (active_plugins in wp_options replaced).
	 * 3. The admin's auth session (wp_users/wp_usermeta replaced).
	 *
	 * This method restores all three so that:
	 * - Progress polling can find the job.
	 * - The plugin's AJAX handlers are registered on subsequent requests.
	 * - The admin stays logged in.
	 *
	 * @param array $data Job data.
	 */
	private function reinstate_after_db_import( $data ) {
		global $wpdb;

		// Flush stale object cache from before the import.
		wp_cache_flush();

		// 1. Ensure this plugin stays active in the new database.
		//    The backup's active_plugins may not include this plugin.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$raw = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT option_value FROM {$wpdb->options} WHERE option_name = %s",
				'active_plugins'
			)
		);

		$active = maybe_unserialize( $raw );
		if ( ! is_array( $active ) ) {
			$active = array();
		}

		$basename = FDPBR_PLUGIN_BASENAME;
		if ( ! in_array( $basename, $active, true ) ) {
			$active[] = $basename;
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->update(
				$wpdb->options,
				array( 'option_value' => maybe_serialize( $active ) ),
				array( 'option_name' => 'active_plugins' )
			);
			FiveDPBR_Logger::info( 'restore', 'Re-activated plugin in new database.' );
		}

		// 2. Re-insert the current restore job record.
		//    The fdpbr_jobs table was replaced by the backup's version.
		$table = $wpdb->prefix . 'fdpbr_jobs';

		// Verify the table exists (backup may not include it if plugin wasn't active on source).
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$table_exists = $wpdb->get_var(
			$wpdb->prepare( 'SHOW TABLES LIKE %s', $table )
		);

		if ( ! $table_exists ) {
			// Re-create plugin tables.
			FiveDPBR_Activator::create_tables();
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->replace(
			$table,
			array(
				'job_id'           => $this->job_id,
				'type'             => 'restore',
				'status'           => 'running',
				'progress_percent' => 85,
				'current_step'     => __( 'Database imported, finalizing...', '5dp-backup-restore' ),
				'data'             => wp_json_encode( $data ),
				'attempts'         => 0,
				'max_attempts'     => 3,
				'heartbeat'        => current_time( 'mysql', true ),
				'created_at'       => current_time( 'mysql', true ),
			),
			array( '%s', '%s', '%s', '%d', '%s', '%s', '%d', '%d', '%s', '%s' )
		);

		FiveDPBR_Logger::info( 'restore', sprintf( 'Re-inserted job record %s after DB import.', $this->job_id ) );

		// 3. Preserve admin session (user password hash + session tokens).
		$this->preserve_user_session( $data );

		// Flush again so subsequent queries use the updated records.
		wp_cache_flush();
	}

	/**
	 * Phase: Search and replace.
	 *
	 * @param array $data Job data.
	 * @return array
	 */
	private function phase_search_replace( $data ) {
		$this->update_progress( 90, __( 'Running search & replace...', '5dp-backup-restore' ) );

		$pairs = $data['search_replace'];

		if ( ! empty( $pairs ) ) {
			FiveDPBR_Logger::file_debug( 'restore', sprintf( 'Search-replace: %d pairs', count( $pairs ) ) );
			foreach ( $pairs as $i => $pair ) {
				FiveDPBR_Logger::file_debug( 'restore', sprintf( '  Pair %d: "%s" → "%s"', $i + 1, $pair['search'], $pair['replace'] ) );
			}
			$report = FiveDPBR_Search_Replace::run_multiple( $pairs );
			FiveDPBR_Logger::file_debug( 'restore', sprintf(
				'Search-replace done: %d tables, %d rows affected, %d changes, %d errors',
				$report['tables'],
				$report['rows_affected'],
				$report['changes'],
				count( $report['errors'] )
			) );
		} else {
			FiveDPBR_Logger::file_debug( 'restore', 'Search-replace: no pairs configured, skipping.' );
		}

		$data['phase'] = 'cleanup';
		return $data;
	}

	/**
	 * Phase: Cleanup and finalize.
	 *
	 * @param array $data Job data.
	 * @return true
	 */
	private function phase_cleanup( $data ) {
		$this->update_progress( 95, __( 'Finalizing restore...', '5dp-backup-restore' ) );

		FiveDPBR_Logger::file_debug( 'restore', 'Phase cleanup: flushing rewrite rules, caches, transients, cleaning uploads.' );

		// Flush rewrite rules.
		flush_rewrite_rules();

		// Clear all caches.
		wp_cache_flush();

		// Clear transients.
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query(
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_%' OR option_name LIKE '_site_transient_%'"
		);

		// Keep the restore token file alive — the frontend needs it for the
		// final "completed" response via the token-based chunk endpoint.
		// Schedule a one-time cron event to delete it + state file after 5 minutes.
		if ( ! empty( $data['_restore_token_file'] ) ) {
			wp_schedule_single_event(
				time() + 300,
				'fdpbr_cleanup_restore_token',
				array( $data['_restore_token_file'] )
			);
		}

		// Clean the state file now — the completion response will be sent before this returns.
		$state_file = self::get_state_file_path();
		if ( file_exists( $state_file ) ) {
			@unlink( $state_file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}

		// Clean up extracted files from the uploads directory.
		$upload_dir = FiveDPBR_Environment::get_backup_dir() . '/uploads';
		if ( is_dir( $upload_dir ) ) {
			$root_preserve = array(
				rtrim( str_replace( '\\', '/', $upload_dir ), '/' ) . '/.htaccess',
				rtrim( str_replace( '\\', '/', $upload_dir ), '/' ) . '/index.php',
			);
			$iter = new RecursiveIteratorIterator(
				new RecursiveDirectoryIterator( $upload_dir, RecursiveDirectoryIterator::SKIP_DOTS ),
				RecursiveIteratorIterator::CHILD_FIRST
			);
			foreach ( $iter as $item ) {
				$path = str_replace( '\\', '/', $item->getPathname() );
				if ( $item->isFile() && ! in_array( $path, $root_preserve, true ) ) {
					@unlink( $item->getPathname() ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				} elseif ( $item->isDir() ) {
					@rmdir( $item->getPathname() ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				}
			}
		}

		// Remove debug log if it exists.
		$debug_log = FiveDPBR_Environment::get_backup_dir() . '/restore-debug.log';
		if ( file_exists( $debug_log ) ) {
			@unlink( $debug_log ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}

		FiveDPBR_Logger::info( 'restore', 'Restore completed successfully.' );
		FiveDPBR_Logger::file_debug( 'restore', 'Restore completed successfully.' );

		return true;
	}

	// =========================================================================
	// AJAX Handlers
	// =========================================================================

	/**
	 * Register AJAX handlers.
	 */
	public function register_ajax() {
		add_action( 'wp_ajax_fdpbr_start_restore', array( $this, 'ajax_start_restore' ) );
		add_action( 'wp_ajax_fdpbr_upload_backup_chunk', array( $this, 'ajax_upload_chunk' ) );
		add_action( 'wp_ajax_fdpbr_get_uploaded_files', array( $this, 'ajax_get_uploaded_files' ) );
		add_action( 'wp_ajax_fdpbr_get_active_restore_job', array( $this, 'ajax_get_active_restore_job' ) );
		add_action( 'wp_ajax_fdpbr_clean_uploads', array( $this, 'ajax_clean_uploads' ) );

		// Token-based nopriv endpoints — survive session invalidation after DB import.
		add_action( 'wp_ajax_fdpbr_restore_progress_token', array( $this, 'ajax_restore_progress_token' ) );
		add_action( 'wp_ajax_nopriv_fdpbr_restore_progress_token', array( $this, 'ajax_restore_progress_token' ) );

		// Token-based chunk processing — allows frontend-driven restore to continue after session loss.
		add_action( 'wp_ajax_fdpbr_restore_chunk_token', array( $this, 'ajax_restore_chunk_token' ) );
		add_action( 'wp_ajax_nopriv_fdpbr_restore_chunk_token', array( $this, 'ajax_restore_chunk_token' ) );

		// Deferred cleanup of the restore token file.
		add_action( 'fdpbr_cleanup_restore_token', array( $this, 'cleanup_restore_token' ) );
	}

	/**
	 * Delete the restore token file (called via scheduled event).
	 *
	 * @param string $file Path to the token file.
	 */
	public function cleanup_restore_token( $file ) {
		if ( ! empty( $file ) && file_exists( $file ) ) {
			@unlink( $file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}
		// Also clean up the state file.
		$state_file = self::get_state_file_path();
		if ( file_exists( $state_file ) ) {
			@unlink( $state_file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}
	}

	/**
	 * Get the path to the restore state file.
	 *
	 * @return string
	 */
	private static function get_state_file_path() {
		return FiveDPBR_Environment::get_backup_dir() . '/restore-state.php';
	}

	/**
	 * Save restore job state to a file.
	 *
	 * This file survives database replacement (unlike fdpbr_jobs table).
	 * Inspired by AIOWPM which uses wp_options + secret key rather than
	 * a custom DB table for restore state.
	 *
	 * @param string $job_id  Job ID.
	 * @param array  $data    Job data.
	 * @param int    $percent Progress percent.
	 * @param string $step    Current step description.
	 */
	private function save_restore_state( $job_id, $data, $percent = 0, $step = '' ) {
		$state = array(
			'job_id'           => $job_id,
			'type'             => 'restore',
			'status'           => 'running',
			'progress_percent' => $percent,
			'current_step'     => $step,
			'data'             => $data,
		);

		$file = self::get_state_file_path();
		$guard = '<' . '?php exit; ?' . '>';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $file, $guard . wp_json_encode( $state ) );
	}

	/**
	 * Load restore job state from the file fallback.
	 *
	 * @param string $job_id Job ID to validate.
	 * @return object|null Job-like object or null.
	 */
	private static function load_restore_state( $job_id ) {
		$file = self::get_state_file_path();

		if ( ! file_exists( $file ) ) {
			return null;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$raw = file_get_contents( $file );
		// Strip PHP guard (14 bytes).
		$json  = substr( $raw, 14 );
		$state = json_decode( $json, true );

		if ( ! is_array( $state ) || empty( $state['job_id'] ) ) {
			return null;
		}

		if ( $state['job_id'] !== $job_id ) {
			return null;
		}

		// Return as object to match FiveDPBR_Job_Manager::get_job() shape.
		return (object) array(
			'job_id'           => $state['job_id'],
			'type'             => $state['type'],
			'status'           => $state['status'],
			'progress_percent' => $state['progress_percent'],
			'current_step'     => $state['current_step'],
			'data'             => wp_json_encode( $state['data'] ),
		);
	}

	/**
	 * AJAX: Start restore.
	 */
	public function ajax_start_restore() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$backup_id     = isset( $_POST['backup_id'] ) ? sanitize_text_field( wp_unslash( $_POST['backup_id'] ) ) : '';
		$backup_file   = isset( $_POST['backup_file'] ) ? wp_unslash( $_POST['backup_file'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$restore_db    = isset( $_POST['restore_db'] ) ? (bool) $_POST['restore_db'] : true;
		$restore_files = isset( $_POST['restore_files'] ) ? (bool) $_POST['restore_files'] : true;

		$args = array(
			'backup_id'     => $backup_id,
			'restore_db'    => $restore_db,
			'restore_files' => $restore_files,
		);

		// Uploaded file flow: backup_id is empty but backup_file is set.
		if ( empty( $backup_id ) && ! empty( $backup_file ) ) {
			$upload_dir  = FiveDPBR_Environment::get_backup_dir() . '/uploads';
			$backup_file = realpath( $backup_file );

			// Security: ensure the file is inside the uploads directory.
			if ( ! $backup_file || strpos( $backup_file, realpath( $upload_dir ) ) !== 0 ) {
				wp_send_json_error( array( 'message' => __( 'Invalid backup file path.', '5dp-backup-restore' ) ) );
			}

			if ( ! is_file( $backup_file ) ) {
				wp_send_json_error( array( 'message' => __( 'Uploaded backup file not found.', '5dp-backup-restore' ) ) );
			}

			// Read manifest embedded in the .fdpbr header.
			$manifest = FiveDPBR_Packager::read_manifest( $backup_file );

			if ( is_wp_error( $manifest ) ) {
				wp_send_json_error( array( 'message' => $manifest->get_error_message() ) );
			}

			// Write manifest.json to the uploads directory so the restore engine can load it.
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			file_put_contents( $upload_dir . '/manifest.json', wp_json_encode( $manifest ) );

			$args['backup_dir'] = $upload_dir;
			$args['backup_id']  = 'uploaded_' . substr( md5( $backup_file ), 0, 8 );
			$args['fdpbr_source'] = $backup_file; // Mark as .fdpbr archive - skip checksum verify.

			// Auto-detect search-replace pairs from manifest URLs vs current site.
			// Uses get_migration_pairs() to generate all variations: plain URL,
			// protocol-relative, JSON-escaped (\/), URL-encoded, and file paths.
			$old_url = ! empty( $manifest['wordpress']['site_url'] )
				? untrailingslashit( $manifest['wordpress']['site_url'] )
				: '';
			$new_url = untrailingslashit( site_url() );

			if ( $old_url && $old_url !== $new_url ) {
				// Derive old ABSPATH from old URL path structure.
				// e.g. https://msrplugins.test → C:\laragon\www\msrplugins
				// We can't know the exact old path, but wp-content relative paths
				// are embedded in the DB. Use content dir paths for replacement.
				$old_content_url = ! empty( $manifest['wordpress']['home_url'] )
					? untrailingslashit( $manifest['wordpress']['home_url'] ) . '/wp-content'
					: $old_url . '/wp-content';
				$new_content_url = content_url();

				$sr_pairs = FiveDPBR_Search_Replace::get_migration_pairs( $old_url, $new_url );

				// Also replace home_url if different from site_url.
				if ( ! empty( $manifest['wordpress']['home_url'] ) ) {
					$old_home = untrailingslashit( $manifest['wordpress']['home_url'] );
					$new_home = untrailingslashit( home_url() );
					if ( $old_home !== $new_home && $old_home !== $old_url ) {
						$sr_pairs = array_merge(
							$sr_pairs,
							FiveDPBR_Search_Replace::get_migration_pairs( $old_home, $new_home )
						);
					}
				}

				$args['search_replace'] = $sr_pairs;

				FiveDPBR_Logger::file_debug( 'restore', sprintf(
					'Auto-detected search-replace: old_url=%s, new_url=%s, %d pairs',
					$old_url,
					$new_url,
					count( $sr_pairs )
				) );
			}
		}

		// Capture current user session data so we can re-inject it after DB import.
		// Without this, importing the database replaces wp_users + wp_usermeta tables,
		// invalidating the auth cookie and logging the user out mid-restore.
		$current_user = wp_get_current_user();
		if ( $current_user->ID ) {
			$args['_auth_preserve'] = array(
				'user_login'     => $current_user->user_login,
				'user_pass'      => $current_user->user_pass,
				'user_email'     => $current_user->user_email,
				'session_tokens' => get_user_meta( $current_user->ID, 'session_tokens', true ),
			);
		}

		// Generate a secret token for nonce-free progress polling.
		// Stored in a PHP file (with die() guard) so polling survives session loss.
		$restore_token = wp_generate_password( 32, false );
		$token_dir     = FiveDPBR_Environment::get_backup_dir();
		$token_file    = $token_dir . '/restore-token.php';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		$php_guard = '<' . '?php exit; ?' . '>';
		file_put_contents( $token_file, $php_guard . $restore_token );
		$args['_restore_token_file'] = $token_file;

		$result = $this->start( $args );

		if ( is_wp_error( $result ) ) {
			@unlink( $token_file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			wp_send_json_error( array( 'message' => $result->get_error_message() ) );
		}

		wp_send_json_success( array(
			'message'       => __( 'Restore started.', '5dp-backup-restore' ),
			'job_id'        => $result,
			'restore_token' => $restore_token,
		) );
	}

	/**
	 * AJAX: List backup files already present in the uploads directory.
	 */
	public function ajax_get_uploaded_files() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$upload_dir = FiveDPBR_Environment::get_backup_dir() . '/uploads';
		$files      = array();
		$skip       = array( '.htaccess', 'index.php', 'manifest.json' );
		$allowed    = array( 'fdpbr', 'zip', 'sql', 'gz' );

		if ( is_dir( $upload_dir ) ) {
			foreach ( (array) glob( $upload_dir . '/*' ) as $path ) {
				if ( ! is_file( $path ) ) {
					continue;
				}
				$name = basename( $path );
				if ( in_array( $name, $skip, true ) ) {
					continue;
				}
				// Only show recognised backup file types.
				$ext = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
				if ( ! in_array( $ext, $allowed, true ) ) {
					continue;
				}
				$files[] = array(
					'name'     => $name,
					'path'     => $path,
					'size'     => FiveDPBR_Helper::format_bytes( filesize( $path ) ),
					'modified' => gmdate( 'Y-m-d H:i', filemtime( $path ) ),
				);
			}
			// Sort newest first.
			usort( $files, function( $a, $b ) {
				return strcmp( $b['modified'], $a['modified'] );
			});
		}

		wp_send_json_success( array( 'files' => $files ) );
	}


	/**
	 * AJAX: Return the most recent active restore job (for resuming after page reload).
	 */
	public function ajax_get_active_restore_job() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$active_jobs = FiveDPBR_Job_Manager::get_active_jobs();
		$restore_job = null;

		foreach ( $active_jobs as $job ) {
			if ( 'restore' === $job->type ) {
				$restore_job = $job;
				break;
			}
		}

		if ( ! $restore_job ) {
			wp_send_json_success( array( 'job' => null ) );
		}

		wp_send_json_success( array(
			'job' => array(
				'job_id'  => $restore_job->job_id,
				'percent' => (int) $restore_job->progress_percent,
				'step'    => $restore_job->current_step,
				'status'  => $restore_job->status,
			),
		) );
	}

	/**
	 * AJAX: Token-based restore progress (works without auth).
	 *
	 * Validates via a secret stored in a PHP file rather than nonce/cookie.
	 * This allows the frontend to keep polling restore progress even after
	 * the database import invalidates the user's session.
	 */
	public function ajax_restore_progress_token() {
		$token  = isset( $_POST['restore_token'] ) ? sanitize_text_field( wp_unslash( $_POST['restore_token'] ) ) : '';
		$job_id = isset( $_POST['job_id'] ) ? sanitize_text_field( wp_unslash( $_POST['job_id'] ) ) : '';

		if ( empty( $token ) || empty( $job_id ) ) {
			wp_send_json_error( array( 'message' => 'Missing token or job ID.' ) );
		}

		// Read the stored token from the PHP-guarded file.
		$token_file = FiveDPBR_Environment::get_backup_dir() . '/restore-token.php';

		if ( ! file_exists( $token_file ) ) {
			wp_send_json_error( array( 'message' => 'No active restore.' ) );
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$stored = file_get_contents( $token_file );
		// Strip the PHP die() guard (14 bytes).
		$stored_token = substr( $stored, 14 );

		if ( ! hash_equals( $stored_token, $token ) ) {
			wp_send_json_error( array( 'message' => 'Invalid token.' ) );
		}

		// Try DB first, fall back to state file.
		$job = FiveDPBR_Job_Manager::get_job( $job_id );

		if ( ! $job ) {
			$job = self::load_restore_state( $job_id );
		}

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
	 * AJAX: Token-based chunk processing (works without auth).
	 *
	 * Validates via the restore token, then processes one chunk of restore work
	 * and returns progress. This lets the frontend drive restore processing even
	 * after the database import invalidates the user's session, and serves as a
	 * reliable fallback when WP Cron loopback is broken.
	 */
	public function ajax_restore_chunk_token() {
		$token  = isset( $_POST['restore_token'] ) ? sanitize_text_field( wp_unslash( $_POST['restore_token'] ) ) : '';
		$job_id = isset( $_POST['job_id'] ) ? sanitize_text_field( wp_unslash( $_POST['job_id'] ) ) : '';

		if ( empty( $token ) || empty( $job_id ) ) {
			wp_send_json_error( array( 'message' => 'Missing token or job ID.' ) );
		}

		// Validate the token.
		$token_file = FiveDPBR_Environment::get_backup_dir() . '/restore-token.php';

		if ( ! file_exists( $token_file ) ) {
			wp_send_json_error( array( 'message' => 'No active restore.' ) );
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$stored       = file_get_contents( $token_file );
		$stored_token = substr( $stored, 14 );

		if ( ! hash_equals( $stored_token, $token ) ) {
			wp_send_json_error( array( 'message' => 'Invalid token.' ) );
		}

		// Try DB first, fall back to state file (DB job record is destroyed during DB import).
		$job         = FiveDPBR_Job_Manager::get_job( $job_id );
		$from_file   = false;

		if ( ! $job ) {
			$job       = self::load_restore_state( $job_id );
			$from_file = true;
		}

		if ( ! $job ) {
			wp_send_json_error( array( 'message' => 'Job not found.' ) );
		}

		// If job is already completed or failed, just return its status.
		if ( in_array( $job->status, array( 'completed', 'failed' ), true ) ) {
			wp_send_json_success( array(
				'status'  => $job->status,
				'percent' => (int) $job->progress_percent,
				'step'    => $job->current_step,
			) );
		}

		// Process one chunk of restore work.
		$this->job_id     = $job_id;
		$this->job_data   = json_decode( $job->data, true ) ?: array();
		$this->start_time = microtime( true );

		if ( ! $from_file ) {
			FiveDPBR_Job_Manager::update_job( $job_id, array( 'status' => 'running' ) );
			FiveDPBR_Job_Manager::heartbeat( $job_id );
		}

		// Catch any fatal errors during chunk processing so we always send a response.
		try {
			$result = $this->process_chunk( $this->job_data );
		} catch ( \Throwable $e ) {
			FiveDPBR_Logger::error( 'restore', 'Fatal error during token chunk: ' . $e->getMessage() );
			wp_send_json_error( array(
				'message' => $e->getMessage(),
				'status'  => 'failed',
			) );
		}

		if ( is_wp_error( $result ) ) {
			$this->handle_failure( $result );
			wp_send_json_error( array(
				'message' => $result->get_error_message(),
				'status'  => 'failed',
			) );
		}

		if ( true === $result ) {
			$this->handle_completion();
			// Clean up state file on completion.
			$state_file = self::get_state_file_path();
			if ( file_exists( $state_file ) ) {
				@unlink( $state_file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			}
			wp_send_json_success( array(
				'status'  => 'completed',
				'percent' => 100,
				'step'    => __( 'Complete', '5dp-backup-restore' ),
			) );
		}

		// Save progress.
		if ( is_array( $result ) ) {
			$this->job_data = $result;
		}

		// Save to state file (always reliable) + try DB (may or may not work).
		$step = isset( $this->job_data['phase'] ) ? $this->job_data['phase'] : 'processing';
		$this->save_restore_state( $job_id, $this->job_data, 90, $step );

		FiveDPBR_Job_Manager::update_job( $job_id, array(
			'data' => wp_json_encode( $this->job_data ),
		) );

		$progress = FiveDPBR_Job_Manager::get_job( $job_id );

		wp_send_json_success( array(
			'status'  => 'running',
			'percent' => $progress ? (int) $progress->progress_percent : 90,
			'step'    => $progress ? $progress->current_step : __( 'Processing...', '5dp-backup-restore' ),
		) );
	}

	/**
	 * AJAX: Clean the uploads directory.
	 *
	 * Removes all files from wp-content/5dp-backups/uploads/ to free space
	 * after aborted or completed restores. Preserves .htaccess and index.php.
	 */
	public function ajax_clean_uploads() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$upload_dir = FiveDPBR_Environment::get_backup_dir() . '/uploads';

		if ( ! is_dir( $upload_dir ) ) {
			wp_send_json_success( array(
				'message' => __( 'Upload directory is already clean.', '5dp-backup-restore' ),
				'deleted' => 0,
			) );
		}

		$deleted  = 0;
		$freed    = 0;

		// Only preserve .htaccess and index.php at the root of the uploads dir.
		// Files with those names inside extracted subdirectories must be deleted.
		$root_preserve = array(
			rtrim( str_replace( '\\', '/', $upload_dir ), '/' ) . '/.htaccess',
			rtrim( str_replace( '\\', '/', $upload_dir ), '/' ) . '/index.php',
		);

		$iter = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator( $upload_dir, RecursiveDirectoryIterator::SKIP_DOTS ),
			RecursiveIteratorIterator::CHILD_FIRST
		);

		foreach ( $iter as $item ) {
			$path = str_replace( '\\', '/', $item->getPathname() );

			if ( $item->isFile() ) {
				if ( in_array( $path, $root_preserve, true ) ) {
					continue;
				}
				$freed += $item->getSize();
				@unlink( $item->getPathname() ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				++$deleted;
			} elseif ( $item->isDir() ) {
				@rmdir( $item->getPathname() ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			}
		}

		FiveDPBR_Logger::info( 'restore', sprintf( 'Cleaned uploads directory: %d files removed, %s freed.', $deleted, FiveDPBR_Helper::format_bytes( $freed ) ) );

		wp_send_json_success( array(
			'message' => sprintf(
				/* translators: 1: files deleted, 2: space freed */
				__( 'Cleaned up %1$d files (%2$s freed).', '5dp-backup-restore' ),
				$deleted,
				FiveDPBR_Helper::format_bytes( $freed )
			),
			'deleted' => $deleted,
		) );
	}

	/**
	 * AJAX: Handle chunked backup file upload.
	 */
	public function ajax_upload_chunk() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		if ( empty( $_FILES['file'] ) ) {
			wp_send_json_error( array( 'message' => __( 'No file uploaded.', '5dp-backup-restore' ) ) );
		}

		$chunk_index = isset( $_POST['chunk_index'] ) ? (int) $_POST['chunk_index'] : 0;
		$total_chunks = isset( $_POST['total_chunks'] ) ? (int) $_POST['total_chunks'] : 1;
		$filename    = isset( $_POST['filename'] ) ? sanitize_file_name( wp_unslash( $_POST['filename'] ) ) : 'backup.zip';

		$upload_dir = FiveDPBR_Environment::get_backup_dir() . '/uploads';
		FiveDPBR_Helper::ensure_directory( $upload_dir );

		$target_file = $upload_dir . '/' . $filename;

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$tmp_file = isset( $_FILES['file']['tmp_name'] ) ? $_FILES['file']['tmp_name'] : '';

		if ( ! $tmp_file || ! is_uploaded_file( $tmp_file ) ) {
			wp_send_json_error( array( 'message' => __( 'Invalid upload.', '5dp-backup-restore' ) ) );
		}

		// Append chunk to target file.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$out = fopen( $target_file, 0 === $chunk_index ? 'w' : 'a' );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$in  = fopen( $tmp_file, 'r' );

		if ( $out && $in ) {
			while ( $data = fread( $in, 8192 ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread,WordPress.CodeAnalysis.AssignmentInCondition.FoundInWhileCondition
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
				fwrite( $out, $data );
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			fclose( $in );
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			fclose( $out );
		}

		$is_complete = ( $chunk_index + 1 ) >= $total_chunks;

		wp_send_json_success( array(
			'message'  => $is_complete ? __( 'Upload complete.', '5dp-backup-restore' ) : __( 'Chunk received.', '5dp-backup-restore' ),
			'complete' => $is_complete,
			'file'     => $is_complete ? $target_file : '',
		) );
	}
}
