<?php

namespace ElementorOne\Common;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class RestError
 * Centralized REST API error handling with proper HTTP status codes
 */
class RestError {

	/**
	 * Create a bad request error (400)
	 *
	 * @param string $message Error message
	 * @param array  $data    Additional error data
	 * @return \WP_Error
	 */
	public static function bad_request( string $message, array $data = [] ): \WP_Error {
		return self::create_error( 'bad_request', $message, \WP_Http::BAD_REQUEST, $data );
	}

	/**
	 * Create an unauthorized error (401)
	 *
	 * @param string $message Error message
	 * @param array  $data    Additional error data
	 * @return \WP_Error
	 */
	public static function unauthorized( string $message, array $data = [] ): \WP_Error {
		return self::create_error( 'unauthorized', $message, \WP_Http::UNAUTHORIZED, $data );
	}

	/**
	 * Create a forbidden error (403)
	 *
	 * @param string $message Error message
	 * @param array  $data    Additional error data
	 * @return \WP_Error
	 */
	public static function forbidden( string $message, array $data = [] ): \WP_Error {
		return self::create_error( 'forbidden', $message, \WP_Http::FORBIDDEN, $data );
	}

	/**
	 * Create a not found error (404)
	 *
	 * @param string $message Error message
	 * @param array  $data    Additional error data
	 * @return \WP_Error
	 */
	public static function not_found( string $message, array $data = [] ): \WP_Error {
		return self::create_error( 'not_found', $message, \WP_Http::NOT_FOUND, $data );
	}

	/**
	 * Create a conflict error (409)
	 *
	 * @param string $message Error message
	 * @param array  $data    Additional error data
	 * @return \WP_Error
	 */
	public static function conflict( string $message, array $data = [] ): \WP_Error {
		return self::create_error( 'conflict', $message, \WP_Http::CONFLICT, $data );
	}

	/**
	 * Create an internal server error (500)
	 *
	 * @param string $message Error message
	 * @param array  $data    Additional error data
	 * @return \WP_Error
	 */
	public static function internal_server_error( string $message, array $data = [] ): \WP_Error {
		return self::create_error( 'internal_server_error', $message, \WP_Http::INTERNAL_SERVER_ERROR, $data );
	}

	/**
	 * Create a custom error with specific code and status
	 *
	 * @param string $code    Error code
	 * @param string $message Error message
	 * @param int    $status  HTTP status code
	 * @param array  $data    Additional error data
	 * @return \WP_Error
	 */
	public static function custom_error( string $code, string $message, int $status, array $data = [] ): \WP_Error {
		return self::create_error( $code, $message, $status, $data );
	}

	/**
	 * Internal method to create WP_Error with proper structure
	 *
	 * @param string $code    Error code
	 * @param string $message Error message
	 * @param int    $status  HTTP status code
	 * @param array  $data    Additional error data
	 * @return \WP_Error
	 */
	private static function create_error( string $code, string $message, int $status, array $data = [] ): \WP_Error {
		$error_data = array_merge( [ 'status' => $status ], $data );
		return new \WP_Error( $code, $message, $error_data );
	}
}
