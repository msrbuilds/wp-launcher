<?php
/**
 * Staging site synchronization.
 *
 * Handles bidirectional sync between staging and live sites,
 * as well as remote local-live synchronization via the REST API.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/staging
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Staging_Sync
 *
 * @since 1.0.0
 */
class FiveDPBR_Staging_Sync {

	/**
	 * Push staging changes to live.
	 *
	 * Retrieves pending changes from the change log and applies them
	 * to the live site database and files. URL search-replace is performed
	 * on database changes to correctly translate staging URLs to live URLs.
	 *
	 * @param int   $staging_id Staging site ID.
	 * @param array $options    Sync options.
	 * @return array|WP_Error Sync report or error.
	 */
	public static function sync_to_live( $staging_id, $options = array() ) {
		global $wpdb;

		$defaults = array(
			'sync_db'          => true,
			'sync_files'       => true,
			'selective_tables' => array(),
			'selective_dirs'   => array(),
		);

		$options = wp_parse_args( $options, $defaults );

		// Get the staging site record.
		$staging = FiveDPBR_Staging_Engine::get_staging_site( $staging_id );

		if ( ! $staging ) {
			return new WP_Error( 'not_found', __( 'Staging site not found.', '5dp-backup-restore' ) );
		}

		if ( 'active' !== $staging->status ) {
			return new WP_Error( 'not_active', __( 'Staging site is not active.', '5dp-backup-restore' ) );
		}

		$report = array(
			'direction'     => 'staging_to_live',
			'staging_id'    => $staging_id,
			'db_changes'    => 0,
			'files_synced'  => 0,
			'errors'        => array(),
			'started_at'    => current_time( 'mysql', true ),
			'completed_at'  => '',
		);

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'Sync to live started for staging "%s".', $staging->name )
		);

		// Get pending changes from the STAGING site's change log table.
		$stg_prefix = $staging->staging_prefix;
		$changes    = self::get_pending_changes( $staging_id, 'staging', $stg_prefix );

		// Sync database changes.
		if ( $options['sync_db'] ) {
			$db_result = self::apply_db_changes_to_live( $staging, $changes, $options );

			if ( is_wp_error( $db_result ) ) {
				$report['errors'][] = $db_result->get_error_message();
			} else {
				$report['db_changes'] = $db_result;
			}
		}

		// Sync file changes.
		if ( $options['sync_files'] ) {
			$file_result = self::apply_file_changes_to_live( $staging, $options );

			if ( is_wp_error( $file_result ) ) {
				$report['errors'][] = $file_result->get_error_message();
			} else {
				$report['files_synced'] = $file_result;
			}
		}

		// Mark staging changes as synced in the STAGING change log table.
		FiveDPBR_Staging_Tracker::mark_all_synced( $staging_id, $stg_prefix );
		// Also mark any live-side pending changes as synced.
		FiveDPBR_Staging_Tracker::mark_all_synced( $staging_id );

		$report['completed_at'] = current_time( 'mysql', true );

		// Update last_sync_at and last_push_at timestamps.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update(
			$wpdb->prefix . 'fdpbr_staging',
			array(
				'last_sync_at' => $report['completed_at'],
				'last_push_at' => $report['completed_at'],
			),
			array( 'id' => $staging_id ),
			array( '%s', '%s' ),
			array( '%d' )
		);

		// Store sync history entry.
		self::store_sync_history( $staging_id, $report );

		FiveDPBR_Logger::info(
			'staging',
			sprintf(
				'Sync to live completed: %d DB changes, %d files synced.',
				$report['db_changes'],
				$report['files_synced']
			),
			$report
		);

		return $report;
	}

	/**
	 * Pull live changes to staging.
	 *
	 * Reverse of sync_to_live: retrieves pending live-side changes
	 * and applies them to the staging database and files.
	 *
	 * @param int   $staging_id Staging site ID.
	 * @param array $options    Sync options.
	 * @return array|WP_Error Sync report or error.
	 */
	public static function sync_to_staging( $staging_id, $options = array() ) {
		global $wpdb;

		$defaults = array(
			'sync_db'          => true,
			'sync_files'       => true,
			'selective_tables' => array(),
			'selective_dirs'   => array(),
		);

		$options = wp_parse_args( $options, $defaults );

		$staging = FiveDPBR_Staging_Engine::get_staging_site( $staging_id );

		if ( ! $staging ) {
			return new WP_Error( 'not_found', __( 'Staging site not found.', '5dp-backup-restore' ) );
		}

		if ( 'active' !== $staging->status ) {
			return new WP_Error( 'not_active', __( 'Staging site is not active.', '5dp-backup-restore' ) );
		}

		$report = array(
			'direction'     => 'live_to_staging',
			'staging_id'    => $staging_id,
			'db_changes'    => 0,
			'files_synced'  => 0,
			'errors'        => array(),
			'started_at'    => current_time( 'mysql', true ),
			'completed_at'  => '',
		);

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'Sync to staging started for staging "%s".', $staging->name )
		);

		// Get pending changes from the LIVE site's change log table.
		$stg_prefix = $staging->staging_prefix;
		$changes    = self::get_pending_changes( $staging_id, 'live' );

		// Sync database changes.
		if ( $options['sync_db'] ) {
			$db_result = self::apply_db_changes_to_staging( $staging, $changes, $options );

			if ( is_wp_error( $db_result ) ) {
				$report['errors'][] = $db_result->get_error_message();
			} else {
				$report['db_changes'] = $db_result;
			}
		}

		// Sync file changes.
		if ( $options['sync_files'] ) {
			$file_result = self::apply_file_changes_to_staging( $staging, $options );

			if ( is_wp_error( $file_result ) ) {
				$report['errors'][] = $file_result->get_error_message();
			} else {
				$report['files_synced'] = $file_result;
			}
		}

		// Mark live changes as synced in the LIVE change log table.
		FiveDPBR_Staging_Tracker::mark_all_synced( $staging_id );
		// Also mark any staging-side pending changes as synced.
		FiveDPBR_Staging_Tracker::mark_all_synced( $staging_id, $stg_prefix );

		$report['completed_at'] = current_time( 'mysql', true );

		// Update last_sync_at timestamp.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update(
			$wpdb->prefix . 'fdpbr_staging',
			array( 'last_sync_at' => $report['completed_at'] ),
			array( 'id' => $staging_id ),
			array( '%s' ),
			array( '%d' )
		);

		// Store sync history entry.
		self::store_sync_history( $staging_id, $report );

		FiveDPBR_Logger::info(
			'staging',
			sprintf(
				'Sync to staging completed: %d DB changes, %d files synced.',
				$report['db_changes'],
				$report['files_synced']
			),
			$report
		);

		return $report;
	}

	/**
	 * Handle remote local-live 2-way sync.
	 *
	 * Supports push, pull, and two-way directions for syncing with a remote site.
	 * For push: packages local changes and POSTs to the remote endpoint.
	 * For pull: GETs remote changes and applies them locally.
	 * For two_way: merges changes from both sides, detecting conflicts.
	 *
	 * @param array $args Sync arguments.
	 * @return array|WP_Error Sync report with conflicts if any.
	 */
	public static function sync_remote( $args = array() ) {
		$defaults = array(
			'remote_url'  => '',
			'remote_key'  => '',
			'direction'   => 'push',
			'sync_db'     => true,
			'sync_files'  => true,
		);

		$args = wp_parse_args( $args, $defaults );

		if ( empty( $args['remote_url'] ) || empty( $args['remote_key'] ) ) {
			return new WP_Error( 'missing_args', __( 'Remote URL and API key are required.', '5dp-backup-restore' ) );
		}

		$remote_url = untrailingslashit( $args['remote_url'] );
		$remote_key = $args['remote_key'];

		$report = array(
			'direction'    => $args['direction'],
			'remote_url'   => $remote_url,
			'pushed'       => 0,
			'pulled'       => 0,
			'conflicts'    => array(),
			'errors'       => array(),
			'started_at'   => current_time( 'mysql', true ),
			'completed_at' => '',
		);

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'Remote sync started (%s) with %s.', $args['direction'], $remote_url )
		);

		$headers = array(
			'X-FDPBR-Key'  => $remote_key,
			'Content-Type' => 'application/json',
		);

		switch ( $args['direction'] ) {
			case 'push':
				$result = self::remote_push( $remote_url, $headers, $args );

				if ( is_wp_error( $result ) ) {
					$report['errors'][] = $result->get_error_message();
				} else {
					$report['pushed'] = $result;
				}
				break;

			case 'pull':
				$result = self::remote_pull( $remote_url, $headers, $args );

				if ( is_wp_error( $result ) ) {
					$report['errors'][] = $result->get_error_message();
				} else {
					$report['pulled'] = $result;
				}
				break;

			case 'two_way':
				$result = self::remote_two_way( $remote_url, $headers, $args );

				if ( is_wp_error( $result ) ) {
					$report['errors'][] = $result->get_error_message();
				} else {
					$report['pushed']    = $result['pushed'];
					$report['pulled']    = $result['pulled'];
					$report['conflicts'] = $result['conflicts'];
				}
				break;

			default:
				return new WP_Error(
					'invalid_direction',
					sprintf(
						/* translators: %s: Direction value */
						__( 'Invalid sync direction: %s', '5dp-backup-restore' ),
						$args['direction']
					)
				);
		}

		$report['completed_at'] = current_time( 'mysql', true );

		FiveDPBR_Logger::info(
			'staging',
			sprintf(
				'Remote sync completed (%s): pushed %d, pulled %d, %d conflicts.',
				$args['direction'],
				$report['pushed'],
				$report['pulled'],
				count( $report['conflicts'] )
			),
			$report
		);

		return $report;
	}

	/**
	 * Get pending changes from the change log.
	 *
	 * @param int    $staging_id     Staging site ID.
	 * @param string $source         Source filter ('live' or 'staging'). Empty for all.
	 * @param string $table_prefix   Optional table prefix override (e.g., staging prefix).
	 * @return array Array of change log entries.
	 */
	public static function get_pending_changes( $staging_id, $source = '', $table_prefix = '' ) {
		global $wpdb;

		$prefix = ! empty( $table_prefix ) ? $table_prefix : $wpdb->prefix;
		$table  = $prefix . 'fdpbr_change_log';
		$where  = 'staging_id = %d AND synced = 0';
		$values = array( $staging_id );

		if ( ! empty( $source ) ) {
			$where   .= ' AND source = %s';
			$values[] = $source;
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$results = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE {$where} ORDER BY detected_at ASC",
				$values
			)
		);

		return $results ? $results : array();
	}

	/**
	 * Resolve a sync conflict.
	 *
	 * Applies the chosen resolution strategy (keep_local, keep_remote, or skip)
	 * to a specific change log entry.
	 *
	 * @param int    $change_id  Change log entry ID.
	 * @param string $resolution Resolution strategy: 'keep_local', 'keep_remote', or 'skip'.
	 * @return bool|WP_Error True on success, WP_Error on failure.
	 */
	public static function resolve_conflict( $change_id, $resolution ) {
		global $wpdb;

		$table = $wpdb->prefix . 'fdpbr_change_log';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$change = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $change_id )
		);

		if ( ! $change ) {
			return new WP_Error( 'not_found', __( 'Change log entry not found.', '5dp-backup-restore' ) );
		}

		$valid_resolutions = array( 'keep_local', 'keep_remote', 'skip' );

		if ( ! in_array( $resolution, $valid_resolutions, true ) ) {
			return new WP_Error(
				'invalid_resolution',
				sprintf(
					/* translators: %s: Resolution value */
					__( 'Invalid conflict resolution: %s', '5dp-backup-restore' ),
					$resolution
				)
			);
		}

		switch ( $resolution ) {
			case 'keep_local':
				// Mark the remote change as synced (effectively discarding it).
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->update(
					$table,
					array(
						'synced'    => 1,
						'resolved'  => 'keep_local',
					),
					array( 'id' => $change_id ),
					array( '%d', '%s' ),
					array( '%d' )
				);
				break;

			case 'keep_remote':
				// Apply the remote change.
				$staging = FiveDPBR_Staging_Engine::get_staging_site( $change->staging_id );

				if ( ! $staging ) {
					return new WP_Error( 'staging_not_found', __( 'Associated staging site not found.', '5dp-backup-restore' ) );
				}

				$apply_result = self::apply_single_change( $change, $staging );

				if ( is_wp_error( $apply_result ) ) {
					return $apply_result;
				}

				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->update(
					$table,
					array(
						'synced'    => 1,
						'resolved'  => 'keep_remote',
					),
					array( 'id' => $change_id ),
					array( '%d', '%s' ),
					array( '%d' )
				);
				break;

			case 'skip':
				// Mark as synced without applying.
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->update(
					$table,
					array(
						'synced'    => 1,
						'resolved'  => 'skipped',
					),
					array( 'id' => $change_id ),
					array( '%d', '%s' ),
					array( '%d' )
				);
				break;
		}

		FiveDPBR_Logger::info(
			'staging',
			sprintf( 'Conflict resolved for change %d: %s.', $change_id, $resolution )
		);

		return true;
	}

	// =========================================================================
	// Private: Sync History
	// =========================================================================

	/**
	 * Store a sync history entry in the options table.
	 *
	 * @param int   $staging_id Staging site ID.
	 * @param array $report     Sync report.
	 */
	private static function store_sync_history( $staging_id, $report ) {
		$history   = get_option( 'fdpbr_sync_history', array() );
		$history[] = array(
			'staging_id'   => $staging_id,
			'direction'    => $report['direction'],
			'db_changes'   => $report['db_changes'],
			'files_synced' => $report['files_synced'],
			'errors'       => count( $report['errors'] ),
			'completed_at' => $report['completed_at'],
		);

		// Keep only the last 50 entries.
		$history = array_slice( $history, -50 );
		update_option( 'fdpbr_sync_history', $history, false );
	}

	// =========================================================================
	// Private: Database Sync Helpers
	// =========================================================================

	/**
	 * Apply database changes from staging to live.
	 *
	 * @param object $staging Staging site record.
	 * @param array  $changes Array of change log entries.
	 * @param array  $options Sync options.
	 * @return int|WP_Error Number of changes applied or error.
	 */
	private static function apply_db_changes_to_live( $staging, $changes, $options ) {
		global $wpdb;

		$applied       = 0;
		$change_table  = $staging->staging_prefix . 'fdpbr_change_log';

		// Filter to DB-related changes only (posts, options).
		$db_changes = array_filter( $changes, function ( $change ) {
			return in_array( $change->object_type, array( 'post', 'option', 'term', 'nav_menu' ), true );
		} );

		// If selective tables are specified, filter further.
		if ( ! empty( $options['selective_tables'] ) ) {
			$db_changes = array_filter( $db_changes, function ( $change ) use ( $options ) {
				return in_array( $change->object_type, $options['selective_tables'], true );
			} );
		}

		// URL search-replace pairs for translating staging URLs to live.
		$pairs = FiveDPBR_Search_Replace::get_migration_pairs(
			$staging->staging_url,
			$staging->source_url,
			$staging->staging_dir,
			ABSPATH
		);

		foreach ( $db_changes as $change ) {
			$result = self::apply_single_change_to_live( $change, $staging, $pairs );

			if ( is_wp_error( $result ) ) {
				FiveDPBR_Logger::warning(
					'staging',
					sprintf( 'Failed to apply change %d to live: %s', $change->id, $result->get_error_message() )
				);
				continue;
			}

			// Mark change as synced in the staging change log table.
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$wpdb->update(
				$change_table,
				array( 'synced' => 1 ),
				array( 'id' => $change->id ),
				array( '%d' ),
				array( '%d' )
			);

			++$applied;
		}

		return $applied;
	}

	/**
	 * Apply database changes from live to staging.
	 *
	 * @param object $staging Staging site record.
	 * @param array  $changes Array of change log entries.
	 * @param array  $options Sync options.
	 * @return int|WP_Error Number of changes applied or error.
	 */
	private static function apply_db_changes_to_staging( $staging, $changes, $options ) {
		global $wpdb;

		$applied = 0;

		$db_changes = array_filter( $changes, function ( $change ) {
			return in_array( $change->object_type, array( 'post', 'option', 'term', 'nav_menu' ), true );
		} );

		if ( ! empty( $options['selective_tables'] ) ) {
			$db_changes = array_filter( $db_changes, function ( $change ) use ( $options ) {
				return in_array( $change->object_type, $options['selective_tables'], true );
			} );
		}

		// URL search-replace pairs for translating live URLs to staging.
		$pairs = FiveDPBR_Search_Replace::get_migration_pairs(
			$staging->source_url,
			$staging->staging_url,
			ABSPATH,
			$staging->staging_dir
		);

		foreach ( $db_changes as $change ) {
			$result = self::apply_single_change_to_staging( $change, $staging, $pairs );

			if ( is_wp_error( $result ) ) {
				FiveDPBR_Logger::warning(
					'staging',
					sprintf( 'Failed to apply change %d to staging: %s', $change->id, $result->get_error_message() )
				);
				continue;
			}

			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$wpdb->update(
				$wpdb->prefix . 'fdpbr_change_log',
				array( 'synced' => 1 ),
				array( 'id' => $change->id ),
				array( '%d' ),
				array( '%d' )
			);

			++$applied;
		}

		return $applied;
	}

	/**
	 * Apply a single change record to the live database.
	 *
	 * @param object $change Change log entry.
	 * @param object $staging Staging site record.
	 * @param array  $pairs   Search-replace pairs.
	 * @return true|WP_Error
	 */
	private static function apply_single_change_to_live( $change, $staging, $pairs ) {
		global $wpdb;

		$object_data = json_decode( $change->object_data, true );

		if ( null === $object_data ) {
			return new WP_Error( 'invalid_data', __( 'Invalid change data.', '5dp-backup-restore' ) );
		}

		// Apply URL search-replace to the data.
		$object_data_json = wp_json_encode( $object_data );
		foreach ( $pairs as $pair ) {
			$object_data_json = str_replace( $pair['search'], $pair['replace'], $object_data_json );
		}
		$object_data = json_decode( $object_data_json, true );

		switch ( $change->object_type ) {
			case 'post':
				return self::apply_post_change_to_table( $wpdb->posts, $change->change_type, $change->object_id, $object_data );

			case 'option':
				return self::apply_option_change_to_table( $wpdb->options, $change->change_type, $object_data );

			default:
				return new WP_Error(
					'unsupported_type',
					sprintf(
						/* translators: %s: Object type */
						__( 'Unsupported object type for live sync: %s', '5dp-backup-restore' ),
						$change->object_type
					)
				);
		}
	}

	/**
	 * Apply a single change record to the staging database.
	 *
	 * @param object $change  Change log entry.
	 * @param object $staging Staging site record.
	 * @param array  $pairs   Search-replace pairs.
	 * @return true|WP_Error
	 */
	private static function apply_single_change_to_staging( $change, $staging, $pairs ) {
		global $wpdb;

		$object_data = json_decode( $change->object_data, true );

		if ( null === $object_data ) {
			return new WP_Error( 'invalid_data', __( 'Invalid change data.', '5dp-backup-restore' ) );
		}

		// Apply URL search-replace to the data.
		$object_data_json = wp_json_encode( $object_data );
		foreach ( $pairs as $pair ) {
			$object_data_json = str_replace( $pair['search'], $pair['replace'], $object_data_json );
		}
		$object_data = json_decode( $object_data_json, true );

		$staging_prefix = $staging->staging_prefix;

		switch ( $change->object_type ) {
			case 'post':
				$table = $staging_prefix . 'posts';
				return self::apply_post_change_to_table( $table, $change->change_type, $change->object_id, $object_data );

			case 'option':
				$table = $staging_prefix . 'options';
				return self::apply_option_change_to_table( $table, $change->change_type, $object_data );

			default:
				return new WP_Error(
					'unsupported_type',
					sprintf(
						/* translators: %s: Object type */
						__( 'Unsupported object type for staging sync: %s', '5dp-backup-restore' ),
						$change->object_type
					)
				);
		}
	}

	/**
	 * Apply a post change to a specific table.
	 *
	 * @param string $table       Table name.
	 * @param string $change_type Change type (create, update, delete).
	 * @param int    $object_id   Post ID.
	 * @param array  $object_data Post data.
	 * @return true|WP_Error
	 */
	private static function apply_post_change_to_table( $table, $change_type, $object_id, $object_data ) {
		global $wpdb;

		switch ( $change_type ) {
			case 'create':
			case 'update':
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$exists = $wpdb->get_var(
					$wpdb->prepare( "SELECT ID FROM `{$table}` WHERE ID = %d", $object_id )
				);

				if ( $exists ) {
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
					$wpdb->update( $table, $object_data, array( 'ID' => $object_id ) );
				} else {
					$object_data['ID'] = $object_id;
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
					$wpdb->insert( $table, $object_data );
				}

				return true;

			case 'delete':
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->delete( $table, array( 'ID' => $object_id ) );
				return true;

			default:
				return new WP_Error( 'invalid_change_type', __( 'Invalid change type.', '5dp-backup-restore' ) );
		}
	}

	/**
	 * Apply an option change to a specific table.
	 *
	 * @param string $table       Table name.
	 * @param string $change_type Change type (create, update, delete).
	 * @param array  $object_data Option data with 'option_name' and 'option_value'.
	 * @return true|WP_Error
	 */
	private static function apply_option_change_to_table( $table, $change_type, $object_data ) {
		global $wpdb;

		$option_name = isset( $object_data['option_name'] ) ? $object_data['option_name'] : '';

		if ( empty( $option_name ) ) {
			return new WP_Error( 'missing_option_name', __( 'Option name is required.', '5dp-backup-restore' ) );
		}

		// Never sync site-identity options — these are different per environment.
		$protected_options = array( 'siteurl', 'home', 'rewrite_rules', 'db_version' );
		if ( in_array( $option_name, $protected_options, true ) ) {
			return true; // Silently skip.
		}

		// Never sync prefix-dependent option keys (e.g., wp_user_roles, stg1_user_roles).
		if ( preg_match( '/^[a-z0-9]+_user_roles$/', $option_name ) ) {
			return true;
		}

		switch ( $change_type ) {
			case 'create':
			case 'update':
				$option_value = isset( $object_data['option_value'] ) ? $object_data['option_value'] : '';

				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$exists = $wpdb->get_var(
					$wpdb->prepare( "SELECT option_id FROM `{$table}` WHERE option_name = %s", $option_name )
				);

				if ( $exists ) {
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
					$wpdb->update(
						$table,
						array( 'option_value' => $option_value ),
						array( 'option_name' => $option_name )
					);
				} else {
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
					$wpdb->insert(
						$table,
						array(
							'option_name'  => $option_name,
							'option_value' => $option_value,
							'autoload'     => isset( $object_data['autoload'] ) ? $object_data['autoload'] : 'yes',
						)
					);
				}

				return true;

			case 'delete':
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$wpdb->delete( $table, array( 'option_name' => $option_name ) );
				return true;

			default:
				return new WP_Error( 'invalid_change_type', __( 'Invalid change type.', '5dp-backup-restore' ) );
		}
	}

	/**
	 * Apply a single change (generic, used for conflict resolution).
	 *
	 * @param object $change  Change log entry.
	 * @param object $staging Staging site record.
	 * @return true|WP_Error
	 */
	private static function apply_single_change( $change, $staging ) {
		if ( 'staging' === $change->source ) {
			$pairs = FiveDPBR_Search_Replace::get_migration_pairs(
				$staging->staging_url,
				$staging->source_url,
				$staging->staging_dir,
				ABSPATH
			);
			return self::apply_single_change_to_live( $change, $staging, $pairs );
		} else {
			$pairs = FiveDPBR_Search_Replace::get_migration_pairs(
				$staging->source_url,
				$staging->staging_url,
				ABSPATH,
				$staging->staging_dir
			);
			return self::apply_single_change_to_staging( $change, $staging, $pairs );
		}
	}

	// =========================================================================
	// Private: File Sync Helpers
	// =========================================================================

	/**
	 * Apply file changes from staging to live.
	 *
	 * @param object $staging Staging site record.
	 * @param array  $options Sync options.
	 * @return int|WP_Error Number of files synced or error.
	 */
	private static function apply_file_changes_to_live( $staging, $options ) {
		require_once ABSPATH . 'wp-admin/includes/file.php';
		WP_Filesystem();
		global $wp_filesystem;

		if ( ! $wp_filesystem ) {
			return new WP_Error( 'filesystem', __( 'Could not initialize WP_Filesystem.', '5dp-backup-restore' ) );
		}

		$staging_dir = trailingslashit( wp_normalize_path( $staging->staging_dir ) );
		$live_dir    = trailingslashit( wp_normalize_path( WP_CONTENT_DIR ) );
		$synced      = 0;

		// Determine directories to sync.
		$dirs_to_sync = array( 'themes/', 'plugins/', 'uploads/' );

		if ( ! empty( $options['selective_dirs'] ) ) {
			$dirs_to_sync = array_map( 'trailingslashit', $options['selective_dirs'] );
		}

		foreach ( $dirs_to_sync as $dir ) {
			$source = $staging_dir . $dir;
			$dest   = $live_dir . $dir;

			if ( ! $wp_filesystem->is_dir( $source ) ) {
				continue;
			}

			$result = self::sync_directory( $source, $dest );

			if ( is_wp_error( $result ) ) {
				FiveDPBR_Logger::warning(
					'staging',
					sprintf( 'Error syncing directory %s to live: %s', $dir, $result->get_error_message() )
				);
				continue;
			}

			$synced += $result;
		}

		return $synced;
	}

	/**
	 * Apply file changes from live to staging.
	 *
	 * @param object $staging Staging site record.
	 * @param array  $options Sync options.
	 * @return int|WP_Error Number of files synced or error.
	 */
	private static function apply_file_changes_to_staging( $staging, $options ) {
		require_once ABSPATH . 'wp-admin/includes/file.php';
		WP_Filesystem();
		global $wp_filesystem;

		if ( ! $wp_filesystem ) {
			return new WP_Error( 'filesystem', __( 'Could not initialize WP_Filesystem.', '5dp-backup-restore' ) );
		}

		$staging_dir = trailingslashit( wp_normalize_path( $staging->staging_dir ) );
		$live_dir    = trailingslashit( wp_normalize_path( WP_CONTENT_DIR ) );
		$synced      = 0;

		$dirs_to_sync = array( 'themes/', 'plugins/', 'uploads/' );

		if ( ! empty( $options['selective_dirs'] ) ) {
			$dirs_to_sync = array_map( 'trailingslashit', $options['selective_dirs'] );
		}

		foreach ( $dirs_to_sync as $dir ) {
			$source = $live_dir . $dir;
			$dest   = $staging_dir . $dir;

			if ( ! $wp_filesystem->is_dir( $source ) ) {
				continue;
			}

			if ( ! $wp_filesystem->is_dir( $dest ) ) {
				wp_mkdir_p( $dest );
			}

			$result = self::sync_directory( $source, $dest );

			if ( is_wp_error( $result ) ) {
				FiveDPBR_Logger::warning(
					'staging',
					sprintf( 'Error syncing directory %s to staging: %s', $dir, $result->get_error_message() )
				);
				continue;
			}

			$synced += $result;
		}

		return $synced;
	}

	/**
	 * Sync files from one directory to another.
	 *
	 * Compares files by hash and only copies changed files.
	 *
	 * @param string $source Source directory.
	 * @param string $dest   Destination directory.
	 * @return int|WP_Error Number of files copied or error.
	 */
	private static function sync_directory( $source, $dest ) {
		global $wp_filesystem;

		$source = trailingslashit( wp_normalize_path( $source ) );
		$dest   = trailingslashit( wp_normalize_path( $dest ) );

		$dirlist = $wp_filesystem->dirlist( $source, true, false );

		if ( false === $dirlist ) {
			return new WP_Error( 'dir_read', sprintf( 'Cannot read directory: %s', $source ) );
		}

		// Skip the plugin's own directory to prevent self-overwrite during sync.
		$plugin_dir_name = defined( 'FDPBR_PLUGIN_BASENAME' )
			? dirname( FDPBR_PLUGIN_BASENAME )
			: '5dp-backup-restore';

		$copied = 0;

		foreach ( $dirlist as $name => $item ) {
			// Skip our own plugin directory.
			if ( $name === $plugin_dir_name ) {
				continue;
			}

			$source_path = $source . $name;
			$dest_path   = $dest . $name;

			if ( 'd' === $item['type'] ) {
				if ( ! $wp_filesystem->is_dir( $dest_path ) ) {
					$wp_filesystem->mkdir( $dest_path );
				}

				$sub_result = self::sync_directory( $source_path . '/', $dest_path . '/' );

				if ( ! is_wp_error( $sub_result ) ) {
					$copied += $sub_result;
				}
			} else {
				// Only copy if the file has changed (compare by size and modification time).
				$should_copy = true;

				if ( $wp_filesystem->exists( $dest_path ) ) {
					$source_size = $wp_filesystem->size( $source_path );
					$dest_size   = $wp_filesystem->size( $dest_path );

					$source_mtime = $wp_filesystem->mtime( $source_path );
					$dest_mtime   = $wp_filesystem->mtime( $dest_path );

					if ( $source_size === $dest_size && $source_mtime <= $dest_mtime ) {
						$should_copy = false;
					}
				}

				if ( $should_copy ) {
					$result = $wp_filesystem->copy( $source_path, $dest_path, true );

					if ( $result ) {
						++$copied;
					}
				}
			}
		}

		return $copied;
	}

	// =========================================================================
	// Private: Remote Sync Helpers
	// =========================================================================

	/**
	 * Push local changes to the remote site.
	 *
	 * @param string $remote_url Remote site URL.
	 * @param array  $headers    Request headers.
	 * @param array  $args       Sync arguments.
	 * @return int|WP_Error Number of changes pushed or error.
	 */
	private static function remote_push( $remote_url, $headers, $args ) {
		// Package local changes.
		$local_changes = self::package_local_changes( $args );

		if ( empty( $local_changes ) ) {
			return 0;
		}

		$response = wp_remote_post(
			$remote_url . '/wp-json/fdpbr/v1/staging/push',
			array(
				'headers' => $headers,
				'body'    => wp_json_encode( $local_changes ),
				'timeout' => 60,
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = wp_remote_retrieve_response_code( $response );

		if ( 200 !== $code ) {
			return new WP_Error(
				'remote_push_failed',
				sprintf(
					/* translators: %d: HTTP status code */
					__( 'Remote push failed with HTTP %d.', '5dp-backup-restore' ),
					$code
				)
			);
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		return isset( $body['applied'] ) ? (int) $body['applied'] : count( $local_changes );
	}

	/**
	 * Pull changes from the remote site.
	 *
	 * @param string $remote_url Remote site URL.
	 * @param array  $headers    Request headers.
	 * @param array  $args       Sync arguments.
	 * @return int|WP_Error Number of changes pulled or error.
	 */
	private static function remote_pull( $remote_url, $headers, $args ) {
		$response = wp_remote_get(
			$remote_url . '/wp-json/fdpbr/v1/staging/pull',
			array(
				'headers' => $headers,
				'timeout' => 60,
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = wp_remote_retrieve_response_code( $response );

		if ( 200 !== $code ) {
			return new WP_Error(
				'remote_pull_failed',
				sprintf(
					/* translators: %d: HTTP status code */
					__( 'Remote pull failed with HTTP %d.', '5dp-backup-restore' ),
					$code
				)
			);
		}

		$body           = json_decode( wp_remote_retrieve_body( $response ), true );
		$remote_changes = isset( $body['changes'] ) ? $body['changes'] : array();

		if ( empty( $remote_changes ) ) {
			return 0;
		}

		// Apply remote changes locally.
		$applied = self::apply_remote_changes( $remote_changes );

		return $applied;
	}

	/**
	 * Perform two-way sync with the remote site.
	 *
	 * Gets changes from both sides, detects conflicts (same object modified on both),
	 * and merges non-conflicting changes.
	 *
	 * @param string $remote_url Remote site URL.
	 * @param array  $headers    Request headers.
	 * @param array  $args       Sync arguments.
	 * @return array|WP_Error Array with pushed, pulled, and conflicts counts.
	 */
	private static function remote_two_way( $remote_url, $headers, $args ) {
		// Get remote changes.
		$response = wp_remote_get(
			$remote_url . '/wp-json/fdpbr/v1/staging/pull',
			array(
				'headers' => $headers,
				'timeout' => 60,
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$body           = json_decode( wp_remote_retrieve_body( $response ), true );
		$remote_changes = isset( $body['changes'] ) ? $body['changes'] : array();

		// Get local changes.
		$local_changes = self::package_local_changes( $args );

		// Detect conflicts: same object_type + object_id changed on both sides.
		$conflicts       = array();
		$safe_local      = array();
		$safe_remote     = array();

		$remote_keys = array();
		foreach ( $remote_changes as $rc ) {
			$key = $rc['object_type'] . ':' . $rc['object_id'];
			$remote_keys[ $key ] = $rc;
		}

		foreach ( $local_changes as $lc ) {
			$key = $lc['object_type'] . ':' . $lc['object_id'];

			if ( isset( $remote_keys[ $key ] ) ) {
				$conflicts[] = array(
					'local'  => $lc,
					'remote' => $remote_keys[ $key ],
					'key'    => $key,
				);
				unset( $remote_keys[ $key ] );
			} else {
				$safe_local[] = $lc;
			}
		}

		$safe_remote = array_values( $remote_keys );

		// Apply non-conflicting changes.
		$pushed = 0;
		$pulled = 0;

		if ( ! empty( $safe_local ) ) {
			$push_response = wp_remote_post(
				$remote_url . '/wp-json/fdpbr/v1/staging/push',
				array(
					'headers' => $headers,
					'body'    => wp_json_encode( $safe_local ),
					'timeout' => 60,
				)
			);

			if ( ! is_wp_error( $push_response ) && 200 === wp_remote_retrieve_response_code( $push_response ) ) {
				$pushed = count( $safe_local );
			}
		}

		if ( ! empty( $safe_remote ) ) {
			$pulled = self::apply_remote_changes( $safe_remote );
		}

		return array(
			'pushed'    => $pushed,
			'pulled'    => $pulled,
			'conflicts' => $conflicts,
		);
	}

	/**
	 * Package local changes for remote push.
	 *
	 * @param array $args Sync arguments.
	 * @return array Packaged changes.
	 */
	private static function package_local_changes( $args ) {
		global $wpdb;

		// Get recent changes that haven't been synced.
		$table = $wpdb->prefix . 'fdpbr_change_log';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$changes = $wpdb->get_results(
			"SELECT * FROM {$table} WHERE synced = 0 AND source = 'live' ORDER BY created_at ASC"
		);

		if ( empty( $changes ) ) {
			return array();
		}

		$packaged = array();

		foreach ( $changes as $change ) {
			$packaged[] = array(
				'object_type' => $change->object_type,
				'object_id'   => $change->object_id,
				'change_type' => $change->change_type,
				'object_data' => $change->object_data,
				'created_at'  => $change->created_at,
			);
		}

		return $packaged;
	}

	/**
	 * Apply remote changes locally.
	 *
	 * @param array $changes Array of change data from remote.
	 * @return int Number of changes applied.
	 */
	private static function apply_remote_changes( $changes ) {
		global $wpdb;

		$applied = 0;

		foreach ( $changes as $change ) {
			$object_data = is_string( $change['object_data'] )
				? json_decode( $change['object_data'], true )
				: $change['object_data'];

			if ( null === $object_data ) {
				continue;
			}

			$change_type = $change['change_type'];
			$object_type = $change['object_type'];
			$object_id   = isset( $change['object_id'] ) ? $change['object_id'] : 0;

			switch ( $object_type ) {
				case 'post':
					$result = self::apply_post_change_to_table( $wpdb->posts, $change_type, $object_id, $object_data );
					break;

				case 'option':
					$result = self::apply_option_change_to_table( $wpdb->options, $change_type, $object_data );
					break;

				default:
					$result = new WP_Error( 'unsupported', 'Unsupported type.' );
					break;
			}

			if ( ! is_wp_error( $result ) ) {
				++$applied;
			}
		}

		return $applied;
	}
}
