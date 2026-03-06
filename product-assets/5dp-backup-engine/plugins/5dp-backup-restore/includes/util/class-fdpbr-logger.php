<?php
/**
 * Activity logger.
 *
 * Writes log entries to the fdpbr_logs database table.
 * Supports levels: debug, info, warning, error.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/util
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Logger
 *
 * @since 1.0.0
 */
class FiveDPBR_Logger {

	/**
	 * Log levels in order of severity.
	 *
	 * @var array
	 */
	const LEVELS = array( 'debug', 'info', 'warning', 'error' );

	/**
	 * Log a debug message.
	 *
	 * @param string $context Context (backup, restore, migration, staging, storage).
	 * @param string $message Message.
	 * @param array  $data    Optional data.
	 */
	public static function debug( $context, $message, $data = array() ) {
		self::log( 'debug', $context, $message, $data );
	}

	/**
	 * Log an info message.
	 *
	 * @param string $context Context.
	 * @param string $message Message.
	 * @param array  $data    Optional data.
	 */
	public static function info( $context, $message, $data = array() ) {
		self::log( 'info', $context, $message, $data );
	}

	/**
	 * Log a warning message.
	 *
	 * @param string $context Context.
	 * @param string $message Message.
	 * @param array  $data    Optional data.
	 */
	public static function warning( $context, $message, $data = array() ) {
		self::log( 'warning', $context, $message, $data );
	}

	/**
	 * Log an error message.
	 *
	 * @param string $context Context.
	 * @param string $message Message.
	 * @param array  $data    Optional data.
	 */
	public static function error( $context, $message, $data = array() ) {
		self::log( 'error', $context, $message, $data );
	}

	/**
	 * Write a log entry.
	 *
	 * @param string $level   Level.
	 * @param string $context Context.
	 * @param string $message Message.
	 * @param array  $data    Optional data.
	 */
	public static function log( $level, $context, $message, $data = array() ) {
		// Skip debug in production unless debug mode is on.
		if ( 'debug' === $level && ! self::is_debug() ) {
			return;
		}

		global $wpdb;

		$table = $wpdb->prefix . 'fdpbr_logs';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$wpdb->insert(
			$table,
			array(
				'level'      => $level,
				'context'    => $context,
				'message'    => $message,
				'data'       => ! empty( $data ) ? wp_json_encode( $data ) : null,
				'user_id'    => get_current_user_id(),
				'created_at' => current_time( 'mysql', true ),
			),
			array( '%s', '%s', '%s', '%s', '%d', '%s' )
		);
	}

	/**
	 * Get log entries with filtering.
	 *
	 * @param array $args Query arguments.
	 * @return array
	 */
	public static function get_logs( $args = array() ) {
		global $wpdb;

		$defaults = array(
			'level'    => '',
			'context'  => '',
			'per_page' => 50,
			'page'     => 1,
			'order'    => 'DESC',
		);

		$args  = wp_parse_args( $args, $defaults );
		$table = $wpdb->prefix . 'fdpbr_logs';
		$where = array( '1=1' );
		$values = array();

		if ( ! empty( $args['level'] ) ) {
			$where[]  = 'level = %s';
			$values[] = $args['level'];
		}

		if ( ! empty( $args['context'] ) ) {
			$where[]  = 'context = %s';
			$values[] = $args['context'];
		}

		$where_sql = implode( ' AND ', $where );
		$order     = 'ASC' === strtoupper( $args['order'] ) ? 'ASC' : 'DESC';
		$offset    = ( max( 1, (int) $args['page'] ) - 1 ) * (int) $args['per_page'];

		// Build query.
		$sql = "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY id {$order} LIMIT %d OFFSET %d";
		$values[] = (int) $args['per_page'];
		$values[] = $offset;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$results = $wpdb->get_results( $wpdb->prepare( $sql, $values ) );

		return $results ? $results : array();
	}

	/**
	 * Get total log count with optional filters.
	 *
	 * @param array $args Filter arguments (level, context).
	 * @return int
	 */
	public static function get_count( $args = array() ) {
		global $wpdb;

		$table  = $wpdb->prefix . 'fdpbr_logs';
		$where  = array( '1=1' );
		$values = array();

		if ( ! empty( $args['level'] ) ) {
			$where[]  = 'level = %s';
			$values[] = $args['level'];
		}

		if ( ! empty( $args['context'] ) ) {
			$where[]  = 'context = %s';
			$values[] = $args['context'];
		}

		$where_sql = implode( ' AND ', $where );

		if ( ! empty( $values ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$count = $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}", $values ) );
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$count = $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
		}

		return (int) $count;
	}

	/**
	 * Purge old log entries.
	 *
	 * @param int $days Keep entries newer than this many days. Default 30.
	 * @return int Number of deleted rows.
	 */
	public static function purge( $days = 30 ) {
		global $wpdb;

		$table    = $wpdb->prefix . 'fdpbr_logs';
		$cutoff   = gmdate( 'Y-m-d H:i:s', time() - ( $days * DAY_IN_SECONDS ) );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$deleted = $wpdb->query(
			$wpdb->prepare( "DELETE FROM {$table} WHERE created_at < %s", $cutoff )
		);

		return (int) $deleted;
	}

	/**
	 * Clear all logs.
	 *
	 * @return bool
	 */
	public static function clear_all() {
		global $wpdb;

		$table = $wpdb->prefix . 'fdpbr_logs';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange
		return false !== $wpdb->query( "TRUNCATE TABLE {$table}" );
	}

	/**
	 * Check if debug mode is enabled in settings.
	 *
	 * @return bool
	 */
	public static function is_debug() {
		static $debug = null;

		if ( null === $debug ) {
			$settings = get_option( 'fdpbr_settings', array() );
			$debug    = ! empty( $settings['advanced']['debug_mode'] );
		}

		return $debug;
	}

	/**
	 * Write a debug message to a file. Survives DB wipes (e.g. during restore).
	 *
	 * Only writes when debug mode is enabled in plugin settings.
	 * Log file: wp-content/5dp-backups/debug.log
	 *
	 * @param string $context Context (backup, restore, etc.).
	 * @param string $message Message.
	 */
	public static function file_debug( $context, $message ) {
		if ( ! self::is_debug() ) {
			return;
		}

		$file = FiveDPBR_Environment::get_backup_dir() . '/debug.log';
		$line = sprintf( "[%s] [%s] %s\n", gmdate( 'Y-m-d H:i:s' ), $context, $message );

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		@file_put_contents( $file, $line, FILE_APPEND ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
	}
}
