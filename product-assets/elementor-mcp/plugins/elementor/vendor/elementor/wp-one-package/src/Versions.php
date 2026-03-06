<?php

namespace ElementorOne;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Class \ElementorOne\Versions
 */
class Versions {
	/**
	 * \ElementorOne\Versions instance.
	 *
	 * @var Versions
	 */
	private static $instance = null;

	/**
	 * Versions.
	 *
	 * @var array<string, callable>
	 */
	private $versions = [];

	/**
	 * Registered sources.
	 *
	 * @var array<string, string>
	 */
	private $sources = [];

	/**
	 * The determined highest version source directory.
	 *
	 * @var string|null
	 */
	private static $active_source_dir = null;

	/**
	 * Register version's callback.
	 *
	 * @param string   $version_string           Elementor One version.
	 * @param callable $initialization_callback Callback to initialize the version.
	 */
	public function register( $version_string, $initialization_callback ) {
		if ( isset( $this->versions[ $version_string ] ) ) {
			return false;
		}

		// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_debug_backtrace
		$backtrace = debug_backtrace( DEBUG_BACKTRACE_IGNORE_ARGS );
		$source    = $backtrace[0]['file'];

		$this->versions[ $version_string ] = $initialization_callback;
		$this->sources[ $source ]          = $version_string;
		return true;
	}

	/**
	 * Get all versions.
	 */
	public function get_versions() {
		return $this->versions;
	}

	/**
	 * Get registered sources.
	 *
	 * @return array<string, string>
	 */
	public function get_sources() {
		return $this->sources;
	}

	/**
	 * Get latest version registered.
	 */
	public function latest_version() {
		$keys = array_keys( $this->versions );
		if ( empty( $keys ) ) {
			return false;
		}
		uasort( $keys, 'version_compare' );
		return end( $keys );
	}

	/**
	 * Get callback for latest registered version.
	 */
	public function latest_version_callback() {
		$latest = $this->latest_version();

		if ( empty( $latest ) || ! isset( $this->versions[ $latest ] ) ) {
			return '__return_null';
		}

		return $this->versions[ $latest ];
	}

	/**
	 * Custom autoloader that loads classes from the highest version source.
	 *
	 * @param string $class_name Fully qualified class name
	 */
	public static function autoloader( $class_name ) {
		// Only handle ElementorOne namespace classes
		if ( strpos( $class_name, 'ElementorOne\\' ) !== 0 ) {
			return;
		}

		// Don't handle Versions class itself (already loaded)
		if ( 'ElementorOne\Versions' === $class_name ) {
			return;
		}

		// Wait until we have determined the active source directory
		if ( empty( self::$active_source_dir ) ) {
			return;
		}

		// Convert class name to file path
		$relative_class = str_replace( 'ElementorOne\\', '', $class_name );
		$file_path = str_replace( '\\', '/', $relative_class ) . '.php';
		$full_path = self::$active_source_dir . '/src/' . $file_path;

		// Load the file if it exists
		if ( file_exists( $full_path ) ) {
			require_once $full_path;
		}
	}

	/**
	 * Get instance.
	 *
	 * @return \ElementorOne\Versions
	 * @codeCoverageIgnore
	 */
	public static function instance() {
		if ( empty( self::$instance ) ) {
			self::$instance = new self();
			// Register our custom autoloader with high priority (prepend=true)
			spl_autoload_register( [ __CLASS__, 'autoloader' ], true, true );
		}
		return self::$instance;
	}

	/**
	 * Initialize.
	 *
	 * @codeCoverageIgnore
	 */
	public static function initialize_latest_version() {
		$self = self::instance();

		// Determine the highest version source directory from the callback function
		// The callback will be defined in the runner.php of the highest version
		$callback = $self->latest_version_callback();

		// Get the source directory by inspecting where the callback function is defined
		if ( is_string( $callback ) && function_exists( $callback ) ) {
			$reflection = new \ReflectionFunction( $callback );
			$callback_file = $reflection->getFileName();
			// The callback is defined in runner.php, so parent dir is the package dir
			self::$active_source_dir = dirname( $callback_file );
		}

		// Call the initialization callback
		call_user_func( $callback );
	}
}
