<?php
/**
 * Staging site clone operations.
 *
 * Handles the low-level database table cloning and file copying
 * required to create and remove staging site clones.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/staging
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Staging_Clone
 *
 * @since 1.0.0
 */
class FiveDPBR_Staging_Clone {

	/**
	 * Clone database tables with a new prefix.
	 *
	 * For each table: drops the staging version if it exists, then creates
	 * a new staging table as a copy of the source using CREATE TABLE ... SELECT.
	 * Updates the staging wp_options table with staging-specific values.
	 *
	 * @param string $source_prefix  Source table prefix (e.g., 'wp_').
	 * @param string $staging_prefix Staging table prefix (e.g., 'stg1_').
	 * @param array  $tables         Array of source table names to clone.
	 * @return true|WP_Error True on success, WP_Error on failure.
	 */
	public static function clone_database( $source_prefix, $staging_prefix, $tables ) {
		global $wpdb;

		if ( empty( $tables ) ) {
			return new WP_Error( 'no_tables', __( 'No tables provided for cloning.', '5dp-backup-restore' ) );
		}

		$cloned_count = 0;
		$errors       = array();

		// Disable strict mode for the entire clone session — WordPress core tables have
		// DEFAULT '0000-00-00 00:00:00' which fails under NO_ZERO_DATE / STRICT_TRANS_TABLES.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->query( "SET SESSION sql_mode = ''" );

		foreach ( $tables as $source_table ) {
			// Derive the staging table name by replacing the prefix.
			$staging_table = $staging_prefix . substr( $source_table, strlen( $source_prefix ) );

			// Drop the staging table if it already exists.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->query( "DROP TABLE IF EXISTS `{$staging_table}`" );

			// Clone table structure (preserves PRIMARY KEY, indexes, AUTO_INCREMENT).
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$result = $wpdb->query( "CREATE TABLE `{$staging_table}` LIKE `{$source_table}`" );

			if ( false === $result ) {
				$errors[] = sprintf(
					/* translators: 1: Source table, 2: Database error */
					__( 'Failed to clone table %1$s: %2$s', '5dp-backup-restore' ),
					$source_table,
					$wpdb->last_error
				);

				FiveDPBR_Logger::error(
					'staging',
					sprintf( 'Failed to clone table %s: %s', $source_table, $wpdb->last_error )
				);

				continue;
			}

			// Copy data.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->query( "INSERT INTO `{$staging_table}` SELECT * FROM `{$source_table}`" );

			++$cloned_count;
		}

		if ( ! empty( $errors ) && 0 === $cloned_count ) {
			return new WP_Error( 'clone_failed', implode( '; ', $errors ) );
		}

		// Update staging wp_options with staging-specific values.
		$staging_options = $staging_prefix . 'options';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$table_exists = $wpdb->get_var(
			$wpdb->prepare( 'SHOW TABLES LIKE %s', $staging_options )
		);

		if ( $table_exists ) {
			// Append " (Staging)" to blogname.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$blogname = $wpdb->get_var(
				$wpdb->prepare(
					"SELECT option_value FROM `{$staging_options}` WHERE option_name = %s",
					'blogname'
				)
			);

			if ( $blogname && strpos( $blogname, '(Staging)' ) === false ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$wpdb->update(
					$staging_options,
					array( 'option_value' => $blogname . ' (Staging)' ),
					array( 'option_name' => 'blogname' )
				);
			}
		}

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'Database cloned: %d tables from %s to %s prefix.', $cloned_count, $source_prefix, $staging_prefix ),
			array( 'errors' => $errors )
		);

		return true;
	}

	/**
	 * Copy indexes from source table to staging table.
	 *
	 * Recreates the primary key and unique indexes on the cloned table,
	 * since CREATE TABLE ... SELECT does not copy indexes.
	 *
	 * @param string $source_table  Source table name.
	 * @param string $staging_table Staging table name.
	 */
	private static function copy_indexes( $source_table, $staging_table ) {
		global $wpdb;

		// Get the CREATE TABLE statement for the source.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$create_result = $wpdb->get_row( "SHOW CREATE TABLE `{$source_table}`", ARRAY_N );

		if ( ! $create_result || empty( $create_result[1] ) ) {
			return;
		}

		$create_sql = $create_result[1];

		// Extract PRIMARY KEY — suppress errors since it may already exist.
		if ( preg_match( '/PRIMARY KEY\s*\(([^)]+)\)/i', $create_sql, $matches ) ) {
			$pk_columns = $matches[1];

			$wpdb->suppress_errors( true );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->query( "ALTER TABLE `{$staging_table}` ADD PRIMARY KEY ({$pk_columns})" );
			$wpdb->suppress_errors( false );
		}

		// Extract AUTO_INCREMENT column.
		if ( preg_match( '/`(\w+)`[^,]+AUTO_INCREMENT/i', $create_sql, $matches ) ) {
			$auto_col = $matches[1];

			// Delete any rows with ID=0 — CREATE TABLE ... SELECT loses AUTO_INCREMENT,
			// so the column gets DEFAULT 0. If a row has 0, MODIFY AUTO_INCREMENT will
			// try to resequence it to 1, causing a duplicate key error if 1 already exists.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->query( "DELETE FROM `{$staging_table}` WHERE `{$auto_col}` = 0" );

			// Get the column definition.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$col_info = $wpdb->get_row(
				$wpdb->prepare(
					"SHOW COLUMNS FROM `{$source_table}` WHERE Field = %s",
					$auto_col
				)
			);

			if ( $col_info ) {
				$col_type = $col_info->Type;

				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$result = $wpdb->query( "ALTER TABLE `{$staging_table}` MODIFY `{$auto_col}` {$col_type} NOT NULL AUTO_INCREMENT" );

				if ( false === $result ) {
					FiveDPBR_Logger::error( 'staging', sprintf( 'Failed to add AUTO_INCREMENT to %s.%s: %s', $staging_table, $auto_col, $wpdb->last_error ) );
				}
			}
		}

		// Extract UNIQUE indexes.
		preg_match_all( '/UNIQUE KEY `(\w+)` \(([^)]+)\)/i', $create_sql, $unique_matches, PREG_SET_ORDER );

		foreach ( $unique_matches as $match ) {
			$index_name = $match[1];
			$columns    = $match[2];

			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->query( "ALTER TABLE `{$staging_table}` ADD UNIQUE KEY `{$index_name}` ({$columns})" );
		}

		// Extract regular KEY indexes.
		preg_match_all( '/^\s*KEY `(\w+)` \(([^)]+)\)/im', $create_sql, $key_matches, PREG_SET_ORDER );

		foreach ( $key_matches as $match ) {
			$index_name = $match[1];
			$columns    = $match[2];

			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->query( "ALTER TABLE `{$staging_table}` ADD KEY `{$index_name}` ({$columns})" );
		}
	}

	/**
	 * Clone files from source to destination directory.
	 *
	 * Uses recursive copy with WP_Filesystem, applying exclude patterns
	 * to skip unnecessary directories and files.
	 *
	 * @param string $source_dir Source directory path.
	 * @param string $dest_dir   Destination directory path.
	 * @param array  $exclude    Array of directory/file patterns to exclude.
	 * @return int|WP_Error Number of files copied, or WP_Error on failure.
	 */
	public static function clone_files( $source_dir, $dest_dir, $exclude = array() ) {
		require_once ABSPATH . 'wp-admin/includes/file.php';
		WP_Filesystem();
		global $wp_filesystem;

		if ( ! $wp_filesystem ) {
			return new WP_Error( 'filesystem', __( 'Could not initialize WP_Filesystem.', '5dp-backup-restore' ) );
		}

		$source_dir = trailingslashit( wp_normalize_path( $source_dir ) );
		$dest_dir   = trailingslashit( wp_normalize_path( $dest_dir ) );

		// Create destination directory if it does not exist.
		if ( ! $wp_filesystem->is_dir( $dest_dir ) ) {
			$created = wp_mkdir_p( $dest_dir );

			if ( ! $created ) {
				return new WP_Error(
					'dir_create',
					sprintf(
						/* translators: %s: Directory path */
						__( 'Cannot create staging directory: %s', '5dp-backup-restore' ),
						$dest_dir
					)
				);
			}
		}

		$files_copied = 0;

		$result = self::recursive_copy( $source_dir, $dest_dir, $exclude, $files_copied );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'Files cloned: %d files from %s to %s.', $files_copied, $source_dir, $dest_dir )
		);

		return $files_copied;
	}

	/**
	 * Recursively copy files from source to destination.
	 *
	 * @param string $source       Source directory.
	 * @param string $dest         Destination directory.
	 * @param array  $exclude      Exclude patterns.
	 * @param int    $files_copied Running count of files copied (passed by reference).
	 * @return true|WP_Error
	 */
	private static function recursive_copy( $source, $dest, $exclude, &$files_copied ) {
		global $wp_filesystem;

		$source = trailingslashit( wp_normalize_path( $source ) );
		$dest   = trailingslashit( wp_normalize_path( $dest ) );

		$dirlist = $wp_filesystem->dirlist( $source, true, false );

		if ( false === $dirlist ) {
			return new WP_Error(
				'dir_read',
				sprintf(
					/* translators: %s: Directory path */
					__( 'Cannot read directory: %s', '5dp-backup-restore' ),
					$source
				)
			);
		}

		foreach ( $dirlist as $name => $item ) {
			$source_path = $source . $name;
			$dest_path   = $dest . $name;

			// Check exclude patterns (absolute paths or plain names).
			$should_exclude = false;

			foreach ( $exclude as $pattern ) {
				$pattern = trim( $pattern, '/' );

				// Absolute path match (starts with /).
				if ( strpos( $pattern, ':' ) !== false || strpos( $pattern, '/' ) === 0 ) {
					$norm_pattern = rtrim( wp_normalize_path( $pattern ), '/' );
					$norm_source  = rtrim( wp_normalize_path( $source_path ), '/' );
					if ( $norm_source === $norm_pattern ) {
						$should_exclude = true;
						break;
					}
				} elseif ( $name === $pattern ) {
					// Simple name match (only at this level).
					$should_exclude = true;
					break;
				}
			}

			if ( $should_exclude ) {
				continue;
			}

			if ( 'd' === $item['type'] ) {
				// Directory: create and recurse.
				if ( ! $wp_filesystem->is_dir( $dest_path ) ) {
					$wp_filesystem->mkdir( $dest_path );
				}

				$result = self::recursive_copy(
					$source_path . '/',
					$dest_path . '/',
					$exclude,
					$files_copied
				);

				if ( is_wp_error( $result ) ) {
					FiveDPBR_Logger::warning(
						'staging',
						sprintf( 'Error copying directory %s: %s', $source_path, $result->get_error_message() )
					);
					// Continue with other files/directories.
				}
			} else {
				// File: copy.
				$copied = $wp_filesystem->copy( $source_path, $dest_path, true );

				if ( $copied ) {
					++$files_copied;
				} else {
					FiveDPBR_Logger::debug(
						'staging',
						sprintf( 'Could not copy file: %s', $source_path )
					);
				}
			}
		}

		return true;
	}

	/**
	 * Remove a staging clone (tables and directory).
	 *
	 * Drops all database tables with the staging prefix and deletes
	 * the staging files directory.
	 *
	 * @param string $staging_prefix Staging table prefix (e.g., 'stg1_').
	 * @param string $staging_dir    Staging files directory path.
	 * @return true|WP_Error
	 */
	public static function remove_clone( $staging_prefix, $staging_dir ) {
		global $wpdb;

		$errors = array();

		// Drop all tables with the staging prefix.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$tables = $wpdb->get_col(
			$wpdb->prepare(
				'SHOW TABLES LIKE %s',
				$wpdb->esc_like( $staging_prefix ) . '%'
			)
		);

		if ( ! empty( $tables ) ) {
			foreach ( $tables as $table ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$dropped = $wpdb->query( "DROP TABLE IF EXISTS `{$table}`" );

				if ( false === $dropped ) {
					$errors[] = sprintf(
						/* translators: %s: Table name */
						__( 'Failed to drop table: %s', '5dp-backup-restore' ),
						$table
					);
				}
			}

			FiveDPBR_Logger::info(
				'staging',
				sprintf( 'Dropped %d staging tables with prefix %s.', count( $tables ), $staging_prefix )
			);
		}

		// Delete staging files directory.
		if ( ! empty( $staging_dir ) && is_dir( $staging_dir ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
			global $wp_filesystem;

			if ( $wp_filesystem ) {
				$deleted = $wp_filesystem->delete( $staging_dir, true );

				if ( ! $deleted ) {
					$errors[] = sprintf(
						/* translators: %s: Directory path */
						__( 'Failed to delete staging directory: %s', '5dp-backup-restore' ),
						$staging_dir
					);
				} else {
					FiveDPBR_Logger::info(
						'staging',
						sprintf( 'Deleted staging directory: %s', $staging_dir )
					);
				}
			} else {
				$errors[] = __( 'Could not initialize WP_Filesystem for directory deletion.', '5dp-backup-restore' );
			}
		}

		if ( ! empty( $errors ) ) {
			FiveDPBR_Logger::warning( 'staging', 'Clone removal completed with errors.', array( 'errors' => $errors ) );
		}

		return true;
	}
}
