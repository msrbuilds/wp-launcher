<?php

namespace ElementorOne;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Class Logger
 */
class Logger {

	public const LEVEL_ERROR = 'error';
	public const LEVEL_WARN = 'warn';
	public const LEVEL_INFO = 'info';

	/**
	 * @var string Prefix for log messages (e.g., app name)
	 */
	private string $prefix;

	/**
	 * Constructor
	 *
	 * @param string $prefix Prefix for log messages (e.g., 'Elementor One', 'Elementor AI')
	 */
	public function __construct( string $prefix ) {
		$this->prefix = $prefix;
	}

	/**
	 * Log a message
	 *
	 * @param string $log_level Log level
	 * @param mixed $message Message to log
	 * @return void
	 */
	private function log( string $log_level, $message ): void {
		$backtrace = debug_backtrace(); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_debug_backtrace

		$class    = $backtrace[2]['class'] ?? null;
		$type     = $backtrace[2]['type'] ?? null;
		$function = $backtrace[2]['function'];

		if ( $class ) {
			$message = '[' . $this->prefix . ']: ' . $log_level . ' in ' . "$class$type$function()" . ': ' . $message;
		} else {
			$message = '[' . $this->prefix . ']: ' . $log_level . ' in ' . "$function()" . ': ' . $message;
		}

		error_log( $message ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
	}

	/**
	 * Log an error message
	 *
	 * @param mixed $message Message to log
	 * @return void
	 */
	public function error( $message ): void {
		$this->log( self::LEVEL_ERROR, $message );
	}

	/**
	 * Log an info message
	 *
	 * @param mixed $message Message to log
	 * @return void
	 */
	public function info( $message ): void {
		$this->log( self::LEVEL_INFO, $message );
	}
}
