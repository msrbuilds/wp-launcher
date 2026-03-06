<?php

namespace ElementorOne\Connect;

use ElementorOne\Connect\Classes\Data;
use ElementorOne\Connect\Classes\Utils;
use ElementorOne\Connect\Classes\Service;
use ElementorOne\Logger;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Facade
 *
 * Facade for the Connect subsystem.
 * Provides a simplified interface to Data, Utils, and Service instances.
 * Manages multiple instances indexed by plugin_slug for easy retrieval.
 */
class Facade {
	/**
	 * @var array<string, Facade> Registry of facade instances by plugin_slug
	 */
	private static array $instances = [];

	/**
	 * @var array Configuration for this facade instance
	 */
	private array $config;

	/**
	 * @var Data Data instance
	 */
	private Data $data;

	/**
	 * @var Utils Utils instance
	 */
	private Utils $utils;

	/**
	 * @var Service Service instance
	 */
	private Service $service;

	/**
	 * @var Logger Logger instance
	 */
	private Logger $logger;

	/**
	 * Private constructor - use make() to create instances
	 *
	 * @param array $config Configuration array with required keys:
	 *                     - app_name: App name
	 *                     - app_prefix: App prefix for options
	 *                     - app_rest_namespace: REST namespace
	 *                     - base_url: Base URL for API
	 *                     - admin_page: Admin page slug
	 *                     - app_type: App type
	 *                     - plugin_slug: Plugin slug
	 *                     - scopes: OAuth scopes
	 *                     - state_nonce: State nonce name
	 *                     - connect_mode: Connect mode - 'site' or 'user'
	 */
	private function __construct( array $config ) {
		$this->config = $config;
		$this->create_services();
		$this->init();
	}

	/**
	 * Create or retrieve a Facade instance by plugin_slug
	 * If an instance with the same plugin_slug exists, it will be returned
	 * Otherwise, a new instance is created and registered
	 *
	 * @param array $config Configuration array (must include all required keys)
	 * @return Facade
	 * @throws \InvalidArgumentException If required config keys are missing
	 */
	public static function make( array $config ): Facade {
		// Validate configuration
		self::validate_config( $config );

		$plugin_slug = $config['plugin_slug'];

		// Return existing instance if already created
		if ( isset( self::$instances[ $plugin_slug ] ) ) {
			return self::get( $plugin_slug );
		}

		// Create new instance and register it
		$instance = new self( $config );
		self::$instances[ $plugin_slug ] = $instance;

		return $instance;
	}

	/**
	 * Validate configuration array has all required keys
	 *
	 * @param array $config Configuration to validate
	 * @return void
	 * @throws \InvalidArgumentException If required keys are missing
	 */
	private static function validate_config( array $config ): void {
		$required_keys = [
			'app_name',
			'app_prefix',
			'app_rest_namespace',
			'base_url',
			'admin_page',
			'app_type',
			'plugin_slug',
			'scopes',
			'state_nonce',
			'connect_mode',
		];

		$missing_keys = [];

		foreach ( $required_keys as $key ) {
			if ( ! isset( $config[ $key ] ) ) {
				$missing_keys[] = $key;
			}
		}

		if ( ! empty( $missing_keys ) ) {
			throw new \InvalidArgumentException(
				'Configuration is missing required keys: ' . implode( ', ', $missing_keys )
			);
		}

		// Validate connect_mode value
		if ( ! in_array( $config['connect_mode'], [ 'site', 'user' ], true ) ) {
			throw new \InvalidArgumentException(
				'Configuration key "connect_mode" must be either "site" or "user", got: ' . $config['connect_mode']
			);
		}
	}

	/**
	 * Get a Facade instance by plugin_slug
	 *
	 * @param string $plugin_slug The plugin slug
	 * @return Facade|null The facade instance or null if not found
	 */
	public static function get( string $plugin_slug ): ?Facade {
		$instance = self::$instances[ $plugin_slug ] ?? null;
		return apply_filters( 'elementor_one/get_connect_instance', $instance, $plugin_slug, self::$instances );
	}

	/**
	 * Get a Facade instance by plugin_slug or throw exception if not found
	 *
	 * @param string $plugin_slug The plugin slug
	 * @return Facade The facade instance
	 * @throws \RuntimeException If instance not found
	 */
	public static function get_or_fail( string $plugin_slug ): Facade {
		if ( ! isset( self::$instances[ $plugin_slug ] ) ) {
			throw new \RuntimeException(
				"Facade instance '{$plugin_slug}' not found. Did you forget to call Facade::make() first?"
			);
		}

		return self::get( $plugin_slug );
	}

	/**
	 * Check if a Facade instance exists for the given plugin_slug
	 *
	 * @param string $plugin_slug The plugin slug
	 * @return bool
	 */
	public static function has( string $plugin_slug ): bool {
		return isset( self::$instances[ $plugin_slug ] );
	}

	/**
	 * Get all registered app names
	 *
	 * @return array<string>
	 */
	public static function registered(): array {
		return array_keys( self::$instances );
	}

	/**
	 * Remove a Facade instance from the registry
	 *
	 * @param string $plugin_slug The plugin slug
	 * @return bool True if removed, false if not found
	 */
	public static function forget( string $plugin_slug ): bool {
		if ( isset( self::$instances[ $plugin_slug ] ) ) {
			unset( self::$instances[ $plugin_slug ] );
			return true;
		}

		return false;
	}

	/**
	 * Create Data, Utils, Service, and Logger instances
	 *
	 * @return void
	 */
	private function create_services(): void {
		// Create Data instance
		$this->data = new Data( $this );

		// Create Utils instance
		$this->utils = new Utils( $this );

		// Create Service instance
		$this->service = new Service( $this );

		// Create Logger instance with app name
		$this->logger = new Logger( $this->config['app_name'] );
	}

	/**
	 * Initialize routes and handlers
	 * Called automatically by constructor
	 *
	 * @return void
	 */
	private function init(): void {
		$this->init_routes();
		$this->init_handler();
	}

	/**
	 * Get Data instance
	 *
	 * @return Data
	 */
	public function data(): Data {
		return $this->data;
	}

	/**
	 * Get Utils instance
	 *
	 * @return Utils
	 */
	public function utils(): Utils {
		return $this->utils;
	}

	/**
	 * Get Service instance
	 *
	 * @return Service
	 */
	public function service(): Service {
		return $this->service;
	}

	/**
	 * Get Logger instance
	 *
	 * @return Logger
	 */
	public function logger(): Logger {
		return $this->logger;
	}

	/**
	 * Get configuration
	 * @param string|null $key
	 * @return array|string
	 */
	public function get_config( ?string $key = null ) {
		if ( $key ) {
			return $this->config[ $key ];
		}
		return $this->config;
	}

	/**
	 * Get the app name for this instance
	 *
	 * @return string
	 */
	public function get_app_name(): string {
		return $this->config['app_name'];
	}

	/**
	 * Initialize REST API routes
	 *
	 * @return void
	 */
	private function init_routes(): void {
		new \ElementorOne\Connect\Controllers\Authorization( $this );
	}

	/**
	 * Initialize auth handler
	 *
	 * @return void
	 */
	private function init_handler(): void {
		new \ElementorOne\Connect\Components\Handler( $this );
	}
}
