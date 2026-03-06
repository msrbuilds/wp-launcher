<?php
/**
 * Serialization-safe search and replace.
 *
 * Handles URL and path replacement in the WordPress database,
 * correctly updating serialized data with recalculated string lengths.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/restore
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Search_Replace
 *
 * @since 1.0.0
 */
class FiveDPBR_Search_Replace {

	/**
	 * Run search-replace on the database.
	 *
	 * @param string $search     String to search for.
	 * @param string $replace    String to replace with.
	 * @param array  $tables     Tables to process (empty = all WP tables).
	 * @param bool   $dry_run    If true, only count matches without changing data.
	 * @return array Report with tables processed, rows affected, changes made.
	 */
	public static function run( $search, $replace, $tables = array(), $dry_run = false ) {
		global $wpdb;

		if ( $search === $replace ) {
			return array(
				'tables'       => 0,
				'rows_affected' => 0,
				'changes'      => 0,
				'errors'       => array(),
			);
		}

		if ( empty( $tables ) ) {
			$tables = FiveDPBR_Helper::get_wp_tables();
		}

		$report = array(
			'tables'        => 0,
			'rows_affected' => 0,
			'changes'       => 0,
			'errors'        => array(),
		);

		$batch_size = FiveDPBR_Environment::get_db_batch_size();

		foreach ( $tables as $table ) {
			$result = self::process_table( $table, $search, $replace, $batch_size, $dry_run );

			if ( is_wp_error( $result ) ) {
				$report['errors'][] = array(
					'table' => $table,
					'error' => $result->get_error_message(),
				);
				continue;
			}

			++$report['tables'];
			$report['rows_affected'] += $result['rows'];
			$report['changes']       += $result['changes'];
		}

		FiveDPBR_Logger::info(
			'restore',
			sprintf(
				'Search-replace complete: %d tables, %d rows affected, %d changes.',
				$report['tables'],
				$report['rows_affected'],
				$report['changes']
			),
			array( 'search' => $search, 'replace' => $replace, 'dry_run' => $dry_run )
		);

		return $report;
	}

	/**
	 * Run multiple search-replace pairs.
	 *
	 * @param array $pairs   Array of [ 'search' => '...', 'replace' => '...' ].
	 * @param array $tables  Tables to process.
	 * @return array Combined report.
	 */
	public static function run_multiple( $pairs, $tables = array() ) {
		$total_report = array(
			'tables'        => 0,
			'rows_affected' => 0,
			'changes'       => 0,
			'errors'        => array(),
		);

		foreach ( $pairs as $pair ) {
			$report = self::run( $pair['search'], $pair['replace'], $tables );

			$total_report['rows_affected'] += $report['rows_affected'];
			$total_report['changes']       += $report['changes'];
			$total_report['errors']         = array_merge( $total_report['errors'], $report['errors'] );
			$total_report['tables']         = max( $total_report['tables'], $report['tables'] );
		}

		return $total_report;
	}

	/**
	 * Process a single table.
	 *
	 * @param string $table      Table name.
	 * @param string $search     Search string.
	 * @param string $replace    Replace string.
	 * @param int    $batch_size Rows per batch.
	 * @param bool   $dry_run    Dry run flag.
	 * @return array|WP_Error
	 */
	private static function process_table( $table, $search, $replace, $batch_size, $dry_run ) {
		global $wpdb;

		// Get primary key column.
		$primary_key = self::get_primary_key( $table );

		if ( ! $primary_key ) {
			return new WP_Error( 'no_primary_key', sprintf( 'Table %s has no primary key.', $table ) );
		}

		// Get all columns.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$columns = $wpdb->get_col( "DESCRIBE `{$table}`", 0 );

		if ( empty( $columns ) ) {
			return array( 'rows' => 0, 'changes' => 0 );
		}

		$result = array( 'rows' => 0, 'changes' => 0 );
		$offset = 0;

		do {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$rows = $wpdb->get_results(
				"SELECT * FROM `{$table}` ORDER BY `{$primary_key}` LIMIT {$batch_size} OFFSET {$offset}",
				ARRAY_A
			);

			if ( empty( $rows ) ) {
				break;
			}

			foreach ( $rows as $row ) {
				$updates  = array();
				$row_changes = 0;

				foreach ( $columns as $col ) {
					if ( $col === $primary_key ) {
						continue;
					}

					$value = $row[ $col ];

					if ( null === $value || '' === $value ) {
						continue;
					}

					// Check if value contains the search string.
					if ( strpos( $value, $search ) === false ) {
						continue;
					}

					$new_value = self::replace_in_value( $value, $search, $replace );

					if ( $new_value !== $value ) {
						$updates[ $col ] = $new_value;
						++$row_changes;
					}
				}

				if ( ! empty( $updates ) && ! $dry_run ) {
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
					$wpdb->update(
						$table,
						$updates,
						array( $primary_key => $row[ $primary_key ] )
					);
				}

				if ( $row_changes > 0 ) {
					++$result['rows'];
					$result['changes'] += $row_changes;
				}
			}

			$offset += $batch_size;
		} while ( count( $rows ) === $batch_size );

		return $result;
	}

	/**
	 * Replace a search string in a value, handling serialized data.
	 *
	 * @param string $value   The original value.
	 * @param string $search  Search string.
	 * @param string $replace Replace string.
	 * @return string
	 */
	public static function replace_in_value( $value, $search, $replace ) {
		// Check if value is serialized.
		if ( is_serialized( $value ) ) {
			$unserialized = @unserialize( $value );

			if ( false !== $unserialized || 'b:0;' === $value ) {
				$unserialized = self::replace_recursive( $unserialized, $search, $replace );
				return serialize( $unserialized );
			}
		}

		// Check if value is JSON.
		$decoded = json_decode( $value, true );
		if ( null !== $decoded && ( is_array( $decoded ) || is_object( $decoded ) ) ) {
			$decoded = self::replace_recursive( $decoded, $search, $replace );
			return wp_json_encode( $decoded );
		}

		// Plain string replacement.
		return str_replace( $search, $replace, $value );
	}

	/**
	 * Recursively replace in arrays/objects.
	 *
	 * @param mixed  $data    Data structure.
	 * @param string $search  Search string.
	 * @param string $replace Replace string.
	 * @return mixed
	 */
	private static function replace_recursive( $data, $search, $replace ) {
		if ( is_string( $data ) ) {
			return str_replace( $search, $replace, $data );
		}

		if ( is_array( $data ) ) {
			$result = array();
			foreach ( $data as $key => $value ) {
				$new_key = is_string( $key ) ? str_replace( $search, $replace, $key ) : $key;
				$result[ $new_key ] = self::replace_recursive( $value, $search, $replace );
			}
			return $result;
		}

		if ( is_object( $data ) ) {
			$props = get_object_vars( $data );
			foreach ( $props as $key => $value ) {
				$data->$key = self::replace_recursive( $value, $search, $replace );
			}
			return $data;
		}

		return $data;
	}

	/**
	 * Get the primary key column of a table.
	 *
	 * @param string $table Table name.
	 * @return string|false
	 */
	private static function get_primary_key( $table ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( "SHOW KEYS FROM `{$table}` WHERE Key_name = 'PRIMARY'" );

		return $row ? $row->Column_name : false;
	}

	/**
	 * Generate standard search-replace pairs for migration.
	 *
	 * @param string $old_url  Old site URL.
	 * @param string $new_url  New site URL.
	 * @param string $old_path Old file path (optional).
	 * @param string $new_path New file path (optional).
	 * @return array Array of pairs.
	 */
	public static function get_migration_pairs( $old_url, $new_url, $old_path = '', $new_path = '' ) {
		$pairs = array();

		// URL replacements (multiple variations).
		$old_url = untrailingslashit( $old_url );
		$new_url = untrailingslashit( $new_url );

		// https://old.com → https://new.com
		$pairs[] = array( 'search' => $old_url, 'replace' => $new_url );

		// //old.com → //new.com (protocol-relative).
		$old_no_scheme = preg_replace( '#^https?:#', '', $old_url );
		$new_no_scheme = preg_replace( '#^https?:#', '', $new_url );
		if ( $old_no_scheme !== $new_no_scheme ) {
			$pairs[] = array( 'search' => $old_no_scheme, 'replace' => $new_no_scheme );
		}

		// JSON-escaped URLs (with \/).
		$old_escaped = str_replace( '/', '\\/', $old_url );
		$new_escaped = str_replace( '/', '\\/', $new_url );
		if ( $old_escaped !== $new_escaped ) {
			$pairs[] = array( 'search' => $old_escaped, 'replace' => $new_escaped );
		}

		// File paths.
		if ( $old_path && $new_path ) {
			$old_path = untrailingslashit( wp_normalize_path( $old_path ) );
			$new_path = untrailingslashit( wp_normalize_path( $new_path ) );

			if ( $old_path !== $new_path ) {
				$pairs[] = array( 'search' => $old_path, 'replace' => $new_path );

				// Windows backslash paths.
				$old_win = str_replace( '/', '\\', $old_path );
				$new_win = str_replace( '/', '\\', $new_path );
				if ( $old_win !== $new_win ) {
					$pairs[] = array( 'search' => $old_win, 'replace' => $new_win );
				}
			}
		}

		return $pairs;
	}
}
