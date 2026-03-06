<?php
/**
 * Google Drive storage provider.
 *
 * Uses Google Drive REST API v3 with OAuth2 authentication.
 * Handles token refresh transparently.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Storage_GDrive
 *
 * Google Drive storage provider using REST API v3 and OAuth2.
 *
 * @since 1.0.0
 */
class FiveDPBR_Storage_GDrive implements FiveDPBR_Storage_Interface {

	/**
	 * Google Drive API v3 base URL.
	 *
	 * @var string
	 */
	const API_BASE = 'https://www.googleapis.com/drive/v3';

	/**
	 * Google Drive upload base URL.
	 *
	 * @var string
	 */
	const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

	/**
	 * Google OAuth2 token endpoint.
	 *
	 * @var string
	 */
	const TOKEN_URL = 'https://oauth2.googleapis.com/token';

	/**
	 * Default backup folder name.
	 *
	 * @var string
	 */
	const DEFAULT_FOLDER_NAME = '5DP Backups';

	/**
	 * Get the provider slug.
	 *
	 * @since 1.0.0
	 * @return string
	 */
	public function get_slug() {
		return 'gdrive';
	}

	/**
	 * Get the provider display name.
	 *
	 * @since 1.0.0
	 * @return string
	 */
	public function get_name() {
		return 'Google Drive';
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
				'description' => __( 'OAuth2 client ID from Google Cloud Console.', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'client_secret',
				'label'       => __( 'Client Secret', '5dp-backup-restore' ),
				'type'        => 'password',
				'encrypted'   => true,
				'required'    => true,
				'description' => __( 'OAuth2 client secret.', '5dp-backup-restore' ),
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
				'name'        => 'folder_id',
				'label'       => __( 'Folder ID', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => false,
				'required'    => false,
				'description' => __( 'Google Drive folder ID. Leave empty to auto-create a "5DP Backups" folder.', '5dp-backup-restore' ),
			),
		);
	}

	/**
	 * Test the connection to Google Drive.
	 *
	 * Lists files in the target folder to verify access.
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

		$folder_id = $this->get_folder_id( $credentials, $token );
		if ( is_wp_error( $folder_id ) ) {
			return $folder_id;
		}

		$query = rawurlencode( "'" . $folder_id . "' in parents and trashed = false" );
		$url   = self::API_BASE . '/files?q=' . $query . '&pageSize=1&fields=files(id,name)';

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
			return new WP_Error( 'gdrive_connection_failed', sprintf(
				/* translators: %s: error message */
				__( 'Google Drive connection failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			return true;
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$error = isset( $body['error']['message'] ) ? $body['error']['message'] : sprintf( 'HTTP %d', $code );

		return new WP_Error( 'gdrive_connection_failed', sprintf(
			/* translators: %s: error message */
			__( 'Google Drive connection failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	/**
	 * Upload a file to Google Drive.
	 *
	 * Uses multipart/related upload (metadata + file content).
	 *
	 * @since 1.0.0
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path/key (used as filename).
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function upload( $local_path, $remote_path, $credentials ) {
		if ( ! file_exists( $local_path ) || ! is_readable( $local_path ) ) {
			return new WP_Error( 'gdrive_file_not_found', __( 'Local file not found or not readable.', '5dp-backup-restore' ) );
		}

		$token = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$folder_id = $this->get_folder_id( $credentials, $token );
		if ( is_wp_error( $folder_id ) ) {
			return $folder_id;
		}

		$file_name    = basename( $remote_path );
		$file_content = file_get_contents( $local_path );

		if ( false === $file_content ) {
			return new WP_Error( 'gdrive_read_failed', __( 'Could not read local file.', '5dp-backup-restore' ) );
		}

		// Build multipart/related body.
		$boundary = 'fdpbr_boundary_' . wp_generate_password( 16, false );

		$metadata = wp_json_encode( array(
			'name'    => $file_name,
			'parents' => array( $folder_id ),
		) );

		$body  = '--' . $boundary . "\r\n";
		$body .= "Content-Type: application/json; charset=UTF-8\r\n\r\n";
		$body .= $metadata . "\r\n";
		$body .= '--' . $boundary . "\r\n";
		$body .= "Content-Type: application/octet-stream\r\n\r\n";
		$body .= $file_content . "\r\n";
		$body .= '--' . $boundary . "--\r\n";

		$url = self::UPLOAD_BASE . '/files?uploadType=multipart&fields=id,name';

		$response = wp_remote_post(
			$url,
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'multipart/related; boundary=' . $boundary,
					'Content-Length' => strlen( $body ),
				),
				'body'    => $body,
				'timeout' => 300,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'gdrive_upload_failed', sprintf(
				/* translators: %s: error message */
				__( 'Google Drive upload failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			return true;
		}

		$body_data = json_decode( wp_remote_retrieve_body( $response ), true );
		$error     = isset( $body_data['error']['message'] ) ? $body_data['error']['message'] : sprintf( 'HTTP %d', $code );

		return new WP_Error( 'gdrive_upload_failed', sprintf(
			/* translators: %s: error message */
			__( 'Google Drive upload failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	/**
	 * Upload a file chunk using Google Drive resumable upload.
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
			return new WP_Error( 'gdrive_file_not_found', __( 'Local file not found or not readable.', '5dp-backup-restore' ) );
		}

		$token = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$folder_id  = $this->get_folder_id( $credentials, $token );
		if ( is_wp_error( $folder_id ) ) {
			return $folder_id;
		}

		$file_name  = basename( $remote_path );
		$file_size  = filesize( $local_path );
		$chunk_size = 5 * 1024 * 1024; // 5 MB.

		// Initiate resumable upload session if starting from zero.
		$cache_key   = 'fdpbr_gdrive_resumable_' . md5( $remote_path );
		$session_url = get_transient( $cache_key );

		if ( 0 === $offset || empty( $session_url ) ) {
			$metadata = wp_json_encode( array(
				'name'    => $file_name,
				'parents' => array( $folder_id ),
			) );

			$init_url = self::UPLOAD_BASE . '/files?uploadType=resumable';

			$init_response = wp_remote_post(
				$init_url,
				array(
					'headers' => array(
						'Authorization'           => 'Bearer ' . $token,
						'Content-Type'            => 'application/json; charset=UTF-8',
						'X-Upload-Content-Type'   => 'application/octet-stream',
						'X-Upload-Content-Length' => $file_size,
					),
					'body'    => $metadata,
					'timeout' => 30,
				)
			);

			if ( is_wp_error( $init_response ) ) {
				return new WP_Error( 'gdrive_resumable_init_failed', sprintf(
					/* translators: %s: error message */
					__( 'Google Drive resumable upload init failed: %s', '5dp-backup-restore' ),
					$init_response->get_error_message()
				) );
			}

			$session_url = wp_remote_retrieve_header( $init_response, 'location' );
			if ( empty( $session_url ) ) {
				return new WP_Error( 'gdrive_resumable_init_failed', __( 'No resumable session URL returned.', '5dp-backup-restore' ) );
			}

			set_transient( $cache_key, $session_url, DAY_IN_SECONDS );
		}

		// Read chunk data.
		$handle = fopen( $local_path, 'rb' );
		if ( false === $handle ) {
			return new WP_Error( 'gdrive_read_failed', __( 'Could not open local file for reading.', '5dp-backup-restore' ) );
		}

		fseek( $handle, $offset );
		$remaining  = $file_size - $offset;
		$read_size  = min( $chunk_size, $remaining );
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
			return new WP_Error( 'gdrive_chunk_failed', sprintf(
				/* translators: %s: error message */
				__( 'Google Drive chunk upload failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code       = wp_remote_retrieve_response_code( $response );
		$new_offset = $offset + $read_size;

		// 200 or 201 = complete, 308 = resume incomplete.
		if ( 200 === $code || 201 === $code ) {
			delete_transient( $cache_key );
			return $new_offset;
		}

		if ( 308 === $code ) {
			return $new_offset;
		}

		return new WP_Error( 'gdrive_chunk_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'Google Drive chunk upload returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * Download a file from Google Drive.
	 *
	 * @since 1.0.0
	 * @param string $remote_path Remote file path/key (file name in the backup folder).
	 * @param string $local_path  Local destination path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function download( $remote_path, $local_path, $credentials ) {
		$token = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$file_id = $this->find_file_id( $remote_path, $credentials, $token );
		if ( is_wp_error( $file_id ) ) {
			return $file_id;
		}

		$url = self::API_BASE . '/files/' . $file_id . '?alt=media';

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
			return new WP_Error( 'gdrive_download_failed', sprintf(
				/* translators: %s: error message */
				__( 'Google Drive download failed: %s', '5dp-backup-restore' ),
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

		return new WP_Error( 'gdrive_download_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'Google Drive download returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * Delete a file from Google Drive.
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

		$file_id = $this->find_file_id( $remote_path, $credentials, $token );
		if ( is_wp_error( $file_id ) ) {
			return $file_id;
		}

		$url = self::API_BASE . '/files/' . $file_id;

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
			return new WP_Error( 'gdrive_delete_failed', sprintf(
				/* translators: %s: error message */
				__( 'Google Drive delete failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 204 === $code || 200 === $code ) {
			return true;
		}

		return new WP_Error( 'gdrive_delete_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'Google Drive delete returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * List files in the Google Drive backup folder.
	 *
	 * @since 1.0.0
	 * @param string $prefix      Filename prefix to filter by (unused for Drive, but maintained for interface).
	 * @param array  $credentials Provider credentials.
	 * @return array|WP_Error Array of file info or error.
	 */
	public function list_files( $prefix, $credentials ) {
		$token = $this->ensure_valid_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$folder_id = $this->get_folder_id( $credentials, $token );
		if ( is_wp_error( $folder_id ) ) {
			return $folder_id;
		}

		$query = "'" . $folder_id . "' in parents and trashed = false";
		if ( ! empty( $prefix ) ) {
			$query .= " and name contains '" . addcslashes( $prefix, "\\'" ) . "'";
		}

		$url = self::API_BASE . '/files?q=' . rawurlencode( $query )
			. '&fields=' . rawurlencode( 'files(id,name,size,modifiedTime)' )
			. '&pageSize=1000&orderBy=modifiedTime desc';

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
			return new WP_Error( 'gdrive_list_failed', sprintf(
				/* translators: %s: error message */
				__( 'Google Drive list failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 !== $code ) {
			return new WP_Error( 'gdrive_list_failed', sprintf(
				/* translators: %d: HTTP status code */
				__( 'Google Drive list returned HTTP %d.', '5dp-backup-restore' ),
				$code
			) );
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$files = array();

		if ( isset( $body['files'] ) && is_array( $body['files'] ) ) {
			foreach ( $body['files'] as $file ) {
				$files[] = array(
					'path'     => isset( $file['name'] ) ? $file['name'] : '',
					'size'     => isset( $file['size'] ) ? (int) $file['size'] : 0,
					'modified' => isset( $file['modifiedTime'] ) ? $file['modifiedTime'] : '',
					'id'       => isset( $file['id'] ) ? $file['id'] : '',
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

		// Test if the current token works with a lightweight request.
		$response = wp_remote_get(
			self::API_BASE . '/about?fields=user',
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

		// Token is invalid or expired, refresh it.
		return $this->refresh_access_token( $credentials );
	}

	/**
	 * Refresh the OAuth2 access token using the refresh token.
	 *
	 * Updates the stored credentials with the new access token.
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
			return new WP_Error( 'gdrive_missing_credentials', __( 'Refresh token, client ID, and client secret are required.', '5dp-backup-restore' ) );
		}

		$response = wp_remote_post(
			self::TOKEN_URL,
			array(
				'body' => array(
					'client_id'     => $client_id,
					'client_secret' => $client_secret,
					'refresh_token' => $refresh_token,
					'grant_type'    => 'refresh_token',
				),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'gdrive_token_refresh_failed', sprintf(
				/* translators: %s: error message */
				__( 'Google Drive token refresh failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ! isset( $body['access_token'] ) ) {
			$error_msg = isset( $body['error_description'] ) ? $body['error_description'] : __( 'No access token in response.', '5dp-backup-restore' );
			return new WP_Error( 'gdrive_token_refresh_failed', sprintf(
				/* translators: %s: error message */
				__( 'Google Drive token refresh failed: %s', '5dp-backup-restore' ),
				$error_msg
			) );
		}

		$credentials['access_token'] = $body['access_token'];

		// Persist the new token.
		$this->save_updated_token( $body['access_token'] );

		return $body['access_token'];
	}

	/**
	 * Save the updated access token to the database.
	 *
	 * @since 1.0.0
	 * @param string $new_token New access token.
	 */
	private function save_updated_token( $new_token ) {
		$destinations = get_option( 'fdpbr_storage_destinations', array() );

		if ( isset( $destinations['gdrive'] ) ) {
			$destinations['gdrive']['credentials']['access_token'] = FiveDPBR_Encryption::encrypt( $new_token );
			update_option( 'fdpbr_storage_destinations', $destinations );
		}
	}

	// =========================================================================
	// Folder Management
	// =========================================================================

	/**
	 * Get the folder ID, creating the default folder if necessary.
	 *
	 * @since 1.0.0
	 * @param array  $credentials Provider credentials.
	 * @param string $token       Valid access token.
	 * @return string|WP_Error Folder ID or error.
	 */
	private function get_folder_id( $credentials, $token ) {
		$folder_id = isset( $credentials['folder_id'] ) ? $credentials['folder_id'] : '';

		if ( ! empty( $folder_id ) ) {
			return $folder_id;
		}

		// Search for existing folder.
		$query = rawurlencode(
			"name = '" . self::DEFAULT_FOLDER_NAME . "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
		);
		$url = self::API_BASE . '/files?q=' . $query . '&fields=files(id,name)&pageSize=1';

		$response = wp_remote_get(
			$url,
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
				),
				'timeout' => 30,
			)
		);

		if ( ! is_wp_error( $response ) && 200 === wp_remote_retrieve_response_code( $response ) ) {
			$body = json_decode( wp_remote_retrieve_body( $response ), true );
			if ( ! empty( $body['files'][0]['id'] ) ) {
				return $body['files'][0]['id'];
			}
		}

		// Create the folder.
		$create_response = wp_remote_post(
			self::API_BASE . '/files',
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( array(
					'name'     => self::DEFAULT_FOLDER_NAME,
					'mimeType' => 'application/vnd.google-apps.folder',
				) ),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $create_response ) ) {
			return new WP_Error( 'gdrive_folder_failed', sprintf(
				/* translators: %s: error message */
				__( 'Could not create backup folder: %s', '5dp-backup-restore' ),
				$create_response->get_error_message()
			) );
		}

		$create_body = json_decode( wp_remote_retrieve_body( $create_response ), true );
		if ( isset( $create_body['id'] ) ) {
			return $create_body['id'];
		}

		return new WP_Error( 'gdrive_folder_failed', __( 'Could not create or find the backup folder on Google Drive.', '5dp-backup-restore' ) );
	}

	/**
	 * Find a file ID by name in the backup folder.
	 *
	 * @since 1.0.0
	 * @param string $remote_path File name / remote path.
	 * @param array  $credentials Provider credentials.
	 * @param string $token       Valid access token.
	 * @return string|WP_Error File ID or error.
	 */
	private function find_file_id( $remote_path, $credentials, $token ) {
		$folder_id = $this->get_folder_id( $credentials, $token );
		if ( is_wp_error( $folder_id ) ) {
			return $folder_id;
		}

		$file_name = basename( $remote_path );
		$query     = "'" . $folder_id . "' in parents and name = '" . addcslashes( $file_name, "\\'" ) . "' and trashed = false";
		$url       = self::API_BASE . '/files?q=' . rawurlencode( $query ) . '&fields=files(id)&pageSize=1';

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
			return new WP_Error( 'gdrive_file_not_found', sprintf(
				/* translators: %s: error message */
				__( 'Could not search for file: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! empty( $body['files'][0]['id'] ) ) {
			return $body['files'][0]['id'];
		}

		return new WP_Error( 'gdrive_file_not_found', sprintf(
			/* translators: %s: file name */
			__( 'File not found on Google Drive: %s', '5dp-backup-restore' ),
			$file_name
		) );
	}
}
