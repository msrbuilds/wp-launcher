<?php
/**
 * Chunked file extractor.
 *
 * Extracts ZIP archive chunks to restore WordPress files.
 * Fallback chain: ZipArchive → PclZip → exec(unzip)
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/restore
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_File_Extractor
 *
 * @since 1.0.0
 */
class FiveDPBR_File_Extractor {

	/**
	 * Initialize extraction state.
	 *
	 * @param array  $chunk_paths Array of ZIP chunk file paths.
	 * @param string $dest_dir    Destination directory.
	 * @return array Initial state.
	 */
	public static function init_extract_state( $chunk_paths, $dest_dir ) {
		return array(
			'chunk_paths'  => $chunk_paths,
			'chunk_index'  => 0,
			'dest_dir'     => trailingslashit( $dest_dir ),
			'total_chunks' => count( $chunk_paths ),
			'chunks_done'  => 0,
		);
	}

	/**
	 * Extract one chunk.
	 *
	 * @param array $state Current state.
	 * @return array|true Updated state or true if complete.
	 */
	public static function extract_chunk( &$state ) {
		$idx = $state['chunk_index'];

		if ( $idx >= count( $state['chunk_paths'] ) ) {
			return true;
		}

		$chunk_path = $state['chunk_paths'][ $idx ];
		$dest_dir   = $state['dest_dir'];

		if ( ! file_exists( $chunk_path ) ) {
			return new WP_Error( 'chunk_missing', sprintf( __( 'Archive chunk not found: %s', '5dp-backup-restore' ), $chunk_path ) );
		}

		$method = FiveDPBR_Environment::get_extraction_method();
		$result = self::extract_archive( $chunk_path, $dest_dir, $method );

		if ( is_wp_error( $result ) ) {
			// Try fallback.
			$fallback = self::get_fallback_method( $method );
			if ( $fallback ) {
				FiveDPBR_Logger::warning( 'restore', sprintf( 'Extraction method %s failed, trying %s.', $method, $fallback ) );
				$result = self::extract_archive( $chunk_path, $dest_dir, $fallback );
			}
		}

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$state['chunk_index'] = $idx + 1;
		$state['chunks_done'] = $idx + 1;

		return $state['chunk_index'] >= count( $state['chunk_paths'] ) ? true : $state;
	}

	/**
	 * Extract an archive using the specified method.
	 *
	 * @param string $archive  Archive file path.
	 * @param string $dest_dir Destination directory.
	 * @param string $method   Extraction method.
	 * @return true|WP_Error
	 */
	private static function extract_archive( $archive, $dest_dir, $method ) {
		switch ( $method ) {
			case 'zip_archive':
				return self::extract_zip_archive( $archive, $dest_dir );

			case 'pcl_zip':
				return self::extract_pcl_zip( $archive, $dest_dir );

			case 'exec_unzip':
				return self::extract_exec_unzip( $archive, $dest_dir );

			default:
				return new WP_Error( 'no_method', __( 'No extraction method available.', '5dp-backup-restore' ) );
		}
	}

	/**
	 * Extract via ZipArchive.
	 *
	 * @param string $archive  Archive path.
	 * @param string $dest_dir Destination.
	 * @return true|WP_Error
	 */
	private static function extract_zip_archive( $archive, $dest_dir ) {
		$zip    = new ZipArchive();
		$result = $zip->open( $archive );

		if ( true !== $result ) {
			return new WP_Error( 'zip_open', sprintf( __( 'Cannot open ZIP: error %d', '5dp-backup-restore' ), $result ) );
		}

		$extracted = $zip->extractTo( $dest_dir );
		$zip->close();

		if ( ! $extracted ) {
			return new WP_Error( 'zip_extract', __( 'Failed to extract ZIP archive.', '5dp-backup-restore' ) );
		}

		return true;
	}

	/**
	 * Extract via PclZip.
	 *
	 * @param string $archive  Archive path.
	 * @param string $dest_dir Destination.
	 * @return true|WP_Error
	 */
	private static function extract_pcl_zip( $archive, $dest_dir ) {
		require_once ABSPATH . 'wp-admin/includes/class-pclzip.php';

		$zip    = new PclZip( $archive );
		$result = $zip->extract( PCLZIP_OPT_PATH, $dest_dir );

		if ( 0 === $result ) {
			return new WP_Error( 'pclzip_error', $zip->errorInfo( true ) );
		}

		return true;
	}

	/**
	 * Extract via exec(unzip).
	 *
	 * @param string $archive  Archive path.
	 * @param string $dest_dir Destination.
	 * @return true|WP_Error
	 */
	private static function extract_exec_unzip( $archive, $dest_dir ) {
		$cmd = sprintf(
			'unzip -o %s -d %s 2>&1',
			escapeshellarg( $archive ),
			escapeshellarg( $dest_dir )
		);

		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.system_calls_exec
		@exec( $cmd, $output, $code );

		if ( 0 !== $code ) {
			return new WP_Error( 'unzip_failed', implode( "\n", $output ) );
		}

		return true;
	}

	/**
	 * Get a fallback extraction method.
	 *
	 * @param string $current Current method that failed.
	 * @return string|false
	 */
	private static function get_fallback_method( $current ) {
		$chain = array( 'zip_archive', 'exec_unzip', 'pcl_zip' );
		$idx   = array_search( $current, $chain, true );

		if ( false === $idx || $idx >= count( $chain ) - 1 ) {
			return false;
		}

		return $chain[ $idx + 1 ];
	}
}
