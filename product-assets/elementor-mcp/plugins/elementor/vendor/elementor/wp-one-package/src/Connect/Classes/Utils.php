<?php

namespace ElementorOne\Connect\Classes;

use ElementorOne\Connect\Facade;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Utils
 */
class Utils {

	/**
	 * Facade instance
	 * @var Facade
	 */
	private Facade $facade;

	/**
	 * Utils constructor
	 * @param Facade $facade
	 */
	public function __construct( Facade $facade ) {
		$this->facade = $facade;
	}

	/**
	 * Get clients URL
	 * @return string
	 */
	public function get_clients_url(): string {
		return $this->get_base_url() . '/api/v1/clients';
	}

	/**
	 * Get redirect URI
	 * @param string $domain
	 * @return string
	 */
	public function get_admin_url( string $domain = '' ): string {
		$admin_page = $this->facade->get_config( 'admin_page' );

		if ( false !== strpos( $admin_page, '?page=' ) ) {
			$admin_url = admin_url( $admin_page );
		} else {
			$admin_url = admin_url( 'admin.php?page=' . $admin_page );
		}

		if ( $domain ) {
			$parsed_url = wp_parse_url( $admin_url );
			$path = $parsed_url['path'] . ( isset( $parsed_url['query'] ) ? '?' . $parsed_url['query'] : '' );

			return rtrim( $domain, '/' ) . $path;
		}

		return $admin_url;
	}

	/**
	 * Get auth URL
	 * @return string
	 */
	public function get_auth_url(): string {
		return $this->get_base_url() . '/v1/oauth2/auth';
	}

	/**
	 * Get authorize URL
	 * @param string $client_id
	 * @return string
	 */
	public function get_authorize_url( string $client_id ): string {
		$scopes = $this->facade->get_config( 'scopes' );
		$state_nonce = $this->facade->get_config( 'state_nonce' );

		$authorize_url = add_query_arg( [
			'client_id' => $client_id,
			'redirect_uri' => rawurlencode( $this->get_admin_url() ),
			'response_type' => 'code',
			'scope' => $scopes,
			'state' => wp_create_nonce( $state_nonce ),
		], $this->get_auth_url() );

		// Filter the authorize URL for all apps
		$authorize_url = apply_filters( 'elementor_one/connect_authorize_url', $authorize_url, $this->facade );

		// Filter the authorize URL for the app prefix
		$app_prefix = $this->facade->get_config( 'app_prefix' );
		return apply_filters( 'elementor_one/' . $app_prefix . '_connect_authorize_url', $authorize_url, $this->facade );
	}

	/**
	 * Get deactivation URL
	 * @param string $client_id
	 * @return string
	 */
	public function get_deactivation_url( string $client_id ): string {
		return $this->get_base_url() . "/api/v1/clients/{$client_id}/activation";
	}

	/**
	 * Get JWKS URL
	 * @return string
	 */
	public function get_jwks_url(): string {
		return $this->get_base_url() . '/v1/.well-known/jwks.json';
	}

	/**
	 * Get sessions URL
	 * @return string
	 */
	public function get_sessions_url(): string {
		return $this->get_base_url() . '/api/v1/session';
	}

	/**
	 * Get token URL
	 * @return string
	 */
	public function get_token_url(): string {
		return $this->get_base_url() . '/api/v1/oauth2/token';
	}

	/**
	 * Get clients URL
	 *
	 * @param string $client_id
	 *
	 * @return string
	 */
	public function get_clients_patch_url( string $client_id ): string {
		return $this->get_base_url() . "/api/v1/clients/{$client_id}";
	}

	/**
	 * Get base URL
	 * @return string
	 */
	public function get_base_url(): string {
		$base_url = $this->facade->get_config( 'base_url' );
		return apply_filters( 'elementor_one/connect_get_base_url', $base_url, $this->facade );
	}

	/**
	 * Check if home URL is valid
	 * @return bool
	 */
	public function is_valid_home_url(): bool {
		$data = $this->facade->data();
		if ( empty( $data->get_home_url() ) ) {
			return true;
		}
		return $data->get_home_url() === home_url();
	}

	/**
	 * Check if connected
	 * @return bool
	 */
	public function is_connected(): bool {
		$data = $this->facade->data();
		return (bool) $data->get_access_token() && $this->is_valid_home_url();
	}

	/**
	 * Decode JWT and return payload without signature verification
	 * @param string $jwt
	 * @return array|null
	 */
	public static function decode_jwt( string $jwt ): ?array {
		$parts = explode( '.', $jwt );

		if ( count( $parts ) !== 3 ) {
			return null;
		}

		$payload = base64_decode( strtr( $parts[1], '-_', '+/' ) );

		if ( ! $payload ) {
			return null;
		}

		$decoded = json_decode( $payload, true );

		return is_array( $decoded ) ? $decoded : null;
	}
}
