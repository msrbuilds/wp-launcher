<?php
/**
 * Handles plugin settings, admin menu, and settings registration.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Settings
 *
 * Registers the admin menu, settings pages, and manages
 * all plugin settings with defaults and sanitization.
 *
 * @since 1.0.0
 */
class FiveDPBR_Settings {

	/**
	 * Option name in wp_options.
	 *
	 * @var string
	 */
	const OPTION_NAME = 'fdpbr_settings';

	/**
	 * Admin page hook suffixes for conditional asset loading.
	 *
	 * @since 1.0.0
	 * @var   array
	 */
	private $page_hooks = array();

	/**
	 * Initialize settings hooks.
	 *
	 * @since 1.0.0
	 */
	public function init() {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_head', array( $this, 'menu_icon_css' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_filter( 'plugin_action_links_' . FDPBR_PLUGIN_BASENAME, array( $this, 'add_action_links' ) );
		add_action( 'wp_ajax_fdpbr_save_settings', array( $this, 'ajax_save_settings' ) );
	}

	/**
	 * Register the admin menu and submenu pages.
	 *
	 * @since 1.0.0
	 */
	public function register_menu() {
		$this->page_hooks[] = add_menu_page(
			__( 'Backup Engine', '5dp-backup-restore' ),
			__( 'Backup Engine', '5dp-backup-restore' ),
			'manage_options',
			'fdpbr',
			array( $this, 'render_dashboard_page' ),
			'none',
			81
		);

		$this->page_hooks[] = add_submenu_page(
			'fdpbr',
			__( 'Dashboard', '5dp-backup-restore' ),
			__( 'Dashboard', '5dp-backup-restore' ),
			'manage_options',
			'fdpbr',
			array( $this, 'render_dashboard_page' )
		);

		$this->page_hooks[] = add_submenu_page(
			'fdpbr',
			__( 'Backup', '5dp-backup-restore' ),
			__( 'Backup', '5dp-backup-restore' ),
			'manage_options',
			'fdpbr-backup',
			array( $this, 'render_backup_page' )
		);

		$this->page_hooks[] = add_submenu_page(
			'fdpbr',
			__( 'Restore', '5dp-backup-restore' ),
			__( 'Restore', '5dp-backup-restore' ),
			'manage_options',
			'fdpbr-restore',
			array( $this, 'render_restore_page' )
		);

		$this->page_hooks[] = add_submenu_page(
			'fdpbr',
			__( 'Migration', '5dp-backup-restore' ),
			__( 'Migration', '5dp-backup-restore' ),
			'manage_options',
			'fdpbr-migration',
			array( $this, 'render_migration_page' )
		);

		$this->page_hooks[] = add_submenu_page(
			'fdpbr',
			__( 'Staging', '5dp-backup-restore' ),
			__( 'Staging', '5dp-backup-restore' ),
			'manage_options',
			'fdpbr-staging',
			array( $this, 'render_staging_page' )
		);

		$this->page_hooks[] = add_submenu_page(
			'fdpbr',
			__( 'Storage', '5dp-backup-restore' ),
			__( 'Storage', '5dp-backup-restore' ),
			'manage_options',
			'fdpbr-storage',
			array( $this, 'render_storage_page' )
		);

		$this->page_hooks[] = add_submenu_page(
			'fdpbr',
			__( 'Settings', '5dp-backup-restore' ),
			__( 'Settings', '5dp-backup-restore' ),
			'manage_options',
			'fdpbr-settings',
			array( $this, 'render_settings_page' )
		);

		$this->page_hooks[] = add_submenu_page(
			'fdpbr',
			__( 'Logs', '5dp-backup-restore' ),
			__( 'Logs', '5dp-backup-restore' ),
			'manage_options',
			'fdpbr-logs',
			array( $this, 'render_logs_page' )
		);
	}

	/**
	 * Output CSS to set the admin menu icon.
	 *
	 * @since 1.0.0
	 */
	public function menu_icon_css() {
		?>
		<style>
			#adminmenu .toplevel_page_fdpbr .wp-menu-image::before {
				content: "\f321";
				font-family: dashicons;
			}
		</style>
		<?php
	}

	/**
	 * Register settings with WordPress Settings API.
	 *
	 * @since 1.0.0
	 */
	public function register_settings() {
		register_setting(
			'fdpbr_settings_group',
			self::OPTION_NAME,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => self::get_defaults(),
			)
		);
	}

	/**
	 * Add Settings link to the Plugins page.
	 *
	 * @since  1.0.0
	 * @param  array $links Existing plugin action links.
	 * @return array Modified links.
	 */
	public function add_action_links( $links ) {
		$settings_link = sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'admin.php?page=fdpbr-settings' ) ),
			esc_html__( 'Settings', '5dp-backup-restore' )
		);
		array_unshift( $links, $settings_link );
		return $links;
	}

	/**
	 * Get default plugin settings.
	 *
	 * @since  1.0.0
	 * @return array
	 */
	public static function get_defaults() {
		return array(
			'general' => array(
				'chunk_size'          => 50,
				'db_batch_size'       => 5000,
				'temp_cleanup_hours'  => 24,
				'background_method'   => 'auto',
			),
			'notifications' => array(
				'email_enabled'       => false,
				'email_recipients'    => '',
				'notify_on_success'   => true,
				'notify_on_failure'   => true,
			),
			'advanced' => array(
				'debug_mode'          => false,
				'max_execution_time'  => 0,
				'exclude_paths'       => array(),
				'exclude_tables'      => array(),
			),
		);
	}

	/**
	 * Get the navigation tabs definition.
	 *
	 * @since  1.0.0
	 * @return array
	 */
	public static function get_nav_tabs() {
		return array(
			'fdpbr'           => array(
				'label' => __( 'Dashboard', '5dp-backup-restore' ),
				'icon'  => 'dashicons-dashboard',
			),
			'fdpbr-backup'    => array(
				'label' => __( 'Backup', '5dp-backup-restore' ),
				'icon'  => 'dashicons-cloud-upload',
			),
			'fdpbr-restore'   => array(
				'label' => __( 'Restore', '5dp-backup-restore' ),
				'icon'  => 'dashicons-cloud-saved',
			),
			'fdpbr-migration' => array(
				'label' => __( 'Migration', '5dp-backup-restore' ),
				'icon'  => 'dashicons-migrate',
			),
			'fdpbr-staging'   => array(
				'label' => __( 'Staging', '5dp-backup-restore' ),
				'icon'  => 'dashicons-admin-multisite',
			),
			'fdpbr-storage'   => array(
				'label' => __( 'Storage', '5dp-backup-restore' ),
				'icon'  => 'dashicons-cloud',
			),
			'fdpbr-settings'  => array(
				'label' => __( 'Settings', '5dp-backup-restore' ),
				'icon'  => 'dashicons-admin-generic',
			),
			'fdpbr-logs'      => array(
				'label' => __( 'Logs', '5dp-backup-restore' ),
				'icon'  => 'dashicons-list-view',
			),
		);
	}

	/**
	 * Get the settings sidebar tabs definition.
	 *
	 * @since  1.0.0
	 * @return array
	 */
	public static function get_settings_tabs() {
		return array(
			'general'       => array(
				'label' => __( 'General', '5dp-backup-restore' ),
				'icon'  => 'dashicons-admin-generic',
			),
			'schedules'     => array(
				'label' => __( 'Schedules', '5dp-backup-restore' ),
				'icon'  => 'dashicons-calendar-alt',
			),
			'notifications' => array(
				'label' => __( 'Notifications', '5dp-backup-restore' ),
				'icon'  => 'dashicons-email-alt',
			),
			'advanced'      => array(
				'label' => __( 'Advanced', '5dp-backup-restore' ),
				'icon'  => 'dashicons-admin-tools',
			),
		);
	}

	// -------------------------------------------------------------------------
	// Page renderers.
	// -------------------------------------------------------------------------

	/**
	 * Render the dashboard page.
	 *
	 * @since 1.0.0
	 */
	public function render_dashboard_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		include FDPBR_PLUGIN_DIR . 'admin/partials/dashboard-page.php';
	}

	/**
	 * Render the backup page.
	 *
	 * @since 1.0.0
	 */
	public function render_backup_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		include FDPBR_PLUGIN_DIR . 'admin/partials/backup-page.php';
	}

	/**
	 * Render the restore page.
	 *
	 * @since 1.0.0
	 */
	public function render_restore_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		include FDPBR_PLUGIN_DIR . 'admin/partials/restore-page.php';
	}

	/**
	 * Render the migration page.
	 *
	 * @since 1.0.0
	 */
	public function render_migration_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		include FDPBR_PLUGIN_DIR . 'admin/partials/migration-page.php';
	}

	/**
	 * Render the staging page.
	 *
	 * @since 1.0.0
	 */
	public function render_staging_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		include FDPBR_PLUGIN_DIR . 'admin/partials/staging-page.php';
	}

	/**
	 * Render the storage page.
	 *
	 * @since 1.0.0
	 */
	public function render_storage_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		include FDPBR_PLUGIN_DIR . 'admin/partials/storage-page.php';
	}

	/**
	 * Render the settings page with sidebar tabs.
	 *
	 * @since 1.0.0
	 */
	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		include FDPBR_PLUGIN_DIR . 'admin/partials/settings-page.php';
	}

	/**
	 * Render the logs page.
	 *
	 * @since 1.0.0
	 */
	public function render_logs_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		include FDPBR_PLUGIN_DIR . 'admin/partials/logs-page.php';
	}

	// -------------------------------------------------------------------------
	// AJAX handlers.
	// -------------------------------------------------------------------------

	/**
	 * AJAX handler for saving settings.
	 *
	 * @since 1.0.0
	 */
	public function ajax_save_settings() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Unauthorized.', '5dp-backup-restore' ) ), 403 );
		}

		$settings = get_option( self::OPTION_NAME, self::get_defaults() );

		if ( isset( $_POST['module'] ) && isset( $_POST['settings'] ) ) {
			$module       = sanitize_key( wp_unslash( $_POST['module'] ) );
			$raw_settings = map_deep( wp_unslash( $_POST['settings'] ), 'sanitize_text_field' ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Sanitized via map_deep.

			if ( ! is_array( $raw_settings ) ) {
				wp_send_json_error( array( 'message' => __( 'Invalid settings data.', '5dp-backup-restore' ) ), 400 );
			}

			$defaults = self::get_defaults();
			if ( ! isset( $defaults[ $module ] ) ) {
				wp_send_json_error( array( 'message' => __( 'Unknown module.', '5dp-backup-restore' ) ), 400 );
			}

			$sanitized = self::sanitize_module_settings( $module, $raw_settings );

			// Preserve existing API keys when the sentinel value '__KEEP__' is sent.
			$api_key_fields = array( 'api_key', 'access_key', 'secret_key', 'client_id', 'client_secret' );
			$existing_module = isset( $settings[ $module ] ) ? $settings[ $module ] : array();
			foreach ( $api_key_fields as $key_field ) {
				if ( isset( $raw_settings[ $key_field ] ) && '__KEEP__' === $raw_settings[ $key_field ] && isset( $existing_module[ $key_field ] ) ) {
					$sanitized[ $key_field ] = $existing_module[ $key_field ];
				}
			}

			$settings[ $module ] = $sanitized;

			update_option( self::OPTION_NAME, $settings );

			wp_send_json_success( array( 'message' => __( 'Settings saved.', '5dp-backup-restore' ) ) );
		}

		wp_send_json_error( array( 'message' => __( 'Missing parameters.', '5dp-backup-restore' ) ), 400 );
	}

	// -------------------------------------------------------------------------
	// Sanitization.
	// -------------------------------------------------------------------------

	/**
	 * Sanitize the full settings array.
	 *
	 * @since  1.0.0
	 * @param  mixed $input Raw settings input.
	 * @return array Sanitized settings.
	 */
	public function sanitize_settings( $input ) {
		if ( ! is_array( $input ) ) {
			return self::get_defaults();
		}

		$sanitized = array();
		$defaults  = self::get_defaults();

		foreach ( $defaults as $module => $module_defaults ) {
			if ( isset( $input[ $module ] ) && is_array( $input[ $module ] ) ) {
				$sanitized[ $module ] = self::sanitize_module_settings( $module, $input[ $module ] );
			} else {
				$sanitized[ $module ] = $module_defaults;
			}
		}

		return $sanitized;
	}

	/**
	 * Sanitize settings for a specific module.
	 *
	 * @since  1.0.0
	 * @param  string $module   Module key.
	 * @param  array  $settings Raw module settings.
	 * @return array  Sanitized module settings.
	 */
	public static function sanitize_module_settings( $module, $settings ) {
		$defaults  = self::get_defaults();
		$sanitized = array();

		if ( ! isset( $defaults[ $module ] ) ) {
			return array();
		}

		$int_keys = array( 'chunk_size', 'db_batch_size', 'temp_cleanup_hours', 'max_execution_time' );
		$bool_keys = array( 'email_enabled', 'notify_on_success', 'notify_on_failure', 'debug_mode' );

		foreach ( $defaults[ $module ] as $key => $default_value ) {
			if ( ! isset( $settings[ $key ] ) ) {
				$sanitized[ $key ] = $default_value;
				continue;
			}

			if ( in_array( $key, $bool_keys, true ) ) {
				$sanitized[ $key ] = (bool) $settings[ $key ];
			} elseif ( in_array( $key, $int_keys, true ) ) {
				$sanitized[ $key ] = absint( $settings[ $key ] );
			} elseif ( is_array( $default_value ) ) {
				$sanitized[ $key ] = is_array( $settings[ $key ] )
					? array_map( 'sanitize_text_field', $settings[ $key ] )
					: $default_value;
			} else {
				$sanitized[ $key ] = sanitize_text_field( $settings[ $key ] );
			}
		}

		return $sanitized;
	}
}
