<?php
/**
 * Google Cloud Storage provider.
 *
 * Uses the GCS JSON API with service account key authentication.
 * Implements self-signed JWT for OAuth2 access token exchange.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Storage_GCS
 *
 * Google Cloud Storage provider using JSON API and service account JWT authentication.
 *
 * @since 1.0.0
 */
class FiveDPBR_Storage_GCS implements FiveDPBR_Storage_Interface {

	/**
	 * GCS JSON API base URL.
	 *
	 * @var string
	 */
	const API_BASE = 'https://storage.googleapis.com/storage/v1';

	/**
	 * GCS upload base URL.
	 *
	 * @var string
	 */
	const UPLOAD_BASE = 'https://storage.googleapis.com/upload/storage/v1';

	/**
	 * GCS object download base URL.
	 *
	 * @var string
	 */
	const DOWNLOAD_BASE = 'https://storage.googleapis.com/storage/v1';

	/**
	 * Google OAuth2 token endpoint.
	 *
	 * @var string
	 */
	const TOKEN_URL = 'https://oauth2.googleapis.com/token';

	/**
	 * OAuth2 scope for GCS full control.
	 *
	 * @var string
	 */
	const SCOPE = 'https://www.googleapis.com/auth/devstorage.full_control';

	/**
	 * JWT token lifetime in seconds.
	 *
	 * @var int
	 */
	const TOKEN_LIFETIME = 3600;

	/**
	 * Cached access token.
	 *
	 * @var string|null
	 */
	private $access_token = null;

	/**
	 * Token expiry timestamp.
	 *
	 * @var int
	 */
	private $token_expires = 0;

	/**
	 * Get the provider slug.
	 *
	 * @since 1.0.0
	 * @return string
	 */
	public function get_slug() {
		return 'gcs';
	}

	/**
	 * Get the provider display name.
	 *
	 * @since 1.0.0
	 * @return string
	 */
	public function get_name() {
		return 'Google Cloud Storage';
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
				'name'        => 'service_account_json',
				'label'       => __( 'Service Account JSON Key', '5dp-backup-restore' ),
				'type'        => 'textarea',
				'encrypted'   => true,
				'required'    => true,
				'description' => __( 'Paste the full JSON key file content for your service account.', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'bucket',
				'label'       => __( 'Bucket Name', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => false,
				'required'    => true,
				'description' => __( 'The GCS bucket name.', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'path_prefix',
				'label'       => __( 'Path Prefix', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => false,
				'required'    => false,
				'default'     => '5dp-backups/',
				'description' => __( 'Optional prefix (folder) for backup files.', '5dp-backup-restore' ),
			),
		);
	}

	/**
	 * Test the connection to Google Cloud Storage.
	 *
	 * Fetches bucket metadata to verify credentials and access.
	 *
	 * @since 1.0.0
	 * @param array $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function test_connection( $credentials ) {
		$bucket = isset( $credentials['bucket'] ) ? $credentials['bucket'] : '';

		if ( empty( $bucket ) ) {
			return new WP_Error( 'gcs_missing_bucket', __( 'Bucket name is required.', '5dp-backup-restore' ) );
		}

		$token = $this->get_access_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$url = self::API_BASE . '/b/' . rawurlencode( $bucket );

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
			return new WP_Error( 'gcs_connection_failed', sprintf(
				/* translators: %s: error message */
				__( 'GCS connection failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			return true;
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$error = isset( $body['error']['message'] ) ? $body['error']['message'] : sprintf( 'HTTP %d', $code );

		return new WP_Error( 'gcs_connection_failed', sprintf(
			/* translators: %s: error message */
			__( 'GCS connection failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	/**
	 * Upload a file to Google Cloud Storage.
	 *
	 * Uses the media upload endpoint (uploadType=media).
	 *
	 * @since 1.0.0
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path/key.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function upload( $local_path, $remote_path, $credentials ) {
		if ( ! file_exists( $local_path ) || ! is_readable( $local_path ) ) {
			return new WP_Error( 'gcs_file_not_found', __( 'Local file not found or not readable.', '5dp-backup-restore' ) );
		}

		$token = $this->get_access_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$bucket      = isset( $credentials['bucket'] ) ? $credentials['bucket'] : '';
		$object_name = $this->build_object_name( $remote_path, $credentials );
		$body        = file_get_contents( $local_path );

		if ( false === $body ) {
			return new WP_Error( 'gcs_read_failed', __( 'Could not read local file.', '5dp-backup-restore' ) );
		}

		$url = self::UPLOAD_BASE . '/b/' . rawurlencode( $bucket )
			. '/o?uploadType=media&name=' . rawurlencode( $object_name );

		$response = wp_remote_post(
			$url,
			array(
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/octet-stream',
				),
				'body'    => $body,
				'timeout' => 300,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'gcs_upload_failed', sprintf(
				/* translators: %s: error message */
				__( 'GCS upload failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			return true;
		}

		$body_data = json_decode( wp_remote_retrieve_body( $response ), true );
		$error     = isset( $body_data['error']['message'] ) ? $body_data['error']['message'] : sprintf( 'HTTP %d', $code );

		return new WP_Error( 'gcs_upload_failed', sprintf(
			/* translators: %s: error message */
			__( 'GCS upload failed: %s', '5dp-backup-restore' ),
			$error
		) );
	}

	/**
	 * Upload a file chunk using GCS resumable upload.
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
			return new WP_Error( 'gcs_file_not_found', __( 'Local file not found or not readable.', '5dp-backup-restore' ) );
		}

		$token = $this->get_access_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$bucket      = isset( $credentials['bucket'] ) ? $credentials['bucket'] : '';
		$object_name = $this->build_object_name( $remote_path, $credentials );
		$file_size   = filesize( $local_path );
		$chunk_size  = 5 * 1024 * 1024; // 5 MB chunks.

		// Initiate resumable upload if starting from zero.
		$cache_key  = 'fdpbr_gcs_resumable_' . md5( $object_name );
		$session_url = get_transient( $cache_key );

		if ( 0 === $offset || empty( $session_url ) ) {
			$init_url = self::UPLOAD_BASE . '/b/' . rawurlencode( $bucket )
				. '/o?uploadType=resumable&name=' . rawurlencode( $object_name );

			$init_response = wp_remote_post(
				$init_url,
				array(
					'headers' => array(
						'Authorization'           => 'Bearer ' . $token,
						'Content-Type'            => 'application/json',
						'X-Upload-Content-Type'   => 'application/octet-stream',
						'X-Upload-Content-Length' => $file_size,
					),
					'body'    => wp_json_encode( array( 'name' => $object_name ) ),
					'timeout' => 30,
				)
			);

			if ( is_wp_error( $init_response ) ) {
				return new WP_Error( 'gcs_resumable_init_failed', sprintf(
					/* translators: %s: error message */
					__( 'GCS resumable upload init failed: %s', '5dp-backup-restore' ),
					$init_response->get_error_message()
				) );
			}

			$session_url = wp_remote_retrieve_header( $init_response, 'location' );
			if ( empty( $session_url ) ) {
				return new WP_Error( 'gcs_resumable_init_failed', __( 'No resumable session URL returned by GCS.', '5dp-backup-restore' ) );
			}

			set_transient( $cache_key, $session_url, DAY_IN_SECONDS );
		}

		// Read chunk data.
		$handle = fopen( $local_path, 'rb' );
		if ( false === $handle ) {
			return new WP_Error( 'gcs_read_failed', __( 'Could not open local file for reading.', '5dp-backup-restore' ) );
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
			return new WP_Error( 'gcs_chunk_failed', sprintf(
				/* translators: %s: error message */
				__( 'GCS chunk upload failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code      = wp_remote_retrieve_response_code( $response );
		$new_offset = $offset + $read_size;

		// 200 or 201 = complete, 308 = resume incomplete (more chunks needed).
		if ( 200 === $code || 201 === $code ) {
			delete_transient( $cache_key );
			return $new_offset;
		}

		if ( 308 === $code ) {
			return $new_offset;
		}

		return new WP_Error( 'gcs_chunk_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'GCS chunk upload returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * Download a file from Google Cloud Storage.
	 *
	 * @since 1.0.0
	 * @param string $remote_path Remote file path/key.
	 * @param string $local_path  Local destination path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function download( $remote_path, $local_path, $credentials ) {
		$token = $this->get_access_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$bucket      = isset( $credentials['bucket'] ) ? $credentials['bucket'] : '';
		$object_name = $this->build_object_name( $remote_path, $credentials );

		$url = self::DOWNLOAD_BASE . '/b/' . rawurlencode( $bucket )
			. '/o/' . rawurlencode( $object_name ) . '?alt=media';

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
			return new WP_Error( 'gcs_download_failed', sprintf(
				/* translators: %s: error message */
				__( 'GCS download failed: %s', '5dp-backup-restore' ),
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

		return new WP_Error( 'gcs_download_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'GCS download returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * Delete a file from Google Cloud Storage.
	 *
	 * @since 1.0.0
	 * @param string $remote_path Remote file path/key.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function delete( $remote_path, $credentials ) {
		$token = $this->get_access_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$bucket      = isset( $credentials['bucket'] ) ? $credentials['bucket'] : '';
		$object_name = $this->build_object_name( $remote_path, $credentials );

		$url = self::API_BASE . '/b/' . rawurlencode( $bucket )
			. '/o/' . rawurlencode( $object_name );

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
			return new WP_Error( 'gcs_delete_failed', sprintf(
				/* translators: %s: error message */
				__( 'GCS delete failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 204 === $code || 200 === $code ) {
			return true;
		}

		return new WP_Error( 'gcs_delete_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'GCS delete returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * List files in Google Cloud Storage with a given prefix.
	 *
	 * @since 1.0.0
	 * @param string $prefix      Remote path prefix.
	 * @param array  $credentials Provider credentials.
	 * @return array|WP_Error Array of file info or error.
	 */
	public function list_files( $prefix, $credentials ) {
		$token = $this->get_access_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$bucket      = isset( $credentials['bucket'] ) ? $credentials['bucket'] : '';
		$full_prefix = $this->build_object_name( $prefix, $credentials );

		$url = self::API_BASE . '/b/' . rawurlencode( $bucket )
			. '/o?prefix=' . rawurlencode( $full_prefix );

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
			return new WP_Error( 'gcs_list_failed', sprintf(
				/* translators: %s: error message */
				__( 'GCS list failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 !== $code ) {
			return new WP_Error( 'gcs_list_failed', sprintf(
				/* translators: %d: HTTP status code */
				__( 'GCS list returned HTTP %d.', '5dp-backup-restore' ),
				$code
			) );
		}

		$body  = json_decode( wp_remote_retrieve_body( $response ), true );
		$files = array();

		if ( isset( $body['items'] ) && is_array( $body['items'] ) ) {
			foreach ( $body['items'] as $item ) {
				$files[] = array(
					'path'     => isset( $item['name'] ) ? $item['name'] : '',
					'size'     => isset( $item['size'] ) ? (int) $item['size'] : 0,
					'modified' => isset( $item['updated'] ) ? $item['updated'] : '',
				);
			}
		}

		return $files;
	}

	// =========================================================================
	// JWT / OAuth2 Token Management
	// =========================================================================

	/**
	 * Get a valid OAuth2 access token.
	 *
	 * Generates a self-signed JWT from the service account key and exchanges
	 * it for an access token via Google's OAuth2 token endpoint.
	 *
	 * @since 1.0.0
	 * @param array $credentials Provider credentials.
	 * @return string|WP_Error Access token or error.
	 */
	private function get_access_token( $credentials ) {
		// Return cached token if still valid.
		if ( ! empty( $this->access_token ) && time() < $this->token_expires ) {
			return $this->access_token;
		}

		$sa_json = isset( $credentials['service_account_json'] ) ? $credentials['service_account_json'] : '';

		if ( empty( $sa_json ) ) {
			return new WP_Error( 'gcs_missing_credentials', __( 'Service account JSON key is required.', '5dp-backup-restore' ) );
		}

		$sa = json_decode( $sa_json, true );
		if ( empty( $sa ) || ! isset( $sa['client_email'] ) || ! isset( $sa['private_key'] ) ) {
			return new WP_Error( 'gcs_invalid_credentials', __( 'Invalid service account JSON key. Must contain client_email and private_key.', '5dp-backup-restore' ) );
		}

		$now = time();

		// Build JWT header.
		$header = array(
			'alg' => 'RS256',
			'typ' => 'JWT',
		);

		// Build JWT claim set.
		$claims = array(
			'iss'   => $sa['client_email'],
			'scope' => self::SCOPE,
			'aud'   => self::TOKEN_URL,
			'iat'   => $now,
			'exp'   => $now + self::TOKEN_LIFETIME,
		);

		// Encode header and claims.
		$header_b64 = $this->base64url_encode( wp_json_encode( $header ) );
		$claims_b64 = $this->base64url_encode( wp_json_encode( $claims ) );

		$signing_input = $header_b64 . '.' . $claims_b64;

		// Sign with RSA-SHA256.
		$private_key = openssl_pkey_get_private( $sa['private_key'] );
		if ( false === $private_key ) {
			return new WP_Error( 'gcs_invalid_key', __( 'Could not parse private key from service account JSON.', '5dp-backup-restore' ) );
		}

		$signature = '';
		$sign_ok   = openssl_sign( $signing_input, $signature, $private_key, OPENSSL_ALGO_SHA256 );

		if ( ! $sign_ok ) {
			return new WP_Error( 'gcs_sign_failed', __( 'Failed to sign JWT with service account key.', '5dp-backup-restore' ) );
		}

		$jwt = $signing_input . '.' . $this->base64url_encode( $signature );

		// Exchange JWT for access token.
		$response = wp_remote_post(
			self::TOKEN_URL,
			array(
				'body' => array(
					'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
					'assertion'  => $jwt,
				),
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'gcs_token_failed', sprintf(
				/* translators: %s: error message */
				__( 'GCS token exchange failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ! isset( $body['access_token'] ) ) {
			$error_msg = isset( $body['error_description'] ) ? $body['error_description'] : __( 'No access token in response.', '5dp-backup-restore' );
			return new WP_Error( 'gcs_token_failed', sprintf(
				/* translators: %s: error message */
				__( 'GCS token exchange failed: %s', '5dp-backup-restore' ),
				$error_msg
			) );
		}

		$this->access_token  = $body['access_token'];
		$this->token_expires = $now + ( isset( $body['expires_in'] ) ? (int) $body['expires_in'] - 60 : self::TOKEN_LIFETIME - 60 );

		return $this->access_token;
	}

	/**
	 * Base64url-encode data (URL-safe base64 without padding).
	 *
	 * @since 1.0.0
	 * @param string $data Data to encode.
	 * @return string Base64url-encoded string.
	 */
	private function base64url_encode( $data ) {
		return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' );
	}

	// =========================================================================
	// Path Helpers
	// =========================================================================

	/**
	 * Build the full object name with optional path prefix.
	 *
	 * @since 1.0.0
	 * @param string $remote_path Remote path.
	 * @param array  $credentials Provider credentials.
	 * @return string Full object name.
	 */
	private function build_object_name( $remote_path, $credentials ) {
		$prefix = isset( $credentials['path_prefix'] ) ? trim( $credentials['path_prefix'], '/' ) : '';
		$path   = ltrim( $remote_path, '/' );

		if ( ! empty( $prefix ) ) {
			return $prefix . '/' . $path;
		}

		return $path;
	}
}
