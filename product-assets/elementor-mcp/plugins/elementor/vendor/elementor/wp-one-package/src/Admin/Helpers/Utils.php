<?php

namespace ElementorOne\Admin\Helpers;

use ElementorOne\Admin\Config;
use ElementorOne\Admin\Services\Client;
use ElementorOne\Admin\Services\Editor;
use ElementorOne\Common\SupportedPlugins;
use ElementorOne\Connect\Classes\GrantTypes;
use ElementorOne\Connect\Facade;
use ElementorOne\Versions;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Utils
 */
class Utils {

	/**
	 * Get API client
	 * @return Client|null
	 */
	public static function get_api_client(): ?Client {
		return Client::instance();
	}

	/**
	 * Get ONE connect instance
	 * @return Facade
	 */
	public static function get_one_connect(): Facade {
		return self::get_connect( Config::PLUGIN_SLUG );
	}

	/**
	 * Get access token
	 * @param string $grant_type
	 * @return false|mixed|string|null
	 */
	public static function get_access_token( string $grant_type = GrantTypes::REFRESH_TOKEN ) {
		return self::get_one_connect()->data()->get_access_token( $grant_type );
	}

	/**
	 * Get connect instance
	 * @param string $plugin_slug
	 * @return Facade|null
	 */
	public static function get_connect( string $plugin_slug = Config::PLUGIN_SLUG ): ?Facade {
		return Facade::get( $plugin_slug );
	}

	/**
	 * Check if plugin is connected
	 * @param string $plugin_slug
	 * @return bool
	 */
	public static function is_plugin_connected( string $plugin_slug ): bool {
		$facade = self::get_connect( $plugin_slug );

		if ( $facade && $facade->utils()->is_connected() ) {
			return true;
		}

		// Fallback to license key check for Elementor Pro
		return SupportedPlugins::ELEMENTOR_PRO === $plugin_slug
			&& (bool) Editor::get_active_license_key( $plugin_slug );
	}

	/**
	 * Get package version
	 * @param string $plugin_slug
	 * @return string|null
	 */
	public static function get_package_version( string $plugin_slug ): ?string {
		global $wp_one_package_versions;
		$plugin_slug = self::filter_plugin_slug( $plugin_slug );
		return $wp_one_package_versions[ $plugin_slug ] ?? null;
	}

	/**
	 * Get latest package version
	 * @return string|null
	 */
	public static function get_latest_package_version(): ?string {
		return Versions::instance()->latest_version();
	}

	/**
	 * Get plugin data
	 * @param string $plugin_slug
	 * @return array|null
	 */
	public static function get_plugin_data( string $plugin_slug ): ?array {
		$plugin_slug = self::filter_plugin_slug( $plugin_slug );

		foreach ( get_plugins() as $plugin_file => $plugin_data ) {
			if ( preg_match( '~^' . preg_quote( $plugin_slug, '~' ) . '/~', $plugin_file ) === 1 ) {
				$plugin_data['_file'] = $plugin_file;
				return $plugin_data;
			}
		}

		return null;
	}

	/**
	 * Get plugin slug
	 * @param string $plugin_slug
	 * @return string
	 */
	public static function filter_plugin_slug( string $plugin_slug ): string {
		return apply_filters( 'elementor_one/plugin_slug', $plugin_slug );
	}

	/**
	 * Get plugin new version
	 * @param string $plugin_file
	 * @return string|null
	 */
	public static function get_plugin_new_version( string $plugin_file, ?\stdClass $plugin_updates = null ): ?string {
		if ( is_null( $plugin_updates ) ) {
			wp_update_plugins();
			$plugin_updates = get_site_transient( 'update_plugins' );
		}
		return $plugin_updates->response[ $plugin_file ]->new_version ?? null;
	}

	/**
	 * Convert camel case to snake case
	 * @param string $input
	 * @return string
	 */
	public static function camel_to_snake( string $input ): string {
		return strtolower(
			preg_replace( '/(?<!^)[A-Z]/', '_$0', $input )
		);
	}

	/**
	 * Get authorize URL
	 * @return string
	 */
	public static function get_authorize_url(): ?string {
		$facade = self::get_one_connect();
		$client_id = $facade->data()->get_client_id();

		if ( ! $client_id ) {
			try {
				$client_id = $facade->service()->register_client();
			} catch ( \Throwable $_th ) {
				return null;
			}
		}

		return $facade->utils()->get_authorize_url( $client_id );
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

	/**
	 * Check if JWT token is expired
	 * @param string $jwt
	 * @param int $buffer Buffer in seconds to account for clock skew
	 * @return bool
	 */
	public static function is_jwt_expired( string $jwt, int $buffer = 30 ): bool {
		$jwt_payload = self::decode_jwt( $jwt );
		if ( $jwt_payload && isset( $jwt_payload['exp'] ) ) {
			return ( time() + $buffer ) >= $jwt_payload['exp'];
		}
		return false;
	}
}
