<?php

namespace ElementorOne\Admin\Controllers;

use ElementorOne\Admin\Config;
use ElementorOne\Common\RestError;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Themes
 * Extends WordPress's built-in REST Themes Controller
 * Handles all themes-related REST API endpoints
 */
class Themes extends \WP_REST_Themes_Controller {

	/**
	 * Constructor
	 * @return void
	 */
	public function __construct() {
		$this->namespace = Config::APP_REST_NAMESPACE;
		$this->rest_base = 'themes';

		add_action( 'rest_api_init', [ $this, 'register_routes' ] );
	}

	/**
	 * Register all themes-related routes
	 * @return void
	 */
	public function register_routes() {
		// POST /themes - Install theme
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base,
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'install_theme' ],
					'permission_callback' => [ $this, 'create_item_permissions_check' ],
					'args' => [
						'slug' => [
							'type' => 'string',
							'required' => true,
							'description' => 'WordPress.org theme directory slug.',
							'pattern' => '[\w\-]+',
						],
						'status' => [
							'description' => 'The theme activation status.',
							'type' => 'string',
							'enum' => [ 'inactive', 'active' ],
							'default' => 'inactive',
						],
					],
				],
			]
		);

		// POST /themes/{slug}/activate
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<slug>[\w\-]+)/activate',
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'activate_theme' ],
					'permission_callback' => [ $this, 'user_can_manage_theme_status' ],
					'args' => [
						'slug' => [
							'type' => 'string',
							'required' => true,
							'description' => 'WordPress.org theme directory slug.',
							'pattern' => '[\w\-]+',
						],
					],
				],
			]
		);
	}

	/**
	 * Install a theme
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function install_theme( $request ) {
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/theme.php';
		require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
		require_once ABSPATH . 'wp-admin/includes/theme-install.php';

		$skin = new \WP_Ajax_Upgrader_Skin();
		$upgrader = new \Theme_Upgrader( $skin );

		$package_url = $this->get_package_url_from_theme_slug( $request['slug'] );

		if ( is_wp_error( $package_url ) ) {
			return $package_url;
		}

		$result = $upgrader->install( $package_url );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		if ( is_wp_error( $skin->result ) ) {
			return $skin->result;
		}

		if ( $skin->get_errors()->has_errors() ) {
			return $skin->get_errors();
		}

		if ( ! $result ) {
			return RestError::internal_server_error( 'Unable to install the theme.' );
		}

		if ( 'active' === $request['status'] ) {
			$theme = wp_get_theme( $request['slug'] );
			if ( ! $theme->exists() ) {
				return RestError::not_found( 'Theme not found.' );
			}

			if ( ! $theme->is_allowed() ) {
				return RestError::bad_request( 'Theme is broken or not compatible.' );
			}

			switch_theme( $theme->get_stylesheet() );
		}

		return rest_ensure_response( [
			'status' => 'success',
			'message' => 'Theme installed successfully.',
		] );
	}

	/**
	 * Activate a theme
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function activate_theme( $request ) {
		$theme = wp_get_theme( $request['slug'] );
		if ( ! $theme->exists() ) {
			return RestError::not_found( 'Theme not found.' );
		}

		if ( $theme->get_stylesheet() === get_stylesheet() ) {
			return RestError::bad_request( 'Theme is already active.' );
		}

		if ( ! $theme->is_allowed() ) {
			return RestError::bad_request( 'Theme is broken or not compatible.' );
		}

		switch_theme( $theme->get_stylesheet() );

		return rest_ensure_response( [
			'status' => 'success',
			'message' => 'Theme activated successfully.',
		] );
	}

	/**
	 * Get the package URL from the theme slug
	 * @param string $theme_slug
	 * @return string|WP_Error
	 */
	private function get_package_url_from_theme_slug( string $theme_slug ) {
		$installed_themes = wp_get_themes();
		if ( isset( $installed_themes[ $theme_slug ] ) ) {
			return RestError::conflict( 'Theme already installed.' );
		}

		$api = themes_api( 'theme_information', [
			'slug' => $theme_slug,
			'fields' => [
				'sections' => false,
			],
		] );

		if ( is_wp_error( $api ) ) {
			if ( str_contains( $api->get_error_message(), 'Theme not found.' ) ) {
				return RestError::not_found( $api->get_error_message() );
			} else {
				return RestError::internal_server_error( $api->get_error_message() );
			}
		}

		return $api->download_link;
	}

	/**
	 * Checks if a given request has access to upload themes.
	 *
	 * @since 5.5.0
	 *
	 * @param WP_REST_Request $request Full details about the request.
	 * @return true|WP_Error True if the request has access to create items, WP_Error object otherwise.
	 */
	public function create_item_permissions_check( $request ) {
		if ( ! current_user_can( 'install_themes' ) ) {
			return RestError::forbidden( 'Sorry, you are not allowed to install themes on this site.' );
		}

		return true;
	}

	/**
	 * Checks if a given request has access to manage theme status.
	 *
	 * @since 5.5.0
	 *
	 * @param WP_REST_Request $request Full details about the request.
	 * @return true|WP_Error True if the request has access to manage theme status, WP_Error object otherwise.
	 */
	public function user_can_manage_theme_status( $request ) {
		if ( ! current_user_can( 'switch_themes' ) ) {
			return RestError::forbidden( 'Sorry, you are not allowed to switch themes on this site.' );
		}

		return true;
	}
}
