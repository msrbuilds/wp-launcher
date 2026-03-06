<?php
/**
 * Chunked database exporter.
 *
 * Exports WordPress database tables in chunks, writing SQL files that can
 * be imported to restore the database. Supports three methods:
 * 1. exec(mysqldump) — fastest
 * 2. PDO chunked queries
 * 3. mysqli chunked queries
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/backup
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_DB_Exporter
 *
 * @since 1.0.0
 */
class FiveDPBR_DB_Exporter {

	/**
	 * Export the database.
	 *
	 * @param string $output_file  Path to the output SQL file.
	 * @param array  $tables       Tables to export (empty = all).
	 * @param array  $exclude      Tables to exclude.
	 * @return true|WP_Error
	 */
	public static function export( $output_file, $tables = array(), $exclude = array() ) {
		$method = FiveDPBR_Environment::get_db_export_method();

		FiveDPBR_Logger::info( 'backup', sprintf( 'Starting database export via %s.', $method ) );

		if ( empty( $tables ) ) {
			$tables = FiveDPBR_Helper::get_wp_tables();
		}

		// Apply exclusions.
		if ( ! empty( $exclude ) ) {
			$tables = array_diff( $tables, $exclude );
		}

		if ( empty( $tables ) ) {
			return new WP_Error( 'no_tables', __( 'No tables to export.', '5dp-backup-restore' ) );
		}

		switch ( $method ) {
			case 'exec_mysqldump':
				$result = self::export_mysqldump( $output_file, $tables );
				break;

			case 'pdo':
				$result = self::export_pdo( $output_file, $tables );
				break;

			case 'mysqli':
			default:
				$result = self::export_mysqli( $output_file, $tables );
				break;
		}

		if ( is_wp_error( $result ) ) {
			// Try fallback.
			if ( 'exec_mysqldump' === $method ) {
				FiveDPBR_Logger::warning( 'backup', 'mysqldump failed, falling back to PHP export.' );
				$result = extension_loaded( 'pdo_mysql' )
					? self::export_pdo( $output_file, $tables )
					: self::export_mysqli( $output_file, $tables );
			}
		}

		return $result;
	}

	/**
	 * Export a single chunk of tables (for chunked background processing).
	 *
	 * @param array $state Current export state.
	 * @return array|true Updated state or true if complete.
	 */
	public static function export_chunk( &$state ) {
		$tables     = $state['tables'];
		$table_idx  = $state['table_index'];
		$row_offset = $state['row_offset'];
		$output     = $state['output_file'];
		$batch_size = FiveDPBR_Environment::get_db_batch_size();

		if ( $table_idx >= count( $tables ) ) {
			return true; // All tables exported.
		}

		$table = $tables[ $table_idx ];

		global $wpdb;

		// Open file for appending.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$handle = fopen( $output, 'a' );

		if ( ! $handle ) {
			return new WP_Error( 'file_open', sprintf( __( 'Cannot open %s for writing.', '5dp-backup-restore' ), $output ) );
		}

		// Write table header on first offset.
		if ( 0 === $row_offset ) {
			self::write_table_header( $handle, $table );
		}

		// Fetch rows.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM `{$table}` LIMIT %d OFFSET %d",
				$batch_size,
				$row_offset
			),
			ARRAY_A
		);

		if ( ! empty( $rows ) ) {
			self::write_insert_statements( $handle, $table, $rows );
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
		fclose( $handle );

		// Check if table is complete.
		if ( count( $rows ) < $batch_size ) {
			// Move to next table.
			$state['table_index'] = $table_idx + 1;
			$state['row_offset']  = 0;
			$state['tables_done'] = ( $state['tables_done'] ?? 0 ) + 1;
		} else {
			$state['row_offset'] = $row_offset + $batch_size;
		}

		$state['rows_exported'] = ( $state['rows_exported'] ?? 0 ) + count( $rows );

		return $state;
	}

	/**
	 * Initialize export state for chunked processing.
	 *
	 * @param string $output_file Path to output file.
	 * @param array  $tables      Tables to export.
	 * @param array  $exclude     Tables to exclude.
	 * @return array Initial state.
	 */
	public static function init_export_state( $output_file, $tables = array(), $exclude = array() ) {
		if ( empty( $tables ) ) {
			$tables = FiveDPBR_Helper::get_wp_tables();
		}

		if ( ! empty( $exclude ) ) {
			$tables = array_values( array_diff( $tables, $exclude ) );
		}

		// Write SQL header.
		$header = self::get_sql_header();
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $output_file, $header );

		return array(
			'output_file'   => $output_file,
			'tables'        => $tables,
			'table_index'   => 0,
			'row_offset'    => 0,
			'rows_exported' => 0,
			'tables_done'   => 0,
			'total_tables'  => count( $tables ),
		);
	}

	// =========================================================================
	// Export Methods
	// =========================================================================

	/**
	 * Export via mysqldump exec.
	 *
	 * @param string $output_file Output path.
	 * @param array  $tables      Tables.
	 * @return true|WP_Error
	 */
	private static function export_mysqldump( $output_file, $tables ) {
		$creds = FiveDPBR_Helper::get_db_credentials();

		// Parse host and port.
		$host = $creds['host'];
		$port = '';
		if ( strpos( $host, ':' ) !== false ) {
			list( $host, $port ) = explode( ':', $host, 2 );
		}

		$cmd = sprintf(
			'mysqldump --opt --single-transaction --quick --no-tablespaces -h %s -u %s',
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

		// Add specific tables.
		foreach ( $tables as $table ) {
			$cmd .= ' ' . escapeshellarg( $table );
		}

		$cmd .= ' > ' . escapeshellarg( $output_file ) . ' 2>&1';

		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.system_calls_exec
		@exec( $cmd, $output, $return_code );

		if ( 0 !== $return_code ) {
			$error_msg = ! empty( $output ) ? implode( "\n", $output ) : 'mysqldump failed with code ' . $return_code;
			return new WP_Error( 'mysqldump_failed', $error_msg );
		}

		// Verify file was created and has content.
		if ( ! file_exists( $output_file ) || filesize( $output_file ) < 10 ) {
			return new WP_Error( 'mysqldump_empty', __( 'mysqldump produced an empty file.', '5dp-backup-restore' ) );
		}

		return true;
	}

	/**
	 * Export via PDO chunked queries.
	 *
	 * @param string $output_file Output path.
	 * @param array  $tables      Tables.
	 * @return true|WP_Error
	 */
	private static function export_pdo( $output_file, $tables ) {
		$state = self::init_export_state( $output_file, $tables );

		while ( $state['table_index'] < count( $state['tables'] ) ) {
			$result = self::export_chunk( $state );

			if ( is_wp_error( $result ) ) {
				return $result;
			}

			if ( true === $result ) {
				break;
			}

			$state = $result;
		}

		// Write footer.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $output_file, self::get_sql_footer(), FILE_APPEND );

		return true;
	}

	/**
	 * Export via mysqli chunked queries.
	 *
	 * Same as PDO — both use $wpdb which abstracts the connection.
	 *
	 * @param string $output_file Output path.
	 * @param array  $tables      Tables.
	 * @return true|WP_Error
	 */
	private static function export_mysqli( $output_file, $tables ) {
		return self::export_pdo( $output_file, $tables );
	}

	// =========================================================================
	// SQL Generation
	// =========================================================================

	/**
	 * Get SQL file header.
	 *
	 * @return string
	 */
	private static function get_sql_header() {
		$header  = "-- 5DP Backup & Restore - Database Export\n";
		$header .= '-- Generated: ' . gmdate( 'Y-m-d H:i:s' ) . " UTC\n";
		$header .= '-- WordPress: ' . get_bloginfo( 'version' ) . "\n";
		$header .= '-- Site URL: ' . home_url() . "\n";
		$header .= "-- --------------------------------------------------------\n\n";
		$header .= "SET SQL_MODE = \"NO_AUTO_VALUE_ON_ZERO\";\n";
		$header .= "SET AUTOCOMMIT = 0;\n";
		$header .= "START TRANSACTION;\n";
		$header .= "SET time_zone = \"+00:00\";\n\n";
		$header .= "/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n";
		$header .= "/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;\n";
		$header .= "/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;\n";
		$header .= "/*!40101 SET NAMES utf8mb4 */;\n\n";

		return $header;
	}

	/**
	 * Get SQL file footer.
	 *
	 * @return string
	 */
	private static function get_sql_footer() {
		$footer  = "\nCOMMIT;\n\n";
		$footer .= "/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;\n";
		$footer .= "/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;\n";
		$footer .= "/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;\n";

		return $footer;
	}

	/**
	 * Write table structure (CREATE TABLE) to file handle.
	 *
	 * @param resource $handle File handle.
	 * @param string   $table  Table name.
	 */
	private static function write_table_header( $handle, $table ) {
		global $wpdb;

		$sql  = "\n-- --------------------------------------------------------\n";
		$sql .= "-- Table structure for table `{$table}`\n";
		$sql .= "-- --------------------------------------------------------\n\n";
		$sql .= "DROP TABLE IF EXISTS `{$table}`;\n";

		// Get CREATE TABLE statement.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$create = $wpdb->get_row( "SHOW CREATE TABLE `{$table}`", ARRAY_N );

		if ( $create && isset( $create[1] ) ) {
			$sql .= $create[1] . ";\n\n";
		}

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
		fwrite( $handle, $sql );
	}

	/**
	 * Write INSERT statements for a batch of rows.
	 *
	 * Uses extended INSERT syntax for efficiency.
	 *
	 * @param resource $handle File handle.
	 * @param string   $table  Table name.
	 * @param array    $rows   Array of associative row arrays.
	 */
	private static function write_insert_statements( $handle, $table, $rows ) {
		if ( empty( $rows ) ) {
			return;
		}

		global $wpdb;

		$columns  = array_keys( $rows[0] );
		$col_list = '`' . implode( '`, `', $columns ) . '`';

		// Write in batches of 100 rows per INSERT.
		$chunks = array_chunk( $rows, 100 );

		foreach ( $chunks as $chunk ) {
			$values = array();

			foreach ( $chunk as $row ) {
				$vals = array();

				foreach ( $row as $value ) {
					if ( null === $value ) {
						$vals[] = 'NULL';
					} else {
						// Use mysqli directly — $wpdb->_real_escape() runs
						// add_placeholder_escape() which corrupts % characters
						// (e.g. /%postname%/ → /{hash}postname{hash}/).
						$vals[] = "'" . mysqli_real_escape_string( $wpdb->dbh, $value ) . "'";
					}
				}

				$values[] = '(' . implode( ', ', $vals ) . ')';
			}

			$sql = "INSERT INTO `{$table}` ({$col_list}) VALUES\n" . implode( ",\n", $values ) . ";\n";

			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite
			fwrite( $handle, $sql );
		}
	}

	/**
	 * Get the total number of rows across all tables.
	 *
	 * @param array $tables Tables to count.
	 * @return int
	 */
	public static function get_total_rows( $tables ) {
		global $wpdb;

		$total = 0;

		foreach ( $tables as $table ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$count = $wpdb->get_var( "SELECT COUNT(*) FROM `{$table}`" );
			$total += (int) $count;
		}

		return $total;
	}
}
