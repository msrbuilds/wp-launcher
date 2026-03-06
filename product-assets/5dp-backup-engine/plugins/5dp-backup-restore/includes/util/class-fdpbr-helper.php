<?php
/**
 * Miscellaneous helper functions.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/util
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Helper
 *
 * @since 1.0.0
 */
class FiveDPBR_Helper {

	/**
	 * Format bytes to human-readable string.
	 *
	 * @param int $bytes    Byte count.
	 * @param int $decimals Decimal places.
	 * @return string
	 */
	public static function format_bytes( $bytes, $decimals = 2 ) {
		if ( $bytes <= 0 ) {
			return '0 B';
		}

		$units = array( 'B', 'KB', 'MB', 'GB', 'TB' );
		$i     = (int) floor( log( $bytes, 1024 ) );

		return round( $bytes / pow( 1024, $i ), $decimals ) . ' ' . $units[ $i ];
	}

	/**
	 * Generate a random alphanumeric string.
	 *
	 * @param int $length String length.
	 * @return string
	 */
	public static function random_string( $length = 16 ) {
		return bin2hex( random_bytes( (int) ceil( $length / 2 ) ) );
	}

	/**
	 * Get a human-readable time-ago string.
	 *
	 * @param string $datetime MySQL datetime string (UTC).
	 * @return string
	 */
	public static function time_ago( $datetime ) {
		$timestamp = strtotime( $datetime );

		if ( ! $timestamp ) {
			return __( 'Unknown', '5dp-backup-restore' );
		}

		return sprintf(
			/* translators: %s: Human-readable time difference */
			__( '%s ago', '5dp-backup-restore' ),
			human_time_diff( $timestamp, time() )
		);
	}

	/**
	 * Ensure a directory exists and is protected.
	 *
	 * Creates the directory with .htaccess deny and empty index.php.
	 *
	 * @param string $dir Directory path.
	 * @return bool True if directory is ready.
	 */
	public static function ensure_directory( $dir ) {
		if ( ! wp_mkdir_p( $dir ) ) {
			return false;
		}

		// .htaccess deny all.
		$htaccess = $dir . '/.htaccess';
		if ( ! file_exists( $htaccess ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			file_put_contents( $htaccess, "deny from all\n" );
		}

		// Empty index.php.
		$index = $dir . '/index.php';
		if ( ! file_exists( $index ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			file_put_contents( $index, "<?php\n// Silence is golden.\n" );
		}

		return true;
	}

	/**
	 * Get all WordPress tables for the current site.
	 *
	 * @return array Table names.
	 */
	public static function get_wp_tables() {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables = $wpdb->get_col(
			$wpdb->prepare(
				'SHOW TABLES LIKE %s',
				$wpdb->esc_like( $wpdb->prefix ) . '%'
			)
		);

		return $tables ? $tables : array();
	}

	/**
	 * Get the total size of the WordPress installation directory.
	 *
	 * Uses a fast approach: sums top-level directories.
	 *
	 * @return int Size in bytes.
	 */
	public static function get_wp_size() {
		$size = 0;

		$dirs = array(
			ABSPATH . 'wp-content/uploads',
			ABSPATH . 'wp-content/plugins',
			ABSPATH . 'wp-content/themes',
		);

		foreach ( $dirs as $dir ) {
			if ( is_dir( $dir ) ) {
				$size += self::get_directory_size( $dir );
			}
		}

		return $size;
	}

	/**
	 * Get directory size recursively.
	 *
	 * @param string $dir  Directory path.
	 * @param int    $max  Maximum files to count before estimating (default 10000).
	 * @return int Size in bytes.
	 */
	public static function get_directory_size( $dir, $max = 10000 ) {
		$size  = 0;
		$count = 0;

		$iterator = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator( $dir, RecursiveDirectoryIterator::SKIP_DOTS ),
			RecursiveIteratorIterator::SELF_FIRST
		);

		foreach ( $iterator as $file ) {
			if ( $file->isFile() ) {
				$size += $file->getSize();
				++$count;

				if ( $count >= $max ) {
					break; // Prevent timeout on huge directories.
				}
			}
		}

		return $size;
	}

	/**
	 * Check if a path is excluded by the exclusion rules.
	 *
	 * @param string $path          Relative path to check.
	 * @param array  $exclude_paths Array of exclude patterns.
	 * @return bool
	 */
	public static function is_path_excluded( $path, $exclude_paths ) {
		$path = wp_normalize_path( $path );

		foreach ( $exclude_paths as $pattern ) {
			$pattern = trim( $pattern );

			if ( empty( $pattern ) ) {
				continue;
			}

			// Exact match.
			if ( $path === $pattern ) {
				return true;
			}

			// Wildcard match.
			if ( fnmatch( $pattern, $path ) ) {
				return true;
			}

			// Directory prefix match.
			if ( substr( $pattern, -1 ) === '/' && strpos( $path, $pattern ) === 0 ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Validate a URL.
	 *
	 * @param string $url URL to validate.
	 * @return bool
	 */
	public static function is_valid_url( $url ) {
		return (bool) filter_var( $url, FILTER_VALIDATE_URL );
	}

	/**
	 * Get WordPress database credentials.
	 *
	 * @return array With keys: host, name, user, password, charset, prefix.
	 */
	public static function get_db_credentials() {
		global $wpdb;

		return array(
			'host'     => DB_HOST,
			'name'     => DB_NAME,
			'user'     => DB_USER,
			'password' => DB_PASSWORD,
			'charset'  => DB_CHARSET,
			'prefix'   => $wpdb->prefix,
		);
	}
}
