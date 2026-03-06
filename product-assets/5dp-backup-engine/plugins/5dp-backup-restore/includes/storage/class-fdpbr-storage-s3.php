<?php
/**
 * Amazon S3 Compatible storage provider.
 *
 * Pure PHP AWS Signature V4 implementation using wp_remote_request.
 * Supports AWS S3, Wasabi, DigitalOcean Spaces, Backblaze B2, MinIO, Cloudflare R2.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Storage_S3
 *
 * Amazon S3 Compatible storage provider with pure PHP AWS Signature V4 signing.
 *
 * @since 1.0.0
 */
class FiveDPBR_Storage_S3 implements FiveDPBR_Storage_Interface {

	/**
	 * Default S3 region.
	 *
	 * @var string
	 */
	const DEFAULT_REGION = 'us-east-1';

	/**
	 * S3 service name for signing.
	 *
	 * @var string
	 */
	const SERVICE = 's3';

	/**
	 * Minimum chunk size for multipart uploads (5 MB).
	 *
	 * @var int
	 */
	const MIN_CHUNK_SIZE = 5242880;

	/**
	 * Get the provider slug.
	 *
	 * @since 1.0.0
	 * @return string
	 */
	public function get_slug() {
		return 's3';
	}

	/**
	 * Get the provider display name.
	 *
	 * @since 1.0.0
	 * @return string
	 */
	public function get_name() {
		return 'Amazon S3 Compatible';
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
				'name'        => 'access_key',
				'label'       => __( 'Access Key', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => true,
				'required'    => true,
				'description' => __( 'Your S3-compatible access key ID.', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'secret_key',
				'label'       => __( 'Secret Key', '5dp-backup-restore' ),
				'type'        => 'password',
				'encrypted'   => true,
				'required'    => true,
				'description' => __( 'Your S3-compatible secret access key.', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'bucket',
				'label'       => __( 'Bucket', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => false,
				'required'    => true,
				'description' => __( 'The S3 bucket name.', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'region',
				'label'       => __( 'Region', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => false,
				'required'    => true,
				'default'     => 'us-east-1',
				'description' => __( 'The bucket region (e.g., us-east-1).', '5dp-backup-restore' ),
			),
			array(
				'name'        => 'endpoint',
				'label'       => __( 'Custom Endpoint', '5dp-backup-restore' ),
				'type'        => 'text',
				'encrypted'   => false,
				'required'    => false,
				'description' => __( 'Custom endpoint URL for S3-compatible services (e.g., https://s3.wasabisys.com). Leave empty for AWS S3.', '5dp-backup-restore' ),
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
	 * Test the connection to the S3-compatible storage.
	 *
	 * Performs a HEAD request on the bucket to verify access.
	 *
	 * @since 1.0.0
	 * @param array $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function test_connection( $credentials ) {
		$bucket   = isset( $credentials['bucket'] ) ? $credentials['bucket'] : '';
		$region   = isset( $credentials['region'] ) ? $credentials['region'] : self::DEFAULT_REGION;
		$endpoint = $this->get_endpoint( $credentials );

		if ( empty( $bucket ) ) {
			return new WP_Error( 's3_missing_bucket', __( 'Bucket name is required.', '5dp-backup-restore' ) );
		}

		$url     = $endpoint . '/';
		$headers = array(
			'Host' => $this->get_host( $credentials ),
		);

		$signed_headers = $this->sign_request( 'HEAD', $url, $headers, '', $credentials );
		if ( is_wp_error( $signed_headers ) ) {
			return $signed_headers;
		}

		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'HEAD',
				'headers' => $signed_headers,
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 's3_connection_failed', sprintf(
				/* translators: %s: error message */
				__( 'S3 connection failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code >= 200 && $code < 400 ) {
			return true;
		}

		return new WP_Error( 's3_connection_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'S3 returned HTTP %d. Check your credentials and bucket name.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * Upload a file to S3 using a single PUT request.
	 *
	 * @since 1.0.0
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path/key.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function upload( $local_path, $remote_path, $credentials ) {
		if ( ! file_exists( $local_path ) || ! is_readable( $local_path ) ) {
			return new WP_Error( 's3_file_not_found', __( 'Local file not found or not readable.', '5dp-backup-restore' ) );
		}

		$key      = $this->build_key( $remote_path, $credentials );
		$endpoint = $this->get_endpoint( $credentials );
		$url      = $endpoint . '/' . rawurlencode( $key );
		$body     = file_get_contents( $local_path );

		if ( false === $body ) {
			return new WP_Error( 's3_read_failed', __( 'Could not read local file.', '5dp-backup-restore' ) );
		}

		$content_type = 'application/octet-stream';
		$headers      = array(
			'Host'           => $this->get_host( $credentials ),
			'Content-Type'   => $content_type,
			'Content-Length' => strlen( $body ),
		);

		$signed_headers = $this->sign_request( 'PUT', $url, $headers, $body, $credentials );
		if ( is_wp_error( $signed_headers ) ) {
			return $signed_headers;
		}

		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'PUT',
				'headers' => $signed_headers,
				'body'    => $body,
				'timeout' => 300,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 's3_upload_failed', sprintf(
				/* translators: %s: error message */
				__( 'S3 upload failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			return true;
		}

		return new WP_Error( 's3_upload_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'S3 upload returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * Upload a file using S3 multipart upload.
	 *
	 * Manages CreateMultipartUpload, UploadPart, and CompleteMultipartUpload.
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
			return new WP_Error( 's3_file_not_found', __( 'Local file not found or not readable.', '5dp-backup-restore' ) );
		}

		$key       = $this->build_key( $remote_path, $credentials );
		$endpoint  = $this->get_endpoint( $credentials );
		$file_size = filesize( $local_path );
		$chunk_size = self::MIN_CHUNK_SIZE;

		// Step 1: Initiate multipart upload if starting from zero.
		$upload_id = $this->get_cached_upload_id( $key );
		if ( 0 === $offset || empty( $upload_id ) ) {
			$upload_id = $this->create_multipart_upload( $key, $credentials );
			if ( is_wp_error( $upload_id ) ) {
				return $upload_id;
			}
			$this->cache_upload_id( $key, $upload_id );
		}

		// Step 2: Upload a single part.
		$part_number = (int) floor( $offset / $chunk_size ) + 1;
		$handle      = fopen( $local_path, 'rb' );

		if ( false === $handle ) {
			return new WP_Error( 's3_read_failed', __( 'Could not open local file for reading.', '5dp-backup-restore' ) );
		}

		fseek( $handle, $offset );
		$remaining  = $file_size - $offset;
		$read_size  = min( $chunk_size, $remaining );
		$chunk_data = fread( $handle, $read_size );
		fclose( $handle );

		$url = $endpoint . '/' . rawurlencode( $key )
			. '?partNumber=' . $part_number
			. '&uploadId=' . rawurlencode( $upload_id );

		$headers = array(
			'Host'           => $this->get_host( $credentials ),
			'Content-Length' => strlen( $chunk_data ),
		);

		$signed_headers = $this->sign_request( 'PUT', $url, $headers, $chunk_data, $credentials );
		if ( is_wp_error( $signed_headers ) ) {
			return $signed_headers;
		}

		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'PUT',
				'headers' => $signed_headers,
				'body'    => $chunk_data,
				'timeout' => 300,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 's3_chunk_failed', sprintf(
				/* translators: %s: error message */
				__( 'S3 chunk upload failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 !== $code ) {
			return new WP_Error( 's3_chunk_failed', sprintf(
				/* translators: %d: HTTP status code */
				__( 'S3 chunk upload returned HTTP %d.', '5dp-backup-restore' ),
				$code
			) );
		}

		$etag = wp_remote_retrieve_header( $response, 'etag' );
		$this->cache_part_etag( $key, $part_number, $etag );

		$new_offset = $offset + $read_size;

		// Step 3: Complete multipart upload if all parts are uploaded.
		if ( $new_offset >= $file_size ) {
			$complete = $this->complete_multipart_upload( $key, $upload_id, $credentials );
			if ( is_wp_error( $complete ) ) {
				return $complete;
			}
			$this->clear_upload_cache( $key );
		}

		return $new_offset;
	}

	/**
	 * Download a file from S3.
	 *
	 * @since 1.0.0
	 * @param string $remote_path Remote file path/key.
	 * @param string $local_path  Local destination path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function download( $remote_path, $local_path, $credentials ) {
		$key      = $this->build_key( $remote_path, $credentials );
		$endpoint = $this->get_endpoint( $credentials );
		$url      = $endpoint . '/' . rawurlencode( $key );

		$headers = array(
			'Host' => $this->get_host( $credentials ),
		);

		$signed_headers = $this->sign_request( 'GET', $url, $headers, '', $credentials );
		if ( is_wp_error( $signed_headers ) ) {
			return $signed_headers;
		}

		$response = wp_remote_get(
			$url,
			array(
				'headers'  => $signed_headers,
				'timeout'  => 300,
				'stream'   => true,
				'filename' => $local_path,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 's3_download_failed', sprintf(
				/* translators: %s: error message */
				__( 'S3 download failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			return true;
		}

		// Clean up partial download.
		if ( file_exists( $local_path ) ) {
			wp_delete_file( $local_path );
		}

		return new WP_Error( 's3_download_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'S3 download returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * Delete a file from S3.
	 *
	 * @since 1.0.0
	 * @param string $remote_path Remote file path/key.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function delete( $remote_path, $credentials ) {
		$key      = $this->build_key( $remote_path, $credentials );
		$endpoint = $this->get_endpoint( $credentials );
		$url      = $endpoint . '/' . rawurlencode( $key );

		$headers = array(
			'Host' => $this->get_host( $credentials ),
		);

		$signed_headers = $this->sign_request( 'DELETE', $url, $headers, '', $credentials );
		if ( is_wp_error( $signed_headers ) ) {
			return $signed_headers;
		}

		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'DELETE',
				'headers' => $signed_headers,
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 's3_delete_failed', sprintf(
				/* translators: %s: error message */
				__( 'S3 delete failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( $code >= 200 && $code < 300 ) {
			return true;
		}

		return new WP_Error( 's3_delete_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'S3 delete returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	/**
	 * List files in S3 with a given prefix.
	 *
	 * Uses ListObjectsV2 (list-type=2).
	 *
	 * @since 1.0.0
	 * @param string $prefix      Remote path prefix.
	 * @param array  $credentials Provider credentials.
	 * @return array|WP_Error Array of file info or error.
	 */
	public function list_files( $prefix, $credentials ) {
		$full_prefix = $this->build_key( $prefix, $credentials );
		$endpoint    = $this->get_endpoint( $credentials );
		$url         = $endpoint . '/?list-type=2&prefix=' . rawurlencode( $full_prefix );

		$headers = array(
			'Host' => $this->get_host( $credentials ),
		);

		$signed_headers = $this->sign_request( 'GET', $url, $headers, '', $credentials );
		if ( is_wp_error( $signed_headers ) ) {
			return $signed_headers;
		}

		$response = wp_remote_get(
			$url,
			array(
				'headers' => $signed_headers,
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 's3_list_failed', sprintf(
				/* translators: %s: error message */
				__( 'S3 list failed: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 !== $code ) {
			return new WP_Error( 's3_list_failed', sprintf(
				/* translators: %d: HTTP status code */
				__( 'S3 list returned HTTP %d.', '5dp-backup-restore' ),
				$code
			) );
		}

		$body = wp_remote_retrieve_body( $response );
		return $this->parse_list_objects_response( $body );
	}

	// =========================================================================
	// AWS Signature V4 Implementation
	// =========================================================================

	/**
	 * Sign an HTTP request using AWS Signature Version 4.
	 *
	 * Creates the canonical request, string to sign, signing key, and
	 * authorization header per the AWS Signature V4 specification.
	 *
	 * @since 1.0.0
	 * @param string $method      HTTP method (GET, PUT, DELETE, HEAD, POST).
	 * @param string $url         Full request URL.
	 * @param array  $headers     Request headers (Host is required).
	 * @param string $payload     Request body (empty string for no body).
	 * @param array  $credentials Provider credentials with access_key, secret_key, region.
	 * @return array|WP_Error Signed headers array or error.
	 */
	private function sign_request( $method, $url, $headers, $payload, $credentials ) {
		$access_key = isset( $credentials['access_key'] ) ? $credentials['access_key'] : '';
		$secret_key = isset( $credentials['secret_key'] ) ? $credentials['secret_key'] : '';
		$region     = isset( $credentials['region'] ) ? $credentials['region'] : self::DEFAULT_REGION;

		if ( empty( $access_key ) || empty( $secret_key ) ) {
			return new WP_Error( 's3_missing_credentials', __( 'Access key and secret key are required.', '5dp-backup-restore' ) );
		}

		// Parse the URL.
		$parsed = wp_parse_url( $url );
		$path   = isset( $parsed['path'] ) ? $parsed['path'] : '/';
		$query  = isset( $parsed['query'] ) ? $parsed['query'] : '';

		// Timestamp values.
		$timestamp  = gmdate( 'Ymd\THis\Z' );
		$date_stamp = gmdate( 'Ymd' );

		// Add required headers.
		$headers['x-amz-date']           = $timestamp;
		$headers['x-amz-content-sha256'] = hash( 'sha256', $payload );

		// Step 1: Create canonical request.
		// Sort query parameters.
		$canonical_query = $this->build_canonical_query_string( $query );

		// Sort headers by lowercase name.
		$canonical_headers = '';
		$signed_headers_list = array();
		$lower_headers = array();
		foreach ( $headers as $name => $value ) {
			$lower_headers[ strtolower( $name ) ] = trim( $value );
		}
		ksort( $lower_headers );
		foreach ( $lower_headers as $name => $value ) {
			$canonical_headers .= $name . ':' . $value . "\n";
			$signed_headers_list[] = $name;
		}
		$signed_headers_str = implode( ';', $signed_headers_list );

		$payload_hash = hash( 'sha256', $payload );

		$canonical_request = implode( "\n", array(
			$method,
			$this->uri_encode_path( $path ),
			$canonical_query,
			$canonical_headers,
			$signed_headers_str,
			$payload_hash,
		) );

		// Step 2: Create string to sign.
		$credential_scope = $date_stamp . '/' . $region . '/' . self::SERVICE . '/aws4_request';

		$string_to_sign = implode( "\n", array(
			'AWS4-HMAC-SHA256',
			$timestamp,
			$credential_scope,
			hash( 'sha256', $canonical_request ),
		) );

		// Step 3: Calculate the signing key.
		$k_date    = hash_hmac( 'sha256', $date_stamp, 'AWS4' . $secret_key, true );
		$k_region  = hash_hmac( 'sha256', $region, $k_date, true );
		$k_service = hash_hmac( 'sha256', self::SERVICE, $k_region, true );
		$k_signing = hash_hmac( 'sha256', 'aws4_request', $k_service, true );

		// Step 4: Create the signature.
		$signature = hash_hmac( 'sha256', $string_to_sign, $k_signing );

		// Step 5: Build the authorization header.
		$authorization = sprintf(
			'AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s',
			$access_key,
			$credential_scope,
			$signed_headers_str,
			$signature
		);

		$headers['Authorization'] = $authorization;

		return $headers;
	}

	/**
	 * Build a canonical query string for Signature V4.
	 *
	 * Parses the query string, sorts parameters by name, and re-encodes them.
	 *
	 * @since 1.0.0
	 * @param string $query Raw query string.
	 * @return string Canonical query string.
	 */
	private function build_canonical_query_string( $query ) {
		if ( empty( $query ) ) {
			return '';
		}

		$params = array();
		parse_str( $query, $parsed );
		foreach ( $parsed as $key => $value ) {
			$params[ rawurlencode( $key ) ] = rawurlencode( $value );
		}
		ksort( $params );

		$parts = array();
		foreach ( $params as $key => $value ) {
			$parts[] = $key . '=' . $value;
		}

		return implode( '&', $parts );
	}

	/**
	 * URI-encode a path component for the canonical request.
	 *
	 * Each path segment is individually URI-encoded, preserving '/'.
	 *
	 * @since 1.0.0
	 * @param string $path URL path.
	 * @return string Encoded path.
	 */
	private function uri_encode_path( $path ) {
		$segments = explode( '/', $path );
		$encoded  = array();
		foreach ( $segments as $segment ) {
			$encoded[] = rawurlencode( rawurldecode( $segment ) );
		}
		return implode( '/', $encoded );
	}

	// =========================================================================
	// Multipart Upload Helpers
	// =========================================================================

	/**
	 * Initiate a multipart upload (CreateMultipartUpload).
	 *
	 * @since 1.0.0
	 * @param string $key         Object key.
	 * @param array  $credentials Provider credentials.
	 * @return string|WP_Error Upload ID or error.
	 */
	private function create_multipart_upload( $key, $credentials ) {
		$endpoint = $this->get_endpoint( $credentials );
		$url      = $endpoint . '/' . rawurlencode( $key ) . '?uploads';

		$headers = array(
			'Host'         => $this->get_host( $credentials ),
			'Content-Type' => 'application/octet-stream',
		);

		$signed_headers = $this->sign_request( 'POST', $url, $headers, '', $credentials );
		if ( is_wp_error( $signed_headers ) ) {
			return $signed_headers;
		}

		$response = wp_remote_post(
			$url,
			array(
				'headers' => $signed_headers,
				'body'    => '',
				'timeout' => 30,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 's3_multipart_init_failed', sprintf(
				/* translators: %s: error message */
				__( 'Failed to initiate multipart upload: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$body = wp_remote_retrieve_body( $response );
		if ( preg_match( '/<UploadId>(.+?)<\/UploadId>/', $body, $matches ) ) {
			return $matches[1];
		}

		return new WP_Error( 's3_multipart_init_failed', __( 'Could not parse upload ID from S3 response.', '5dp-backup-restore' ) );
	}

	/**
	 * Complete a multipart upload (CompleteMultipartUpload).
	 *
	 * @since 1.0.0
	 * @param string $key         Object key.
	 * @param string $upload_id   Multipart upload ID.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	private function complete_multipart_upload( $key, $upload_id, $credentials ) {
		$endpoint = $this->get_endpoint( $credentials );
		$url      = $endpoint . '/' . rawurlencode( $key ) . '?uploadId=' . rawurlencode( $upload_id );

		// Build the completion XML from cached ETags.
		$etags = $this->get_cached_part_etags( $key );
		$xml   = '<CompleteMultipartUpload>';
		foreach ( $etags as $part_number => $etag ) {
			$xml .= '<Part>';
			$xml .= '<PartNumber>' . intval( $part_number ) . '</PartNumber>';
			$xml .= '<ETag>' . esc_html( $etag ) . '</ETag>';
			$xml .= '</Part>';
		}
		$xml .= '</CompleteMultipartUpload>';

		$headers = array(
			'Host'           => $this->get_host( $credentials ),
			'Content-Type'   => 'application/xml',
			'Content-Length' => strlen( $xml ),
		);

		$signed_headers = $this->sign_request( 'POST', $url, $headers, $xml, $credentials );
		if ( is_wp_error( $signed_headers ) ) {
			return $signed_headers;
		}

		$response = wp_remote_post(
			$url,
			array(
				'headers' => $signed_headers,
				'body'    => $xml,
				'timeout' => 60,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error( 's3_multipart_complete_failed', sprintf(
				/* translators: %s: error message */
				__( 'Failed to complete multipart upload: %s', '5dp-backup-restore' ),
				$response->get_error_message()
			) );
		}

		$code = wp_remote_retrieve_response_code( $response );
		if ( 200 === $code ) {
			return true;
		}

		return new WP_Error( 's3_multipart_complete_failed', sprintf(
			/* translators: %d: HTTP status code */
			__( 'Complete multipart upload returned HTTP %d.', '5dp-backup-restore' ),
			$code
		) );
	}

	// =========================================================================
	// Upload Cache Helpers (transient-based for multipart state)
	// =========================================================================

	/**
	 * Get cached upload ID for a key.
	 *
	 * @since 1.0.0
	 * @param string $key Object key.
	 * @return string|false Upload ID or false.
	 */
	private function get_cached_upload_id( $key ) {
		return get_transient( 'fdpbr_s3_upload_' . md5( $key ) );
	}

	/**
	 * Cache the upload ID for a key.
	 *
	 * @since 1.0.0
	 * @param string $key       Object key.
	 * @param string $upload_id Upload ID.
	 */
	private function cache_upload_id( $key, $upload_id ) {
		set_transient( 'fdpbr_s3_upload_' . md5( $key ), $upload_id, DAY_IN_SECONDS );
	}

	/**
	 * Cache an ETag for a part.
	 *
	 * @since 1.0.0
	 * @param string $key         Object key.
	 * @param int    $part_number Part number.
	 * @param string $etag        ETag value.
	 */
	private function cache_part_etag( $key, $part_number, $etag ) {
		$etags = $this->get_cached_part_etags( $key );
		$etags[ $part_number ] = $etag;
		set_transient( 'fdpbr_s3_etags_' . md5( $key ), $etags, DAY_IN_SECONDS );
	}

	/**
	 * Get all cached part ETags for a key.
	 *
	 * @since 1.0.0
	 * @param string $key Object key.
	 * @return array Part ETags keyed by part number.
	 */
	private function get_cached_part_etags( $key ) {
		$etags = get_transient( 'fdpbr_s3_etags_' . md5( $key ) );
		return is_array( $etags ) ? $etags : array();
	}

	/**
	 * Clear all upload cache for a key.
	 *
	 * @since 1.0.0
	 * @param string $key Object key.
	 */
	private function clear_upload_cache( $key ) {
		delete_transient( 'fdpbr_s3_upload_' . md5( $key ) );
		delete_transient( 'fdpbr_s3_etags_' . md5( $key ) );
	}

	// =========================================================================
	// URL / Path Helpers
	// =========================================================================

	/**
	 * Get the S3 endpoint URL (bucket virtual-hosted or path-style).
	 *
	 * For custom endpoints, uses path-style: https://endpoint/bucket.
	 * For AWS, uses virtual-hosted: https://bucket.s3.region.amazonaws.com.
	 *
	 * @since 1.0.0
	 * @param array $credentials Provider credentials.
	 * @return string Endpoint URL.
	 */
	private function get_endpoint( $credentials ) {
		$bucket   = isset( $credentials['bucket'] ) ? $credentials['bucket'] : '';
		$region   = isset( $credentials['region'] ) ? $credentials['region'] : self::DEFAULT_REGION;
		$endpoint = isset( $credentials['endpoint'] ) ? trim( $credentials['endpoint'] ) : '';

		if ( ! empty( $endpoint ) ) {
			// Custom endpoint: use path-style URL.
			$endpoint = rtrim( $endpoint, '/' );
			return $endpoint . '/' . $bucket;
		}

		// AWS default: virtual-hosted style.
		return 'https://' . $bucket . '.s3.' . $region . '.amazonaws.com';
	}

	/**
	 * Get the Host header value.
	 *
	 * @since 1.0.0
	 * @param array $credentials Provider credentials.
	 * @return string Host header value.
	 */
	private function get_host( $credentials ) {
		$endpoint = $this->get_endpoint( $credentials );
		$parsed   = wp_parse_url( $endpoint );
		return isset( $parsed['host'] ) ? $parsed['host'] : '';
	}

	/**
	 * Build the full object key with optional path prefix.
	 *
	 * @since 1.0.0
	 * @param string $remote_path Remote path.
	 * @param array  $credentials Provider credentials.
	 * @return string Full object key.
	 */
	private function build_key( $remote_path, $credentials ) {
		$prefix = isset( $credentials['path_prefix'] ) ? trim( $credentials['path_prefix'], '/' ) : '';
		$path   = ltrim( $remote_path, '/' );

		if ( ! empty( $prefix ) ) {
			return $prefix . '/' . $path;
		}

		return $path;
	}

	/**
	 * Parse a ListObjectsV2 XML response into an array of file info.
	 *
	 * @since 1.0.0
	 * @param string $xml_body Raw XML response body.
	 * @return array Array of file info arrays with 'path', 'size', 'modified' keys.
	 */
	private function parse_list_objects_response( $xml_body ) {
		$files = array();

		libxml_use_internal_errors( true );
		$xml = simplexml_load_string( $xml_body );
		if ( false === $xml ) {
			return $files;
		}

		// Register namespace if present.
		$namespaces = $xml->getNamespaces( true );
		if ( ! empty( $namespaces ) ) {
			$ns = reset( $namespaces );
			$xml->registerXPathNamespace( 's3', $ns );
			$contents = $xml->xpath( '//s3:Contents' );
		} else {
			$contents = $xml->xpath( '//Contents' );
		}

		if ( ! empty( $contents ) ) {
			foreach ( $contents as $item ) {
				$files[] = array(
					'path'     => (string) $item->Key,
					'size'     => (int) $item->Size,
					'modified' => (string) $item->LastModified,
				);
			}
		}

		return $files;
	}
}
