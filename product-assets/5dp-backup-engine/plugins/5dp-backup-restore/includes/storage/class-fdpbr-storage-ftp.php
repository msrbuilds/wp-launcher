<?php
/**
 * FTP storage provider.
 *
 * Stores backup files on a remote FTP server using PHP ftp_* functions.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Storage_FTP
 *
 * @since 1.0.0
 */
class FiveDPBR_Storage_FTP implements FiveDPBR_Storage_Interface {

	/**
	 * Default connection timeout in seconds.
	 *
	 * @var int
	 */
	const CONNECT_TIMEOUT = 30;

	/**
	 * Get the provider slug.
	 *
	 * @return string
	 */
	public function get_slug() {
		return 'ftp';
	}

	/**
	 * Get the provider display name.
	 *
	 * @return string
	 */
	public function get_name() {
		return __( 'FTP', '5dp-backup-restore' );
	}

	/**
	 * Test the connection to the FTP server.
	 *
	 * @param array $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function test_connection( $credentials ) {
		if ( ! function_exists( 'ftp_connect' ) ) {
			return new WP_Error(
				'ftp_not_available',
				__( 'The PHP FTP extension is not available on this server.', '5dp-backup-restore' )
			);
		}

		$conn = $this->connect( $credentials );

		if ( is_wp_error( $conn ) ) {
			return $conn;
		}

		// Verify remote path exists or can be created.
		$remote_path = $this->get_remote_path( $credentials );

		if ( ! empty( $remote_path ) && '/' !== $remote_path ) {
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			$current = @ftp_pwd( $conn );

			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			if ( ! @ftp_chdir( $conn, $remote_path ) ) {
				// Try to create the directory.
				// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				if ( ! @ftp_mkdir( $conn, $remote_path ) ) {
					ftp_close( $conn );
					return new WP_Error(
						'remote_path_failed',
						/* translators: %s: remote directory path */
						sprintf( __( 'Could not access or create remote path: %s', '5dp-backup-restore' ), $remote_path )
					);
				}
			}

			if ( $current ) {
				// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				@ftp_chdir( $conn, $current );
			}
		}

		ftp_close( $conn );

		return true;
	}

	/**
	 * Upload a file to the FTP server.
	 *
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function upload( $local_path, $remote_path, $credentials ) {
		if ( ! file_exists( $local_path ) ) {
			return new WP_Error(
				'file_not_found',
				/* translators: %s: file path */
				sprintf( __( 'Source file not found: %s', '5dp-backup-restore' ), $local_path )
			);
		}

		$conn = $this->connect( $credentials );

		if ( is_wp_error( $conn ) ) {
			return $conn;
		}

		$full_remote = $this->build_remote_path( $remote_path, $credentials );

		// Ensure remote directory exists.
		$remote_dir = dirname( $full_remote );
		$this->ftp_mkdir_recursive( $conn, $remote_dir );

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$result = @ftp_put( $conn, $full_remote, $local_path, FTP_BINARY );

		ftp_close( $conn );

		if ( ! $result ) {
			return new WP_Error(
				'upload_failed',
				/* translators: %s: remote file path */
				sprintf( __( 'Failed to upload file to FTP: %s', '5dp-backup-restore' ), $full_remote )
			);
		}

		return true;
	}

	/**
	 * Upload a chunk of a file to the FTP server.
	 *
	 * FTP supports resumable uploads via ftp_nb_fput with FTP_AUTORESUME.
	 *
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path.
	 * @param array  $credentials Provider credentials.
	 * @param int    $offset      Byte offset to resume from.
	 * @return int|WP_Error Bytes uploaded or error.
	 */
	public function upload_chunk( $local_path, $remote_path, $credentials, $offset = 0 ) {
		if ( ! file_exists( $local_path ) ) {
			return new WP_Error(
				'file_not_found',
				/* translators: %s: file path */
				sprintf( __( 'Source file not found: %s', '5dp-backup-restore' ), $local_path )
			);
		}

		$conn = $this->connect( $credentials );

		if ( is_wp_error( $conn ) ) {
			return $conn;
		}

		$full_remote = $this->build_remote_path( $remote_path, $credentials );
		$file_size   = filesize( $local_path );

		// Ensure remote directory exists.
		$remote_dir = dirname( $full_remote );
		$this->ftp_mkdir_recursive( $conn, $remote_dir );

		// Open local file and seek to offset.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$handle = fopen( $local_path, 'rb' );

		if ( ! $handle ) {
			ftp_close( $conn );
			return new WP_Error(
				'file_open_failed',
				/* translators: %s: file path */
				sprintf( __( 'Could not open local file: %s', '5dp-backup-restore' ), $local_path )
			);
		}

		if ( $offset > 0 ) {
			fseek( $handle, $offset );
		}

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$result = @ftp_fput( $conn, $full_remote, $handle, FTP_BINARY, $offset );

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $handle );
		ftp_close( $conn );

		if ( ! $result ) {
			return new WP_Error(
				'upload_chunk_failed',
				/* translators: %s: remote file path */
				sprintf( __( 'Failed to upload chunk to FTP: %s', '5dp-backup-restore' ), $full_remote )
			);
		}

		return $file_size;
	}

	/**
	 * Download a file from the FTP server.
	 *
	 * @param string $remote_path Remote file path.
	 * @param string $local_path  Local destination path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function download( $remote_path, $local_path, $credentials ) {
		$conn = $this->connect( $credentials );

		if ( is_wp_error( $conn ) ) {
			return $conn;
		}

		$full_remote = $this->build_remote_path( $remote_path, $credentials );

		// Ensure local directory exists.
		$local_dir = dirname( $local_path );
		if ( ! is_dir( $local_dir ) ) {
			if ( ! wp_mkdir_p( $local_dir ) ) {
				ftp_close( $conn );
				return new WP_Error(
					'dir_create_failed',
					/* translators: %s: directory path */
					sprintf( __( 'Could not create local directory: %s', '5dp-backup-restore' ), $local_dir )
				);
			}
		}

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$result = @ftp_get( $conn, $local_path, $full_remote, FTP_BINARY );

		ftp_close( $conn );

		if ( ! $result ) {
			return new WP_Error(
				'download_failed',
				/* translators: %s: remote file path */
				sprintf( __( 'Failed to download file from FTP: %s', '5dp-backup-restore' ), $full_remote )
			);
		}

		return true;
	}

	/**
	 * Delete a file from the FTP server.
	 *
	 * @param string $remote_path Remote file path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function delete( $remote_path, $credentials ) {
		$conn = $this->connect( $credentials );

		if ( is_wp_error( $conn ) ) {
			return $conn;
		}

		$full_remote = $this->build_remote_path( $remote_path, $credentials );

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$result = @ftp_delete( $conn, $full_remote );

		ftp_close( $conn );

		if ( ! $result ) {
			return new WP_Error(
				'delete_failed',
				/* translators: %s: remote file path */
				sprintf( __( 'Failed to delete file from FTP: %s', '5dp-backup-restore' ), $full_remote )
			);
		}

		return true;
	}

	/**
	 * List files on the FTP server.
	 *
	 * @param string $prefix      Remote path prefix.
	 * @param array  $credentials Provider credentials.
	 * @return array|WP_Error Array of file info or error.
	 */
	public function list_files( $prefix, $credentials ) {
		$conn = $this->connect( $credentials );

		if ( is_wp_error( $conn ) ) {
			return $conn;
		}

		$full_remote = $this->build_remote_path( $prefix, $credentials );

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$listing = @ftp_nlist( $conn, $full_remote );

		if ( false === $listing ) {
			ftp_close( $conn );
			return new WP_Error(
				'list_failed',
				/* translators: %s: remote directory path */
				sprintf( __( 'Failed to list files on FTP: %s', '5dp-backup-restore' ), $full_remote )
			);
		}

		$files = array();

		foreach ( $listing as $entry ) {
			$basename = basename( $entry );

			// Skip directory markers.
			if ( '.' === $basename || '..' === $basename ) {
				continue;
			}

			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			$size = @ftp_size( $conn, $entry );

			// Skip directories (size -1).
			if ( -1 === $size ) {
				continue;
			}

			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			$mdtm = @ftp_mdtm( $conn, $entry );

			$files[] = array(
				'name'     => $basename,
				'path'     => $entry,
				'size'     => $size,
				'modified' => ( -1 !== $mdtm ) ? $mdtm : 0,
			);
		}

		ftp_close( $conn );

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
	 * @return array Array of field definitions.
	 */
	public function get_credential_fields() {
		return array(
			array(
				'name'        => 'host',
				'label'       => __( 'FTP Host', '5dp-backup-restore' ),
				'type'        => 'text',
				'placeholder' => 'ftp.example.com',
				'required'    => true,
				'encrypted'   => false,
			),
			array(
				'name'        => 'port',
				'label'       => __( 'Port', '5dp-backup-restore' ),
				'type'        => 'number',
				'default'     => 21,
				'required'    => false,
				'encrypted'   => false,
			),
			array(
				'name'        => 'username',
				'label'       => __( 'Username', '5dp-backup-restore' ),
				'type'        => 'text',
				'required'    => true,
				'encrypted'   => false,
			),
			array(
				'name'        => 'password',
				'label'       => __( 'Password', '5dp-backup-restore' ),
				'type'        => 'password',
				'required'    => true,
				'encrypted'   => true,
			),
			array(
				'name'        => 'remote_path',
				'label'       => __( 'Remote Path', '5dp-backup-restore' ),
				'type'        => 'text',
				'placeholder' => '/backups',
				'default'     => '/',
				'required'    => false,
				'encrypted'   => false,
			),
			array(
				'name'        => 'passive_mode',
				'label'       => __( 'Passive Mode', '5dp-backup-restore' ),
				'type'        => 'checkbox',
				'default'     => '1',
				'required'    => false,
				'encrypted'   => false,
			),
		);
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	/**
	 * Establish an FTP connection.
	 *
	 * @param array $credentials Provider credentials.
	 * @return resource|FTP\Connection|WP_Error FTP connection or error.
	 */
	private function connect( $credentials ) {
		$host         = isset( $credentials['host'] ) ? $credentials['host'] : '';
		$port         = isset( $credentials['port'] ) && $credentials['port'] ? (int) $credentials['port'] : 21;
		$username     = isset( $credentials['username'] ) ? $credentials['username'] : '';
		$password     = isset( $credentials['password'] ) ? $credentials['password'] : '';
		$passive_mode = isset( $credentials['passive_mode'] ) ? (bool) $credentials['passive_mode'] : true;

		if ( empty( $host ) || empty( $username ) ) {
			return new WP_Error(
				'missing_credentials',
				__( 'FTP host and username are required.', '5dp-backup-restore' )
			);
		}

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$conn = @ftp_connect( $host, $port, self::CONNECT_TIMEOUT );

		if ( ! $conn ) {
			return new WP_Error(
				'connect_failed',
				/* translators: 1: FTP host, 2: port number */
				sprintf( __( 'Could not connect to FTP server: %1$s:%2$d', '5dp-backup-restore' ), $host, $port )
			);
		}

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		if ( ! @ftp_login( $conn, $username, $password ) ) {
			ftp_close( $conn );
			return new WP_Error(
				'login_failed',
				__( 'FTP login failed. Please check your username and password.', '5dp-backup-restore' )
			);
		}

		if ( $passive_mode ) {
			ftp_pasv( $conn, true );
		}

		return $conn;
	}

	/**
	 * Build the full remote path by prepending the configured remote base path.
	 *
	 * @param string $path        Relative file path.
	 * @param array  $credentials Provider credentials containing remote_path.
	 * @return string Full remote path.
	 */
	private function build_remote_path( $path, $credentials ) {
		$base = $this->get_remote_path( $credentials );
		return rtrim( $base, '/' ) . '/' . ltrim( $path, '/' );
	}

	/**
	 * Get the configured remote base path.
	 *
	 * @param array $credentials Provider credentials.
	 * @return string Remote path.
	 */
	private function get_remote_path( $credentials ) {
		$path = isset( $credentials['remote_path'] ) ? $credentials['remote_path'] : '/';
		return ! empty( $path ) ? $path : '/';
	}

	/**
	 * Recursively create directories on the FTP server.
	 *
	 * @param resource|FTP\Connection $conn FTP connection.
	 * @param string                  $dir  Directory path.
	 * @return bool
	 */
	private function ftp_mkdir_recursive( $conn, $dir ) {
		if ( empty( $dir ) || '/' === $dir || '.' === $dir ) {
			return true;
		}

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		if ( @ftp_chdir( $conn, $dir ) ) {
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			@ftp_chdir( $conn, '/' );
			return true;
		}

		$parent = dirname( $dir );
		$this->ftp_mkdir_recursive( $conn, $parent );

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		@ftp_mkdir( $conn, $dir );

		return true;
	}
}
