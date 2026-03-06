<?php
/**
 * Chunked database importer.
 *
 * Imports SQL files in chunks, executing statements within
 * time and memory constraints.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/restore
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_DB_Importer
 *
 * @since 1.0.0
 */
class FiveDPBR_DB_Importer {

	/**
	 * Initialize import state.
	 *
	 * @param string $sql_file   Path to the SQL file.
	 * @param string $new_prefix Optional new table prefix for migration.
	 * @return array Initial state.
	 */
	public static function init_import_state( $sql_file, $new_prefix = '', $old_prefix = '' ) {
		if ( ! file_exists( $sql_file ) ) {
			return new WP_Error( 'file_missing', __( 'SQL file not found.', '5dp-backup-restore' ) );
		}

		return array(
			'sql_file'       => $sql_file,
			'file_size'      => filesize( $sql_file ),
			'byte_offset'    => 0,
			'new_prefix'     => $new_prefix,
			'old_prefix'     => $old_prefix,
			'statements_run' => 0,
			'errors'         => array(),
		);
	}

	/**
	 * Import one chunk of SQL statements.
	 *
	 * @param array $state Current state.
	 * @return array|true Updated state or true if complete.
	 */
	public static function import_chunk( &$state ) {
		$sql_file    = $state['sql_file'];
		$byte_offset = $state['byte_offset'];
		$file_size   = $state['file_size'];

		if ( $byte_offset >= $file_size ) {
			return true;
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$handle = fopen( $sql_file, 'r' );

		if ( ! $handle ) {
			return new WP_Error( 'file_open', __( 'Cannot open SQL file.', '5dp-backup-restore' ) );
		}

		fseek( $handle, $byte_offset );

		global $wpdb;

		$batch_size    = FiveDPBR_Environment::get_db_batch_size();
		$statement     = '';
		$count         = 0;
		$in_string     = false;
		$string_char   = '';
		$start_time    = microtime( true );
		$time_limit    = FiveDPBR_Environment::get_safe_execution_time();

		while ( ! feof( $handle ) && $count < $batch_size ) {
			// Check time limit.
			if ( ( microtime( true ) - $start_time ) >= $time_limit ) {
				break;
			}

			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fgets
			$line = fgets( $handle );

			if ( false === $line ) {
				break;
			}

			// Skip comments and empty lines.
			$trimmed = ltrim( $line );
			if ( empty( $trimmed ) || strpos( $trimmed, '--' ) === 0 || strpos( $trimmed, '#' ) === 0 ) {
				continue;
			}

			// Skip MySQL directives (keep for compatibility but don't count).
			if ( strpos( $trimmed, '/*!' ) === 0 ) {
				// Execute these as-is.
				$directive = rtrim( $line );
				if ( substr( $directive, -1 ) === ';' ) {
					self::execute_statement( $directive, $state );
				}
				continue;
			}

			$statement .= $line;

			// Check if statement is complete (ends with ;).
			if ( preg_match( '/;\s*$/', $statement ) ) {
				$statement = trim( $statement );

				// Apply prefix replacement if needed.
				if ( ! empty( $state['new_prefix'] ) ) {
					$old = isset( $state['old_prefix'] ) ? $state['old_prefix'] : '';
					$statement = self::replace_prefix( $statement, $state['new_prefix'], $old );
				}

				self::execute_statement( $statement, $state );
				$statement = '';
				++$count;
			}
		}

		$state['byte_offset'] = ftell( $handle );

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $handle );

		if ( $state['byte_offset'] >= $file_size ) {
			return true;
		}

		return $state;
	}

	/**
	 * Execute a single SQL statement.
	 *
	 * @param string $sql   The SQL statement.
	 * @param array  $state State reference for error tracking.
	 */
	private static function execute_statement( $sql, &$state ) {
		global $wpdb;

		// Remove trailing semicolons for $wpdb->query.
		$sql = rtrim( $sql, "; \t\n\r" );

		if ( empty( $sql ) ) {
			return;
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.NotPrepared
		$result = $wpdb->query( $sql );

		if ( false === $result ) {
			$state['errors'][] = array(
				'sql'   => substr( $sql, 0, 200 ),
				'error' => $wpdb->last_error,
			);
		}

		++$state['statements_run'];
	}

	/**
	 * Replace table prefix in a SQL statement.
	 *
	 * @param string $sql        The SQL statement.
	 * @param string $new_prefix New table prefix.
	 * @return string
	 */
	private static function replace_prefix( $sql, $new_prefix, $old_prefix = '' ) {
		if ( empty( $old_prefix ) ) {
			global $wpdb;
			$old_prefix = $wpdb->prefix;
		}

		// Replace in common SQL patterns.
		$patterns = array(
			'/(`' . preg_quote( $old_prefix, '/' ) . ')/',
			'/(TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?`?)(' . preg_quote( $old_prefix, '/' ) . ')/',
			'/(INTO\s+`?)(' . preg_quote( $old_prefix, '/' ) . ')/',
		);

		$replacements = array(
			'`' . $new_prefix,
			'$1' . $new_prefix,
			'$1' . $new_prefix,
		);

		return preg_replace( $patterns, $replacements, $sql );
	}

	/**
	 * Import an entire SQL file at once (for small files or exec method).
	 *
	 * @param string $sql_file   Path to SQL file.
	 * @param string $new_prefix Optional new prefix.
	 * @return true|WP_Error
	 */
	public static function import_full( $sql_file, $new_prefix = '' ) {
		$method = FiveDPBR_Environment::get_db_import_method();

		if ( 'exec_mysql' === $method ) {
			return self::import_exec_mysql( $sql_file );
		}

		// Chunked import.
		$state = self::init_import_state( $sql_file, $new_prefix );

		if ( is_wp_error( $state ) ) {
			return $state;
		}

		while ( true ) {
			$result = self::import_chunk( $state );

			if ( is_wp_error( $result ) ) {
				return $result;
			}

			if ( true === $result ) {
				break;
			}

			$state = $result;
		}

		if ( ! empty( $state['errors'] ) ) {
			FiveDPBR_Logger::warning( 'restore', sprintf( '%d SQL errors during import.', count( $state['errors'] ) ), $state['errors'] );
		}

		return true;
	}

	/**
	 * Import via exec(mysql).
	 *
	 * @param string $sql_file SQL file path.
	 * @return true|WP_Error
	 */
	private static function import_exec_mysql( $sql_file ) {
		$creds = FiveDPBR_Helper::get_db_credentials();

		$host = $creds['host'];
		$port = '';
		if ( strpos( $host, ':' ) !== false ) {
			list( $host, $port ) = explode( ':', $host, 2 );
		}

		$cmd = sprintf(
			'mysql -h %s -u %s',
			escapeshellarg( $host ),
			escapeshellarg( $creds['user'] )
		);

		if ( $port ) {
			$cmd .= ' -P ' . escapeshellarg( $port );
		}

		if ( ! empty( $creds['password'] ) ) {
			$cmd .= ' -p' . escapeshellarg( $creds['password'] );
		}

		$cmd .= ' ' . escapeshellarg( $creds['name'] );
		$cmd .= ' < ' . escapeshellarg( $sql_file ) . ' 2>&1';

		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.system_calls_exec
		@exec( $cmd, $output, $code );

		if ( 0 !== $code ) {
			return new WP_Error( 'mysql_import_failed', implode( "\n", $output ) );
		}

		return true;
	}
}
