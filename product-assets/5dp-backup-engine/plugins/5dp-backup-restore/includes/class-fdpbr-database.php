<?php
/**
 * Database CRUD helper for custom tables.
 *
 * Provides convenience methods for interacting with the plugin's
 * custom database tables.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Database
 *
 * @since 1.0.0
 */
class FiveDPBR_Database {

	/**
	 * Insert a record into a custom table.
	 *
	 * @param string $table  Table name without prefix (e.g. 'fdpbr_backups').
	 * @param array  $data   Column => value pairs.
	 * @param array  $format Optional format array.
	 * @return int|false Insert ID or false.
	 */
	public static function insert( $table, $data, $format = null ) {
		global $wpdb;

		$full_table = $wpdb->prefix . $table;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$result = $wpdb->insert( $full_table, $data, $format );

		return $result ? $wpdb->insert_id : false;
	}

	/**
	 * Update records in a custom table.
	 *
	 * @param string $table Table name without prefix.
	 * @param array  $data  Column => value pairs to update.
	 * @param array  $where Column => value pairs for WHERE clause.
	 * @return int|false Number of rows updated or false.
	 */
	public static function update( $table, $data, $where ) {
		global $wpdb;

		$full_table = $wpdb->prefix . $table;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$result = $wpdb->update( $full_table, $data, $where );

		return false !== $result ? $result : false;
	}

	/**
	 * Delete records from a custom table.
	 *
	 * @param string $table Table name without prefix.
	 * @param array  $where Column => value pairs for WHERE clause.
	 * @return int|false Number of rows deleted or false.
	 */
	public static function delete( $table, $where ) {
		global $wpdb;

		$full_table = $wpdb->prefix . $table;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		return $wpdb->delete( $full_table, $where );
	}

	/**
	 * Get a single row by ID.
	 *
	 * @param string $table Table name without prefix.
	 * @param int    $id    Row ID.
	 * @return object|null
	 */
	public static function get( $table, $id ) {
		global $wpdb;

		$full_table = $wpdb->prefix . $table;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		return $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$full_table} WHERE id = %d", $id ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		);
	}

	/**
	 * Get rows matching conditions.
	 *
	 * @param string $table   Table name without prefix.
	 * @param array  $where   Column => value pairs for WHERE.
	 * @param string $orderby Column to order by.
	 * @param string $order   ASC or DESC.
	 * @param int    $limit   Max rows.
	 * @param int    $offset  Offset.
	 * @return array
	 */
	public static function query( $table, $where = array(), $orderby = 'id', $order = 'DESC', $limit = 50, $offset = 0 ) {
		global $wpdb;

		$full_table = $wpdb->prefix . $table;
		$conditions = array( '1=1' );
		$values     = array();

		foreach ( $where as $col => $val ) {
			$conditions[] = "`{$col}` = %s";
			$values[]     = $val;
		}

		$where_sql = implode( ' AND ', $conditions );
		$order     = 'ASC' === strtoupper( $order ) ? 'ASC' : 'DESC';
		$orderby   = sanitize_key( $orderby );

		$sql = "SELECT * FROM {$full_table} WHERE {$where_sql} ORDER BY `{$orderby}` {$order} LIMIT %d OFFSET %d";
		$values[] = (int) $limit;
		$values[] = (int) $offset;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$results = $wpdb->get_results( $wpdb->prepare( $sql, $values ) );

		return $results ? $results : array();
	}

	/**
	 * Count rows matching conditions.
	 *
	 * @param string $table Table name without prefix.
	 * @param array  $where Column => value pairs.
	 * @return int
	 */
	public static function count( $table, $where = array() ) {
		global $wpdb;

		$full_table = $wpdb->prefix . $table;
		$conditions = array( '1=1' );
		$values     = array();

		foreach ( $where as $col => $val ) {
			$conditions[] = "`{$col}` = %s";
			$values[]     = $val;
		}

		$where_sql = implode( ' AND ', $conditions );

		if ( ! empty( $values ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$count = $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$full_table} WHERE {$where_sql}", $values ) );
		} else {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$count = $wpdb->get_var( "SELECT COUNT(*) FROM {$full_table}" );
		}

		return (int) $count;
	}

	/**
	 * Get all schedules.
	 *
	 * @param bool $active_only Only return active schedules.
	 * @return array
	 */
	public static function get_schedules( $active_only = false ) {
		$where = $active_only ? array( 'is_active' => '1' ) : array();
		return self::query( 'fdpbr_schedules', $where, 'id', 'ASC', 100 );
	}

	/**
	 * Get staging sites.
	 *
	 * @return array
	 */
	public static function get_staging_sites() {
		return self::query( 'fdpbr_staging', array(), 'id', 'DESC', 50 );
	}
}
