<?php

namespace ElementorOne\Admin\Components;

use ElementorOne\Common\SupportedPlugins;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class EditorUpdateNotification
 * Handles the editor update notification
 */
class EditorUpdateNotification {

	const DISMISSED_OPTION_NAME = Fields::SETTING_PREFIX . 'editor_update_notification_dismissed';
	const SHOWN_NONCE_META_KEY = Fields::SETTING_PREFIX . 'editor_update_notification_shown_nonce';
	const EDITOR_PLUGIN_FILE = 'elementor/elementor.php';

	/**
	 * Instance
	 *
	 * @var EditorUpdateNotification|null
	 */
	private static ?EditorUpdateNotification $instance = null;

	/**
	 * Get instance
	 *
	 * @return EditorUpdateNotification|null
	 */
	public static function instance(): ?EditorUpdateNotification {
		if ( ! self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor
	 *
	 * @return void
	 */
	private function __construct() {
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_scripts' ] );
	}

	/**
	 * Check if the Editor plugin is installed
	 *
	 * @return bool
	 */
	public function is_editor_installed(): bool {
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		$all_plugins = get_plugins();

		return isset( $all_plugins[ self::EDITOR_PLUGIN_FILE ] );
	}

	/**
	 * Check if the Editor plugin is activated
	 *
	 * @return bool
	 */
	public function is_editor_activated(): bool {
		if ( ! function_exists( 'is_plugin_active' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		return is_plugin_active( self::EDITOR_PLUGIN_FILE );
	}

	/**
	 * Check if the editor plugin has wp-one-package installed
	 *
	 * @return bool
	 */
	public function editor_has_wp_one_package(): bool {
		global $wp_one_package_versions;

		return isset( $wp_one_package_versions[ SupportedPlugins::ELEMENTOR ] );
	}

	/**
	 * Check if update notification has been dismissed
	 *
	 * @return bool
	 */
	public function is_notification_dismissed(): bool {
		return (bool) get_option( self::DISMISSED_OPTION_NAME, false );
	}

	/**
	 * Check if already shown recently
	 *
	 * @return bool
	 */
	private function is_shown_recently(): bool {
		$user_id = get_current_user_id();

		if ( ! $user_id ) {
			return false;
		}

		$stored_nonce = get_user_meta( $user_id, self::SHOWN_NONCE_META_KEY, true );

		if ( empty( $stored_nonce ) ) {
			return false;
		}

		return false !== wp_verify_nonce( $stored_nonce, self::SHOWN_NONCE_META_KEY );
	}

	/**
	 * Mark as shown
	 *
	 * @return void
	 */
	private function mark_as_shown(): void {
		$user_id = get_current_user_id();

		if ( ! $user_id ) {
			return;
		}

		update_user_meta(
			$user_id,
			self::SHOWN_NONCE_META_KEY,
			wp_create_nonce( self::SHOWN_NONCE_META_KEY )
		);
	}

	/**
	 * Check if we should show the update notification
	 *
	 * @return bool
	 */
	public function should_show_notification(): bool {
		if ( $this->is_shown_recently() ) {
			return false;
		}

		if ( $this->is_notification_dismissed() ) {
			return false;
		}

		if ( ! $this->is_editor_installed() ) {
			return false;
		}

		if ( ! $this->is_editor_activated() ) {
			return false;
		}

		return ! $this->editor_has_wp_one_package();
	}

	/**
	 * Check if current page is an Elementor page
	 *
	 * @return bool
	 */
	private function is_elementor_page(): bool {
		$current_screen = get_current_screen();

		if ( ! $current_screen ) {
			return false;
		}

		$screen_id = $current_screen->id ?? '';
		$post_type = $current_screen->post_type ?? '';

		$is_elementor_screen = strpos( $screen_id, 'elementor' ) !== false
			|| strpos( $screen_id, 'e-floating-buttons' ) !== false;

		$is_elementor_post_type = strpos( $post_type, 'elementor' ) !== false
			|| strpos( $post_type, 'e-floating-buttons' ) !== false;

		return $is_elementor_screen || $is_elementor_post_type;
	}

	/**
	 * Maybe enqueue editor update notification assets
	 *
	 * @return void
	 */
	public function enqueue_scripts() {
		if ( ! $this->is_elementor_page() ) {
			return;
		}

		if ( ! $this->should_show_notification() ) {
			return;
		}

		$asset_file = ELEMENTOR_ONE_ASSETS_PATH . 'editor.asset.php';
		$asset = file_exists( $asset_file ) ? include $asset_file : [
			'dependencies' => [ 'wp-element', 'wp-i18n', 'wp-data', 'wp-core-data' ],
			'version' => '1.0.0',
		];

		wp_enqueue_script(
			'elementor-one-editor-update-notification',
			ELEMENTOR_ONE_ASSETS_URL . 'editor.js',
			$asset['dependencies'],
			$asset['version'],
			true
		);

		wp_localize_script(
			'elementor-one-editor-update-notification',
			'elementorOneEditorUpdateNotification',
			[
				'pluginsUrl' => admin_url( 'plugins.php' ),
			]
		);

		$this->mark_as_shown();
	}
}
