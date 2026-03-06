<?php
/**
 * Chunked file archiver.
 *
 * Creates ZIP archives of WordPress files in chunks to handle
 * sites of any size within memory and time constraints.
 *
 * Fallback chain: ZipArchive → PclZip → exec(zip) → exec(tar)
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/backup
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_File_Archiver
 *
 * @since 1.0.0
 */
class FiveDPBR_File_Archiver {

	/**
	 * Default paths to exclude from backups.
	 *
	 * @var array
	 */
	const DEFAULT_EXCLUDES = array(
		'wp-content/5dp-backups/',
		'wp-content/cache/',
		'wp-content/backups/',
		'wp-content/upgrade/',
		'wp-content/debug.log',
		'wp-content/advanced-cache.php',
		'wp-content/object-cache.php',
		'wp-content/db.php',
		'.git/',
		'node_modules/',
	);

	/**
	 * Initialize archive state for chunked processing.
	 *
	 * @param string $output_dir  Directory to store archive chunks.
	 * @param string $backup_id   Backup identifier.
	 * @param string $source_dir  Source directory (usually ABSPATH).
	 * @param array  $include     Specific paths to include (empty = all).
	 * @param array  $exclude     Paths to exclude.
	 * @return array Initial state.
	 */
	public static function init_archive_state( $output_dir, $backup_id, $source_dir = '', $include = array(), $exclude = array() ) {
		if ( empty( $source_dir ) ) {
			$source_dir = ABSPATH;
		}

		$source_dir = trailingslashit( wp_normalize_path( $source_dir ) );

		// Merge default and custom excludes.
		$all_excludes = array_merge( self::DEFAULT_EXCLUDES, $exclude );

		// Get settings-based excludes.
		$settings = get_option( 'fdpbr_settings', array() );
		if ( ! empty( $settings['exclude_paths'] ) ) {
			$custom = array_filter( array_map( 'trim', explode( "\n", $settings['exclude_paths'] ) ) );
			$all_excludes = array_merge( $all_excludes, $custom );
		}

		// Build file list.
		$files = self::scan_files( $source_dir, $include, $all_excludes );

		FiveDPBR_Logger::info( 'backup', sprintf( 'File archiver initialized: %d files found.', count( $files ) ) );

		return array(
			'output_dir'   => $output_dir,
			'backup_id'    => $backup_id,
			'source_dir'   => $source_dir,
			'files'        => $files,
			'file_index'   => 0,
			'chunk_index'  => 0,
			'chunk_paths'  => array(),
			'total_files'  => count( $files ),
			'files_done'   => 0,
			'total_size'   => 0,
		);
	}

	/**
	 * Process one archive chunk.
	 *
	 * @param array $state Current state.
	 * @return array|true Updated state or true if complete.
	 */
	public static function archive_chunk( &$state ) {
		$files      = $state['files'];
		$file_idx   = $state['file_index'];
		$chunk_idx  = $state['chunk_index'];
		$output_dir = $state['output_dir'];
		$backup_id  = $state['backup_id'];
		$source_dir = $state['source_dir'];

		if ( $file_idx >= count( $files ) ) {
			return true; // All files archived.
		}

		$chunk_size = FiveDPBR_Environment::get_file_chunk_size();
		$method     = FiveDPBR_Environment::get_archive_method();

		$chunk_file = $output_dir . '/' . $backup_id . '-files-' . $chunk_idx . '.zip';
		$current_size = 0;
		$files_in_chunk = array();

		// Collect files for this chunk.
		while ( $file_idx < count( $files ) && $current_size < $chunk_size ) {
			$file = $files[ $file_idx ];
			$full_path = $source_dir . $file;

			if ( file_exists( $full_path ) && is_file( $full_path ) ) {
				$file_size = filesize( $full_path );
				$current_size += $file_size;
				$files_in_chunk[] = array(
					'path'     => $full_path,
					'relative' => $file,
				);
				$state['total_size'] += $file_size;
			}

			++$file_idx;
		}

		if ( empty( $files_in_chunk ) ) {
			$state['file_index'] = $file_idx;
			return $file_idx >= count( $files ) ? true : $state;
		}

		// Create archive chunk.
		$result = self::create_archive( $chunk_file, $files_in_chunk, $method );

		if ( is_wp_error( $result ) ) {
			// Try fallback method.
			FiveDPBR_Logger::warning( 'backup', sprintf( 'Archive method %s failed, trying fallback.', $method ) );

			$fallback = self::get_fallback_method( $method );
			if ( $fallback ) {
				$result = self::create_archive( $chunk_file, $files_in_chunk, $fallback );
			}
		}

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$state['file_index']    = $file_idx;
		$state['chunk_index']   = $chunk_idx + 1;
		$state['chunk_paths'][] = $chunk_file;
		$state['files_done']   += count( $files_in_chunk );

		return $file_idx >= count( $files ) ? true : $state;
	}

	// =========================================================================
	// Archive Creation Methods
	// =========================================================================

	/**
	 * Create a ZIP archive using the specified method.
	 *
	 * @param string $output  Output file path.
	 * @param array  $files   Array of file entries with 'path' and 'relative' keys.
	 * @param string $method  Archive method.
	 * @return true|WP_Error
	 */
	private static function create_archive( $output, $files, $method ) {
		switch ( $method ) {
			case 'zip_archive':
				return self::create_zip_archive( $output, $files );

			case 'pcl_zip':
				return self::create_pcl_zip( $output, $files );

			case 'exec_zip':
				return self::create_exec_zip( $output, $files );

			default:
				return new WP_Error( 'no_archive_method', __( 'No archive method available.', '5dp-backup-restore' ) );
		}
	}

	/**
	 * Create archive via ZipArchive.
	 *
	 * @param string $output Output file path.
	 * @param array  $files  File entries.
	 * @return true|WP_Error
	 */
	private static function create_zip_archive( $output, $files ) {
		$zip = new ZipArchive();

		$result = $zip->open( $output, ZipArchive::CREATE | ZipArchive::OVERWRITE );

		if ( true !== $result ) {
			return new WP_Error( 'zip_open', sprintf( __( 'Cannot create ZIP file: error code %d', '5dp-backup-restore' ), $result ) );
		}

		foreach ( $files as $file ) {
			if ( is_readable( $file['path'] ) ) {
				$zip->addFile( $file['path'], $file['relative'] );
			}
		}

		$zip->close();

		return true;
	}

	/**
	 * Create archive via PclZip (bundled with WordPress).
	 *
	 * @param string $output Output file path.
	 * @param array  $files  File entries.
	 * @return true|WP_Error
	 */
	private static function create_pcl_zip( $output, $files ) {
		require_once ABSPATH . 'wp-admin/includes/class-pclzip.php';

		$zip = new PclZip( $output );

		$paths = array();
		foreach ( $files as $file ) {
			if ( is_readable( $file['path'] ) ) {
				$paths[] = $file['path'];
			}
		}

		if ( empty( $paths ) ) {
			return true;
		}

		// Determine common root for removal.
		$root = isset( $files[0]['path'] )
			? dirname( str_replace( $files[0]['relative'], '', $files[0]['path'] ) )
			: ABSPATH;

		$result = $zip->create( $paths, PCLZIP_OPT_REMOVE_PATH, $root );

		if ( 0 === $result ) {
			return new WP_Error( 'pclzip_error', $zip->errorInfo( true ) );
		}

		return true;
	}

	/**
	 * Create archive via exec(zip).
	 *
	 * @param string $output Output file path.
	 * @param array  $files  File entries.
	 * @return true|WP_Error
	 */
	private static function create_exec_zip( $output, $files ) {
		// Write file list to a temp file.
		$list_file = FiveDPBR_Environment::get_temp_dir() . '/fdpbr_filelist_' . uniqid() . '.txt';
		$list      = '';

		foreach ( $files as $file ) {
			if ( is_readable( $file['path'] ) ) {
				$list .= $file['relative'] . "\n";
			}
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $list_file, $list );

		// Determine source directory.
		$source = isset( $files[0]['path'] )
			? dirname( str_replace( $files[0]['relative'], '', $files[0]['path'] ) )
			: ABSPATH;

		$cmd = sprintf(
			'cd %s && zip -q %s -@ < %s 2>&1',
			escapeshellarg( $source ),
			escapeshellarg( $output ),
			escapeshellarg( $list_file )
		);

		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.system_calls_exec
		@exec( $cmd, $exec_output, $return_code );

		@unlink( $list_file );

		if ( 0 !== $return_code ) {
			return new WP_Error( 'exec_zip_failed', implode( "\n", $exec_output ) );
		}

		return true;
	}

	// =========================================================================
	// File Scanning
	// =========================================================================

	/**
	 * Scan files for backup.
	 *
	 * @param string $source_dir  Source directory.
	 * @param array  $include     Specific paths to include.
	 * @param array  $exclude     Paths to exclude.
	 * @return array Relative file paths.
	 */
	private static function scan_files( $source_dir, $include, $exclude ) {
		$source_dir = trailingslashit( wp_normalize_path( $source_dir ) );
		$files      = array();

		try {
			$iterator = new RecursiveIteratorIterator(
				new RecursiveDirectoryIterator(
					$source_dir,
					RecursiveDirectoryIterator::SKIP_DOTS | RecursiveDirectoryIterator::FOLLOW_SYMLINKS
				),
				RecursiveIteratorIterator::SELF_FIRST
			);

			foreach ( $iterator as $file ) {
				if ( ! $file->isFile() ) {
					continue;
				}

				$full_path = wp_normalize_path( $file->getPathname() );
				$relative  = str_replace( $source_dir, '', $full_path );

				// Check include filter.
				if ( ! empty( $include ) && ! self::matches_include( $relative, $include ) ) {
					continue;
				}

				// Check exclude filter.
				if ( FiveDPBR_Helper::is_path_excluded( $relative, $exclude ) ) {
					continue;
				}

				$files[] = $relative;
			}
		} catch ( Exception $e ) {
			FiveDPBR_Logger::warning( 'backup', 'File scan error: ' . $e->getMessage() );
		}

		return $files;
	}

	/**
	 * Check if a path matches include patterns.
	 *
	 * @param string $path     Relative path.
	 * @param array  $includes Include patterns.
	 * @return bool
	 */
	private static function matches_include( $path, $includes ) {
		foreach ( $includes as $pattern ) {
			$pattern = trim( $pattern );

			if ( empty( $pattern ) ) {
				continue;
			}

			if ( strpos( $path, $pattern ) === 0 || fnmatch( $pattern, $path ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Get a fallback archive method.
	 *
	 * @param string $current Current method that failed.
	 * @return string|false Fallback method or false.
	 */
	private static function get_fallback_method( $current ) {
		$chain = array( 'zip_archive', 'exec_zip', 'pcl_zip' );
		$idx   = array_search( $current, $chain, true );

		if ( false === $idx || $idx >= count( $chain ) - 1 ) {
			return false;
		}

		return $chain[ $idx + 1 ];
	}

	/**
	 * Get the total size of files that will be backed up.
	 *
	 * @param array $state Archive state.
	 * @return int Size in bytes.
	 */
	public static function get_estimated_size( $state ) {
		$total = 0;
		$source_dir = $state['source_dir'];

		foreach ( $state['files'] as $file ) {
			$full_path = $source_dir . $file;
			if ( file_exists( $full_path ) ) {
				$total += filesize( $full_path );
			}
		}

		return $total;
	}
}
