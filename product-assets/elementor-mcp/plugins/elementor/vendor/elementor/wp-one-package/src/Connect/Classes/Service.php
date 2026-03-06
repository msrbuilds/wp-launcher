<?php

namespace ElementorOne\Connect\Classes;

use ElementorOne\Connect\Exceptions\ServiceException;
use ElementorOne\Connect\Facade;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Class Service
 */
class Service {

	/**
	 * Facade instance
	 * @var Facade
	 */
	protected Facade $facade;

	/**
	 * Service constructor
	 * @param Facade $facade
	 */
	public function __construct( Facade $facade ) {
		$this->facade = $facade;
	}

	/**
	 * Get app config
	 * @param string|null $key
	 * @return array|string
	 */
	protected function get_app_config( ?string $key = null ) {
		return $this->facade->get_config( $key );
	}

	/**
	 * Registers new client and returns client ID
	 *
	 * @return string
	 * @throws ServiceException
	 */
	public function register_client(): string {
		$data = $this->facade->data();
		$utils = $this->facade->utils();

		$client_data = $this->request( $utils->get_clients_url(), [
			'method' => 'POST',
			'headers' => [
				'Content-Type' => 'application/json',
			],
			'body' => wp_json_encode( [
				'redirect_uri' => $utils->get_admin_url(),
				'app_type' => $this->get_app_config( 'app_type' ),
			] ),
		], 201 );

		$client_id = $client_data['client_id'] ?? null;
		$client_secret = $client_data['client_secret'] ?? null;

		$data->set_client_id( $client_id );
		$data->set_client_secret( $client_secret );
		$data->set_home_url();

		return $client_id;
	}

	/**
	 * Deactivate license
	 *
	 * @return void
	 * @throws ServiceException
	 */
	public function deactivate_license(): void {
		$data = $this->facade->data();
		$utils = $this->facade->utils();
		$client_id = $data->get_client_id();

		if ( ! $client_id ) {
			throw new ServiceException( 'Missing client ID' );
		}

		[ 'access_token' => $access_token ] = $this->renew_access_token( GrantTypes::CLIENT_CREDENTIALS );

		if ( ! $access_token ) {
			throw new ServiceException( 'Missing access token' );
		}

		// Trigger the before deactivate event for all apps
		do_action( 'elementor_one/before_deactivate', $this->facade );

		// Trigger the before deactivate event for the app prefix
		do_action( 'elementor_one/' . $this->get_app_config( 'app_prefix' ) . '_before_deactivate', $this->facade );

		$this->request( $utils->get_deactivation_url( $client_id ), [
			'method' => 'DELETE',
			'headers' => [
				'Authorization' => "Bearer {$access_token}",
			],
		], 204 );

		$data->set_connect_mode_data( $data::ACCESS_TOKEN, null );

		// Trigger the deactivated event for all apps
		do_action( 'elementor_one/deactivated', $this->facade );

		// Trigger the deactivated event for the app prefix
		do_action( 'elementor_one/' . $this->get_app_config( 'app_prefix' ) . '_deactivated', $this->facade );
	}

	/**
	 * Disconnect session
	 * @return void
	 * @throws ServiceException
	 */
	public function disconnect(): void {
		$data = $this->facade->data();
		$utils = $this->facade->utils();

		[ 'access_token' => $access_token ] = $this->renew_access_token( GrantTypes::REFRESH_TOKEN );

		if ( ! $access_token ) {
			throw new ServiceException( 'Missing access token' );
		}

		// Trigger the before disconnect event for all apps
		do_action( 'elementor_one/before_disconnect', $this->facade );

		// Trigger the before disconnect event for the app prefix
		do_action( 'elementor_one/' . $this->get_app_config( 'app_prefix' ) . '_before_disconnect', $this->facade );

		$this->request( $utils->get_sessions_url(), [
			'method' => 'DELETE',
			'headers' => [
				'Content-Type' => 'application/json',
				'Authorization' => "Bearer {$access_token}",
			],
		], 204 );

		$data->clear_session();

		// Trigger the disconnected event for all apps
		do_action( 'elementor_one/disconnected', $this->facade );

		// Trigger the disconnected event for the app prefix
		do_action( 'elementor_one/' . $this->get_app_config( 'app_prefix' ) . '_disconnected', $this->facade );
	}

	/**
	 * Get token
	 * @param string $grant_type
	 * @param string|null $credential
	 * @param bool|null $update
	 * @return array
	 * @throws ServiceException
	 */
	public function get_token( string $grant_type, ?string $credential = null, ?bool $update = true ): array {
		$data = $this->facade->data();
		$utils = $this->facade->utils();

		$client_id = $data->get_client_id();
		$client_secret = $data->get_client_secret();

		if ( empty( $client_id ) || empty( $client_secret ) ) {
			throw new ServiceException( 'Missing client ID or secret' );
		}

		$body = [
			'grant_type' => $grant_type,
		];

		switch ( $grant_type ) {
			case GrantTypes::AUTHORIZATION_CODE:
				$body['code'] = $credential;
				$body['redirect_uri'] = $utils->get_admin_url();
				break;
			case GrantTypes::REFRESH_TOKEN:
				$body['refresh_token'] = $credential;
				break;
			case GrantTypes::CLIENT_CREDENTIALS:
				break;
			default:
				throw new ServiceException( 'Invalid grant type' );
		}

		$response = $this->request( $utils->get_token_url(), [
			'method' => 'POST',
			'headers' => [
				'Authorization' => 'Basic ' . base64_encode( "{$client_id}:{$client_secret}" ),
			],
			'body' => $body,
		] );

		if ( $update ) {
			$data->set_connect_mode_data( $data::ACCESS_TOKEN, $response['access_token'] ?? null );
			if ( GrantTypes::CLIENT_CREDENTIALS !== $grant_type ) {
				$data->set_connect_mode_data( $data::TOKEN_ID, $response['id_token'] ?? null );
				$data->set_connect_mode_data( $data::REFRESH_TOKEN, $response['refresh_token'] );
				$data->set_connect_mode_data( $data::USER_ACCESS_TOKEN, $response['access_token'] ?? null );
			}
		}

		return $response;
	}

	/**
	 * Request
	 * @param string $url
	 * @param array $args
	 * @param int $valid_response_code
	 * @return array|null
	 * @throws ServiceException
	 */
	public function request( string $url, array $args, int $valid_response_code = 200 ): ?array {
		$args['timeout'] = 30;
		$args['headers'] = array_replace_recursive( [
			'x-elementor-app-type' => $this->get_app_config( 'app_type' ),
		], $args['headers'] ?? [] );

		$response = wp_remote_request( $url, $args );

		if ( is_wp_error( $response ) ) {
			$this->facade->logger()->error( $response->get_error_message() );

			throw new ServiceException( $response->get_error_message() );
		}

		$response_body = wp_remote_retrieve_body( $response );
		$response_code = wp_remote_retrieve_response_code( $response );

		if ( $response_code !== $valid_response_code ) {
			$this->facade->logger()->error( 'Invalid status code ' . $response_code );

			throw new ServiceException( $response_body, $response_code );
		}

		return json_decode( $response_body, true );
	}

	/**
	 * Refresh token
	 * @return array
	 * @throws ServiceException
	 */
	public function renew_access_token( string $grant_type = GrantTypes::CLIENT_CREDENTIALS ): array {
		$credential = null;
		if ( GrantTypes::REFRESH_TOKEN === $grant_type ) {
			$credential = $this->facade->data()->get_refresh_token();
		}
		return $this->get_token( $grant_type, $credential, true );
	}

	/**
	 * Update redirect URI
	 * @return void
	 * @throws ServiceException
	 */
	public function switch_domain(): void {
		$data = $this->facade->data();
		$utils = $this->facade->utils();
		$client_id = $data->get_client_id();

		if ( ! $client_id ) {
			throw new ServiceException( 'Missing client ID' );
		}

		[ 'access_token' => $access_token ] = $this->get_token( GrantTypes::CLIENT_CREDENTIALS, null, false );

		if ( ! $access_token ) {
			throw new ServiceException( 'Missing client token' );
		}

		$this->request( $utils->get_clients_patch_url( $client_id ), [
			'method' => 'PATCH',
			'headers' => [
				'Content-Type' => 'application/json',
				'Authorization' => "Bearer {$access_token}",
			],
			'body' => wp_json_encode( [
				'redirect_uri' => $utils->get_admin_url(),
			] ),
		] );

		$data->set_home_url();

		// Trigger the switched domain event for all apps
		do_action( 'elementor_one/switched_domain', $this->facade );

		// Trigger the switched domain event for the app prefix
		do_action( 'elementor_one/' . $this->get_app_config( 'app_prefix' ) . '_switched_domain', $this->facade );
	}
}
