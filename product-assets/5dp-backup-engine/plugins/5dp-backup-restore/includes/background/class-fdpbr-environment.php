<?php
/**
 * Server environment detection and capability profiling.
 *
 * Detects available PHP extensions, executable binaries, memory limits,
 * and execution time constraints to determine optimal processing strategies.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/background
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Environment
 *
 * @since 1.0.0
 */
class FiveDPBR_Environment {

	/**
	 * Cached capabilities array.
	 *
	 * @var array|null
	 */
	private static $capabilities = null;

	/**
	 * Get all server capabilities at once.
	 *
	 * @return array
	 */
	public static function get_capabilities() {
		if ( null !== self::$capabilities ) {
			return self::$capabilities;
		}

		self::$capabilities = array(
			'php_version'         => PHP_VERSION,
			'memory_limit'        => self::get_memory_limit(),
			'memory_available'    => self::get_available_memory(),
			'max_execution_time'  => self::get_max_execution_time(),
			'safe_execution_time' => self::get_safe_execution_time(),
			'upload_max_size'     => self::get_upload_max_size(),
			'post_max_size'       => self::get_post_max_size(),
			'zip_archive'         => self::has_zip_archive(),
			'pcl_zip'             => true, // Bundled with WordPress.
			'exec_available'      => self::has_exec(),
			'exec_zip'            => self::has_exec_binary( 'zip' ),
			'exec_unzip'          => self::has_exec_binary( 'unzip' ),
			'exec_tar'            => self::has_exec_binary( 'tar' ),
			'exec_mysqldump'      => self::has_exec_binary( 'mysqldump' ),
			'exec_mysql'          => self::has_exec_binary( 'mysql' ),
			'pdo_mysql'           => extension_loaded( 'pdo_mysql' ),
			'mysqli'              => extension_loaded( 'mysqli' ),
			'curl'                => extension_loaded( 'curl' ),
			'openssl'             => extension_loaded( 'openssl' ),
			'ftp'                 => extension_loaded( 'ftp' ),
			'ssh2'                => extension_loaded( 'ssh2' ),
			'json'                => extension_loaded( 'json' ),
			'mbstring'            => extension_loaded( 'mbstring' ),
			'web_server'          => self::detect_web_server(),
			'os'                  => PHP_OS,
			'is_windows'          => self::is_windows(),
			'wp_cron_working'     => self::is_wp_cron_working(),
			'action_scheduler'    => self::has_action_scheduler(),
			'temp_dir'            => self::get_temp_dir(),
			'backup_dir'          => self::get_backup_dir(),
		);

		return self::$capabilities;
	}

	/**
	 * Get a single capability value.
	 *
	 * @param string $key Capability key.
	 * @return mixed|null
	 */
	public static function get( $key ) {
		$caps = self::get_capabilities();
		return isset( $caps[ $key ] ) ? $caps[ $key ] : null;
	}

	/**
	 * Reset cached capabilities (useful after settings change).
	 */
	public static function reset() {
		self::$capabilities = null;
	}

	// =========================================================================
	// Memory
	// =========================================================================

	/**
	 * Get PHP memory limit in bytes.
	 *
	 * @return int
	 */
	public static function get_memory_limit() {
		$limit = ini_get( 'memory_limit' );
		return self::convert_to_bytes( $limit );
	}

	/**
	 * Get available memory (70% of limit minus current usage).
	 *
	 * @return int Bytes available.
	 */
	public static function get_available_memory() {
		$limit = self::get_memory_limit();

		// -1 means unlimited.
		if ( $limit < 0 ) {
			return PHP_INT_MAX;
		}

		$used      = memory_get_usage( true );
		$available = (int) ( $limit * 0.7 ) - $used;

		return max( $available, 1048576 ); // At least 1MB.
	}

	// =========================================================================
	// Execution Time
	// =========================================================================

	/**
	 * Get max execution time in seconds.
	 *
	 * @return int 0 means unlimited.
	 */
	public static function get_max_execution_time() {
		$time = (int) ini_get( 'max_execution_time' );
		return $time > 0 ? $time : 0;
	}

	/**
	 * Get safe execution time (80% of max, capped at 25s).
	 *
	 * @return int Seconds.
	 */
	public static function get_safe_execution_time() {
		$max = self::get_max_execution_time();

		if ( 0 === $max ) {
			return 25; // Unlimited — use 25s as safe default.
		}

		return min( (int) ( $max * 0.8 ), 25 );
	}

	// =========================================================================
	// Upload Sizes
	// =========================================================================

	/**
	 * Get upload_max_filesize in bytes.
	 *
	 * @return int
	 */
	public static function get_upload_max_size() {
		return self::convert_to_bytes( ini_get( 'upload_max_filesize' ) );
	}

	/**
	 * Get post_max_size in bytes.
	 *
	 * @return int
	 */
	public static function get_post_max_size() {
		return self::convert_to_bytes( ini_get( 'post_max_size' ) );
	}

	// =========================================================================
	// Archive Capabilities
	// =========================================================================

	/**
	 * Check if ZipArchive is available.
	 *
	 * @return bool
	 */
	public static function has_zip_archive() {
		return class_exists( 'ZipArchive' );
	}

	/**
	 * Get the best available archive method.
	 *
	 * @return string 'zip_archive'|'pcl_zip'|'exec_zip'|'exec_tar'
	 */
	public static function get_archive_method() {
		if ( self::has_zip_archive() ) {
			return 'zip_archive';
		}

		if ( self::has_exec_binary( 'zip' ) ) {
			return 'exec_zip';
		}

		// PclZip is always available in WordPress.
		return 'pcl_zip';
	}

	/**
	 * Get the best available extraction method.
	 *
	 * @return string 'zip_archive'|'pcl_zip'|'exec_unzip'|'exec_tar'
	 */
	public static function get_extraction_method() {
		if ( self::has_zip_archive() ) {
			return 'zip_archive';
		}

		if ( self::has_exec_binary( 'unzip' ) ) {
			return 'exec_unzip';
		}

		return 'pcl_zip';
	}

	// =========================================================================
	// Database Capabilities
	// =========================================================================

	/**
	 * Get the best available database export method.
	 *
	 * @return string 'exec_mysqldump'|'pdo'|'mysqli'
	 */
	public static function get_db_export_method() {
		if ( self::has_exec_binary( 'mysqldump' ) ) {
			return 'exec_mysqldump';
		}

		if ( extension_loaded( 'pdo_mysql' ) ) {
			return 'pdo';
		}

		return 'mysqli';
	}

	/**
	 * Get the best available database import method.
	 *
	 * @return string 'exec_mysql'|'pdo'|'mysqli'
	 */
	public static function get_db_import_method() {
		if ( self::has_exec_binary( 'mysql' ) ) {
			return 'exec_mysql';
		}

		if ( extension_loaded( 'pdo_mysql' ) ) {
			return 'pdo';
		}

		return 'mysqli';
	}

	// =========================================================================
	// Adaptive Chunk Sizing
	// =========================================================================

	/**
	 * Calculate optimal database batch size.
	 *
	 * @return int Number of rows per batch.
	 */
	public static function get_db_batch_size() {
		$settings = get_option( 'fdpbr_settings', array() );

		if ( ! empty( $settings['db_batch_size'] ) ) {
			return (int) $settings['db_batch_size'];
		}

		$memory = self::get_available_memory();

		// Assume ~10KB per row average.
		$batch = (int) ( $memory / 10240 );

		return max( 1000, min( $batch, 10000 ) );
	}

	/**
	 * Calculate optimal file chunk size in bytes.
	 *
	 * @return int Bytes per archive chunk.
	 */
	public static function get_file_chunk_size() {
		$settings = get_option( 'fdpbr_settings', array() );

		if ( ! empty( $settings['chunk_size'] ) ) {
			return (int) $settings['chunk_size'] * 1048576; // MB to bytes.
		}

		$memory = self::get_available_memory();
		$chunk  = (int) ( $memory / 3 );

		// Clamp between 10MB and 100MB.
		return max( 10485760, min( $chunk, 104857600 ) );
	}

	// =========================================================================
	// Exec & Binary Detection
	// =========================================================================

	/**
	 * Check if exec() is available.
	 *
	 * @return bool
	 */
	public static function has_exec() {
		if ( ! function_exists( 'exec' ) ) {
			return false;
		}

		$disabled = array_map( 'trim', explode( ',', (string) ini_get( 'disable_functions' ) ) );
		return ! in_array( 'exec', $disabled, true );
	}

	/**
	 * Check if a specific binary is available via exec.
	 *
	 * @param string $binary Binary name (e.g. 'zip', 'mysqldump').
	 * @return bool
	 */
	public static function has_exec_binary( $binary ) {
		if ( ! self::has_exec() ) {
			return false;
		}

		$check = self::is_windows() ? 'where' : 'which';

		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.system_calls_exec
		@exec( $check . ' ' . escapeshellarg( $binary ) . ' 2>&1', $output, $code );

		return 0 === $code;
	}

	// =========================================================================
	// Server Detection
	// =========================================================================

	/**
	 * Detect the web server software.
	 *
	 * @return string 'apache'|'nginx'|'litespeed'|'iis'|'unknown'
	 */
	public static function detect_web_server() {
		$server = isset( $_SERVER['SERVER_SOFTWARE'] ) ? sanitize_text_field( wp_unslash( $_SERVER['SERVER_SOFTWARE'] ) ) : '';

		if ( stripos( $server, 'litespeed' ) !== false ) {
			return 'litespeed';
		}

		if ( stripos( $server, 'apache' ) !== false ) {
			return 'apache';
		}

		if ( stripos( $server, 'nginx' ) !== false ) {
			return 'nginx';
		}

		if ( stripos( $server, 'iis' ) !== false || stripos( $server, 'microsoft' ) !== false ) {
			return 'iis';
		}

		return 'unknown';
	}

	/**
	 * Check if running on Windows.
	 *
	 * @return bool
	 */
	public static function is_windows() {
		return 'WIN' === strtoupper( substr( PHP_OS, 0, 3 ) );
	}

	// =========================================================================
	// Background Processing Detection
	// =========================================================================

	/**
	 * Check if WP Cron appears to be working.
	 *
	 * @return bool
	 */
	public static function is_wp_cron_working() {
		if ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) {
			return false;
		}

		// Check if alternate cron is forced (may indicate issues).
		if ( defined( 'ALTERNATE_WP_CRON' ) && ALTERNATE_WP_CRON ) {
			return true; // Alternate cron is a workaround but still works.
		}

		return true;
	}

	/**
	 * Check if Action Scheduler is available.
	 *
	 * @return bool
	 */
	public static function has_action_scheduler() {
		return function_exists( 'as_schedule_single_action' );
	}

	/**
	 * Get the best available background processing method.
	 *
	 * @return string 'action_scheduler'|'wp_cron'|'ajax'
	 */
	public static function get_background_method() {
		$settings = get_option( 'fdpbr_settings', array() );

		// User override.
		if ( ! empty( $settings['background_method'] ) && 'auto' !== $settings['background_method'] ) {
			return $settings['background_method'];
		}

		if ( self::has_action_scheduler() ) {
			return 'action_scheduler';
		}

		if ( self::is_wp_cron_working() ) {
			return 'wp_cron';
		}

		return 'ajax';
	}

	// =========================================================================
	// Directories
	// =========================================================================

	/**
	 * Get the system temp directory.
	 *
	 * @return string
	 */
	public static function get_temp_dir() {
		return get_temp_dir();
	}

	/**
	 * Get the plugin's backup directory path.
	 *
	 * @return string
	 */
	public static function get_backup_dir() {
		return WP_CONTENT_DIR . '/5dp-backups';
	}

	// =========================================================================
	// System Status (for dashboard display)
	// =========================================================================

	/**
	 * Get system status items for the dashboard.
	 *
	 * @return array Array of status items with label, value, and status (good/bad/warning).
	 */
	public static function get_system_status() {
		$caps = self::get_capabilities();

		$items = array();

		// PHP Version.
		$items[] = array(
			'label'  => __( 'PHP Version', '5dp-backup-restore' ),
			'value'  => $caps['php_version'],
			'status' => version_compare( $caps['php_version'], '7.4', '>=' ) ? 'good' : 'bad',
		);

		// Memory Limit.
		$memory_mb = round( $caps['memory_limit'] / 1048576 );
		$items[]   = array(
			'label'  => __( 'Memory Limit', '5dp-backup-restore' ),
			'value'  => $memory_mb . 'MB',
			'status' => $memory_mb >= 128 ? 'good' : ( $memory_mb >= 64 ? 'warning' : 'bad' ),
		);

		// Max Execution Time.
		$items[] = array(
			'label'  => __( 'Max Execution Time', '5dp-backup-restore' ),
			'value'  => $caps['max_execution_time'] ? $caps['max_execution_time'] . 's' : __( 'Unlimited', '5dp-backup-restore' ),
			'status' => 0 === $caps['max_execution_time'] || $caps['max_execution_time'] >= 30 ? 'good' : 'warning',
		);

		// Archive method.
		$items[] = array(
			'label'  => __( 'ZipArchive', '5dp-backup-restore' ),
			'value'  => $caps['zip_archive'] ? __( 'Available', '5dp-backup-restore' ) : __( 'Not Available', '5dp-backup-restore' ),
			'status' => $caps['zip_archive'] ? 'good' : 'warning',
		);

		// cURL.
		$items[] = array(
			'label'  => __( 'cURL', '5dp-backup-restore' ),
			'value'  => $caps['curl'] ? __( 'Available', '5dp-backup-restore' ) : __( 'Not Available', '5dp-backup-restore' ),
			'status' => $caps['curl'] ? 'good' : 'bad',
		);

		// OpenSSL.
		$items[] = array(
			'label'  => __( 'OpenSSL', '5dp-backup-restore' ),
			'value'  => $caps['openssl'] ? __( 'Available', '5dp-backup-restore' ) : __( 'Not Available', '5dp-backup-restore' ),
			'status' => $caps['openssl'] ? 'good' : 'warning',
		);

		// exec().
		$items[] = array(
			'label'  => __( 'exec()', '5dp-backup-restore' ),
			'value'  => $caps['exec_available'] ? __( 'Available', '5dp-backup-restore' ) : __( 'Disabled', '5dp-backup-restore' ),
			'status' => $caps['exec_available'] ? 'good' : 'warning',
		);

		// Web Server.
		$items[] = array(
			'label'  => __( 'Web Server', '5dp-backup-restore' ),
			'value'  => ucfirst( $caps['web_server'] ),
			'status' => 'good',
		);

		// Background method.
		$method  = self::get_background_method();
		$items[] = array(
			'label'  => __( 'Background Processing', '5dp-backup-restore' ),
			'value'  => ucwords( str_replace( '_', ' ', $method ) ),
			'status' => 'action_scheduler' === $method ? 'good' : ( 'wp_cron' === $method ? 'good' : 'warning' ),
		);

		return $items;
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	/**
	 * Convert PHP ini shorthand to bytes.
	 *
	 * @param string $value Value like '128M', '1G', '512K'.
	 * @return int
	 */
	private static function convert_to_bytes( $value ) {
		$value = trim( $value );

		if ( is_numeric( $value ) ) {
			return (int) $value;
		}

		$last = strtolower( substr( $value, -1 ) );
		$num  = (int) substr( $value, 0, -1 );

		switch ( $last ) {
			case 'g':
				$num *= 1073741824;
				break;
			case 'm':
				$num *= 1048576;
				break;
			case 'k':
				$num *= 1024;
				break;
		}

		return $num;
	}
}
