<?php
// phpcs:ignoreFile WordPress.WP.I18n.TextDomainMismatch

namespace ElementorOne\Admin\Components;

use ElementorOne\Admin\Helpers\Utils;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Class Page
 * Handles admin menu registration, page rendering, and related filters
 */
class Page {

	const UPGRADE_PAGE_SLUG = 'elementor-one-upgrade';
	const UPGRADE_PAGE_URL = 'https://go.elementor.com/go-pro-upgrade-one-wp-menu/';

	/**
	 * Instance
	 * @var Page|null
	 */
	private static ?Page $instance = null;

	/**
	 * Get instance
	 * @return Page|null
	 */
	public static function instance(): ?Page {
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
	 * Render top bar
	 */
	public function render_top_bar() {
		global $current_screen;

		if ( "toplevel_page_{$this->get_admin_page()}" === $current_screen->id ) {
			?>
			<div id="elementor-home-app-top-bar"></div>
			<?php

			// Remove all admin header actions
			remove_all_actions( 'network_admin_notices' );
			remove_all_actions( 'user_admin_notices' );
			remove_all_actions( 'all_admin_notices' );
			remove_all_actions( 'admin_notices' );
		}
	}

	/**
	 * Render app
	 */
	public function render_app() {
		?>
		<div id="elementor-home-app"></div>
		<?php
	}

	/**
	 * Register page
	 */
	public function register_page() {
		global $submenu;

		$admin_page = $this->get_admin_page();

		// Add main menu item
		add_menu_page(
			__( 'Elementor', 'elementor' ),
			__( 'Elementor', 'elementor' ),
			'manage_options',
			$admin_page,
			[ $this, 'render_app' ],
			'',
			2
		);

		if ( current_user_can( 'manage_options' ) ) {
			$submenu[ $admin_page ][0] = [
				__( 'Home', 'elementor' ),
				'manage_options',
				"admin.php?page={$admin_page}",
			];
		}
	}

	/**
	 * Add upgrade menu item
	 * @return void
	 */
	public function upgrade_menu_item() {
		// If connected, don't add upgrade menu item
		if ( Utils::get_one_connect()->utils()->is_connected() ) {
			return;
		}

		$admin_page = $this->get_admin_page();

		add_submenu_page(
			$admin_page,
			'',
			__( 'Upgrade', 'elementor' ),
			'manage_options',
			self::UPGRADE_PAGE_SLUG,
			'__return_empty_string',
			999
		);
	}

	/**
	 * Submenu file filter
	 * @param string $submenu_file
	 * @return string
	 */
	public function submenu_file_filter( $submenu_file ) {
		global $parent_file, $current_screen;

		$admin_page = $this->get_admin_page();

		if ( "toplevel_page_{$admin_page}" === $current_screen->id ) {
			$parent_file = $admin_page;
			$submenu_file = "admin.php?page={$admin_page}";
		}

		return $submenu_file;
	}

	/**
	 * Disable Elementor top bar
	 * @param bool $is_active
	 * @param WP_Screen $current_screen
	 * @return bool
	 */
	public function disable_elementor_top_bar( $is_active, $current_screen ) {
		if ( "toplevel_page_{$this->get_admin_page()}" === $current_screen->id ) {
			return false;
		}
		return $is_active;
	}

	/**
	 * Handle upgrade redirect
	 * @return void
	 */
	public function handle_upgrade_redirect() {
		global $plugin_page;

		if ( self::UPGRADE_PAGE_SLUG === $plugin_page ) {
			wp_redirect( self::get_upgrade_url() ); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect
			exit;
		}
	}

	/**
	 * Get the Elementor One upgrade URL.
	 * @return string
	 */
	public static function get_upgrade_url(): string {
		return apply_filters( 'elementor_one/upgrade_url', self::UPGRADE_PAGE_URL );
	}

	/**
	 * Page constructor
	 * @return void
	 */
	private function __construct() {
		add_action( 'admin_menu', [ $this, 'register_page' ], 1 );
		add_action( 'admin_menu', [ $this, 'upgrade_menu_item' ], PHP_INT_MAX );
		add_action( 'in_admin_header', [ $this, 'render_top_bar' ], 1 );
		add_action( 'admin_init', [ $this, 'handle_upgrade_redirect' ] );
		add_filter( 'submenu_file', [ $this, 'submenu_file_filter' ] );
		add_filter( 'elementor/admin-top-bar/is-active', [ $this, 'disable_elementor_top_bar' ], 10, 2 );
	}
}
