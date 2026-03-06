<?php
/**
 * Backup manifest generator.
 *
 * Creates and reads JSON manifest files that describe backup contents,
 * checksums, and metadata needed for restore operations.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/backup
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Backup_Manifest
 *
 * @since 1.0.0
 */
class FiveDPBR_Backup_Manifest {

	/**
	 * Generate a manifest for a completed backup.
	 *
	 * @param array $args Manifest data.
	 * @return array Manifest array.
	 */
	public static function generate( $args ) {
		$defaults = array(
			'backup_id'   => '',
			'name'        => '',
			'type'        => 'full',
			'db_file'     => '',
			'file_chunks' => array(),
			'tables'      => array(),
			'total_size'  => 0,
			'db_size'     => 0,
			'files_size'  => 0,
		);

		$args = wp_parse_args( $args, $defaults );

		$manifest = array(
			'version'     => FDPBR_VERSION,
			'backup_id'   => $args['backup_id'],
			'name'        => $args['name'],
			'type'        => $args['type'],
			'created_at'  => gmdate( 'Y-m-d\TH:i:s\Z' ),

			// WordPress info.
			'wordpress'   => array(
				'version'    => get_bloginfo( 'version' ),
				'site_url'   => site_url(),
				'home_url'   => home_url(),
				'db_prefix'  => $GLOBALS['wpdb']->prefix,
				'db_charset' => DB_CHARSET,
				'locale'     => get_locale(),
				'multisite'  => is_multisite(),
			),

			// PHP & Server info.
			'environment' => array(
				'php_version' => PHP_VERSION,
				'os'          => PHP_OS,
				'web_server'  => FiveDPBR_Environment::detect_web_server(),
			),

			// Files manifest.
			'files'       => array(
				'chunks'    => array(),
				'count'     => 0,
				'total_size' => (int) $args['files_size'],
			),

			// Database manifest.
			'database'    => array(
				'file'      => basename( $args['db_file'] ),
				'tables'    => $args['tables'],
				'size'      => (int) $args['db_size'],
				'checksum'  => '',
			),

			// Totals.
			'total_size'  => (int) $args['total_size'],

			// Checksums (SHA256).
			'checksums'   => array(),
		);

		// Compute database file checksum.
		if ( ! empty( $args['db_file'] ) && file_exists( $args['db_file'] ) ) {
			$manifest['database']['checksum'] = hash_file( 'sha256', $args['db_file'] );
			$manifest['database']['size']     = filesize( $args['db_file'] );
			$manifest['checksums'][ basename( $args['db_file'] ) ] = $manifest['database']['checksum'];
		}

		// Compute file chunk checksums.
		foreach ( $args['file_chunks'] as $chunk_path ) {
			$name = basename( $chunk_path );
			$size = file_exists( $chunk_path ) ? filesize( $chunk_path ) : 0;
			$hash = file_exists( $chunk_path ) ? hash_file( 'sha256', $chunk_path ) : '';

			$manifest['files']['chunks'][] = array(
				'file'     => $name,
				'size'     => $size,
				'checksum' => $hash,
			);

			$manifest['checksums'][ $name ] = $hash;
			++$manifest['files']['count'];
		}

		// Recalculate total size.
		$manifest['total_size'] = $manifest['database']['size'];
		foreach ( $manifest['files']['chunks'] as $chunk ) {
			$manifest['total_size'] += $chunk['size'];
		}

		return $manifest;
	}

	/**
	 * Save a manifest to a JSON file.
	 *
	 * @param array  $manifest Manifest data.
	 * @param string $path     File path.
	 * @return bool
	 */
	public static function save( $manifest, $path ) {
		$json = wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		return false !== file_put_contents( $path, $json );
	}

	/**
	 * Load a manifest from a JSON file.
	 *
	 * @param string $path File path.
	 * @return array|WP_Error
	 */
	public static function load( $path ) {
		if ( ! file_exists( $path ) ) {
			return new WP_Error( 'manifest_missing', __( 'Manifest file not found.', '5dp-backup-restore' ) );
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$json = file_get_contents( $path );

		if ( false === $json ) {
			return new WP_Error( 'manifest_read', __( 'Cannot read manifest file.', '5dp-backup-restore' ) );
		}

		$manifest = json_decode( $json, true );

		if ( null === $manifest ) {
			return new WP_Error( 'manifest_invalid', __( 'Invalid manifest JSON.', '5dp-backup-restore' ) );
		}

		return $manifest;
	}

	/**
	 * Verify backup integrity against manifest checksums.
	 *
	 * @param array  $manifest   Manifest data.
	 * @param string $backup_dir Directory containing backup files.
	 * @return true|WP_Error
	 */
	public static function verify( $manifest, $backup_dir ) {
		$backup_dir = trailingslashit( $backup_dir );
		$errors     = array();

		if ( empty( $manifest['checksums'] ) ) {
			return new WP_Error( 'no_checksums', __( 'No checksums in manifest.', '5dp-backup-restore' ) );
		}

		foreach ( $manifest['checksums'] as $filename => $expected_hash ) {
			$file_path = $backup_dir . $filename;

			if ( ! file_exists( $file_path ) ) {
				$errors[] = sprintf( __( 'Missing file: %s', '5dp-backup-restore' ), $filename );
				continue;
			}

			$actual_hash = hash_file( 'sha256', $file_path );

			if ( $actual_hash !== $expected_hash ) {
				$errors[] = sprintf( __( 'Checksum mismatch: %s', '5dp-backup-restore' ), $filename );
			}
		}

		if ( ! empty( $errors ) ) {
			return new WP_Error( 'integrity_check_failed', implode( '; ', $errors ), $errors );
		}

		return true;
	}
}
