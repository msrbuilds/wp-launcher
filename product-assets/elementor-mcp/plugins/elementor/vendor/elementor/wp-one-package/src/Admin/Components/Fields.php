<?php

namespace ElementorOne\Admin\Components;

use ElementorOne\Admin\Helpers\Utils;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Class Fields
 * Handles WordPress settings registration
 */
class Fields {

	const SETTING_PREFIX = 'elementor_one_';

	/**
	 * Instance
	 * @var Fields|null
	 */
	private static ?Fields $instance = null;

	/**
	 * Get instance
	 * @return Fields|null
	 */
	public static function instance(): ?Fields {
		if ( ! self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Register fields
	 * @return void
	 */
	public function register_fields() {
		foreach ( $this->get_settings() as $setting => $args ) {
			register_setting( 'options', self::SETTING_PREFIX . $setting, $args );
		}
	}

	/**
	 * Get settings
	 * @return array
	 */
	public static function get_settings(): array {
		return [
			'welcome_screen_completed' => [
				'type' => 'boolean',
				'show_in_rest' => true,
				'description' => 'Elementor One Welcome Screen Completed',
			],
			'dismiss_connect_alert' => [
				'type' => 'boolean',
				'single' => true,
				'show_in_rest' => true,
				'description' => 'Elementor One Dismiss Connect Alert',
			],
			'editor_update_notification_dismissed' => [
				'type' => 'boolean',
				'show_in_rest' => true,
				'description' => 'Elementor One Dismiss Editor Update Notification',
			],
		];
	}

	/**
	 * Get plugin settings
	 * @return array
	 */
	public function get_plugin_settings(): array {
		$connect_utils = Utils::get_one_connect()->utils();

		return [
			'siteName' => get_bloginfo( 'name' ),
			'activeTheme' => wp_get_theme()->get( 'Name' ),
			'isConnected' => $connect_utils->is_connected(),
			'isUrlMismatch' => ! $connect_utils->is_valid_home_url(),
			'isDevelopment' => defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG,
			'siteUrl' => get_site_url(),
			'welcomeScreenCompleted' => (bool) get_option( self::SETTING_PREFIX . 'welcome_screen_completed' ),
			'dismissConnectAlert' => (bool) get_option( self::SETTING_PREFIX . 'dismiss_connect_alert' ),
			'editorUpdateNotificationDismissed' => (bool) get_option( self::SETTING_PREFIX . 'editor_update_notification_dismissed' ),
			'userLocale' => get_user_locale( get_current_user_id() ),
			'isRTL' => is_rtl(),
		];
	}

	/**
	 * Fields constructor
	 * @return void
	 */
	private function __construct() {
		add_action( 'rest_api_init', [ $this, 'register_fields' ] );
	}
}
