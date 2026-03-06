<?php

namespace ElementorOne\Admin\Services;

use ElementorOne\Admin\Config;
use ElementorOne\Admin\Components\Fields;
use ElementorOne\Admin\Exceptions\MigrationException;
use ElementorOne\Admin\Helpers\Utils;
use ElementorOne\Common\SupportedPlugins;
use ElementorOne\Connect\Facade;
use ElementorOne\Logger;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Migration
 */
class Migration {

	const SETTING_MIGRATED_PLUGINS = Fields::SETTING_PREFIX . 'migrated_plugins';

	/**
	 * Logger instance
	 * @var Logger
	 */
	private Logger $logger;

	/**
	 * Instance
	 * @var Migration|null
	 */
	private static ?Migration $instance = null;

	/**
	 * Get instance
	 * @return Migration|null
	 */
	public static function instance(): ?Migration {
		if ( ! self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor
	 */
	private function __construct() {
		$this->logger = new Logger( self::class );

		add_action( 'elementor_one/get_connect_instance', [ $this, 'get_migrated_instance' ], 10, 3 );
		add_action( 'elementor_one/elementor_one_before_disconnect', [ $this, 'on_disconnect' ] );
		add_action( 'elementor_one/elementor_one_connected', [ $this, 'on_connect' ] );
		add_action( 'activated_plugin', [ $this, 'handle_plugin_activation' ], 10, 1 );
		add_action( 'shutdown', [ $this, 'on_shutdown' ] );
	}

	/**
	 * Trigger editor data update on shutdown
	 * @return void
	 */
	public function on_shutdown(): void {
		do_action( 'elementor_one/update_editor_data' );
	}

	/**
	 * Handle plugin activation
	 *
	 * This action is triggered when a plugin is activated.
	 * We make a blocking HTTP request to migrate the plugin
	 * to ensure that the plugin is migrated before the user can use it.
	 *
	 * @param string $plugin Path to the plugin file relative to the plugins directory
	 * @param bool   $network_wide Whether the plugin is being network-activated
	 * @return void
	 */
	public function handle_plugin_activation( string $plugin ): void {
		$plugin_slug = Utils::filter_plugin_slug( dirname( $plugin ) );

		$supported_plugins = array_filter( self::get_supported_plugins(), function ( $plugin_slug ) {
			return SupportedPlugins::ELEMENTOR !== $plugin_slug;
		} );

		if ( ! in_array( $plugin_slug, $supported_plugins, true ) ) {
			return;
		}

		$this->http_migrate_plugin( $plugin_slug );
	}

	/**
	 * Get supported plugins
	 * @return array
	 */
	public static function get_supported_plugins(): array {
		return array_filter( SupportedPlugins::get_values(), function ( $plugin_slug ) {
			return SupportedPlugins::ANGIE !== $plugin_slug;
		} );
	}

	/**
	 * Make a blocking HTTP request to migrate a plugin
	 * @param string $plugin_slug The plugin slug to migrate
	 * @return void
	 */
	private function http_migrate_plugin( string $plugin_slug ): void {
		$url = rest_url( 'elementor-one/v1/plugins/' . $plugin_slug . '/migration/run' );

		$args = [
			'method' => \WP_REST_Server::CREATABLE,
			'timeout' => 30,
			'body' => [
				'force' => false,
			],
			'headers' => [
				'X-WP-Nonce' => wp_create_nonce( 'wp_rest' ),
			],
			'cookies' => array_map(
				function ( $name ) {
					return new \WP_Http_Cookie( [
						'name' => wp_unslash( $name ),
						'value' => sanitize_text_field( wp_unslash( $_COOKIE[ $name ] ?? '' ) ),
					] );
				},
				array_keys( $_COOKIE )
			),
		];

		wp_remote_request( $url, $args );
	}

	/**
	 * On connect
	 * @return void
	 */
	public function on_connect(): void {
		foreach ( self::get_supported_plugins() as $plugin_slug ) {
			$plugin_data = Utils::get_plugin_data( $plugin_slug );
			if ( ! $plugin_data ) {
				continue;
			}

			if ( ! is_plugin_active( $plugin_data['_file'] ) ) {
				continue;
			}

			try {
				$this->run( $plugin_slug );
			} catch ( \Throwable $th ) {
				$this->logger->error( $th->getMessage() );
			}
		}
	}

	/**
	 * Get facade instance
	 *
	 * When a plugin is migrated to ONE, this filter redirects facade lookups
	 * to use the ONE instance instead of the app's own instance.
	 *
	 * @param Facade|null $instance  The originally requested facade instance
	 * @param string      $plugin_slug The plugin slug being requested
	 * @param array       $instances All registered facade instances
	 * @return Facade|null
	 */
	public function get_migrated_instance( ?Facade $instance, string $plugin_slug, array $instances ): ?Facade {
		// Not a migrated plugin - return the original instance
		if ( ! self::is_migrated( $plugin_slug ) ) {
			return $instance;
		}

		// Special case: AI app for non-owner users should use their own instance
		if ( $this->should_use_original_ai_instance( $plugin_slug, $instance ) ) {
			return $instance;
		}

		// Use the ONE instance for migrated plugins
		return $instances[ Config::PLUGIN_SLUG ] ?? null;
	}

	/**
	 * Check if we should use the original instance instead of the migrated instance
	 *
	 * Non-owner users should continue using their own AI instance
	 * to maintain their individual connection state.
	 *
	 * @param string      $plugin_slug The plugin slug
	 * @param Facade|null $instance The original facade instance
	 * @return bool
	 */
	private function should_use_original_ai_instance( string $plugin_slug, ?Facade $instance ): bool {
		if ( ! in_array( $plugin_slug, [ SupportedPlugins::ANGIE, SupportedPlugins::ELEMENTOR ], true ) || ! $instance ) {
			return false;
		}

		return ! $instance->data()->user_is_subscription_owner();
	}

	/**
	 * Update editor data
	 * @param string $connect_type The connect type to update
	 * @return void
	 */
	private static function update_editor_data( string $connect_type, $deactivate_license = false ): void {
		remove_all_actions( 'elementor_one/update_editor_data' );
		add_action( 'elementor_one/update_editor_data', function () use ( $connect_type, $deactivate_license ) {
			Editor::instance()->update_editor_data( $connect_type, $deactivate_license );
		} );
	}

	/**
	 * Add ONE migrated plugin
	 * @param string $plugin_slug The plugin slug to migrate
	 * @param bool $force Whether to force migration even if the plugin is already connected
	 * @return void
	 */
	public function run( string $plugin_slug, bool $force = false ): void {
		$migrated_plugins = self::get_migrated_plugins();

		// If the plugin is already migrated, do nothing
		if ( self::is_migrated( $plugin_slug, $migrated_plugins ) ) {
			return;
		}

		switch ( $plugin_slug ) {
			case SupportedPlugins::ELEMENTOR:
				$is_connected = (bool) Editor::instance()->get_site_owner_connect_data();
				if ( ! $is_connected ) {
					self::update_editor_data( Editor::CONNECT_APP_LIBRARY );
				}
				break;
			case SupportedPlugins::ELEMENTOR_PRO:
				$is_connected = (bool) Editor::get_active_license_key();
				if ( $is_connected && ! $force ) {
					throw new MigrationException( 'Plugin is already connected.', \WP_Http::UNPROCESSABLE_ENTITY );
				}
				self::update_editor_data( Editor::CONNECT_APP_ACTIVATE, true );
				break;
			default:
				$facade = Facade::get( $plugin_slug );
				if ( ! $facade ) {
					throw new MigrationException( 'Plugin version not supported.', \WP_Http::CONFLICT );
				}
				$is_using_original_instance = $facade->get_config( 'plugin_slug' ) === $plugin_slug;
				$is_connected = $facade->utils()->is_connected() && $is_using_original_instance;
				if ( $is_connected ) {
					if ( ! $force ) {
						throw new MigrationException( 'Plugin is already connected.', \WP_Http::UNPROCESSABLE_ENTITY );
					}
					try {
						$facade->service()->deactivate_license();
					} catch ( \Throwable $th ) {
						$facade->data()->clear_session();
						$this->logger->error( $th->getMessage() );
					}
				}
				break;
		}

		// Get the app prefix for the plugin
		$app_prefix = self::get_app_prefix( $plugin_slug );

		// Add the plugin slug to the migrated plugins
		$migrated_plugins = array_merge( $migrated_plugins, [ $plugin_slug ] );
		self::set_migrated_plugins( $migrated_plugins );

		// Trigger the migration run event for the plugin slug
		do_action( 'elementor_one/' . $app_prefix . '_migration_run' );
	}

	/**
	 * Rollback ONE migrated plugin
	 * @param string $plugin_slug The plugin slug to rollback
	 * @return array
	 */
	public function rollback( string $plugin_slug ): array {
		$migrated_plugins = self::get_migrated_plugins();

		if ( self::is_migrated( $plugin_slug, $migrated_plugins ) ) {
			$app_prefix = self::get_app_prefix( $plugin_slug );

			if ( SupportedPlugins::ELEMENTOR_PRO === $plugin_slug ) {
				Editor::instance()->update_editor_data( Editor::CONNECT_APP_LIBRARY, true );
			}

			// Get the app prefix for the plugin
			$app_prefix = self::get_app_prefix( $plugin_slug );

			// Remove the plugin slug from the migrated plugins
			$migrated_plugins = array_values( array_diff( $migrated_plugins, [ $plugin_slug ] ) );
			self::set_migrated_plugins( $migrated_plugins );

			// Trigger the migration rollback event for the plugin slug
			do_action( 'elementor_one/' . $app_prefix . '_migration_rollback' );
		}

		return $migrated_plugins;
	}

	/**
	 * Check if a plugin is migrated
	 * @param string $plugin_slug The plugin slug to check
	 * @return bool
	 */
	public static function is_migrated( string $plugin_slug, array $migrated_plugins = [] ): bool {
		if ( empty( $migrated_plugins ) ) {
			$migrated_plugins = self::get_migrated_plugins();
		}
		return in_array( $plugin_slug, $migrated_plugins, true );
	}

	/**
	 * Get migrated plugins
	 * @return array
	 */
	public static function get_migrated_plugins(): array {
		$migrated_plugins = get_option( self::SETTING_MIGRATED_PLUGINS );
		return ! empty( $migrated_plugins ) ? $migrated_plugins : [];
	}

	/**
	 * On disconnect
	 * @return void
	 */
	public function on_disconnect(): void {
		$migrated_plugins = self::get_migrated_plugins();

		foreach ( $migrated_plugins as $plugin_slug ) {
			if ( SupportedPlugins::ELEMENTOR_PRO === $plugin_slug ) {
				Editor::instance()->delete_editor_data();
			}
			do_action( 'elementor_one/' . self::get_app_prefix( $plugin_slug ) . '_migration_rollback' );
		}

		delete_option( self::SETTING_MIGRATED_PLUGINS );
	}

	/**
	 * Set migrated plugins
	 * @param array $migrated_plugins
	 * @return void
	 */
	private static function set_migrated_plugins( array $migrated_plugins ): void {
		update_option( self::SETTING_MIGRATED_PLUGINS, $migrated_plugins, false );
	}

	/**
	 * Get app prefix for a plugin slug
	 * @param string $plugin_slug The plugin slug
	 * @return string The app prefix or plugin slug as fallback
	 */
	private static function get_app_prefix( string $plugin_slug ): string {
		if ( SupportedPlugins::ELEMENTOR_PRO === $plugin_slug ) {
			return Editor::PRO_APP_PREFIX;
		}

		if ( SupportedPlugins::ELEMENTOR === $plugin_slug ) {
			return Editor::CORE_APP_PREFIX;
		}

		$facade = Facade::get( $plugin_slug );
		return $facade ? $facade->get_config( 'app_prefix' ) : $plugin_slug;
	}
}
