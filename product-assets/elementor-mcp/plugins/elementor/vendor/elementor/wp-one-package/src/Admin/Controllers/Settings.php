<?php

namespace ElementorOne\Admin\Controllers;

use ElementorOne\Admin\Config;
use ElementorOne\Admin\Helpers\Utils;
use ElementorOne\Admin\Components\Fields;
use ElementorOne\Common\RestError;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Settings
 * Extends WordPress's built-in REST Settings Controller
 * Handles all settings-related REST API endpoints
 */
class Settings extends \WP_REST_Settings_Controller {

	/**
	 * Constructor
	 */
	public function __construct() {
		$this->namespace = Config::APP_REST_NAMESPACE;
		$this->rest_base = 'settings';

		add_action( 'rest_api_init', [ $this, 'register_routes' ] );
	}

	/**
	 * Register all settings-related routes
	 * @return void
	 */
	public function register_routes() {
		// Register base route that handles both GET and POST
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base,
			[
				[
					'methods' => \WP_REST_Server::READABLE,
					'callback' => [ $this, 'get_item' ],
					'permission_callback' => [ $this, 'get_item_permissions_check' ],
				],
				[
					'methods' => \WP_REST_Server::EDITABLE,
					'callback' => [ $this, 'update_item' ],
					'permission_callback' => [ $this, 'get_item_permissions_check' ],
				],
			]
		);
	}

	/**
	 * Get settings - Override parent to return custom format
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_item( $request ) {
		try {
			$data = Fields::instance()->get_plugin_settings();

			return new \WP_REST_Response( $data );
		} catch ( \Throwable $th ) {
			return RestError::internal_server_error( $th->getMessage() );
		}
	}

	/**
	 * Update settings - Override parent to handle custom logic
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update_item( $request ) {
		try {
			foreach ( $request->get_params() as $key => $value ) {
				$setting_name = Utils::camel_to_snake( $key );
				if ( ! isset( Fields::get_settings()[ $setting_name ] ) ) {
					continue;
				}
				update_option( Fields::SETTING_PREFIX . $setting_name, $value );
			}

			$data = Fields::instance()->get_plugin_settings();

			return new \WP_REST_Response( $data );
		} catch ( \Throwable $th ) {
			return RestError::internal_server_error( $th->getMessage() );
		}
	}
}
