<?php

namespace ElementorOne\Admin\Controllers;

use Elementor\WPNotificationsPackage\V120\Notifications as NotificationsSDK;
use ElementorOne\Admin\Services\Feedback as FeedbackService;
use ElementorOne\Admin\Config;
use ElementorOne\Common\RestError;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class TopBar
 * Handles all top bar-related REST API endpoints
 */
class TopBar extends \WP_REST_Controller {

	/**
	 * Constructor
	 */
	public function __construct() {
		$this->namespace = Config::APP_REST_NAMESPACE;
		$this->rest_base = 'top-bar';

		add_action( 'rest_api_init', [ $this, 'register_routes' ] );
	}

	/**
	 * Register all notifications-related routes
	 * @return void
	 */
	public function register_routes() {
		// GET /top-bar/notifications
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/notifications',
			[
				[
					'methods' => \WP_REST_Server::READABLE,
					'callback' => [ $this, 'get_notifications' ],
					'permission_callback' => [ $this, 'create_item_permissions_check' ],
					'args' => [
						'app_name' => [
							'type' => 'string',
							'required' => true,
						],
						'app_version' => [
							'type' => 'string',
							'required' => true,
						],
					],
				],
			]
		);

		// POST /top-bar/feedback
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/feedback',
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'send_product_feedback' ],
					'permission_callback' => [ $this, 'create_item_permissions_check' ],
					'args' => [
						'product' => [
							'type' => 'string',
							'required' => true,
						],
						'subject' => [
							'type' => 'string',
							'required' => true,
						],
						'title' => [
							'type' => 'string',
							'required' => true,
						],
						'description' => [
							'type' => 'string',
							'required' => true,
						],
					],
				],
			]
		);
	}

	/**
	 * Get notifications
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_notifications( \WP_REST_Request $request ) {
		try {
			$app_name = $request->get_param( 'app_name' );
			$app_version = $request->get_param( 'app_version' );

			$notifications_sdk = new NotificationsSDK( [
				'app_name' => $app_name,
				'app_version' => $app_version,
			] );

			$notifications = $notifications_sdk->get_notifications_by_conditions( true );

			return new \WP_REST_Response( $notifications );
		} catch ( \Throwable $th ) {
			return RestError::internal_server_error( $th->getMessage() );
		}
	}

	/**
	 * Send feedback
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function send_product_feedback( \WP_REST_Request $request ) {
		try {
			$product = $request->get_param( 'product' );
			$subject = $request->get_param( 'subject' );
			$title = $request->get_param( 'title' );
			$description = $request->get_param( 'description' );

			FeedbackService::instance()->send_product_feedback( $product, $subject, $title, $description );

			return new \WP_REST_Response( null, \WP_Http::NO_CONTENT );
		} catch ( \Throwable $th ) {
			if ( \WP_Http::UNAUTHORIZED === $th->getCode() ) {
				return RestError::unauthorized( $th->getMessage() );
			}
			return RestError::bad_request( $th->getMessage() );
		}
	}

	/**
	 * Check if the user has permission to create an item
	 * @param \WP_REST_Request $request
	 * @return true|\WP_Error
	 */
	public function create_item_permissions_check( $request ) {
		return current_user_can( 'manage_options' );
	}
}
