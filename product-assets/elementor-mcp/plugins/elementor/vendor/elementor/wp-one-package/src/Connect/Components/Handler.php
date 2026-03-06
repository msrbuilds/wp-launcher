<?php

namespace ElementorOne\Connect\Components;

use ElementorOne\Connect\Classes\GrantTypes;
use ElementorOne\Connect\Classes\Utils;
use ElementorOne\Connect\Facade;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Handler
 */
class Handler {

	const SCOPE_SHARE_USAGE_DATA = 'share_usage_data';

	/**
	 * Facade instance
	 * @var Facade
	 */
	private Facade $facade;

	/**
	 * Handler constructor
	 * @param Facade $facade
	 */
	public function __construct( Facade $facade ) {
		$this->facade = $facade;

		add_action( 'admin_init', [ $this, 'handle_auth_code' ] );
	}

	/**
	 * Should handle auth code
	 * @return bool
	 */
	private function should_handle_auth_code(): bool {
		global $plugin_page;

		$admin_page = $this->facade->get_config( 'admin_page' );
		$page_slug = explode( 'page=', $admin_page );

		$is_connect_admin_page = false;

		if ( ! empty( $page_slug[1] ) && $page_slug[1] === $plugin_page ) {
			$is_connect_admin_page = true;
		}

		if ( ! $is_connect_admin_page && $admin_page === $plugin_page ) {
			$is_connect_admin_page = true;
		}

		if ( ! $is_connect_admin_page ) {
			return false;
		}

		if ( ! isset( $_GET['code'] ) || ! isset( $_GET['state'] ) ) {
			return false;
		}

		return true;
	}

	/**
	 * Validate nonce
	 * @param string $state
	 * @return void
	 */
	private function validate_nonce( $state ) {
		if ( ! wp_verify_nonce( $state, $this->facade->get_config( 'state_nonce' ) ) ) {
			// phpcs:ignore WordPress.WP.I18n.MissingArgDomain
			wp_die( 'Invalid state<p><a href="' . esc_url( $this->facade->utils()->get_admin_url() ) . '">' . esc_html__( '&laquo; Back' ) . '</a></p>' );
		}
	}

	/**
	 * Handle auth code
	 * @return void
	 */
	public function handle_auth_code() {
		if ( ! $this->should_handle_auth_code() ) {
			return;
		}

		$code = sanitize_text_field( wp_unslash( $_GET['code'] ?? '' ) );
		$state = sanitize_text_field( wp_unslash( $_GET['state'] ?? '' ) );

		// Check if the state is valid
		$this->validate_nonce( $state );

		try {
			// Exchange the code for an access token and store it
			[ 'access_token' => $access_token ] = $this->facade->service()->get_token( GrantTypes::AUTHORIZATION_CODE, $code );
			$this->facade->data()->set_share_usage_data( $this->is_share_usage_scope_granted( $access_token ) ? 'yes' : 'no' );
			$this->facade->data()->set_owner_user_id( get_current_user_id() );
			$this->facade->data()->set_home_url();
		} catch ( \Throwable $th ) {
			$this->facade->logger()->error( 'Unable to handle auth code: ' . $th->getMessage() );
		}

		// Trigger the connected event for all apps
		do_action( 'elementor_one/connected', $this->facade );

		// Trigger the connected event for the app prefix
		do_action( 'elementor_one/' . $this->facade->get_config( 'app_prefix' ) . '_connected', $this->facade );

		wp_safe_redirect( $this->facade->utils()->get_admin_url() );

		exit;
	}

	/**
	 * Check if share usage scope is granted
	 * @param string $access_token
	 * @return bool
	 */
	private function is_share_usage_scope_granted( string $access_token ): bool {
		$jwt_payload = Utils::decode_jwt( $access_token );
		if ( $jwt_payload ) {
			return in_array( self::SCOPE_SHARE_USAGE_DATA, $jwt_payload['scp'] ?? [], true );
		}
		return false;
	}
}
