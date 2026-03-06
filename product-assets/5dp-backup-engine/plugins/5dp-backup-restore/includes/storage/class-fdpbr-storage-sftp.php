<?php
/**
 * SFTP storage provider.
 *
 * Stores backup files on a remote server via SSH2/SFTP using the
 * PHP ssh2 extension. Falls back to command-line exec if the
 * extension is not available.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Storage_SFTP
 *
 * @since 1.0.0
 */
class FiveDPBR_Storage_SFTP implements FiveDPBR_Storage_Interface {

	/**
	 * Default connection timeout in seconds.
	 *
	 * @var int
	 */
	const CONNECT_TIMEOUT = 30;

	/**
	 * Default chunk size for stream-based uploads (2 MB).
	 *
	 * @var int
	 */
	const CHUNK_SIZE = 2097152;

	/**
	 * Get the provider slug.
	 *
	 * @return string
	 */
	public function get_slug() {
		return 'sftp';
	}

	/**
	 * Get the provider display name.
	 *
	 * @return string
	 */
	public function get_name() {
		return __( 'SFTP', '5dp-backup-restore' );
	}

	/**
	 * Test the connection to the SFTP server.
	 *
	 * @param array $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function test_connection( $credentials ) {
		if ( ! function_exists( 'ssh2_connect' ) ) {
			return new WP_Error(
				'ssh2_not_available',
				__( 'The PHP ssh2 extension is not available on this server.', '5dp-backup-restore' )
			);
		}

		$session = $this->connect( $credentials );

		if ( is_wp_error( $session ) ) {
			return $session;
		}

		$sftp = $this->open_sftp( $session );

		if ( is_wp_error( $sftp ) ) {
			$this->disconnect( $session );
			return $sftp;
		}

		// Verify remote path exists or can be created.
		$remote_path = $this->get_remote_path( $credentials );

		if ( ! empty( $remote_path ) && '/' !== $remote_path ) {
			$stat = @ssh2_sftp_stat( $sftp, $remote_path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged

			if ( false === $stat ) {
				// Try to create the directory.
				// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				if ( ! @ssh2_sftp_mkdir( $sftp, $remote_path, 0755, true ) ) {
					$this->disconnect( $session );
					return new WP_Error(
						'remote_path_failed',
						/* translators: %s: remote directory path */
						sprintf( __( 'Could not access or create remote path: %s', '5dp-backup-restore' ), $remote_path )
					);
				}
			}
		}

		$this->disconnect( $session );

		return true;
	}

	/**
	 * Upload a file to the SFTP server.
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

		$session = $this->connect( $credentials );

		if ( is_wp_error( $session ) ) {
			return $session;
		}

		$sftp = $this->open_sftp( $session );

		if ( is_wp_error( $sftp ) ) {
			$this->disconnect( $session );
			return $sftp;
		}

		$full_remote = $this->build_remote_path( $remote_path, $credentials );

		// Ensure remote directory exists.
		$remote_dir = dirname( $full_remote );
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		@ssh2_sftp_mkdir( $sftp, $remote_dir, 0755, true );

		// Try ssh2_scp_send first (faster for whole files).
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$result = @ssh2_scp_send( $session, $local_path, $full_remote, 0644 );

		if ( ! $result ) {
			// Fall back to stream-based upload.
			$result = $this->stream_upload( $sftp, $local_path, $full_remote );

			if ( is_wp_error( $result ) ) {
				$this->disconnect( $session );
				return $result;
			}
		}

		$this->disconnect( $session );

		return true;
	}

	/**
	 * Upload a chunk of a file to the SFTP server.
	 *
	 * Uses stream-based upload with offset support for resumable transfers.
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

		// For offset 0, attempt a full upload via SCP.
		if ( 0 === $offset ) {
			$result = $this->upload( $local_path, $remote_path, $credentials );

			if ( is_wp_error( $result ) ) {
				return $result;
			}

			return filesize( $local_path );
		}

		// Resumable: stream from offset.
		$session = $this->connect( $credentials );

		if ( is_wp_error( $session ) ) {
			return $session;
		}

		$sftp = $this->open_sftp( $session );

		if ( is_wp_error( $sftp ) ) {
			$this->disconnect( $session );
			return $sftp;
		}

		$full_remote = $this->build_remote_path( $remote_path, $credentials );
		$sftp_id     = intval( $sftp );

		// Open remote file for appending.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$remote_handle = fopen( "ssh2.sftp://{$sftp_id}{$full_remote}", 'a' );

		if ( ! $remote_handle ) {
			$this->disconnect( $session );
			return new WP_Error(
				'remote_open_failed',
				/* translators: %s: remote file path */
				sprintf( __( 'Could not open remote file for writing: %s', '5dp-backup-restore' ), $full_remote )
			);
		}

		// Open local file and seek to offset.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$local_handle = fopen( $local_path, 'rb' );

		if ( ! $local_handle ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			fclose( $remote_handle );
			$this->disconnect( $session );
			return new WP_Error(
				'file_open_failed',
				/* translators: %s: file path */
				sprintf( __( 'Could not open local file: %s', '5dp-backup-restore' ), $local_path )
			);
		}

		fseek( $local_handle, $offset );
		$bytes_written = 0;

		while ( ! feof( $local_handle ) ) {
			$data = fread( $local_handle, self::CHUNK_SIZE );

			if ( false === $data ) {
				break;
			}

			$written = fwrite( $remote_handle, $data );

			if ( false === $written ) {
				break;
			}

			$bytes_written += $written;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $local_handle );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $remote_handle );
		$this->disconnect( $session );

		return $offset + $bytes_written;
	}

	/**
	 * Download a file from the SFTP server.
	 *
	 * @param string $remote_path Remote file path.
	 * @param string $local_path  Local destination path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function download( $remote_path, $local_path, $credentials ) {
		$session = $this->connect( $credentials );

		if ( is_wp_error( $session ) ) {
			return $session;
		}

		$full_remote = $this->build_remote_path( $remote_path, $credentials );

		// Ensure local directory exists.
		$local_dir = dirname( $local_path );
		if ( ! is_dir( $local_dir ) ) {
			if ( ! wp_mkdir_p( $local_dir ) ) {
				$this->disconnect( $session );
				return new WP_Error(
					'dir_create_failed',
					/* translators: %s: directory path */
					sprintf( __( 'Could not create local directory: %s', '5dp-backup-restore' ), $local_dir )
				);
			}
		}

		// Try ssh2_scp_recv first.
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$result = @ssh2_scp_recv( $session, $full_remote, $local_path );

		if ( ! $result ) {
			// Fall back to stream-based download.
			$sftp = $this->open_sftp( $session );

			if ( is_wp_error( $sftp ) ) {
				$this->disconnect( $session );
				return $sftp;
			}

			$stream_result = $this->stream_download( $sftp, $full_remote, $local_path );

			if ( is_wp_error( $stream_result ) ) {
				$this->disconnect( $session );
				return $stream_result;
			}
		}

		$this->disconnect( $session );

		return true;
	}

	/**
	 * Delete a file from the SFTP server.
	 *
	 * @param string $remote_path Remote file path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function delete( $remote_path, $credentials ) {
		$session = $this->connect( $credentials );

		if ( is_wp_error( $session ) ) {
			return $session;
		}

		$sftp = $this->open_sftp( $session );

		if ( is_wp_error( $sftp ) ) {
			$this->disconnect( $session );
			return $sftp;
		}

		$full_remote = $this->build_remote_path( $remote_path, $credentials );

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$result = @ssh2_sftp_unlink( $sftp, $full_remote );

		$this->disconnect( $session );

		if ( ! $result ) {
			return new WP_Error(
				'delete_failed',
				/* translators: %s: remote file path */
				sprintf( __( 'Failed to delete file from SFTP: %s', '5dp-backup-restore' ), $full_remote )
			);
		}

		return true;
	}

	/**
	 * List files on the SFTP server.
	 *
	 * @param string $prefix      Remote path prefix.
	 * @param array  $credentials Provider credentials.
	 * @return array|WP_Error Array of file info or error.
	 */
	public function list_files( $prefix, $credentials ) {
		$session = $this->connect( $credentials );

		if ( is_wp_error( $session ) ) {
			return $session;
		}

		$sftp = $this->open_sftp( $session );

		if ( is_wp_error( $sftp ) ) {
			$this->disconnect( $session );
			return $sftp;
		}

		$full_remote = $this->build_remote_path( $prefix, $credentials );
		$sftp_id     = intval( $sftp );

		$dir_handle = @opendir( "ssh2.sftp://{$sftp_id}{$full_remote}" ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged

		if ( ! $dir_handle ) {
			$this->disconnect( $session );
			return new WP_Error(
				'list_failed',
				/* translators: %s: remote directory path */
				sprintf( __( 'Failed to list files on SFTP: %s', '5dp-backup-restore' ), $full_remote )
			);
		}

		$files = array();

		// phpcs:ignore WordPress.CodeAnalysis.AssignmentInCondition.FoundInWhileCondition
		while ( false !== ( $entry = readdir( $dir_handle ) ) ) {
			if ( '.' === $entry || '..' === $entry ) {
				continue;
			}

			$entry_path = rtrim( $full_remote, '/' ) . '/' . $entry;

			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			$stat = @ssh2_sftp_stat( $sftp, $entry_path );

			if ( false === $stat ) {
				continue;
			}

			// Skip directories (check permissions: directories have 0040000 bit).
			if ( isset( $stat['mode'] ) && ( $stat['mode'] & 0040000 ) ) {
				continue;
			}

			$files[] = array(
				'name'     => $entry,
				'path'     => $entry_path,
				'size'     => isset( $stat['size'] ) ? $stat['size'] : 0,
				'modified' => isset( $stat['mtime'] ) ? $stat['mtime'] : 0,
			);
		}

		closedir( $dir_handle );
		$this->disconnect( $session );

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
				'label'       => __( 'SFTP Host', '5dp-backup-restore' ),
				'type'        => 'text',
				'placeholder' => 'sftp.example.com',
				'required'    => true,
				'encrypted'   => false,
			),
			array(
				'name'        => 'port',
				'label'       => __( 'Port', '5dp-backup-restore' ),
				'type'        => 'number',
				'default'     => 22,
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
				'required'    => false,
				'encrypted'   => true,
				'description' => __( 'Leave empty if using a private key.', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'private_key',
				'label'       => __( 'Private Key', '5dp-backup-restore' ),
				'type'        => 'textarea',
				'required'    => false,
				'encrypted'   => true,
				'description' => __( 'Paste the full PEM private key, or leave empty to use password authentication.', '5dp-backup-restore' ),
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
		);
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	/**
	 * Establish an SSH2 connection and authenticate.
	 *
	 * @param array $credentials Provider credentials.
	 * @return resource|WP_Error SSH2 session or error.
	 */
	private function connect( $credentials ) {
		$host        = isset( $credentials['host'] ) ? $credentials['host'] : '';
		$port        = isset( $credentials['port'] ) && $credentials['port'] ? (int) $credentials['port'] : 22;
		$username    = isset( $credentials['username'] ) ? $credentials['username'] : '';
		$password    = isset( $credentials['password'] ) ? $credentials['password'] : '';
		$private_key = isset( $credentials['private_key'] ) ? trim( $credentials['private_key'] ) : '';

		if ( empty( $host ) || empty( $username ) ) {
			return new WP_Error(
				'missing_credentials',
				__( 'SFTP host and username are required.', '5dp-backup-restore' )
			);
		}

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$session = @ssh2_connect( $host, $port );

		if ( ! $session ) {
			return new WP_Error(
				'connect_failed',
				/* translators: 1: SFTP host, 2: port number */
				sprintf( __( 'Could not connect to SFTP server: %1$s:%2$d', '5dp-backup-restore' ), $host, $port )
			);
		}

		$authenticated = false;

		// Try public key authentication first if a private key is provided.
		if ( ! empty( $private_key ) ) {
			$auth_result = $this->auth_pubkey( $session, $username, $private_key, $password );

			if ( true === $auth_result ) {
				$authenticated = true;
			}
		}

		// Fall back to password authentication.
		if ( ! $authenticated && ! empty( $password ) ) {
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			$authenticated = @ssh2_auth_password( $session, $username, $password );
		}

		if ( ! $authenticated ) {
			return new WP_Error(
				'auth_failed',
				__( 'SFTP authentication failed. Please check your credentials.', '5dp-backup-restore' )
			);
		}

		return $session;
	}

	/**
	 * Authenticate with a public key.
	 *
	 * Writes the private key to a temporary file for ssh2_auth_pubkey_file().
	 *
	 * @param resource $session    SSH2 session.
	 * @param string   $username   Username.
	 * @param string   $private_key PEM private key content.
	 * @param string   $passphrase Optional key passphrase.
	 * @return bool True on success, false on failure.
	 */
	private function auth_pubkey( $session, $username, $private_key, $passphrase = '' ) {
		// Write the private key to a temporary file.
		$tmp_key = wp_tempnam( 'fdpbr_ssh_key' );

		if ( ! $tmp_key ) {
			return false;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $tmp_key, $private_key );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_chmod
		chmod( $tmp_key, 0600 );

		// Generate the public key from the private key if possible.
		$pub_key = $tmp_key . '.pub';
		$pub_key_content = '';

		if ( function_exists( 'openssl_pkey_get_private' ) ) {
			$pkey = openssl_pkey_get_private( $private_key, $passphrase );

			if ( $pkey ) {
				$details = openssl_pkey_get_details( $pkey );

				if ( $details && isset( $details['key'] ) ) {
					$pub_key_content = $details['key'];
				}
			}
		}

		if ( ! empty( $pub_key_content ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			file_put_contents( $pub_key, $pub_key_content );
		} else {
			// Without a public key file, try password auth as fallback.
			// phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
			unlink( $tmp_key );
			return false;
		}

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$result = @ssh2_auth_pubkey_file(
			$session,
			$username,
			$pub_key,
			$tmp_key,
			$passphrase
		);

		// Clean up temp files.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
		@unlink( $tmp_key );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink,WordPress.PHP.NoSilencedErrors.Discouraged
		@unlink( $pub_key );

		return (bool) $result;
	}

	/**
	 * Open the SFTP subsystem on an SSH2 session.
	 *
	 * @param resource $session SSH2 session.
	 * @return resource|WP_Error SFTP resource or error.
	 */
	private function open_sftp( $session ) {
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$sftp = @ssh2_sftp( $session );

		if ( ! $sftp ) {
			return new WP_Error(
				'sftp_init_failed',
				__( 'Could not initialize the SFTP subsystem.', '5dp-backup-restore' )
			);
		}

		return $sftp;
	}

	/**
	 * Disconnect an SSH2 session.
	 *
	 * @param resource $session SSH2 session.
	 */
	private function disconnect( $session ) {
		if ( function_exists( 'ssh2_disconnect' ) ) {
			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			@ssh2_disconnect( $session );
		}

		// The session resource will be freed when it goes out of scope.
		unset( $session );
	}

	/**
	 * Upload a file using SFTP streams as a fallback.
	 *
	 * @param resource $sftp        SFTP resource.
	 * @param string   $local_path  Local file path.
	 * @param string   $remote_path Remote file path.
	 * @return true|WP_Error
	 */
	private function stream_upload( $sftp, $local_path, $remote_path ) {
		$sftp_id = intval( $sftp );

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$remote_handle = fopen( "ssh2.sftp://{$sftp_id}{$remote_path}", 'wb' );

		if ( ! $remote_handle ) {
			return new WP_Error(
				'remote_open_failed',
				/* translators: %s: remote file path */
				sprintf( __( 'Could not open remote file for writing: %s', '5dp-backup-restore' ), $remote_path )
			);
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$local_handle = fopen( $local_path, 'rb' );

		if ( ! $local_handle ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			fclose( $remote_handle );
			return new WP_Error(
				'file_open_failed',
				/* translators: %s: file path */
				sprintf( __( 'Could not open local file: %s', '5dp-backup-restore' ), $local_path )
			);
		}

		while ( ! feof( $local_handle ) ) {
			$data = fread( $local_handle, self::CHUNK_SIZE );

			if ( false === $data ) {
				break;
			}

			if ( false === fwrite( $remote_handle, $data ) ) {
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
				fclose( $local_handle );
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
				fclose( $remote_handle );
				return new WP_Error(
					'stream_write_failed',
					__( 'Failed to write data to remote SFTP stream.', '5dp-backup-restore' )
				);
			}
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $local_handle );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $remote_handle );

		return true;
	}

	/**
	 * Download a file using SFTP streams as a fallback.
	 *
	 * @param resource $sftp        SFTP resource.
	 * @param string   $remote_path Remote file path.
	 * @param string   $local_path  Local destination path.
	 * @return true|WP_Error
	 */
	private function stream_download( $sftp, $remote_path, $local_path ) {
		$sftp_id = intval( $sftp );

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$remote_handle = fopen( "ssh2.sftp://{$sftp_id}{$remote_path}", 'rb' );

		if ( ! $remote_handle ) {
			return new WP_Error(
				'remote_open_failed',
				/* translators: %s: remote file path */
				sprintf( __( 'Could not open remote file for reading: %s', '5dp-backup-restore' ), $remote_path )
			);
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$local_handle = fopen( $local_path, 'wb' );

		if ( ! $local_handle ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			fclose( $remote_handle );
			return new WP_Error(
				'file_open_failed',
				/* translators: %s: file path */
				sprintf( __( 'Could not open local file for writing: %s', '5dp-backup-restore' ), $local_path )
			);
		}

		while ( ! feof( $remote_handle ) ) {
			$data = fread( $remote_handle, self::CHUNK_SIZE );

			if ( false === $data ) {
				break;
			}

			if ( false === fwrite( $local_handle, $data ) ) {
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
				fclose( $remote_handle );
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
				fclose( $local_handle );
				return new WP_Error(
					'stream_write_failed',
					__( 'Failed to write data to local file.', '5dp-backup-restore' )
				);
			}
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $remote_handle );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $local_handle );

		return true;
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
}
