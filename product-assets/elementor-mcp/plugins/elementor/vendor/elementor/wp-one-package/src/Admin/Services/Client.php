<?php

namespace ElementorOne\Admin\Services;

use ElementorOne\Admin\Config;
use ElementorOne\Admin\Exceptions\ClientException;
use ElementorOne\Admin\Helpers\Utils;
use ElementorOne\Connect\Classes\GrantTypes;
use ElementorOne\Logger;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Client
 */
class Client {

	const BASE_URL = 'https://my.elementor.com';

	/**
	 * Logger instance
	 * @var Logger
	 */
	private Logger $logger;

	/**
	 * Instance
	 * @var Client|null
	 */
	private static ?Client $instance = null;

	/**
	 * Get instance
	 * @return Client|null
	 */
	public static function instance(): ?Client {
		if ( ! self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor
	 */
	private function __construct() {
		$this->logger = new Logger( self::class );
	}

	/**
	 * Refreshed flag
	 * @var bool
	 */
	private bool $refreshed = false;

	/**
	 * Check if JWT token is expired
	 * @param string $token
	 * @return bool
	 */
	private function token_expired( string $token ): bool {
		try {
			$payload = Utils::decode_jwt( $token );

			if ( ! isset( $payload['exp'] ) ) {
				return false; // No expiration claim, let the regular flow handle it
			}

			// Check if token is expired (with 60 second buffer to account for clock skew)
			return ( $payload['exp'] - MINUTE_IN_SECONDS ) < time();
		} catch ( \Throwable $th ) {
			$this->logger->error( 'Error checking token expiration: ' . $th->getMessage() );
			return false; // On error, let the regular flow handle it
		}
	}

	/**
	 * Refresh access token
	 * @param string $grant_type
	 * @return self
	 * @throws ClientException
	 */
	private function refresh_access_token( string $grant_type ): self {
		$this->refreshed = true;

		try {
			Utils::get_one_connect()->service()->renew_access_token( $grant_type );
		} catch ( \Throwable $th ) {
			throw new ClientException( $th->getMessage(), \WP_Http::UNAUTHORIZED );
		}

		return $this;
	}

	/**
	 * Request
	 * @param string $url
	 * @param array $args
	 * @param int $valid_response_code
	 * @return mixed
	 * @throws ClientException
	 */
	public function request(
		string $url,
		array $args,
		?callable $callback = null,
		string $grant_type = GrantTypes::REFRESH_TOKEN,
		int $valid_response_code = \WP_Http::OK
	) {
		$access_token = Utils::get_access_token( $grant_type );

		// Decode and check token expiration
		if ( ! $this->refreshed && $this->token_expired( $access_token ) ) {
			$this->refresh_access_token( $grant_type );
			$access_token = Utils::get_access_token( $grant_type );
		}

		$args['timeout'] = 30;
		$args['headers'] = array_merge( $args['headers'] ?? [], [
			'Content-Type' => 'application/json',
			'Authorization' => "Bearer {$access_token}",
			'x-elementor-app-type' => Config::APP_TYPE,
		] );

		$response = wp_remote_request( $url, $args );

		// If the response is an error, throw an error.
		if ( is_wp_error( $response ) ) {
			$this->logger->error( $response->get_error_message() );

			throw new ClientException( $response->get_error_message() );
		}

		$response_body = wp_remote_retrieve_body( $response );
		$response_code = wp_remote_retrieve_response_code( $response );

		// If the response body is not valid, throw an error.
		if ( ! empty( $response_body ) && null === json_decode( $response_body ) ) {
			throw new ClientException( esc_html( $response_body ), $response_code );
		}

		// If the token is invalid, refresh it and try again once only.
		if ( ! $this->refreshed && \WP_Http::UNAUTHORIZED === $response_code ) {
			return $this->refresh_access_token( $grant_type )
				->request( $url, $args, $callback, $grant_type, $valid_response_code );
		}

		// If the response code is not valid, throw an error.
		if ( $response_code !== $valid_response_code ) {
			$this->logger->error( 'Invalid status code ' . wp_remote_retrieve_response_code( $response ) );

			throw new ClientException( json_decode( $response_body )->message ?? $response_body, $response_code );
		}

		// If a callback is provided, call it.
		if ( $callback ) {
			return call_user_func( $callback, $response_body );
		}

		return json_decode( $response_body, true );
	}

	/**
	 * Get client base URL
	 * @return string
	 */
	public static function get_client_base_url() {
		return apply_filters( 'elementor_one/get_client_base_url', self::BASE_URL );
	}
}
