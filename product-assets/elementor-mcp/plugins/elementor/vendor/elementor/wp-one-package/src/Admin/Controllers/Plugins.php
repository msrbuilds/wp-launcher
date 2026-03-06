<?php

namespace ElementorOne\Admin\Controllers;

use ElementorOne\Admin\Config;
use ElementorOne\Admin\Exceptions\MigrationException;
use ElementorOne\Admin\Helpers\Utils;
use ElementorOne\Admin\Services\Editor;
use ElementorOne\Admin\Services\Migration;
use ElementorOne\Common\RestError;
use ElementorOne\Common\SupportedPlugins;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Plugins
 * Extends WordPress's built-in REST Plugins Controller
 * Handles all plugin-related REST API endpoints
 */
class Plugins extends \WP_REST_Plugins_Controller {

	/**
	 * Constructor
	 */
	public function __construct() {
		$this->namespace = Config::APP_REST_NAMESPACE;
		$this->rest_base = 'plugins';

		add_action( 'rest_api_init', [ $this, 'register_routes' ] );
	}

	/**
	 * Register all plugin-related routes
	 * @return void
	 */
	public function register_routes() {
		// GET /plugins - List all plugins
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base,
			[
				[
					'methods' => \WP_REST_Server::READABLE,
					'callback' => [ $this, 'get_items' ],
					'permission_callback' => [ $this, 'get_items_permissions_check' ],
					'args' => $this->get_collection_params(),
				],
			]
		);

		// POST /plugins - Install plugin
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base,
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'install_plugin' ],
					'permission_callback' => [ $this, 'create_item_permissions_check' ],
					'args' => [
						'slug' => [
							'type' => 'string',
							'required' => true,
							'description' => 'WordPress.org plugin directory slug.',
							'enum' => SupportedPlugins::get_values(),
						],
						'status' => [
							'description' => 'The plugin activation status.',
							'type' => 'string',
							'enum' => [ 'inactive', 'active' ],
							'default' => 'inactive',
						],
					],
				],
			]
		);

		// POST /plugins/{slug}/activate
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<slug>[\w\-]+)/activate',
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'activate_plugin' ],
					'permission_callback' => [ $this, 'user_can_manage_plugin_status' ],
					'args' => [
						'slug' => [
							'type' => 'string',
							'required' => true,
							'description' => 'WordPress.org plugin directory slug.',
							'enum' => SupportedPlugins::get_values(),
						],
					],
				],
			]
		);

		// POST /plugins/{slug}/deactivate
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<slug>[\w\-]+)/deactivate',
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'deactivate_plugin' ],
					'permission_callback' => [ $this, 'user_can_manage_plugin_status' ],
					'args' => [
						'slug' => [
							'type' => 'string',
							'required' => true,
							'description' => 'WordPress.org plugin directory slug.',
							'enum' => SupportedPlugins::get_values(),
						],
					],
				],
			]
		);

		// POST /plugins/{slug}/upgrade
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<slug>[\w\-]+)/upgrade',
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'upgrade_plugin' ],
					'permission_callback' => [ $this, 'update_item_permissions_check' ],
					'args' => [
						'slug' => [
							'type' => 'string',
							'required' => true,
							'description' => 'WordPress.org plugin directory slug.',
							'enum' => SupportedPlugins::get_values(),
						],
						'status' => [
							'description' => 'The plugin activation status.',
							'type' => 'string',
							'required' => false,
							'enum' => [ 'active' ],
						],
					],
				],
			]
		);

		// POST /plugins/{slug}/migration/run
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<slug>[\w\-]+)/migration/run',
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'run_migration' ],
					'permission_callback' => [ $this, 'user_can_run_migration' ],
					'args' => [
						'slug' => [
							'type' => 'string',
							'required' => true,
							'description' => 'WordPress.org plugin directory slug.',
							'enum' => Migration::get_supported_plugins(),
						],
						'force' => [
							'type' => 'boolean',
							'required' => false,
							'default' => true,
							'description' => 'Force migration even if the plugin is already connected.',
						],
					],
				],
			]
		);

		// POST /plugins/{slug}/migration/rollback
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/(?P<slug>[\w\-]+)/migration/rollback',
			[
				[
					'methods' => \WP_REST_Server::CREATABLE,
					'callback' => [ $this, 'rollback_migration' ],
					'permission_callback' => [ $this, 'user_can_rollback_migration' ],
					'args' => [
						'slug' => [
							'type' => 'string',
							'required' => true,
							'description' => 'WordPress.org plugin directory slug.',
							'enum' => Migration::get_supported_plugins(),
						],
					],
				],
			]
		);
	}

	/**
	 * Get all plugins - Override parent to add custom fields
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_items( $request ) {
		wp_update_plugins();

		$plugins = [];
		foreach ( SupportedPlugins::get_values() as $plugin_slug ) {
			$plugin_response = $this->plugin_response( $plugin_slug )->get_data();
			if ( ! empty( $plugin_response ) ) {
				$plugins[] = $plugin_response;
			}
		}

		return new \WP_REST_Response( $plugins );
	}

	/**
	 * Install plugin - Override parent to add custom logic
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function install_plugin( $request ) {
		// Filter plugins API result for Elementor Pro
		if ( SupportedPlugins::ELEMENTOR_PRO === $request['slug'] ) {
			add_filter( 'plugins_api', [ Editor::instance(), 'filter_plugins_api_result' ], 10 );
		}

		// Use parent's create_item functionality
		$result = parent::create_item( $request );

		if ( is_wp_error( $result ) ) {
			return RestError::bad_request( $result->get_error_message(), $result->get_all_error_data() );
		}

		return $this->plugin_response( $request['slug'] );
	}

	/**
	 * Activate plugin
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function activate_plugin( \WP_REST_Request $request ) {
		$plugin_slug = $request->get_url_params()['slug'];

		try {
			$plugin_file = Utils::get_plugin_data( $plugin_slug )['_file'];
			$result = activate_plugins( $plugin_file );

			if ( is_wp_error( $result ) ) {
				return RestError::bad_request( $result->get_error_message(), $result->get_all_error_data() );
			}
		} catch ( \Throwable $th ) {
			return RestError::internal_server_error( $th->getMessage() );
		}

		return $this->plugin_response( $plugin_slug );
	}

	/**
	 * Deactivate plugin
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function deactivate_plugin( \WP_REST_Request $request ) {
		$plugin_slug = $request->get_url_params()['slug'];

		try {
			$plugin_file = Utils::get_plugin_data( $plugin_slug )['_file'];
			deactivate_plugins( $plugin_file );
		} catch ( \Throwable $th ) {
			return RestError::internal_server_error( $th->getMessage() );
		}

		return $this->plugin_response( $plugin_slug );
	}

	/**
	 * Upgrade plugin
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function upgrade_plugin( \WP_REST_Request $request ) {
		$plugin_slug = $request->get_url_params()['slug'];

		try {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
			require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
			require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
			require_once ABSPATH . 'wp-admin/includes/update.php';

			$plugin_data = Utils::get_plugin_data( $plugin_slug );

			if ( empty( $plugin_data ) ) {
				return RestError::not_found( 'Plugin not found.' );
			}

			// Check if there's an update available
			wp_update_plugins();

			$skin = new \WP_Ajax_Upgrader_Skin();
			$upgrader = new \Plugin_Upgrader( $skin );
			$result = $upgrader->upgrade( $plugin_data['_file'] );

			if ( is_wp_error( $result ) ) {
				return RestError::bad_request( $result->get_error_message(), $result->get_all_error_data() );
			}

			if ( is_wp_error( $skin->result ) ) {
				return RestError::bad_request( $skin->result->get_error_message(), $skin->result->get_all_error_data() );
			}

			if ( $skin->get_errors()->has_errors() ) {
				return RestError::bad_request( $skin->get_errors()->get_error_message(), $skin->get_errors()->get_all_error_data() );
			}

			if ( false === $result ) {
				return RestError::internal_server_error( 'Failed to update plugin for an unknown reason.' );
			}

			if ( 'active' === $request['status'] ) {
				$can_change_status = $this->user_can_manage_plugin_status( $request );

				if ( is_wp_error( $can_change_status ) ) {
					return RestError::forbidden( $can_change_status->get_error_message(), $can_change_status->get_all_error_data() );
				}

				$result = activate_plugins( $plugin_data['_file'] );

				if ( is_wp_error( $result ) ) {
					return RestError::bad_request( $result->get_error_message(), $result->get_all_error_data() );
				}
			}
		} catch ( \Throwable $th ) {
			return RestError::internal_server_error( $th->getMessage() );
		}

		return $this->plugin_response( $plugin_slug );
	}

	/**
	 * Run migration
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function run_migration( \WP_REST_Request $request ) {
		$plugin_slug = $request->get_url_params()['slug'];

		try {
			Migration::instance()->run( $plugin_slug, $request['force'] );
		} catch ( MigrationException $e ) {
			return RestError::custom_error( 'migration_exception', $e->getMessage(), $e->getCode() );
		} catch ( \Throwable $th ) {
			return RestError::internal_server_error( $th->getMessage() );
		}

		return $this->plugin_response( $plugin_slug );
	}

	/**
	 * Rollback migration
	 * @param \WP_REST_Request $request
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rollback_migration( \WP_REST_Request $request ) {
		$plugin_slug = $request->get_url_params()['slug'];

		try {
			Migration::instance()->rollback( $plugin_slug );
		} catch ( MigrationException $e ) {
			return RestError::custom_error( 'migration_exception', $e->getMessage(), $e->getCode() );
		} catch ( \Throwable $th ) {
			return RestError::internal_server_error( $th->getMessage() );
		}

		return $this->plugin_response( $plugin_slug );
	}

	/**
	 * Create unified plugin response
	 * @param string $plugin_slug Plugin slug
	 * @return \WP_REST_Response
	 */
	protected function plugin_response( string $plugin_slug ): \WP_REST_Response {
		$plugin_data = Utils::get_plugin_data( $plugin_slug );

		$response = is_null( $plugin_data ) ? null : [
			'slug' => $plugin_slug,
			'status' => is_plugin_active( $plugin_data['_file'] ) ? 'active' : 'inactive',
			'version' => $plugin_data['Version'],
			'newVersion' => Utils::get_plugin_new_version( $plugin_data['_file'] ),
			'isMigrated' => Migration::is_migrated( $plugin_slug ),
			'isConnected' => Utils::is_plugin_connected( $plugin_slug ),
			'hasWpOnePackage' => (bool) Utils::get_package_version( $plugin_slug ),
		];

		return new \WP_REST_Response( $response );
	}

	/**
	 * Check if the user has permission to manage the plugin status
	 * @param \WP_REST_Request $request
	 * @return true|\WP_Error
	 */
	public function user_can_manage_plugin_status( \WP_REST_Request $request ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			$authorization_required_code = rest_authorization_required_code();
			return RestError::custom_error(
				\WP_Http::UNAUTHORIZED === $authorization_required_code ? 'unauthorized' : 'forbidden',
				'Sorry, you are not allowed to manage plugins for this site.',
				$authorization_required_code
			);
		}

		$plugin_slug = $request->get_url_params()['slug'];
		$plugin_data = Utils::get_plugin_data( $plugin_slug );

		if ( empty( $plugin_data ) ) {
			return RestError::not_found( 'Plugin not found.' );
		}

		$current_status = is_plugin_active( $plugin_data['_file'] ) ? 'active' : 'inactive';

		return $this->plugin_status_permission_check( $plugin_data['_file'], 'active', $current_status );
	}

	/**
	 * Check if the user has permission to run migration
	 * @param \WP_REST_Request $request
	 * @return true|\WP_Error
	 */
	public function user_can_run_migration( \WP_REST_Request $request ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			$authorization_required_code = rest_authorization_required_code();
			return RestError::custom_error(
				\WP_Http::UNAUTHORIZED === $authorization_required_code ? 'unauthorized' : 'forbidden',
				'Sorry, you are not allowed to manage plugins for this site.',
				$authorization_required_code
			);
		}

		$plugin_slug = $request->get_url_params()['slug'];
		$plugin_data = Utils::get_plugin_data( $plugin_slug );

		if ( empty( $plugin_data ) ) {
			return RestError::not_found( 'Plugin not found.' );
		}

		if ( ! is_plugin_active( $plugin_data['_file'] ) ) {
			return RestError::bad_request( 'Plugin is not active.' );
		}

		return Utils::get_one_connect()->utils()->is_connected();
	}

	/**
	 * Check if the user has permission to rollback migration
	 * @param \WP_REST_Request $request
	 * @return true|\WP_Error
	 */
	public function user_can_rollback_migration( \WP_REST_Request $request ) {
		return $this->user_can_run_migration( $request );
	}
}
