<?php
/**
 * Dropbox storage provider.
 *
 * Uses Dropbox API v2 with OAuth2 authentication.
 * Handles token refresh transparently and supports both
 * simple and session-based (chunked) uploads.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Storage_Dropbox
 *
 * Dropbox storage provider using API v2 and OAuth2.
 *
 * @since 1.0.0
 */
class FiveDPBR_Storage_Dropbox implements FiveDPBR_Storage_Interface {

	/**
	 * Dropbox API base URL.
	 *
	 * @var string
	 */
	const API_BASE = 'https://api.dropboxapi.com/2';

	/**
	 * Dropbox content API base URL (for uploads/downloads).
	 *
	 * @var string
	 */
	const CONTENT_BASE = 'https://content.dropboxapi.com/2';

	/**
	 * Dropbox OAuth2 token endpoint.
	 *
	 * @var string
	 */
	const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';

	/**
	 * Maximum file size for simple upload (150 MB).
	 *
	 * @var int
	 */
	const SIMPLE_UPLOAD_LIMIT = 157286400;

	/**
	 * Chunk size for session uploads (8 MB).
	 *
	 * @var int
	 */
	const CHUNK_SIZE = 8388608;

	/**
	 * Default backup folder path.
	 *
	 * @var string
	 */
	const DEFAULT_FOLDER = '/5DP-Backups';

	/**
	 * Get the provider slug.
	 *
	 * @since 1.0.0
	 * @return string
	 */
	public function get_slug() {
		return 'dropbox';
	}

	/**
	 * Get the provider display name.
	 *
	 * @since 1.0.0
	 * @return string
	 */
	public function get_name() {
		return 'Dropbox';
	}

	/**
	 * Get the credential fields required by this provider.
	 *
	 * @since 1.0.0
	 * @return array Array of field definitions.
	 */
	public function get_credential_fields() {
		return array(
			array(
				'name'        => 'access_token',
				'label'       => __( 'Access Token', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => true,
				'required'    => true,
				'description' => __( 'OAuth2 access token (refreshed automatically).', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'refresh_token',
				'label'       => __( 'Refresh Token', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => true,
				'required'    => true,
				'description' => __( 'OAuth2 refresh token for automatic token renewal.', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'app_key',
				'label'       => __( 'App Key', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => false,
				'required'    => true,
				'description' => __( 'Dropbox app key (client ID).', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'app_secret',
				'label'       => __( 'App Secret', '5dp-backup-restore' ),
				'type'        => 'password',
				'encrypted'   => true,
				'required'    => true,
				'description' => __( 'Dropbox app secret (client secret).', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'folder_path',
				'label'       => __( 'Folder Path', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => false,
				'required'    => false,
				'default'     => '/5DP-Backups',
				'description' => __( 'Dropbox folder path for backups.', '5dp-backup-restore' ),
			),
		);
	}

	/**
	 * Test the connection to Dropbox.
	 *
	 * Lists the backup folder contents to verify access.
	 *
	 * @since 1.0.0
	 * @param array $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function test_connection( $credentials ) {
		$token = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$folder_path = $this->get_folder_path( $credentials );

		$response = wp_remote_post(
			self::API_BASE . '/files/list_folder',
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( array(
					'path'    => $folder_path,
					'limit'   => 1,
				) ),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'dropbox_connection_failed', sprintf(
				/* translators: %s: error message */
				__( 'Dropbox connection failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );

		// 409 with path/not_found means folder doesn't exist yet, which is OK.
		if ( 409 === $code ) {
			$body = json_decode( wp_remote_retrieve_body( $response ), true );
			if ( isset( $body['error']['.tag'] ) && 'path' === $body['error']['.tag'] ) {
				// Folder doesn't exist. Try to create it.
				$create = $this->create_folder( $folder_path, $token );
				if ( is_wp_error( $create ) ) {
					return $create;
				}
				return true;
			}
		}

		if ( 200 === $code ) {
			return true;
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$error = isset( $body['error_summary'] ) ? $body['error_summary'] : sprintf( 'HTTP %d', $code );

		return new WP_Error( 'dropbox_connection_failed', sprintf(
			/* translators: %s: error message */
			__( 'Dropbox connection failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	/**
	 * Upload a file to Dropbox.
	 *
	 * Uses simple upload for files under 150 MB, upload session for larger files.
	 *
	 * @since 1.0.0
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path/key.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function upload( $local_path, $remote_path, $credentials ) {
		if ( ! file_exists( $local_path ) || ! is_readable( $local_path ) ) {
			return new WP_Error( 'dropbox_file_not_found', __( 'Local file not found or not readable.', '5dp-backup-restore' ) );
		}

		$token     = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$file_size   = filesize( $local_path );
		$dropbox_path = $this->build_dropbox_path( $remote_path, $credentials );

		// Use simple upload for files under the limit.
		if ( $file_size <= self::SIMPLE_UPLOAD_LIMIT ) {
			return $this->simple_upload( $local_path, $dropbox_path, $token );
		}

		// Use upload session for larger files.
		return $this->session_upload( $local_path, $dropbox_path, $token );
	}

	/**
	 * Upload a file chunk using Dropbox upload session.
	 *
	 * Manages upload_session/start, append_v2, and finish.
	 *
	 * @since 1.0.0
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path/key.
	 * @param array  $credentials Provider credentials.
	 * @param int    $offset      Byte offset to resume from.
	 * @return int|WP_Error Bytes uploaded or error.
	 */
	public function upload_chunk( $local_path, $remote_path, $credentials, $offset = 0 ) {
		if ( ! file_exists( $local_path ) || ! is_readable( $local_path ) ) {
			return new WP_Error( 'dropbox_file_not_found', __( 'Local file not found or not readable.', '5dp-backup-restore' ) );
		}

		$token = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$file_size    = filesize( $local_path );
		$dropbox_path = $this->build_dropbox_path( $remote_path, $credentials );

		// Step 1: Start a session if at the beginning.
		$cache_key  = 'fdpbr_dropbox_session_' . md5( $dropbox_path );
		$session_id = get_transient( $cache_key );

		if ( 0 === $offset || empty( $session_id ) ) {
			$handle = fopen( $local_path, 'rb' );
			if ( false === $handle ) {
				return new WP_Error( 'dropbox_read_failed', __( 'Could not open local file for reading.', '5dp-backup-restore' ) );
			}

			$chunk_data = fread( $handle, self::CHUNK_SIZE );
			fclose( $handle );

			$start_response = wp_remote_post(
				self::CONTENT_BASE . '/files/upload_session/start',
				array(
					'headers' => array(
						'Authorization'   => 'Bearer ' . $token,
						'Content-Type'    => 'application/octet-stream',
						'Dropbox-API-Arg' => wp_json_encode( array( 'close' => false ) ),
					),
					'body'    => $chunk_data,
					'timeout' => 300,
				)
			);

			if ( is_wp_error( $start_response ) ) {
				return new WP_Error( 'dropbox_session_start_failed', sprintf(
					/* translators: %s: error message */
					__( 'Dropbox upload session start failed: %s', '5dp-backup-restore' ),
					$start_response->get_error_message()
				) );
			}

			$start_body = json_decode( wp_remote_retrieve_body( $start_response ), true );
			if ( ! isset( $start_body['session_id'] ) ) {
				return new WP_Error( 'dropbox_session_start_failed', __( 'No session ID returned by Dropbox.', '5dp-backup-restore' ) );
			}

			$session_id = $start_body['session_id'];
			set_transient( $cache_key, $session_id, DAY_IN_SECONDS );

			return strlen( $chunk_data );
		}

		// Step 2: Append data to the session.
		$handle = fopen( $local_path, 'rb' );
		if ( false === $handle ) {
			return new WP_Error( 'dropbox_read_failed', __( 'Could not open local file for reading.', '5dp-backup-restore' ) );
		}

		fseek( $handle, $offset );
		$remaining  = $file_size - $offset;
		$read_size  = min( self::CHUNK_SIZE, $remaining );
		$chunk_data = fread( $handle, $read_size );
		fclose( $handle );

		$new_offset = $offset + $read_size;
		$is_last    = ( $new_offset >= $file_size );

		if ( $is_last ) {
			// Step 3: Finish the session.
			$finish_response = wp_remote_post(
				self::CONTENT_BASE . '/files/upload_session/finish',
				array(
					'headers' => array(
						'Authorization'   => 'Bearer ' . $token,
						'Content-Type'    => 'application/octet-stream',
						'Dropbox-API-Arg' => wp_json_encode( array(
							'cursor' => array(
								'session_id' => $session_id,
								'offset'     => $offset,
							),
							'commit' => array(
								'path'       => $dropbox_path,
								'mode'       => 'overwrite',
								'autorename' => false,
								'mute'       => true,
							),
						) ),
					),
					'body'    => $chunk_data,
					'timeout' => 300,
				)
			);

			if ( is_wp_error( $finish_response ) ) {
				return new WP_Error( 'dropbox_session_finish_failed', sprintf(
					/* translators: %s: error message */
					__( 'Dropbox upload session finish failed: %s', '5dp-backup-restore' ),
					$finish_response->get_error_message()
				) );
			}

			$code = wp_remote_retrieve_response_code( $finish_response );
			if ( 200 !== $code ) {
				$body  = json_decode( wp_remote_retrieve_body( $finish_response ), true );
				$error = isset( $body['error_summary'] ) ? $body['error_summary'] : sprintf( 'HTTP %d', $code );
				return new WP_Error( 'dropbox_session_finish_failed', sprintf(
					/* translators: %s: error message */
					__( 'Dropbox upload session finish failed: %s', '5dp-backup-restore' ),
					$error
				) );
			}

			delete_transient( $cache_key );
			return $new_offset;
		}

		// Append chunk.
		$append_response = wp_remote_post(
			self::CONTENT_BASE . '/files/upload_session/append_v2',
			array(
				'headers' => array(
					'Authorization'   => 'Bearer ' . $token,
					'Content-Type'    => 'application/octet-stream',
					'Dropbox-API-Arg' => wp_json_encode( array(
						'cursor' => array(
							'session_id' => $session_id,
							'offset'     => $offset,
						),
						'close' => false,
					) ),
				),
				'body'    => $chunk_data,
				'timeout' => 300,
			)
		);

		if ( is_wp_error( $append_response ) ) {
			return new WP_Error( 'dropbox_session_append_failed', sprintf(
				/* translators: %s: error message */
				__( 'Dropbox upload session append failed: %s', '5dp-backup-restore' ),
				$append_response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $append_response );
		if ( 200 !== $code ) {
			$body  = json_decode( wp_remote_retrieve_body( $append_response ), true );
			$error = isset( $body['error_summary'] ) ? $body['error_summary'] : sprintf( 'HTTP %d', $code );
			return new WP_Error( 'dropbox_session_append_failed', sprintf(
				/* translators: %s: error message */
				__( 'Dropbox upload session append failed: %s', '5dp-backup-restore' ),
				$error
			) );
		}

		return $new_offset;
	}

	/**
	 * Download a file from Dropbox.
	 *
	 * @since 1.0.0
	 * @param string $remote_path Remote file path/key.
	 * @param string $local_path  Local destination path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function download( $remote_path, $local_path, $credentials ) {
		$token = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$dropbox_path = $this->build_dropbox_path( $remote_path, $credentials );

		$response = wp_remote_post(
			self::CONTENT_BASE . '/files/download',
			array(
				'headers' => array(
					'Authorization'   => 'Bearer ' . $token,
					'Dropbox-API-Arg' => wp_json_encode( array( 'path' => $dropbox_path ) ),
				),
				'timeout'  => 300,
				'stream'   => true,
				'filename' => $local_path,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'dropbox_download_failed', sprintf(
				/* translators: %s: error message */
				__( 'Dropbox download failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			return true;
		}

		if ( file_exists( $local_path ) ) {
			wp_delete_file( $local_path );
		}

		return new WP_Error( 'dropbox_download_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'Dropbox download returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * Delete a file from Dropbox.
	 *
	 * @since 1.0.0
	 * @param string $remote_path Remote file path/key.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function delete( $remote_path, $credentials ) {
		$token = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$dropbox_path = $this->build_dropbox_path( $remote_path, $credentials );

		$response = wp_remote_post(
			self::API_BASE . '/files/delete_v2',
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( array( 'path' => $dropbox_path ) ),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'dropbox_delete_failed', sprintf(
				/* translators: %s: error message */
				__( 'Dropbox delete failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			return true;
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$error = isset( $body['error_summary'] ) ? $body['error_summary'] : sprintf( 'HTTP %d', $code );

		return new WP_Error( 'dropbox_delete_failed', sprintf(
			/* translators: %s: error message */
			__( 'Dropbox delete failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	/**
	 * List files in the Dropbox backup folder.
	 *
	 * @since 1.0.0
	 * @param string $prefix      Filename prefix to filter (applied client-side).
	 * @param array  $credentials Provider credentials.
	 * @return array|WP_Error Array of file info or error.
	 */
	public function list_files( $prefix, $credentials ) {
		$token = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$folder_path = $this->get_folder_path( $credentials );

		$response = wp_remote_post(
			self::API_BASE . '/files/list_folder',
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( array(
					'path'                    => $folder_path,
					'recursive'               => false,
					'include_deleted'         => false,
					'include_has_explicit_shared_members' => false,
				) ),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'dropbox_list_failed', sprintf(
				/* translators: %s: error message */
				__( 'Dropbox list failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 !== $code ) {
			$body  = json_decode( wp_remote_retrieve_body( $response ), true );
			$error = isset( $body['error_summary'] ) ? $body['error_summary'] : sprintf( 'HTTP %d', $code );

			return new WP_Error( 'dropbox_list_failed', sprintf(
				/* translators: %s: error message */
				__( 'Dropbox list failed: %s', '5dp-backup-restore' ),
				$error
			) );
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$files = array();

		if ( isset( $body['entries'] ) && is_array( $body['entries'] ) ) {
			foreach ( $body['entries'] as $entry ) {
				if ( 'file' !== ( isset( $entry['.tag'] ) ? $entry['.tag'] : '' ) ) {
					continue;
				}

				$name = isset( $entry['name'] ) ? $entry['name'] : '';

				// Client-side prefix filtering.
				if ( ! empty( $prefix ) && 0 !== strpos( $name, $prefix ) ) {
					continue;
				}

				$files[] = array(
					'path'     => isset( $entry['path_display'] ) ? $entry['path_display'] : $name,
					'size'     => isset( $entry['size'] ) ? (int) $entry['size'] : 0,
					'modified' => isset( $entry['server_modified'] ) ? $entry['server_modified'] : '',
				);
			}
		}

		return $files;
	}

	// =========================================================================
	// OAuth2 Token Management
	// =========================================================================

	/**
	 * Ensure a valid access token, refreshing if necessary.
	 *
	 * @since 1.0.0
	 * @param array $credentials Provider credentials (passed by reference to update token).
	 * @return string|WP_Error Valid access token or error.
	 */
	private function ensure_valid_token( &$credentials ) {
		$access_token = isset( $credentials['access_token'] ) ? $credentials['access_token'] : '';

		if ( empty( $access_token ) ) {
			return $this->refresh_access_token( $credentials );
		}

		// Quick validation: try a lightweight API call.
		$response = wp_remote_post(
			self::API_BASE . '/check/user',
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( array( 'query' => 'fdpbr' ) ),
				'timeout' => 10,
			)
		);

		if ( ! is_wp_error( $response ) && 200 === wp_remote_retrieve_response_code( $response ) ) {
			return $access_token;
		}

		return $this->refresh_access_token( $credentials );
	}

	/**
	 * Refresh the OAuth2 access token using the refresh token.
	 *
	 * @since 1.0.0
	 * @param array $credentials Provider credentials (passed by reference).
	 * @return string|WP_Error New access token or error.
	 */
	private function refresh_access_token( &$credentials ) {
		$refresh_token = isset( $credentials['refresh_token'] ) ? $credentials['refresh_token'] : '';
		$app_key       = isset( $credentials['app_key'] ) ? $credentials['app_key'] : '';
		$app_secret    = isset( $credentials['app_secret'] ) ? $credentials['app_secret'] : '';

		if ( empty( $refresh_token ) || empty( $app_key ) || empty( $app_secret ) ) {
			return new WP_Error( 'dropbox_missing_credentials', __( 'Refresh token, app key, and app secret are required.', '5dp-backup-restore' ) );
		}

		$response = wp_remote_post(
			self::TOKEN_URL,
			array(
				'body' => array(
					'grant_type'    => 'refresh_token',
					'refresh_token' => $refresh_token,
					'client_id'     => $app_key,
					'client_secret' => $app_secret,
				),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'dropbox_token_refresh_failed', sprintf(
				/* translators: %s: error message */
				__( 'Dropbox token refresh failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ! isset( $body['access_token'] ) ) {
			$error_msg = isset( $body['error_description'] ) ? $body['error_description'] : __( 'No access token in response.', '5dp-backup-restore' );
			return new WP_Error( 'dropbox_token_refresh_failed', sprintf(
				/* translators: %s: error message */
				__( 'Dropbox token refresh failed: %s', '5dp-backup-restore' ),
				$error_msg
			) );
		}

		$credentials['access_token'] = $body['access_token'];

		// Persist the new token.
		$destinations = get_option( 'fdpbr_storage_destinations', array() );
		if ( isset( $destinations['dropbox'] ) ) {
			$destinations['dropbox']['credentials']['access_token'] = FiveDPBR_Encryption::encrypt( $body['access_token'] );
			update_option( 'fdpbr_storage_destinations', $destinations );
		}

		return $body['access_token'];
	}

	// =========================================================================
	// Upload Helpers
	// =========================================================================

	/**
	 * Simple file upload for files under 150 MB.
	 *
	 * @since 1.0.0
	 * @param string $local_path   Local file path.
	 * @param string $dropbox_path Full Dropbox path.
	 * @param string $token        Valid access token.
	 * @return true|WP_Error
	 */
	private function simple_upload( $local_path, $dropbox_path, $token ) {
		$body = file_get_contents( $local_path );

		if ( false === $body ) {
			return new WP_Error( 'dropbox_read_failed', __( 'Could not read local file.', '5dp-backup-restore' ) );
		}

		$response = wp_remote_post(
			self::CONTENT_BASE . '/files/upload',
			array(
				'headers' => array(
					'Authorization'   => 'Bearer ' . $token,
					'Content-Type'    => 'application/octet-stream',
					'Dropbox-API-Arg' => wp_json_encode( array(
						'path'       => $dropbox_path,
						'mode'       => 'overwrite',
						'autorename' => false,
						'mute'       => true,
					) ),
				),
				'body'    => $body,
				'timeout' => 300,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'dropbox_upload_failed', sprintf(
				/* translators: %s: error message */
				__( 'Dropbox upload failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			return true;
		}

		$body_data = json_decode( wp_remote_retrieve_body( $response ), true );
		$error     = isset( $body_data['error_summary'] ) ? $body_data['error_summary'] : sprintf( 'HTTP %d', $code );

		return new WP_Error( 'dropbox_upload_failed', sprintf(
			/* translators: %s: error message */
			__( 'Dropbox upload failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	/**
	 * Session-based upload for files over 150 MB.
	 *
	 * @since 1.0.0
	 * @param string $local_path   Local file path.
	 * @param string $dropbox_path Full Dropbox path.
	 * @param string $token        Valid access token.
	 * @return true|WP_Error
	 */
	private function session_upload( $local_path, $dropbox_path, $token ) {
		$file_size = filesize( $local_path );
		$offset    = 0;

		// Temporarily store credentials-like structure for upload_chunk.
		$temp_credentials = array(
			'access_token' => $token,
			'folder_path'  => dirname( $dropbox_path ),
		);

		while ( $offset < $file_size ) {
			$result = $this->upload_chunk( $local_path, basename( $dropbox_path ), $temp_credentials, $offset );
			if ( is_wp_error( $result ) ) {
				return $result;
			}
			$offset = $result;
		}

		return true;
	}

	// =========================================================================
	// Path / Folder Helpers
	// =========================================================================

	/**
	 * Get the folder path for backups.
	 *
	 * @since 1.0.0
	 * @param array $credentials Provider credentials.
	 * @return string Folder path.
	 */
	private function get_folder_path( $credentials ) {
		$folder = isset( $credentials['folder_path'] ) ? trim( $credentials['folder_path'] ) : '';
		if ( empty( $folder ) ) {
			return self::DEFAULT_FOLDER;
		}
		return '/' . ltrim( $folder, '/' );
	}

	/**
	 * Build the full Dropbox file path.
	 *
	 * @since 1.0.0
	 * @param string $remote_path Remote file path.
	 * @param array  $credentials Provider credentials.
	 * @return string Full Dropbox path.
	 */
	private function build_dropbox_path( $remote_path, $credentials ) {
		$folder = $this->get_folder_path( $credentials );
		$file   = ltrim( basename( $remote_path ), '/' );
		return rtrim( $folder, '/' ) . '/' . $file;
	}

	/**
	 * Create a folder on Dropbox.
	 *
	 * @since 1.0.0
	 * @param string $path  Folder path.
	 * @param string $token Access token.
	 * @return true|WP_Error
	 */
	private function create_folder( $path, $token ) {
		$response = wp_remote_post(
			self::API_BASE . '/files/create_folder_v2',
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( array(
					'path'       => $path,
					'autorename' => false,
				) ),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'dropbox_folder_create_failed', sprintf(
				/* translators: %s: error message */
				__( 'Could not create Dropbox folder: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			return true;
		}

		// 409 might mean folder already exists, which is fine.
		if ( 409 === $code ) {
			$body = json_decode( wp_remote_retrieve_body( $response ), true );
			if ( isset( $body['error']['.tag'] ) && 'path' === $body['error']['.tag'] ) {
				$conflict = isset( $body['error']['path']['.tag'] ) ? $body['error']['path']['.tag'] : '';
				if ( 'conflict' === $conflict ) {
					return true;
				}
			}
		}

		return new WP_Error( 'dropbox_folder_create_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'Dropbox folder creation returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}
}
