<?php
/**
 * WebDAV storage provider.
 *
 * Stores backup files on a WebDAV-compatible server using the
 * WordPress HTTP API (wp_remote_request).
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Storage_WebDAV
 *
 * @since 1.0.0
 */
class FiveDPBR_Storage_WebDAV implements FiveDPBR_Storage_Interface {

	/**
	 * Default request timeout in seconds.
	 *
	 * @var int
	 */
	const REQUEST_TIMEOUT = 60;

	/**
	 * Upload request timeout in seconds (longer for large files).
	 *
	 * @var int
	 */
	const UPLOAD_TIMEOUT = 300;

	/**
	 * Get the provider slug.
	 *
	 * @return string
	 */
	public function get_slug() {
		return 'webdav';
	}

	/**
	 * Get the provider display name.
	 *
	 * @return string
	 */
	public function get_name() {
		return __( 'WebDAV', '5dp-backup-restore' );
	}

	/**
	 * Test the connection to the WebDAV server.
	 *
	 * Sends a PROPFIND request to the remote path to verify access.
	 *
	 * @param array $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function test_connection( $credentials ) {
		$base_url    = $this->get_base_url( $credentials );
		$remote_path = $this->get_remote_path( $credentials );
		$url         = $this->build_url( $base_url, $remote_path );

		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'PROPFIND',
				'timeout' => self::REQUEST_TIMEOUT,
				'headers' => array_merge(
					$this->get_auth_headers( $credentials ),
					array(
						'Depth'        => '0',
						'Content-Type' => 'application/xml; charset=utf-8',
					)
				),
				'body'    => $this->get_propfind_body(),
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error(
				'connection_failed',
				/* translators: %s: error message */
				sprintf( __( 'WebDAV connection failed: %s', '5dp-backup-restore' ), $response->get_error_message() )
			);
		}

		$code = wp_remote_retrieve_response_code( $response );

		// 207 Multi-Status is the expected response for PROPFIND.
		if ( 207 === $code ) {
			return true;
		}

		// 404 means the remote path does not exist; try to create it.
		if ( 404 === $code ) {
			$mkdir_result = $this->mkcol( $url, $credentials );

			if ( is_wp_error( $mkdir_result ) ) {
				return $mkdir_result;
			}

			return true;
		}

		// 401/403 indicate authentication issues.
		if ( 401 === $code || 403 === $code ) {
			return new WP_Error(
				'auth_failed',
				__( 'WebDAV authentication failed. Please check your credentials.', '5dp-backup-restore' )
			);
		}

		return new WP_Error(
			'unexpected_response',
			/* translators: 1: HTTP status code, 2: response message */
			sprintf(
				__( 'WebDAV server returned unexpected response: %1$d %2$s', '5dp-backup-restore' ),
				$code,
				wp_remote_retrieve_response_message( $response )
			)
		);
	}

	/**
	 * Upload a file to the WebDAV server.
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

		$base_url     = $this->get_base_url( $credentials );
		$base_remote  = $this->get_remote_path( $credentials );
		$full_remote  = rtrim( $base_remote, '/' ) . '/' . ltrim( $remote_path, '/' );
		$url          = $this->build_url( $base_url, $full_remote );

		// Ensure remote directory exists.
		$dir_url = $this->build_url( $base_url, dirname( $full_remote ) . '/' );
		$this->mkcol( $dir_url, $credentials );

		// Read the file contents for upload.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$file_contents = file_get_contents( $local_path );

		if ( false === $file_contents ) {
			return new WP_Error(
				'file_read_failed',
				/* translators: %s: file path */
				sprintf( __( 'Could not read local file: %s', '5dp-backup-restore' ), $local_path )
			);
		}

		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'PUT',
				'timeout' => self::UPLOAD_TIMEOUT,
				'headers' => array_merge(
					$this->get_auth_headers( $credentials ),
					array(
						'Content-Type'   => 'application/octet-stream',
						'Content-Length' => strlen( $file_contents ),
					)
				),
				'body'    => $file_contents,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error(
				'upload_failed',
				/* translators: %s: error message */
				sprintf( __( 'WebDAV upload failed: %s', '5dp-backup-restore' ), $response->get_error_message() )
			);
		}

		$code = wp_remote_retrieve_response_code( $response );

		// 200, 201, 204 all indicate success.
		if ( $code >= 200 && $code < 300 ) {
			return true;
		}

		return new WP_Error(
			'upload_failed',
			/* translators: 1: HTTP status code, 2: response message */
			sprintf(
				__( 'WebDAV upload failed with status: %1$d %2$s', '5dp-backup-restore' ),
				$code,
				wp_remote_retrieve_response_message( $response )
			)
		);
	}

	/**
	 * Upload a chunk of a file to the WebDAV server.
	 *
	 * WebDAV does not natively support chunked/resumable uploads.
	 * This method falls back to a full upload for the initial request.
	 * For subsequent chunks, it appends using Content-Range if supported.
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

		$file_size = filesize( $local_path );

		// WebDAV does not reliably support Content-Range on PUT.
		// Perform a full upload regardless of offset.
		$result = $this->upload( $local_path, $remote_path, $credentials );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return $file_size;
	}

	/**
	 * Download a file from the WebDAV server.
	 *
	 * @param string $remote_path Remote file path.
	 * @param string $local_path  Local destination path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function download( $remote_path, $local_path, $credentials ) {
		$base_url    = $this->get_base_url( $credentials );
		$base_remote = $this->get_remote_path( $credentials );
		$full_remote = rtrim( $base_remote, '/' ) . '/' . ltrim( $remote_path, '/' );
		$url         = $this->build_url( $base_url, $full_remote );

		// Ensure local directory exists.
		$local_dir = dirname( $local_path );
		if ( ! is_dir( $local_dir ) ) {
			if ( ! wp_mkdir_p( $local_dir ) ) {
				return new WP_Error(
					'dir_create_failed',
					/* translators: %s: directory path */
					sprintf( __( 'Could not create local directory: %s', '5dp-backup-restore' ), $local_dir )
				);
			}
		}

		$response = wp_remote_request(
			$url,
			array(
				'method'   => 'GET',
				'timeout'  => self::UPLOAD_TIMEOUT,
				'headers'  => $this->get_auth_headers( $credentials ),
				'stream'   => true,
				'filename' => $local_path,
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error(
				'download_failed',
				/* translators: %s: error message */
				sprintf( __( 'WebDAV download failed: %s', '5dp-backup-restore' ), $response->get_error_message() )
			);
		}

		$code = wp_remote_retrieve_response_code( $response );

		if ( 200 !== $code ) {
			// Clean up partial download.
			if ( file_exists( $local_path ) ) {
				// phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
				@unlink( $local_path );
			}

			return new WP_Error(
				'download_failed',
				/* translators: 1: HTTP status code, 2: response message */
				sprintf(
					__( 'WebDAV download failed with status: %1$d %2$s', '5dp-backup-restore' ),
					$code,
					wp_remote_retrieve_response_message( $response )
				)
			);
		}

		return true;
	}

	/**
	 * Delete a file from the WebDAV server.
	 *
	 * @param string $remote_path Remote file path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function delete( $remote_path, $credentials ) {
		$base_url    = $this->get_base_url( $credentials );
		$base_remote = $this->get_remote_path( $credentials );
		$full_remote = rtrim( $base_remote, '/' ) . '/' . ltrim( $remote_path, '/' );
		$url         = $this->build_url( $base_url, $full_remote );

		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'DELETE',
				'timeout' => self::REQUEST_TIMEOUT,
				'headers' => $this->get_auth_headers( $credentials ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error(
				'delete_failed',
				/* translators: %s: error message */
				sprintf( __( 'WebDAV delete failed: %s', '5dp-backup-restore' ), $response->get_error_message() )
			);
		}

		$code = wp_remote_retrieve_response_code( $response );

		// 200, 204 indicate success. 404 means already deleted.
		if ( ( $code >= 200 && $code < 300 ) || 404 === $code ) {
			return true;
		}

		return new WP_Error(
			'delete_failed',
			/* translators: 1: HTTP status code, 2: response message */
			sprintf(
				__( 'WebDAV delete failed with status: %1$d %2$s', '5dp-backup-restore' ),
				$code,
				wp_remote_retrieve_response_message( $response )
			)
		);
	}

	/**
	 * List files on the WebDAV server.
	 *
	 * Sends a PROPFIND with Depth: 1 and parses the XML response.
	 *
	 * @param string $prefix      Remote path prefix.
	 * @param array  $credentials Provider credentials.
	 * @return array|WP_Error Array of file info or error.
	 */
	public function list_files( $prefix, $credentials ) {
		$base_url    = $this->get_base_url( $credentials );
		$base_remote = $this->get_remote_path( $credentials );
		$full_remote = rtrim( $base_remote, '/' ) . '/' . ltrim( $prefix, '/' );
		$url         = $this->build_url( $base_url, rtrim( $full_remote, '/' ) . '/' );

		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'PROPFIND',
				'timeout' => self::REQUEST_TIMEOUT,
				'headers' => array_merge(
					$this->get_auth_headers( $credentials ),
					array(
						'Depth'        => '1',
						'Content-Type' => 'application/xml; charset=utf-8',
					)
				),
				'body'    => $this->get_propfind_body(),
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error(
				'list_failed',
				/* translators: %s: error message */
				sprintf( __( 'WebDAV list failed: %s', '5dp-backup-restore' ), $response->get_error_message() )
			);
		}

		$code = wp_remote_retrieve_response_code( $response );

		if ( 207 !== $code ) {
			if ( 404 === $code ) {
				return array();
			}

			return new WP_Error(
				'list_failed',
				/* translators: 1: HTTP status code, 2: response message */
				sprintf(
					__( 'WebDAV list failed with status: %1$d %2$s', '5dp-backup-restore' ),
					$code,
					wp_remote_retrieve_response_message( $response )
				)
			);
		}

		$body = wp_remote_retrieve_body( $response );

		return $this->parse_propfind_response( $body, $full_remote );
	}

	/**
	 * Get the credential fields required by this provider.
	 *
	 * @return array Array of field definitions.
	 */
	public function get_credential_fields() {
		return array(
			array(
				'name'        => 'url',
				'label'       => __( 'WebDAV URL', '5dp-backup-restore' ),
				'type'        => 'url',
				'placeholder' => 'https://dav.example.com',
				'required'    => true,
				'encrypted'   => false,
				'description' => __( 'The base URL of your WebDAV server.', '5dp-backup-restore' ),
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
				'description' => __( 'Path on the WebDAV server where backups will be stored.', '5dp-backup-restore' ),
			),
		);
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	/**
	 * Get the base URL from credentials.
	 *
	 * @param array $credentials Provider credentials.
	 * @return string Base URL.
	 */
	private function get_base_url( $credentials ) {
		$url = isset( $credentials['url'] ) ? $credentials['url'] : '';
		return rtrim( $url, '/' );
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
	 * Build a full URL from the base URL and a path.
	 *
	 * @param string $base_url Base URL.
	 * @param string $path     Path to append.
	 * @return string Full URL.
	 */
	private function build_url( $base_url, $path ) {
		// If path starts with http, it is already a full URL.
		if ( 0 === strpos( $path, 'http' ) ) {
			return $path;
		}

		return rtrim( $base_url, '/' ) . '/' . ltrim( $path, '/' );
	}

	/**
	 * Get HTTP Basic Authentication headers.
	 *
	 * @param array $credentials Provider credentials.
	 * @return array Headers array.
	 */
	private function get_auth_headers( $credentials ) {
		$username = isset( $credentials['username'] ) ? $credentials['username'] : '';
		$password = isset( $credentials['password'] ) ? $credentials['password'] : '';

		if ( empty( $username ) ) {
			return array();
		}

		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		return array(
			'Authorization' => 'Basic ' . base64_encode( $username . ':' . $password ),
		);
	}

	/**
	 * Create a remote directory using MKCOL.
	 *
	 * @param string $url         Full URL for the directory.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	private function mkcol( $url, $credentials ) {
		$response = wp_remote_request(
			$url,
			array(
				'method'  => 'MKCOL',
				'timeout' => self::REQUEST_TIMEOUT,
				'headers' => $this->get_auth_headers( $credentials ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return new WP_Error(
				'mkcol_failed',
				/* translators: %s: error message */
				sprintf( __( 'WebDAV MKCOL failed: %s', '5dp-backup-restore' ), $response->get_error_message() )
			);
		}

		$code = wp_remote_retrieve_response_code( $response );

		// 201 Created, 405 Method Not Allowed (already exists), 301 (trailing slash redirect).
		if ( 201 === $code || 405 === $code || ( $code >= 200 && $code < 300 ) ) {
			return true;
		}

		// 409 Conflict — parent directory does not exist; try to create recursively.
		if ( 409 === $code ) {
			$parent_url = $this->get_parent_url( $url );

			if ( $parent_url && $parent_url !== $url ) {
				$parent_result = $this->mkcol( $parent_url, $credentials );

				if ( is_wp_error( $parent_result ) ) {
					return $parent_result;
				}

				// Retry the original MKCOL.
				return $this->mkcol( $url, $credentials );
			}
		}

		return new WP_Error(
			'mkcol_failed',
			/* translators: 1: HTTP status code, 2: response message */
			sprintf(
				__( 'WebDAV MKCOL failed with status: %1$d %2$s', '5dp-backup-restore' ),
				$code,
				wp_remote_retrieve_response_message( $response )
			)
		);
	}

	/**
	 * Get the parent URL for recursive MKCOL.
	 *
	 * @param string $url Full URL.
	 * @return string|false Parent URL or false.
	 */
	private function get_parent_url( $url ) {
		$parsed = wp_parse_url( $url );

		if ( ! $parsed || ! isset( $parsed['path'] ) ) {
			return false;
		}

		$path   = rtrim( $parsed['path'], '/' );
		$parent = dirname( $path );

		if ( $parent === $path || empty( $parent ) || '.' === $parent ) {
			return false;
		}

		$scheme = isset( $parsed['scheme'] ) ? $parsed['scheme'] : 'https';
		$host   = isset( $parsed['host'] ) ? $parsed['host'] : '';
		$port   = isset( $parsed['port'] ) ? ':' . $parsed['port'] : '';

		return $scheme . '://' . $host . $port . $parent . '/';
	}

	/**
	 * Get the PROPFIND request body XML.
	 *
	 * @return string XML body.
	 */
	private function get_propfind_body() {
		return '<?xml version="1.0" encoding="utf-8"?>' .
			'<D:propfind xmlns:D="DAV:">' .
			'<D:prop>' .
			'<D:displayname/>' .
			'<D:getcontentlength/>' .
			'<D:getlastmodified/>' .
			'<D:resourcetype/>' .
			'</D:prop>' .
			'</D:propfind>';
	}

	/**
	 * Parse a PROPFIND multistatus XML response into a file list.
	 *
	 * @param string $xml_body    Raw XML response body.
	 * @param string $base_path   Base path to exclude from results (the directory itself).
	 * @return array Array of file info arrays.
	 */
	private function parse_propfind_response( $xml_body, $base_path ) {
		$files = array();

		if ( empty( $xml_body ) ) {
			return $files;
		}

		// Suppress XML parsing errors.
		$use_errors = libxml_use_internal_errors( true );

		$xml = simplexml_load_string( $xml_body );

		if ( false === $xml ) {
			libxml_clear_errors();
			libxml_use_internal_errors( $use_errors );
			return $files;
		}

		// Register DAV namespace.
		$xml->registerXPathNamespace( 'd', 'DAV:' );

		$responses = $xml->xpath( '//d:response' );

		if ( ! $responses ) {
			libxml_use_internal_errors( $use_errors );
			return $files;
		}

		$base_path_normalized = rtrim( $base_path, '/' ) . '/';

		foreach ( $responses as $response ) {
			$href = (string) $response->xpath( 'd:href' )[0];

			if ( empty( $href ) ) {
				continue;
			}

			// Decode the href for comparison.
			$href_decoded = rawurldecode( $href );

			// Skip the directory itself.
			$href_trimmed = rtrim( $href_decoded, '/' ) . '/';
			if ( $href_trimmed === $base_path_normalized || $href_decoded === rtrim( $base_path, '/' ) ) {
				continue;
			}

			// Check if this is a collection (directory).
			$resourcetype = $response->xpath( './/d:resourcetype/d:collection' );
			if ( ! empty( $resourcetype ) ) {
				continue;
			}

			// Extract properties.
			$displayname = $response->xpath( './/d:displayname' );
			$name        = ! empty( $displayname ) ? (string) $displayname[0] : basename( $href_decoded );

			$content_length = $response->xpath( './/d:getcontentlength' );
			$size           = ! empty( $content_length ) ? (int) (string) $content_length[0] : 0;

			$last_modified = $response->xpath( './/d:getlastmodified' );
			$modified      = 0;
			if ( ! empty( $last_modified ) ) {
				$time = strtotime( (string) $last_modified[0] );
				if ( false !== $time ) {
					$modified = $time;
				}
			}

			$files[] = array(
				'name'     => $name,
				'path'     => $href_decoded,
				'size'     => $size,
				'modified' => $modified,
			);
		}

		libxml_use_internal_errors( $use_errors );

		// Sort by modification time, newest first.
		usort(
			$files,
			function ( $a, $b ) {
				return $b['modified'] - $a['modified'];
			}
		);

		return $files;
	}
}
