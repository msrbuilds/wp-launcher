<?php
/**
 * FDPBR Packager — Custom .fdpbr binary format with chunked streaming.
 *
 * Creates single-file backups by streaming files directly into the archive
 * without intermediate ZIP compression. Supports resumable chunked writes
 * for large sites.
 *
 * Format specification (v1):
 * ┌──────────────────────────────────────────┐
 * │  Magic       : 5 bytes  "FDPBR"          │
 * │  Version     : 1 byte   0x01             │
 * │  Manifest len: 4 bytes  uint32 LE        │
 * │  Manifest    : variable JSON             │
 * ├──────────────────────────────────────────┤
 * │  For each entry:                         │
 * │    Prefix len : 2 bytes  uint16 LE       │
 * │    Prefix     : variable UTF-8 (path)    │
 * │    Name len   : 2 bytes  uint16 LE       │
 * │    Name       : variable UTF-8 (filename)│
 * │    Data size  : 8 bytes  uint64 LE       │
 * │    Data       : variable raw bytes       │
 * ├──────────────────────────────────────────┤
 * │  Footer      : 8 bytes  "FDPBREND"       │
 * └──────────────────────────────────────────┘
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/backup
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Packager
 *
 * @since 1.0.0
 */
class FiveDPBR_Packager {

	const MAGIC      = 'FDPBR';
	const VERSION    = 1;
	const FOOTER     = 'FDPBREND';
	const EXTENSION  = '.fdpbr';

	/**
	 * Stream copy buffer size (512 KB — matches AIOWPM for optimal I/O).
	 */
	const BUFFER_SIZE = 524288;

	/**
	 * Time limit per chunk in seconds.
	 */
	const CHUNK_TIMEOUT = 10;

	// =========================================================================
	// Chunked Streaming API (for backup engine)
	// =========================================================================

	/**
	 * Initialize a new .fdpbr archive and write header + manifest placeholder.
	 *
	 * @param string $output_path Full path for the .fdpbr file.
	 * @param array  $manifest    Manifest array (JSON-encoded into header).
	 * @return array Initial packaging state.
	 */
	public static function init_stream( $output_path, $manifest ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$fh = fopen( $output_path, 'wb' );

		if ( ! $fh ) {
			return new \WP_Error( 'fdpbr_open', __( 'Cannot create .fdpbr package file.', '5dp-backup-restore' ) );
		}

		$manifest_json = wp_json_encode( $manifest );

		// ── Header ──────────────────────────────────────────────
		fwrite( $fh, self::MAGIC );                            // 5 bytes
		fwrite( $fh, pack( 'C', self::VERSION ) );             // 1 byte
		fwrite( $fh, pack( 'V', strlen( $manifest_json ) ) );  // 4 bytes uint32 LE
		fwrite( $fh, $manifest_json );                         // variable

		$data_offset = ftell( $fh );

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $fh );

		return array(
			'output_path'       => $output_path,
			'data_offset'       => $data_offset,
			'archive_offset'    => $data_offset,  // Current write position.
			'entry_count'       => 0,
			'total_bytes'       => 0,
		);
	}

	/**
	 * Stream files directly into the .fdpbr archive (one chunk of work).
	 *
	 * Reads from a CSV file list and writes raw file data into the archive.
	 * Resumes from the last position on each call.
	 *
	 * @param array  $state      Current packaging state.
	 * @param string $filelist   Path to CSV file list (relative_path per line).
	 * @param string $source_dir Source root directory (e.g. ABSPATH).
	 * @param int    $list_offset Byte offset into the file list CSV.
	 * @param int    $file_offset Byte offset into the current file being streamed.
	 * @return array|true Updated state or true if all files written.
	 */
	public static function stream_chunk( $state, $filelist, $source_dir, $list_offset = 0, $file_offset = 0 ) {
		$source_dir = trailingslashit( $source_dir );
		$start_time = microtime( true );

		// Open archive for appending.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$archive_fh = fopen( $state['output_path'], 'r+b' );
		if ( ! $archive_fh ) {
			return new \WP_Error( 'fdpbr_open', __( 'Cannot open .fdpbr archive for writing.', '5dp-backup-restore' ) );
		}
		fseek( $archive_fh, $state['archive_offset'] );

		// Open file list.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$list_fh = fopen( $filelist, 'rb' );
		if ( ! $list_fh ) {
			fclose( $archive_fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			return new \WP_Error( 'fdpbr_list', __( 'Cannot open file list.', '5dp-backup-restore' ) );
		}

		if ( $list_offset > 0 ) {
			fseek( $list_fh, $list_offset );
		}

		$completed      = true;
		$new_list_offset = $list_offset;
		$new_file_offset = 0;

		while ( ( $line = fgets( $list_fh ) ) !== false ) {
			$relative = trim( $line );
			if ( '' === $relative ) {
				$new_list_offset = ftell( $list_fh );
				continue;
			}

			$full_path = $source_dir . $relative;

			if ( ! is_file( $full_path ) || ! is_readable( $full_path ) ) {
				$new_list_offset = ftell( $list_fh );
				continue;
			}

			$file_size = filesize( $full_path );

			// Split into prefix (directory) and name (filename).
			$name   = basename( $relative );
			$prefix = dirname( $relative );
			if ( '.' === $prefix ) {
				$prefix = '';
			}

			// If this is a resumed partial file, we already wrote the header.
			if ( $file_offset > 0 ) {
				// Resume streaming from offset.
				$remaining = $file_size - $file_offset;
			} else {
				// Write entry header.
				fwrite( $archive_fh, pack( 'v', strlen( $prefix ) ) ); // 2 bytes
				fwrite( $archive_fh, $prefix );                        // variable
				fwrite( $archive_fh, pack( 'v', strlen( $name ) ) );   // 2 bytes
				fwrite( $archive_fh, $name );                          // variable
				fwrite( $archive_fh, pack( 'P', $file_size ) );        // 8 bytes uint64 LE

				$remaining   = $file_size;
				$file_offset = 0;
			}

			// Stream file data.
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
			$sfh = fopen( $full_path, 'rb' );
			if ( $sfh ) {
				if ( $file_offset > 0 ) {
					fseek( $sfh, $file_offset );
				}

				while ( $remaining > 0 ) {
					$read_size = min( self::BUFFER_SIZE, $remaining );
					// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
					$data = fread( $sfh, $read_size );
					if ( false === $data || '' === $data ) {
						break;
					}
					fwrite( $archive_fh, $data );
					$bytes_read = strlen( $data );
					$remaining -= $bytes_read;
					$file_offset += $bytes_read;
					$state['total_bytes'] += $bytes_read;

					// Check time limit.
					if ( ( microtime( true ) - $start_time ) > self::CHUNK_TIMEOUT ) {
						// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
						fclose( $sfh );

						$state['archive_offset'] = ftell( $archive_fh );
						// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
						fclose( $archive_fh );
						fclose( $list_fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

						// Still has remaining data in this file.
						if ( $remaining > 0 ) {
							return array(
								'state'       => $state,
								'list_offset' => $new_list_offset, // Same line — not yet advanced.
								'file_offset' => $file_offset,
							);
						}

						$state['entry_count']++;
						return array(
							'state'       => $state,
							'list_offset' => ftell( $list_fh ),
							'file_offset' => 0,
						);
					}
				}

				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
				fclose( $sfh );
			}

			$state['entry_count']++;
			$file_offset     = 0;
			$new_list_offset = ftell( $list_fh );

			// Check time limit between files.
			if ( ( microtime( true ) - $start_time ) > self::CHUNK_TIMEOUT ) {
				$completed = false;
				break;
			}
		}

		$state['archive_offset'] = ftell( $archive_fh );

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $archive_fh );
		fclose( $list_fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

		if ( $completed ) {
			return true;
		}

		return array(
			'state'       => $state,
			'list_offset' => $new_list_offset,
			'file_offset' => 0,
		);
	}

	/**
	 * Add a single file entry to an open .fdpbr archive.
	 *
	 * Used for adding the SQL dump or other special files.
	 *
	 * @param array  $state     Current packaging state.
	 * @param string $file_path Absolute path to the file.
	 * @param string $name      Entry name in the archive.
	 * @param string $prefix    Entry prefix/path in the archive.
	 * @return array Updated state.
	 */
	public static function add_file( $state, $file_path, $name, $prefix = '' ) {
		if ( ! file_exists( $file_path ) || ! is_readable( $file_path ) ) {
			return $state;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$fh = fopen( $state['output_path'], 'r+b' );
		if ( ! $fh ) {
			return $state;
		}
		fseek( $fh, $state['archive_offset'] );

		$file_size = filesize( $file_path );

		// Entry header.
		fwrite( $fh, pack( 'v', strlen( $prefix ) ) );
		fwrite( $fh, $prefix );
		fwrite( $fh, pack( 'v', strlen( $name ) ) );
		fwrite( $fh, $name );
		fwrite( $fh, pack( 'P', $file_size ) );

		// Stream data.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$sfh = fopen( $file_path, 'rb' );
		if ( $sfh ) {
			while ( ! feof( $sfh ) ) {
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
				$chunk = fread( $sfh, self::BUFFER_SIZE );
				if ( false !== $chunk && '' !== $chunk ) {
					fwrite( $fh, $chunk );
				}
			}
			fclose( $sfh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		}

		$state['archive_offset'] = ftell( $fh );
		$state['entry_count']++;
		$state['total_bytes'] += $file_size;

		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

		return $state;
	}

	/**
	 * Finalize the archive by writing the footer.
	 *
	 * @param array $state Current packaging state.
	 * @return true|WP_Error
	 */
	public static function finalize( $state ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$fh = fopen( $state['output_path'], 'r+b' );
		if ( ! $fh ) {
			return new \WP_Error( 'fdpbr_finalize', __( 'Cannot finalize .fdpbr archive.', '5dp-backup-restore' ) );
		}

		fseek( $fh, $state['archive_offset'] );
		fwrite( $fh, self::FOOTER ); // 8 bytes
		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

		return true;
	}

	// =========================================================================
	// File List Helpers
	// =========================================================================

	/**
	 * Enumerate files and write to a CSV file list.
	 *
	 * Decouples file scanning from archiving for better performance.
	 *
	 * @param string $output_file Path to write CSV file list.
	 * @param string $source_dir  Source directory to scan.
	 * @param array  $include     Paths to include (empty = all).
	 * @param array  $exclude     Paths to exclude.
	 * @return int Number of files found.
	 */
	public static function enumerate_files( $output_file, $source_dir, $include = array(), $exclude = array() ) {
		$source_dir = trailingslashit( wp_normalize_path( $source_dir ) );
		$count      = 0;

		// Merge default excludes.
		$all_excludes = array_merge( FiveDPBR_File_Archiver::DEFAULT_EXCLUDES, $exclude );

		// Get settings-based excludes.
		$settings = get_option( 'fdpbr_settings', array() );
		if ( ! empty( $settings['exclude_paths'] ) ) {
			$custom = array_filter( array_map( 'trim', explode( "\n", $settings['exclude_paths'] ) ) );
			$all_excludes = array_merge( $all_excludes, $custom );
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$fh = fopen( $output_file, 'wb' );
		if ( ! $fh ) {
			return 0;
		}

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

				// Include filter.
				if ( ! empty( $include ) ) {
					$matched = false;
					foreach ( $include as $pattern ) {
						$pattern = trim( $pattern );
						if ( ! empty( $pattern ) && ( strpos( $relative, $pattern ) === 0 || fnmatch( $pattern, $relative ) ) ) {
							$matched = true;
							break;
						}
					}
					if ( ! $matched ) {
						continue;
					}
				}

				// Exclude filter.
				if ( FiveDPBR_Helper::is_path_excluded( $relative, $all_excludes ) ) {
					continue;
				}

				fwrite( $fh, $relative . "\n" );
				++$count;
			}
		} catch ( \Exception $e ) {
			FiveDPBR_Logger::warning( 'backup', 'File enumerate error: ' . $e->getMessage() );
		}

		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

		FiveDPBR_Logger::info( 'backup', sprintf( 'Enumerated %d files to %s.', $count, basename( $output_file ) ) );

		return $count;
	}

	// =========================================================================
	// Read / Extract / Validate (unchanged from v1)
	// =========================================================================

	/**
	 * Read the manifest from a .fdpbr file without extracting.
	 *
	 * @param string $package_path Path to .fdpbr file.
	 * @return array|WP_Error Manifest array or error.
	 */
	public static function read_manifest( $package_path ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$fh = fopen( $package_path, 'rb' );

		if ( ! $fh ) {
			return new \WP_Error( 'fdpbr_read', __( 'Cannot open .fdpbr package.', '5dp-backup-restore' ) );
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
		$magic = fread( $fh, 5 );
		if ( self::MAGIC !== $magic ) {
			fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			return new \WP_Error( 'fdpbr_magic', __( 'Not a valid .fdpbr package.', '5dp-backup-restore' ) );
		}

		fread( $fh, 1 ); // version // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread

		$header = unpack( 'Vmanifest_len', fread( $fh, 4 ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
		$manifest_json = fread( $fh, $header['manifest_len'] );
		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

		$manifest = json_decode( $manifest_json, true );

		if ( null === $manifest ) {
			return new \WP_Error( 'fdpbr_manifest', __( 'Corrupt manifest in .fdpbr package.', '5dp-backup-restore' ) );
		}

		return $manifest;
	}

	/**
	 * Extract a .fdpbr package to a directory.
	 *
	 * @param string $package_path Path to .fdpbr file.
	 * @param string $extract_dir  Destination directory.
	 * @return array|WP_Error Manifest array or error.
	 */
	public static function extract( $package_path, $extract_dir ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$fh = fopen( $package_path, 'rb' );

		if ( ! $fh ) {
			return new \WP_Error( 'fdpbr_read', __( 'Cannot open .fdpbr package.', '5dp-backup-restore' ) );
		}

		// Read header.
		$magic = fread( $fh, 5 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
		if ( self::MAGIC !== $magic ) {
			fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			return new \WP_Error( 'fdpbr_magic', __( 'Not a valid .fdpbr package.', '5dp-backup-restore' ) );
		}

		fread( $fh, 1 ); // version // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread

		$header        = unpack( 'Vmanifest_len', fread( $fh, 4 ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
		$manifest_json = fread( $fh, $header['manifest_len'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
		$manifest      = json_decode( $manifest_json, true );

		$extract_dir = trailingslashit( $extract_dir );
		FiveDPBR_Helper::ensure_directory( $extract_dir );

		// Save manifest.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $extract_dir . 'manifest.json', $manifest_json );

		// Extract entries until we hit the footer or EOF.
		while ( ! feof( $fh ) ) {
			// Peek ahead to check for footer.
			$peek = fread( $fh, 2 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
			if ( false === $peek || strlen( $peek ) < 2 ) {
				break;
			}

			// Check if this is the start of the footer "FD" from "FDPBREND".
			if ( 'FD' === $peek ) {
				$rest = fread( $fh, 6 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
				if ( 'PBREND' === $rest ) {
					break; // Reached footer.
				}
				// Not footer — rewind and parse as entry.
				fseek( $fh, -8, SEEK_CUR );
				$peek = fread( $fh, 2 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
			}

			// Read entry: prefix_len(2) + prefix + name_len(2) + name + size(8) + data.
			$prefix_len_data = unpack( 'vlen', $peek );
			$prefix_len      = $prefix_len_data['len'];
			$prefix          = '';
			if ( $prefix_len > 0 ) {
				$prefix = fread( $fh, $prefix_len ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
			}

			$name_len_data = unpack( 'vlen', fread( $fh, 2 ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
			$name          = fread( $fh, $name_len_data['len'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
			$size_data     = unpack( 'Psize', fread( $fh, 8 ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
			$file_size     = $size_data['size'];

			// Build safe destination path.
			$relative  = ( '' !== $prefix ) ? $prefix . '/' . $name : $name;
			$safe_name = ltrim( str_replace( '..', '', $relative ), '/' );
			$dest_path = $extract_dir . $safe_name;

			FiveDPBR_Helper::ensure_directory( dirname( $dest_path ) );

			// Stream write to file.
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
			$out = fopen( $dest_path, 'wb' );

			if ( $out ) {
				$remaining = $file_size;
				while ( $remaining > 0 ) {
					$read_size = min( self::BUFFER_SIZE, $remaining );
					// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
					$data = fread( $fh, $read_size );
					if ( false === $data ) {
						break;
					}
					fwrite( $out, $data );
					$remaining -= strlen( $data );
				}
				fclose( $out ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			} else {
				fseek( $fh, $file_size, SEEK_CUR );
			}
		}

		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

		return $manifest;
	}

	/**
	 * Validate a .fdpbr file by checking magic bytes and footer.
	 *
	 * @param string $package_path Path to .fdpbr file.
	 * @return true|WP_Error
	 */
	public static function validate( $package_path ) {
		if ( ! file_exists( $package_path ) ) {
			return new \WP_Error( 'fdpbr_missing', __( 'Package file not found.', '5dp-backup-restore' ) );
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$fh = fopen( $package_path, 'rb' );
		if ( ! $fh ) {
			return new \WP_Error( 'fdpbr_read', __( 'Cannot open package.', '5dp-backup-restore' ) );
		}

		$magic = fread( $fh, 5 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
		if ( self::MAGIC !== $magic ) {
			fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			return new \WP_Error( 'fdpbr_magic', __( 'Not a valid .fdpbr package.', '5dp-backup-restore' ) );
		}

		fseek( $fh, -8, SEEK_END );
		$footer = fread( $fh, 8 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

		if ( self::FOOTER !== $footer ) {
			return new \WP_Error( 'fdpbr_footer', __( 'Package file appears truncated or corrupt.', '5dp-backup-restore' ) );
		}

		return true;
	}

	/**
	 * Get the output filename for a backup.
	 *
	 * @param string $backup_id Backup ID.
	 * @param string $type      Backup type.
	 * @return string Filename with extension.
	 */
	public static function get_filename( $backup_id, $type = 'full' ) {
		$site_name = sanitize_file_name( str_replace( array( 'http://', 'https://', 'www.' ), '', home_url() ) );
		$date      = gmdate( 'Y-m-d' );

		return sprintf( '%s-%s-%s%s', $site_name, $date, $type, self::EXTENSION );
	}
}
