<?php

namespace ElementorOne\Connect\Controllers;

use ElementorOne\Connect\Facade;
use ElementorOne\Common\RestError;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Authorization
 * Handles all authorization-related REST API endpoints
 */
class Authorization {

	/**
	 * Facade instance
	 * @var Facade
	 */
	private Facade $facade;

	/**
	 * REST namespace
	 * @var string
	 */
	private string $namespace;

	/**
	 * REST base
	 * @var string
	 */
	private string $rest_base = 'connect';

	/**
	 * Constructor
	 * @param Facade $facade
	 */
	public function __construct( Facade $facade ) {
		$this->facade = $facade;
		$this->namespace = $this->facade->get_config( 'app_rest_namespace' );

		add_action( 'rest_api_init', [ $this, 'register_routes' ] );
	}

	/**
	 * Register all authorization-related routes
	 * @return void
	 */
	public function register_routes() {
		// POST /connect/authorize
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/authorize',
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'authorize' ],
					'permission_callback' => [ $this, 'check_permission' ],
					'args' => [
						'clearSession' => [
							'type' => 'boolean',
							'required' => false,
							'default' => false,
						],
					],
				],
			]
		);

		// POST /connect/disconnect
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/disconnect',
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'disconnect' ],
					'permission_callback' => [ $this, 'check_permission' ],
				],
			]
		);

		// POST /connect/switch-domain
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/switch-domain',
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'switch_domain' ],
					'permission_callback' => [ $this, 'check_permission' ],
				],
			]
		);

		// POST /connect/deactivate
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/deactivate',
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'deactivate' ],
					'permission_callback' => [ $this, 'check_permission' ],
				],
			]
		);
	}

	/**
	 * Permission callback for all endpoints
	 * @param \WP_REST_Request $_request
	 * @return bool
	 */
	public function check_permission( \WP_REST_Request $_request ): bool {
		$current_user_id = get_current_user_id();
		return $current_user_id > 0 && user_can( $current_user_id, 'manage_options' );
	}

	/**
	 * Handle authorize request
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function authorize( \WP_REST_Request $request ) {
		$data = $this->facade->data();
		$utils = $this->facade->utils();

		$clear_session = $request->get_param( 'clearSession' );

		if ( $clear_session ) {
			$data->clear_session( true );
		} elseif ( $utils->is_connected() ) {
			return RestError::forbidden( 'You are already connected' );
		}

		$client_id = $data->get_client_id();
		$client_secret = $data->get_client_secret();

		if ( ! $client_id || ! $client_secret ) {
			try {
				$client_id = $this->facade->service()->register_client();
			} catch ( \Throwable $th ) {
				return RestError::internal_server_error( $th->getMessage() );
			}
		}

		return $this->respond_success_json( $utils->get_authorize_url( $client_id ) );
	}

	/**
	 * Handle disconnect request
	 * @param \WP_REST_Request $_request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function disconnect( \WP_REST_Request $_request ) {
		try {
			$service = $this->facade->service();
			$service->disconnect();

			return $this->respond_success_json();
		} catch ( \Throwable $th ) {
			return RestError::internal_server_error( $th->getMessage() );
		}
	}

	/**
	 * Handle switch domain request
	 * @param \WP_REST_Request $_request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function switch_domain( \WP_REST_Request $_request ) {
		try {
			$data = $this->facade->data();
			$service = $this->facade->service();

			$client_id = $data->get_client_id();

			if ( ! $client_id ) {
				return RestError::bad_request( 'Client ID not found' );
			}

			$service->switch_domain();

			return $this->respond_success_json( [ 'message' => 'Domain updated!' ] );
		} catch ( \Throwable $th ) {
			return RestError::internal_server_error( $th->getMessage() );
		}
	}

	/**
	 * Handle deactivate request
	 * @param \WP_REST_Request $_request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function deactivate( \WP_REST_Request $_request ) {
		try {
			$service = $this->facade->service();
			$service->deactivate_license();

			return $this->respond_success_json();
		} catch ( \Throwable $th ) {
			return RestError::internal_server_error( $th->getMessage() );
		}
	}

	/**
	 * Respond success JSON
	 * @param array $data The data to return
	 * @return \WP_REST_Response The response object
	 */
	private function respond_success_json( $data = [] ): \WP_REST_Response {
		return new \WP_REST_Response([
			'success' => true,
			'data' => $data,
		]);
	}
}
