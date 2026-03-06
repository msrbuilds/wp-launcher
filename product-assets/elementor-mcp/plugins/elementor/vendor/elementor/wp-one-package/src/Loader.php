<?php

namespace ElementorOne;

use ElementorOne\Admin\Config;
use ElementorOne\Connect\Facade;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Class \ElementorOne\Loader
 */
class Loader {

	/**
	 * Initialize the loader.
	 * @return void
	 */
	public static function init(): void {
		/**
		 * Fires in the early stages of Elementor One init hook.
		 */
		do_action( 'elementor_one/pre_init' );

		self::define_constants();
		self::initialize_connect();
		self::initialize_services();
		self::initialize_components();
		self::initialize_controllers();
	}

	/**
	 * Initialize the Connect facade with configuration.
	 *
	 * @return void
	 */
	private static function initialize_connect(): void {
		Facade::make( [
			'app_name' => Config::APP_NAME,
			'app_prefix' => Config::APP_PREFIX,
			'app_rest_namespace' => Config::APP_REST_NAMESPACE,
			'admin_page' => Config::ADMIN_PAGE,
			'base_url' => Config::BASE_URL,
			'app_type' => Config::APP_TYPE,
			'plugin_slug' => Config::PLUGIN_SLUG,
			'scopes' => Config::SCOPES,
			'connect_mode' => Config::CONNECT_MODE,
			'state_nonce' => Config::STATE_NONCE,
		] );
	}

	/**
	 * Initialize all services.
	 *
	 * @return void
	 */
	private static function initialize_services(): void {
		\ElementorOne\Admin\Services\Editor::instance();
		\ElementorOne\Admin\Services\Migration::instance();
	}

	/**
	 * Initialize all components.
	 *
	 * @return void
	 */
	private static function initialize_components(): void {
		\ElementorOne\Admin\Components\Page::instance();
		\ElementorOne\Admin\Components\Assets::instance();
		\ElementorOne\Admin\Components\Fields::instance();
		\ElementorOne\Admin\Components\Onboarding::instance();
		\ElementorOne\Admin\Components\EditorUpdateNotification::instance();
	}

	/**
	 * Initialize all REST controllers.
	 *
	 * @return void
	 */
	private static function initialize_controllers(): void {
		new \ElementorOne\Admin\Controllers\TopBar();
		new \ElementorOne\Admin\Controllers\Themes();
		new \ElementorOne\Admin\Controllers\Plugins();
		new \ElementorOne\Admin\Controllers\Settings();
	}

	/**
	 * Define constants
	 * @return void
	 */
	public static function define_constants(): void {
		if ( ! defined( 'ELEMENTOR_ONE_ASSETS_URL' ) && function_exists( 'plugin_dir_url' ) ) {
			define( 'ELEMENTOR_ONE_ASSETS_URL', plugin_dir_url( __DIR__ ) . 'assets/build/' );
		}

		if ( ! defined( 'ELEMENTOR_ONE_ASSETS_PATH' ) && function_exists( 'plugin_dir_path' ) ) {
			define( 'ELEMENTOR_ONE_ASSETS_PATH', plugin_dir_path( __DIR__ ) . 'assets/build/' );
		}

		if ( ! defined( 'ELEMENTOR_ONE_UI_ASSETS_ROOT_URL' ) && function_exists( 'plugin_dir_url' ) ) {
			define( 'ELEMENTOR_ONE_UI_ASSETS_ROOT_URL', plugin_dir_url( __DIR__ ) . 'assets/elementor-home/' );
		}

		if ( ! defined( 'ELEMENTOR_ONE_CLIENT_APP_URL' ) ) {
			define( 'ELEMENTOR_ONE_CLIENT_APP_URL', ELEMENTOR_ONE_UI_ASSETS_ROOT_URL . 'client.js' );
		}
	}
}
