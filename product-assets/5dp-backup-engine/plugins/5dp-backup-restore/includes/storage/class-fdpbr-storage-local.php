<?php
/**
 * Local filesystem storage provider.
 *
 * Stores backup files on the local server using WP_Filesystem.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Storage_Local
 *
 * @since 1.0.0
 */
class FiveDPBR_Storage_Local implements FiveDPBR_Storage_Interface {

	/**
	 * Get the provider slug.
	 *
	 * @return string
	 */
	public function get_slug() {
		return 'local';
	}

	/**
	 * Get the provider display name.
	 *
	 * @return string
	 */
	public function get_name() {
		return __( 'Local Storage', '5dp-backup-restore' );
	}

	/**
	 * Test the connection to the local storage directory.
	 *
	 * Verifies the backup directory exists and is writable.
	 *
	 * @param array $credentials Provider credentials (unused for local).
	 * @return true|WP_Error
	 */
	public function test_connection( $credentials ) {
		$backup_dir = FiveDPBR_Environment::get_backup_dir();

		$wp_filesystem = $this->get_filesystem();

		if ( ! $wp_filesystem ) {
			return new WP_Error(
				'filesystem_error',
				__( 'Could not initialize WordPress filesystem.', '5dp-backup-restore' )
			);
		}

		// Create the directory if it does not exist.
		if ( ! $wp_filesystem->is_dir( $backup_dir ) ) {
			if ( ! wp_mkdir_p( $backup_dir ) ) {
				return new WP_Error(
					'dir_create_failed',
					/* translators: %s: directory path */
					sprintf( __( 'Could not create backup directory: %s', '5dp-backup-restore' ), $backup_dir )
				);
			}
		}

		// Verify writability with a test file.
		$test_file = trailingslashit( $backup_dir ) . '.fdpbr-write-test-' . wp_generate_password( 8, false );

		if ( ! $wp_filesystem->put_contents( $test_file, 'test', FS_CHMOD_FILE ) ) {
			return new WP_Error(
				'dir_not_writable',
				/* translators: %s: directory path */
				sprintf( __( 'Backup directory is not writable: %s', '5dp-backup-restore' ), $backup_dir )
			);
		}

		$wp_filesystem->delete( $test_file );

		return true;
	}

	/**
	 * Upload (copy) a file to the local backup directory.
	 *
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path (relative to backup dir).
	 * @param array  $credentials Provider credentials (unused for local).
	 * @return true|WP_Error
	 */
	public function upload( $local_path, $remote_path, $credentials ) {
		$wp_filesystem = $this->get_filesystem();

		if ( ! $wp_filesystem ) {
			return new WP_Error(
				'filesystem_error',
				__( 'Could not initialize WordPress filesystem.', '5dp-backup-restore' )
			);
		}

		if ( ! $wp_filesystem->exists( $local_path ) ) {
			return new WP_Error(
				'file_not_found',
				/* translators: %s: file path */
				sprintf( __( 'Source file not found: %s', '5dp-backup-restore' ), $local_path )
			);
		}

		$destination = $this->resolve_path( $remote_path );

		// Ensure destination directory exists.
		$dest_dir = dirname( $destination );
		if ( ! $wp_filesystem->is_dir( $dest_dir ) ) {
			if ( ! wp_mkdir_p( $dest_dir ) ) {
				return new WP_Error(
					'dir_create_failed',
					/* translators: %s: directory path */
					sprintf( __( 'Could not create destination directory: %s', '5dp-backup-restore' ), $dest_dir )
				);
			}
		}

		if ( ! $wp_filesystem->copy( $local_path, $destination, true, FS_CHMOD_FILE ) ) {
			return new WP_Error(
				'copy_failed',
				/* translators: %s: file path */
				sprintf( __( 'Failed to copy file to: %s', '5dp-backup-restore' ), $destination )
			);
		}

		return true;
	}

	/**
	 * Upload a chunk of a file.
	 *
	 * Local storage does not support chunked uploads, so this falls back
	 * to a full copy on the first chunk (offset 0).
	 *
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path (relative to backup dir).
	 * @param array  $credentials Provider credentials (unused for local).
	 * @param int    $offset      Byte offset to resume from.
	 * @return int|WP_Error Bytes uploaded or error.
	 */
	public function upload_chunk( $local_path, $remote_path, $credentials, $offset = 0 ) {
		// Local storage performs a full copy; chunking is not needed.
		if ( 0 === $offset ) {
			$result = $this->upload( $local_path, $remote_path, $credentials );

			if ( is_wp_error( $result ) ) {
				return $result;
			}

			return filesize( $local_path );
		}

		// If offset > 0 the file was already copied in full.
		return filesize( $local_path );
	}

	/**
	 * Download (copy) a file from the local backup directory.
	 *
	 * @param string $remote_path Remote file path (relative to backup dir).
	 * @param string $local_path  Local destination path.
	 * @param array  $credentials Provider credentials (unused for local).
	 * @return true|WP_Error
	 */
	public function download( $remote_path, $local_path, $credentials ) {
		$wp_filesystem = $this->get_filesystem();

		if ( ! $wp_filesystem ) {
			return new WP_Error(
				'filesystem_error',
				__( 'Could not initialize WordPress filesystem.', '5dp-backup-restore' )
			);
		}

		$source = $this->resolve_path( $remote_path );

		if ( ! $wp_filesystem->exists( $source ) ) {
			return new WP_Error(
				'file_not_found',
				/* translators: %s: file path */
				sprintf( __( 'Backup file not found: %s', '5dp-backup-restore' ), $source )
			);
		}

		// Ensure destination directory exists.
		$dest_dir = dirname( $local_path );
		if ( ! $wp_filesystem->is_dir( $dest_dir ) ) {
			if ( ! wp_mkdir_p( $dest_dir ) ) {
				return new WP_Error(
					'dir_create_failed',
					/* translators: %s: directory path */
					sprintf( __( 'Could not create destination directory: %s', '5dp-backup-restore' ), $dest_dir )
				);
			}
		}

		if ( ! $wp_filesystem->copy( $source, $local_path, true, FS_CHMOD_FILE ) ) {
			return new WP_Error(
				'copy_failed',
				/* translators: %s: file path */
				sprintf( __( 'Failed to copy file to: %s', '5dp-backup-restore' ), $local_path )
			);
		}

		return true;
	}

	/**
	 * Delete a file from the local backup directory.
	 *
	 * @param string $remote_path Remote file path (relative to backup dir).
	 * @param array  $credentials Provider credentials (unused for local).
	 * @return true|WP_Error
	 */
	public function delete( $remote_path, $credentials ) {
		$wp_filesystem = $this->get_filesystem();

		if ( ! $wp_filesystem ) {
			return new WP_Error(
				'filesystem_error',
				__( 'Could not initialize WordPress filesystem.', '5dp-backup-restore' )
			);
		}

		$file = $this->resolve_path( $remote_path );

		if ( ! $wp_filesystem->exists( $file ) ) {
			// File already gone — treat as success.
			return true;
		}

		if ( ! $wp_filesystem->delete( $file ) ) {
			return new WP_Error(
				'delete_failed',
				/* translators: %s: file path */
				sprintf( __( 'Failed to delete file: %s', '5dp-backup-restore' ), $file )
			);
		}

		return true;
	}

	/**
	 * List files in the local backup directory.
	 *
	 * @param string $prefix      Subdirectory prefix within the backup dir.
	 * @param array  $credentials Provider credentials (unused for local).
	 * @return array|WP_Error Array of file info or error.
	 */
	public function list_files( $prefix, $credentials ) {
		$wp_filesystem = $this->get_filesystem();

		if ( ! $wp_filesystem ) {
			return new WP_Error(
				'filesystem_error',
				__( 'Could not initialize WordPress filesystem.', '5dp-backup-restore' )
			);
		}

		$dir = $this->resolve_path( $prefix );

		if ( ! $wp_filesystem->is_dir( $dir ) ) {
			return array();
		}

		$pattern = trailingslashit( $dir ) . '*';
		$entries = glob( $pattern );

		if ( false === $entries ) {
			return new WP_Error(
				'list_failed',
				/* translators: %s: directory path */
				sprintf( __( 'Failed to list files in: %s', '5dp-backup-restore' ), $dir )
			);
		}

		$files = array();

		foreach ( $entries as $entry ) {
			if ( is_file( $entry ) ) {
				$files[] = array(
					'name'     => basename( $entry ),
					'path'     => $entry,
					'size'     => filesize( $entry ),
					'modified' => filemtime( $entry ),
				);
			}
		}

		// Sort by modification time, newest first.
		usort(
			$files,
			function ( $a, $b ) {
				return $b['modified'] - $a['modified'];
			}
		);

		return $files;
	}

	/**
	 * Get the credential fields required by this provider.
	 *
	 * Local storage does not require any credentials.
	 *
	 * @return array Empty array.
	 */
	public function get_credential_fields() {
		return array();
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	/**
	 * Resolve a relative path to an absolute path within the backup directory.
	 *
	 * If the path is already absolute, it is returned as-is.
	 *
	 * @param string $path Relative or absolute path.
	 * @return string Absolute path.
	 */
	private function resolve_path( $path ) {
		$backup_dir = FiveDPBR_Environment::get_backup_dir();

		// If the path is already absolute and within the backup dir, use it directly.
		if ( 0 === strpos( $path, $backup_dir ) ) {
			return $path;
		}

		return trailingslashit( $backup_dir ) . ltrim( $path, '/\\' );
	}

	/**
	 * Initialize and return the WP_Filesystem instance.
	 *
	 * @return WP_Filesystem_Base|false Filesystem instance or false on failure.
	 */
	private function get_filesystem() {
		global $wp_filesystem;

		if ( $wp_filesystem instanceof WP_Filesystem_Base ) {
			return $wp_filesystem;
		}

		require_once ABSPATH . 'wp-admin/includes/file.php';

		if ( ! WP_Filesystem() ) {
			return false;
		}

		return $wp_filesystem;
	}
}
