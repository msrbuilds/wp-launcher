<?php
/**
 * OneDrive storage provider.
 *
 * Uses Microsoft Graph API with OAuth2 authentication.
 * Handles token refresh transparently and supports both
 * simple PUT and upload session (chunked) uploads.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Storage_OneDrive
 *
 * OneDrive storage provider using Microsoft Graph API and OAuth2.
 *
 * @since 1.0.0
 */
class FiveDPBR_Storage_OneDrive implements FiveDPBR_Storage_Interface {

	/**
	 * Microsoft Graph API base URL.
	 *
	 * @var string
	 */
	const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

	/**
	 * Microsoft OAuth2 token endpoint.
	 *
	 * @var string
	 */
	const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

	/**
	 * Maximum file size for simple PUT upload (4 MB).
	 *
	 * @var int
	 */
	const SIMPLE_UPLOAD_LIMIT = 4194304;

	/**
	 * Chunk size for upload sessions (5 MB, must be multiple of 320 KB).
	 *
	 * @var int
	 */
	const CHUNK_SIZE = 5242880;

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
		return 'onedrive';
	}

	/**
	 * Get the provider display name.
	 *
	 * @since 1.0.0
	 * @return string
	 */
	public function get_name() {
		return 'OneDrive';
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
				'name'        => 'client_id',
				'label'       => __( 'Client ID', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => false,
				'required'    => true,
				'description' => __( 'Microsoft Azure app (client) ID.', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'client_secret',
				'label'       => __( 'Client Secret', '5dp-backup-restore' ),
				'type'        => 'password',
				'encrypted'   => true,
				'required'    => true,
				'description' => __( 'Microsoft Azure client secret.', '5dp-backup-restore' ),
			),
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
				'name'        => 'folder_path',
				'label'       => __( 'Folder Path', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => false,
				'required'    => false,
				'default'     => '/5DP-Backups',
				'description' => __( 'OneDrive folder path for backups.', '5dp-backup-restore' ),
			),
		);
	}

	/**
	 * Test the connection to OneDrive.
	 *
	 * Fetches /me/drive to verify credentials and access.
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

		$response = wp_remote_get(
			self::GRAPH_BASE . '/me/drive',
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
				),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'onedrive_connection_failed', sprintf(
				/* translators: %s: error message */
				__( 'OneDrive connection failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			// Also ensure the backup folder exists.
			$folder = $this->ensure_folder_exists( $credentials, $token );
			if ( is_wp_error( $folder ) ) {
				return $folder;
			}
			return true;
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$error = isset( $body['error']['message'] ) ? $body['error']['message'] : sprintf( 'HTTP %d', $code );

		return new WP_Error( 'onedrive_connection_failed', sprintf(
			/* translators: %s: error message */
			__( 'OneDrive connection failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	/**
	 * Upload a file to OneDrive.
	 *
	 * Uses simple PUT for files under 4 MB, upload session for larger files.
	 *
	 * @since 1.0.0
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path/key.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function upload( $local_path, $remote_path, $credentials ) {
		if ( ! file_exists( $local_path ) || ! is_readable( $local_path ) ) {
			return new WP_Error( 'onedrive_file_not_found', __( 'Local file not found or not readable.', '5dp-backup-restore' ) );
		}

		$token = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$file_size = filesize( $local_path );

		if ( $file_size <= self::SIMPLE_UPLOAD_LIMIT ) {
			return $this->simple_upload( $local_path, $remote_path, $credentials, $token );
		}

		return $this->session_upload_full( $local_path, $remote_path, $credentials, $token );
	}

	/**
	 * Upload a file chunk using OneDrive upload session.
	 *
	 * Manages createUploadSession and PUT chunks.
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
			return new WP_Error( 'onedrive_file_not_found', __( 'Local file not found or not readable.', '5dp-backup-restore' ) );
		}

		$token = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$file_size     = filesize( $local_path );
		$onedrive_path = $this->build_onedrive_path( $remote_path, $credentials );

		// Create upload session if starting from zero.
		$cache_key   = 'fdpbr_onedrive_session_' . md5( $onedrive_path );
		$session_url = get_transient( $cache_key );

		if ( 0 === $offset || empty( $session_url ) ) {
			$session_url = $this->create_upload_session( $onedrive_path, $token );
			if ( is_wp_error( $session_url ) ) {
				return $session_url;
			}
			set_transient( $cache_key, $session_url, DAY_IN_SECONDS );
		}

		// Read chunk data.
		$handle = fopen( $local_path, 'rb' );
		if ( false === $handle ) {
			return new WP_Error( 'onedrive_read_failed', __( 'Could not open local file for reading.', '5dp-backup-restore' ) );
		}

		fseek( $handle, $offset );
		$remaining  = $file_size - $offset;
		$read_size  = min( self::CHUNK_SIZE, $remaining );
		$chunk_data = fread( $handle, $read_size );
		fclose( $handle );

		$end_byte = $offset + $read_size - 1;

		$response = wp_remote_request(
			$session_url,
			array(
				'method'  => 'PUT',
				'headers' => array(
					'Content-Length' => strlen( $chunk_data ),
					'Content-Range'  => sprintf( 'bytes %d-%d/%d', $offset, $end_byte, $file_size ),
				),
				'body'    => $chunk_data,
				'timeout' => 300,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'onedrive_chunk_failed', sprintf(
				/* translators: %s: error message */
				__( 'OneDrive chunk upload failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code       = wp_remote_retrieve_response_code( $response );
		$new_offset = $offset + $read_size;

		// 200 or 201 = complete, 202 = accepted (more chunks needed).
		if ( 200 === $code || 201 === $code ) {
			delete_transient( $cache_key );
			return $new_offset;
		}

		if ( 202 === $code ) {
			return $new_offset;
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$error = isset( $body['error']['message'] ) ? $body['error']['message'] : sprintf( 'HTTP %d', $code );

		return new WP_Error( 'onedrive_chunk_failed', sprintf(
			/* translators: %s: error message */
			__( 'OneDrive chunk upload failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	/**
	 * Download a file from OneDrive.
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

		$onedrive_path = $this->build_onedrive_path( $remote_path, $credentials );
		$url           = self::GRAPH_BASE . '/me/drive/root:' . $onedrive_path . ':/content';

		$response = wp_remote_get(
			$url,
			array(
				'headers'  => array(
					'Authorization' => 'Bearer ' . $token,
				),
				'timeout'  => 300,
				'stream'   => true,
				'filename' => $local_path,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'onedrive_download_failed', sprintf(
				/* translators: %s: error message */
				__( 'OneDrive download failed: %s', '5dp-backup-restore' ),
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

		return new WP_Error( 'onedrive_download_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'OneDrive download returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * Delete a file from OneDrive.
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

		$onedrive_path = $this->build_onedrive_path( $remote_path, $credentials );
		$url           = self::GRAPH_BASE . '/me/drive/root:' . $onedrive_path;

		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'DELETE',
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
				),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'onedrive_delete_failed', sprintf(
				/* translators: %s: error message */
				__( 'OneDrive delete failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 204 === $code || 200 === $code ) {
			return true;
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$error = isset( $body['error']['message'] ) ? $body['error']['message'] : sprintf( 'HTTP %d', $code );

		return new WP_Error( 'onedrive_delete_failed', sprintf(
			/* translators: %s: error message */
			__( 'OneDrive delete failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	/**
	 * List files in the OneDrive backup folder.
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
		$url         = self::GRAPH_BASE . '/me/drive/root:' . $folder_path . ':/children'
			. '?$select=name,size,lastModifiedDateTime,id&$top=1000';

		$response = wp_remote_get(
			$url,
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
				),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'onedrive_list_failed', sprintf(
				/* translators: %s: error message */
				__( 'OneDrive list failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 !== $code ) {
			$body  = json_decode( wp_remote_retrieve_body( $response ), true );
			$error = isset( $body['error']['message'] ) ? $body['error']['message'] : sprintf( 'HTTP %d', $code );

			return new WP_Error( 'onedrive_list_failed', sprintf(
				/* translators: %s: error message */
				__( 'OneDrive list failed: %s', '5dp-backup-restore' ),
				$error
			) );
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$files = array();

		if ( isset( $body['value'] ) && is_array( $body['value'] ) ) {
			foreach ( $body['value'] as $item ) {
				// Skip folders.
				if ( isset( $item['folder'] ) ) {
					continue;
				}

				$name = isset( $item['name'] ) ? $item['name'] : '';

				// Client-side prefix filtering.
				if ( ! empty( $prefix ) && 0 !== strpos( $name, $prefix ) ) {
					continue;
				}

				$files[] = array(
					'path'     => $name,
					'size'     => isset( $item['size'] ) ? (int) $item['size'] : 0,
					'modified' => isset( $item['lastModifiedDateTime'] ) ? $item['lastModifiedDateTime'] : '',
					'id'       => isset( $item['id'] ) ? $item['id'] : '',
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
		$response = wp_remote_get(
			self::GRAPH_BASE . '/me/drive?$select=id',
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
				),
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
		$client_id     = isset( $credentials['client_id'] ) ? $credentials['client_id'] : '';
		$client_secret = isset( $credentials['client_secret'] ) ? $credentials['client_secret'] : '';

		if ( empty( $refresh_token ) || empty( $client_id ) || empty( $client_secret ) ) {
			return new WP_Error( 'onedrive_missing_credentials', __( 'Refresh token, client ID, and client secret are required.', '5dp-backup-restore' ) );
		}

		$response = wp_remote_post(
			self::TOKEN_URL,
			array(
				'body' => array(
					'client_id'     => $client_id,
					'client_secret' => $client_secret,
					'refresh_token' => $refresh_token,
					'grant_type'    => 'refresh_token',
					'scope'         => 'files.readwrite.all offline_access',
				),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'onedrive_token_refresh_failed', sprintf(
				/* translators: %s: error message */
				__( 'OneDrive token refresh failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ! isset( $body['access_token'] ) ) {
			$error_msg = isset( $body['error_description'] ) ? $body['error_description'] : __( 'No access token in response.', '5dp-backup-restore' );
			return new WP_Error( 'onedrive_token_refresh_failed', sprintf(
				/* translators: %s: error message */
				__( 'OneDrive token refresh failed: %s', '5dp-backup-restore' ),
				$error_msg
			) );
		}

		$credentials['access_token'] = $body['access_token'];

		// Update refresh token if a new one was provided.
		if ( isset( $body['refresh_token'] ) ) {
			$credentials['refresh_token'] = $body['refresh_token'];
		}

		// Persist the new tokens.
		$destinations = get_option( 'fdpbr_storage_destinations', array() );
		if ( isset( $destinations['onedrive'] ) ) {
			$destinations['onedrive']['credentials']['access_token'] = FiveDPBR_Encryption::encrypt( $body['access_token'] );
			if ( isset( $body['refresh_token'] ) ) {
				$destinations['onedrive']['credentials']['refresh_token'] = FiveDPBR_Encryption::encrypt( $body['refresh_token'] );
			}
			update_option( 'fdpbr_storage_destinations', $destinations );
		}

		return $body['access_token'];
	}

	// =========================================================================
	// Upload Helpers
	// =========================================================================

	/**
	 * Simple PUT upload for files under 4 MB.
	 *
	 * @since 1.0.0
	 * @param string $local_path   Local file path.
	 * @param string $remote_path  Remote file name.
	 * @param array  $credentials  Provider credentials.
	 * @param string $token        Valid access token.
	 * @return true|WP_Error
	 */
	private function simple_upload( $local_path, $remote_path, $credentials, $token ) {
		$onedrive_path = $this->build_onedrive_path( $remote_path, $credentials );
		$url           = self::GRAPH_BASE . '/me/drive/root:' . $onedrive_path . ':/content';

		$body = file_get_contents( $local_path );
		if ( false === $body ) {
			return new WP_Error( 'onedrive_read_failed', __( 'Could not read local file.', '5dp-backup-restore' ) );
		}

		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'PUT',
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/octet-stream',
				),
				'body'    => $body,
				'timeout' => 300,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'onedrive_upload_failed', sprintf(
				/* translators: %s: error message */
				__( 'OneDrive upload failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code || 201 === $code ) {
			return true;
		}

		$body_data = json_decode( wp_remote_retrieve_body( $response ), true );
		$error     = isset( $body_data['error']['message'] ) ? $body_data['error']['message'] : sprintf( 'HTTP %d', $code );

		return new WP_Error( 'onedrive_upload_failed', sprintf(
			/* translators: %s: error message */
			__( 'OneDrive upload failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	/**
	 * Full session-based upload for large files.
	 *
	 * @since 1.0.0
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file name.
	 * @param array  $credentials Provider credentials.
	 * @param string $token       Valid access token.
	 * @return true|WP_Error
	 */
	private function session_upload_full( $local_path, $remote_path, $credentials, $token ) {
		$file_size = filesize( $local_path );
		$offset    = 0;

		while ( $offset < $file_size ) {
			$result = $this->upload_chunk( $local_path, $remote_path, $credentials, $offset );
			if ( is_wp_error( $result ) ) {
				return $result;
			}
			$offset = $result;
		}

		return true;
	}

	/**
	 * Create an upload session for large file uploads.
	 *
	 * @since 1.0.0
	 * @param string $onedrive_path Full OneDrive path.
	 * @param string $token         Valid access token.
	 * @return string|WP_Error Upload session URL or error.
	 */
	private function create_upload_session( $onedrive_path, $token ) {
		$url = self::GRAPH_BASE . '/me/drive/root:' . $onedrive_path . ':/createUploadSession';

		$response = wp_remote_post(
			$url,
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( array(
					'item' => array(
						'@microsoft.graph.conflictBehavior' => 'replace',
						'name' => basename( $onedrive_path ),
					),
				) ),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'onedrive_session_failed', sprintf(
				/* translators: %s: error message */
				__( 'OneDrive upload session creation failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( isset( $body['uploadUrl'] ) ) {
			return $body['uploadUrl'];
		}

		$error = isset( $body['error']['message'] ) ? $body['error']['message'] : __( 'No upload URL returned.', '5dp-backup-restore' );

		return new WP_Error( 'onedrive_session_failed', sprintf(
			/* translators: %s: error message */
			__( 'OneDrive upload session creation failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	// =========================================================================
	// Folder Management
	// =========================================================================

	/**
	 * Ensure the backup folder exists on OneDrive.
	 *
	 * @since 1.0.0
	 * @param array  $credentials Provider credentials.
	 * @param string $token       Valid access token.
	 * @return true|WP_Error
	 */
	private function ensure_folder_exists( $credentials, $token ) {
		$folder_path = $this->get_folder_path( $credentials );

		// Check if folder exists.
		$url = self::GRAPH_BASE . '/me/drive/root:' . $folder_path;

		$response = wp_remote_get(
			$url,
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
				),
				'timeout' => 15,
			)
		);

		if ( ! is_wp_error( $response ) && 200 === wp_remote_retrieve_response_code( $response ) ) {
			return true;
		}

		// Create the folder.
		$folder_name = ltrim( basename( $folder_path ), '/' );
		$parent_path = dirname( $folder_path );

		// Determine the parent URL.
		$parent_url = self::GRAPH_BASE . '/me/drive/root/children';
		if ( '/' !== $parent_path && '\\' !== $parent_path && '.' !== $parent_path ) {
			$parent_url = self::GRAPH_BASE . '/me/drive/root:' . $parent_path . ':/children';
		}

		$create_response = wp_remote_post(
			$parent_url,
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( array(
					'name'                              => $folder_name,
					'folder'                            => new stdClass(),
					'@microsoft.graph.conflictBehavior' => 'useExisting',
				) ),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $create_response ) ) {
			return new WP_Error( 'onedrive_folder_failed', sprintf(
				/* translators: %s: error message */
				__( 'Could not create OneDrive folder: %s', '5dp-backup-restore' ),
				$create_response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $create_response );
		if ( 200 === $code || 201 === $code ) {
			return true;
		}

		return new WP_Error( 'onedrive_folder_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'OneDrive folder creation returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	// =========================================================================
	// Path Helpers
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
	 * Build the full OneDrive file path.
	 *
	 * @since 1.0.0
	 * @param string $remote_path Remote file path.
	 * @param array  $credentials Provider credentials.
	 * @return string Full OneDrive path.
	 */
	private function build_onedrive_path( $remote_path, $credentials ) {
		$folder = $this->get_folder_path( $credentials );
		$file   = ltrim( basename( $remote_path ), '/' );
		return rtrim( $folder, '/' ) . '/' . $file;
	}
}
