<?php

namespace ElementorOne\Connect\Classes;

use ElementorOne\Connect\Facade;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Data
 *
 * Instance-based data storage class with runtime configuration support.
 * Each instance has its own configuration for isolated context.
 */
class Data {
	const CLIENT_ID = '_client_id';
	const CLIENT_SECRET = '_client_secret';
	const USER_ACCESS_TOKEN = '_user_access_token';
	const ACCESS_TOKEN = '_access_token';
	const REFRESH_TOKEN = '_refresh_token';
	const TOKEN_ID = '_token_id';
	const OPTION_OWNER_USER_ID = '_owner_user_id';
	const HOME_URL = '_home_url';
	const SHARE_USAGE_DATA = '_share_usage_data';

	/**
	 * Facade instance
	 * @var Facade
	 */
	private Facade $facade;

	/**
	 * Data constructor
	 * @param Facade $facade
	 */
	public function __construct( Facade $facade ) {
		$this->facade = $facade;
	}

	/**
	 * Get app prefix
	 *
	 * @return string
	 */
	protected function get_app_prefix(): string {
		return $this->facade->get_config( 'app_prefix' );
	}

	/**
	 * Get connect mode
	 *
	 * @return string 'site' or 'user'
	 */
	protected function get_connect_mode(): string {
		return $this->facade->get_config( 'connect_mode' ) ?? 'site';
	}

	/**
	 * Get option
	 * @param $option_name
	 * @param $default_value
	 *
	 * @return false|mixed|null
	 */
	public function get_option( $option_name, $default_value ) {
		return get_option( $this->get_app_prefix() . $option_name, $default_value );
	}

	/**
	 * Set option
	 * @param $option_name
	 * @param $option_value
	 * @param $auto_load
	 *
	 * @return bool
	 */
	public function set_option( $option_name, $option_value, $auto_load = false ): bool {
		return update_option( $this->get_app_prefix() . $option_name, $option_value, $auto_load );
	}

	/**
	 * Delete option
	 * @param $option_name
	 * @return bool
	 */
	public function delete_option( $option_name ): bool {
		return delete_option( $this->get_app_prefix() . $option_name );
	}

	/**
	 * Get user data
	 * @param $user_id
	 * @param $data_name
	 * @param mixed|bool $default_value
	 *
	 * @return false|mixed
	 */
	public function get_user_data( $user_id, $data_name, $default_value = false ) {
		$data = get_user_meta( $user_id, $this->get_app_prefix() . $data_name, true );

		return empty( $data ) ? $default_value : $data;
	}

	/**
	 * Set user data
	 * @param $user_id
	 * @param $data_name
	 * @param $value
	 *
	 * @return bool|int
	 */
	public function set_user_data( $user_id, $data_name, $value ) {
		return update_user_meta( $user_id, $this->get_app_prefix() . $data_name, $value );
	}

	/**
	 * Delete user data
	 * @param $user_id
	 * @param $data_name
	 * @return bool
	 */
	public function delete_user_data( $user_id, $data_name ): bool {
		return delete_user_meta( $user_id, $this->get_app_prefix() . $data_name );
	}

	/**
	 * Get connect mode data
	 * @param ...$data
	 * @return false|mixed|null|string
	 */
	public function get_connect_mode_data( ...$data ) {
		if ( $this->get_connect_mode() === 'site' ) {
			return $this->get_option( ...$data );
		}
		$user_id = get_current_user_id();
		return $this->get_user_data( ...( [ $user_id, ...$data ] ) );
	}

	/**
	 * Set connect mode data
	 * @param ...$data
	 * @return bool|int
	 */
	public function set_connect_mode_data( ...$data ) {
		if ( $this->get_connect_mode() === 'site' ) {
			return $this->set_option( ...$data );
		}
		$user_id = get_current_user_id();
		return $this->set_user_data( ...( [ $user_id, ...$data ] ) );
	}

	/**
	 * Get client ID
	 * @return false|mixed|string|null
	 */
	public function get_client_id() {
		return $this->get_connect_mode_data( self::CLIENT_ID, false );
	}

	/**
	 * Get client secret
	 * @return false|mixed|string|null
	 */
	public function get_client_secret() {
		return $this->get_connect_mode_data( self::CLIENT_SECRET, false );
	}

	/**
	 * Set client ID
	 * @param $value
	 * @return bool
	 */
	public function set_client_id( $value ): bool {
		return $this->set_connect_mode_data( self::CLIENT_ID, $value );
	}

	/**
	 * Set client secret
	 * @param $value
	 * @return bool
	 */
	public function set_client_secret( $value ): bool {
		return $this->set_connect_mode_data( self::CLIENT_SECRET, $value );
	}

	/**
	 * Get access token
	 * @return false|mixed|string|null
	 */
	public function get_access_token( $grant_type = GrantTypes::CLIENT_CREDENTIALS ) {
		$key = GrantTypes::CLIENT_CREDENTIALS === $grant_type ? self::ACCESS_TOKEN : self::USER_ACCESS_TOKEN;
		return $this->get_connect_mode_data( $key, false );
	}

	/**
	 * Get token ID
	 * @return false|mixed|string|null
	 */
	public function get_token_id() {
		return $this->get_connect_mode_data( self::TOKEN_ID, false );
	}

	/**
	 * Get refresh token
	 * @return false|mixed|string|null
	 */
	public function get_refresh_token() {
		return $this->get_connect_mode_data( self::REFRESH_TOKEN, false );
	}

	/**
	 * Get home URL
	 * @return false|mixed|string|null
	 */
	public function get_home_url() {
		$raw = $this->get_connect_mode_data( self::HOME_URL, false );
		$is_base64 = base64_encode( base64_decode( $raw, true ) ) === $raw;
		return $is_base64 ? base64_decode( $raw ) : $raw;
	}

	/**
	 * Set home URL
	 * @param string|null $home_url
	 * @return bool
	 */
	public function set_home_url( ?string $home_url = null ): bool {
		$home_url = $home_url ?? home_url();
		return $this->set_connect_mode_data( self::HOME_URL, base64_encode( $home_url ) );
	}

	/**
	 * Set owner user ID
	 * @param int $user_id
	 * @return bool
	 */
	public function set_owner_user_id( int $user_id ): bool {
		return $this->set_connect_mode_data( self::OPTION_OWNER_USER_ID, $user_id );
	}

	/**
	 * Get user is owner option
	 * @return int
	 */
	public function get_owner_user_id(): int {
		return (int) $this->get_connect_mode_data( self::OPTION_OWNER_USER_ID, false );
	}

	/**
	 * Check if user is subscription owner
	 * @return bool
	 */
	public function user_is_subscription_owner(): bool {
		$owner_id = (int) $this->get_connect_mode_data( self::OPTION_OWNER_USER_ID, false );

		return get_current_user_id() === $owner_id;
	}

	/**
	 * Clear session
	 * @param bool $with_client
	 * @return void
	 */
	public function clear_session( $with_client = false ) {
		if ( $this->get_connect_mode() === 'site' ) {
			if ( $with_client ) {
				$this->delete_option( self::CLIENT_ID );
				$this->delete_option( self::CLIENT_SECRET );
			}
			$this->delete_option( self::ACCESS_TOKEN );
			$this->delete_option( self::USER_ACCESS_TOKEN );
			$this->delete_option( self::REFRESH_TOKEN );
			$this->delete_option( self::TOKEN_ID );
			$this->delete_option( self::OPTION_OWNER_USER_ID );
			$this->delete_option( self::HOME_URL );
			$this->delete_option( self::SHARE_USAGE_DATA );
		} else {
			$user_id = get_current_user_id();
			if ( $with_client ) {
				$this->delete_user_data( $user_id, self::CLIENT_ID );
				$this->delete_user_data( $user_id, self::CLIENT_SECRET );
			}
			$this->delete_user_data( $user_id, self::ACCESS_TOKEN );
			$this->delete_user_data( $user_id, self::USER_ACCESS_TOKEN );
			$this->delete_user_data( $user_id, self::REFRESH_TOKEN );
			$this->delete_user_data( $user_id, self::TOKEN_ID );
			$this->delete_user_data( $user_id, self::OPTION_OWNER_USER_ID );
			$this->delete_user_data( $user_id, self::HOME_URL );
			$this->delete_user_data( $user_id, self::SHARE_USAGE_DATA );
		}
	}

	/**
	 * Get share usage data
	 * @return false|mixed|string|null
	 */
	public function get_share_usage_data() {
		return $this->get_connect_mode_data( self::SHARE_USAGE_DATA, false );
	}

	/**
	 * Set share usage data
	 * @param string $share_usage_data
	 * @return bool
	 */
	public function set_share_usage_data( string $share_usage_data ): bool {
		return $this->set_connect_mode_data( self::SHARE_USAGE_DATA, $share_usage_data );
	}
}
