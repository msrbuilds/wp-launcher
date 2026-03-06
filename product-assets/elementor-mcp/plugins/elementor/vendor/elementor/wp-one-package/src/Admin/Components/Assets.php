<?php

namespace ElementorOne\Admin\Components;

use ElementorOne\Admin\Helpers\Utils;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Class Assets
 * Handles script and style enqueuing for the admin area
 */
class Assets {

	/**
	 * Instance
	 * @var Assets|null
	 */
	private static ?Assets $instance = null;

	/**
	 * Get instance
	 * @return Assets|null
	 */
	public static function instance(): ?Assets {
		if ( ! self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Get admin page
	 * @return string
	 */
	private function get_admin_page(): string {
		return Utils::get_one_connect()->get_config( 'admin_page' );
	}

	/**
	 * Enqueue scripts
	 * @param string $hook
	 * @return void
	 */
	public function enqueue_scripts( $hook ) {
		$package_version = Utils::get_latest_package_version();

		// Enqueue fonts
		wp_enqueue_style(
			'elementor-one-admin-fonts',
			'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
			[],
			'1.0.0'
		);

		// Enqueue common assets
		$this->enqueue_common_assets( $package_version );

		// Enqueue app assets only on Elementor Home admin page
		if ( "toplevel_page_{$this->get_admin_page()}" === $hook ) {
			$this->enqueue_app_assets( $package_version );
		}
	}

	/**
	 * Get plugin env
	 * @return string
	 */
	private static function get_plugin_env(): string {
		return apply_filters( 'elementor_one/package_env', 'production' );
	}

	/**
	 * Enqueue app assets
	 * @param string $package_version
	 * @return void
	 */
	private function enqueue_app_assets( string $package_version ) {
		wp_enqueue_script( 'elementor-one-admin', ELEMENTOR_ONE_CLIENT_APP_URL, [], $package_version, true );
	}

	/**
	 * Enqueue common assets
	 * @param string $package_version
	 * @return void
	 */
	private function enqueue_common_assets( string $package_version ) {
		// Load the asset file to get dependencies and version
		$asset_file = ELEMENTOR_ONE_ASSETS_PATH . 'common.asset.php';
		$asset = file_exists( $asset_file ) ? include $asset_file : [
			'dependencies' => [],
			'version' => $package_version,
		];

		wp_enqueue_script( 'elementor-one-admin-common', ELEMENTOR_ONE_ASSETS_URL . 'common.js', $asset['dependencies'], $asset['version'], true );
		wp_enqueue_style( 'elementor-one-admin-common', ELEMENTOR_ONE_ASSETS_URL . 'common.css', [], $package_version );

		wp_add_inline_script(
			'elementor-one-admin-common',
			'window.elementorOneSettingsData = ' . wp_json_encode( [
				'wpRestNonce' => wp_create_nonce( 'wp_rest' ),
				'wpRestUrl' => rest_url(),
				'pluginEnv' => self::get_plugin_env(),
				'packageVersion' => Utils::get_latest_package_version(),
				'canUserManageOptions' => current_user_can( 'manage_options' ),
				'elementorNewPostNonce' => wp_create_nonce( 'elementor_action_new_post' ),
				'elementorSiteSettingsRedirectNonce' => wp_create_nonce( 'elementor_action_site_settings_redirect' ),
				'elementorEditSiteNonce' => wp_create_nonce( 'elementor_action_edit_website' ),
				'shareUsageData' => 'yes' === Utils::get_one_connect()->data()->get_share_usage_data(),
				'assetsUIRootUrl' => ELEMENTOR_ONE_UI_ASSETS_ROOT_URL,
			] ) . ';'
		);
	}

	/**
	 * Assets constructor
	 * @return void
	 */
	private function __construct() {
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_scripts' ] );
	}
}
