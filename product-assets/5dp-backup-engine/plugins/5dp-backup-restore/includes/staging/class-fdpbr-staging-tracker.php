<?php
/**
 * Staging change tracker.
 *
 * Hooks into WordPress actions to log changes made on both the live
 * and staging sites. Tracks post, option, nav menu, and file changes
 * for bidirectional synchronization.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/staging
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Staging_Tracker
 *
 * @since 1.0.0
 */
class FiveDPBR_Staging_Tracker {

	/**
	 * Options to skip when tracking changes.
	 *
	 * Transients, cron, and other internal/volatile options are excluded
	 * because they are not meaningful for staging sync.
	 *
	 * @var array
	 */
	private static $skip_options = array(
		'_transient_',
		'_site_transient_',
		'siteurl',
		'home',
		'cron',
		'rewrite_rules',
		'db_version',
		'db_upgraded',
		'recently_activated',
		'active_plugins',
		'uninstall_plugins',
		'fdpbr_',
		'auto_updater.',
		'recovery_mode_',
		'action_scheduler_',
	);

	/**
	 * Initialize change tracking hooks.
	 *
	 * Registers WordPress action hooks for tracking content and settings
	 * changes. Only activates when at least one staging site is active.
	 */
	public static function init() {
		// Only track changes if there is an active staging site.
		if ( ! self::has_active_staging() ) {
			return;
		}

		// Post changes.
		add_action( 'save_post', array( __CLASS__, 'on_post_change' ), 10, 3 );
		add_action( 'delete_post', array( __CLASS__, 'on_post_delete' ), 10, 1 );

		// Option changes.
		add_action( 'updated_option', array( __CLASS__, 'on_option_change' ), 10, 3 );
		add_action( 'added_option', array( __CLASS__, 'on_option_add' ), 10, 2 );
		add_action( 'deleted_option', array( __CLASS__, 'on_option_delete' ), 10, 1 );

		// Nav menu changes.
		add_action( 'wp_update_nav_menu', array( __CLASS__, 'on_nav_menu_change' ), 10, 2 );
		add_action( 'wp_delete_nav_menu', array( __CLASS__, 'on_nav_menu_delete' ), 10, 1 );

		// Term changes.
		add_action( 'created_term', array( __CLASS__, 'on_term_change' ), 10, 3 );
		add_action( 'edited_term', array( __CLASS__, 'on_term_change' ), 10, 3 );
		add_action( 'delete_term', array( __CLASS__, 'on_term_delete' ), 10, 4 );

		// Widget changes.
		add_action( 'update_option_sidebars_widgets', array( __CLASS__, 'on_widget_change' ), 10, 2 );

		FiveDPBR_Logger::debug( 'staging', 'Change tracking hooks initialized.' );
	}

	/**
	 * Handle post save or update.
	 *
	 * Logs post creation or update to the change log with a JSON diff
	 * of the post data.
	 *
	 * @param int     $post_id Post ID.
	 * @param WP_Post $post    Post object.
	 * @param bool    $update  Whether this is an update.
	 */
	public static function on_post_change( $post_id, $post, $update ) {
		// Skip auto-saves and revisions.
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}

		if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
			return;
		}

		// Skip certain post types.
		$skip_types = array( 'revision', 'auto-draft', 'customize_changeset', 'oembed_cache' );
		if ( in_array( $post->post_type, $skip_types, true ) ) {
			return;
		}

		$change_type = $update ? 'update' : 'create';
		$source      = self::get_current_source();

		// Build a JSON diff of the post data.
		$object_data = array(
			'post_title'   => $post->post_title,
			'post_content' => $post->post_content,
			'post_excerpt' => $post->post_excerpt,
			'post_status'  => $post->post_status,
			'post_type'    => $post->post_type,
			'post_name'    => $post->post_name,
			'post_parent'  => $post->post_parent,
			'menu_order'   => $post->menu_order,
			'post_date'    => $post->post_date,
			'post_author'  => $post->post_author,
		);

		// Include post meta.
		$meta = get_post_meta( $post_id );
		if ( ! empty( $meta ) ) {
			$filtered_meta = array();
			foreach ( $meta as $key => $values ) {
				// Skip internal meta keys.
				if ( strpos( $key, '_edit_' ) === 0 || strpos( $key, '_wp_' ) === 0 ) {
					continue;
				}
				$filtered_meta[ $key ] = $values;
			}
			if ( ! empty( $filtered_meta ) ) {
				$object_data['meta'] = $filtered_meta;
			}
		}

		self::log_change( $change_type, 'post', $post_id, $object_data, $source );
	}

	/**
	 * Handle post deletion.
	 *
	 * @param int $post_id Post ID.
	 */
	public static function on_post_delete( $post_id ) {
		if ( wp_is_post_revision( $post_id ) ) {
			return;
		}

		$post = get_post( $post_id );

		if ( ! $post ) {
			return;
		}

		$skip_types = array( 'revision', 'auto-draft', 'customize_changeset', 'oembed_cache' );
		if ( in_array( $post->post_type, $skip_types, true ) ) {
			return;
		}

		$source      = self::get_current_source();
		$object_data = array(
			'post_title' => $post->post_title,
			'post_type'  => $post->post_type,
		);

		self::log_change( 'delete', 'post', $post_id, $object_data, $source );
	}

	/**
	 * Handle option update.
	 *
	 * Logs option changes to the change log, skipping transients
	 * and internal options that are not meaningful for staging sync.
	 *
	 * @param string $option    Option name.
	 * @param mixed  $old_value Previous value.
	 * @param mixed  $value     New value.
	 */
	public static function on_option_change( $option, $old_value, $value ) {
		if ( self::should_skip_option( $option ) ) {
			return;
		}

		$source      = self::get_current_source();
		$object_data = array(
			'option_name'  => $option,
			'option_value' => maybe_serialize( $value ),
		);

		self::log_change( 'update', 'option', 0, $object_data, $source );
	}

	/**
	 * Handle option addition.
	 *
	 * @param string $option Option name.
	 * @param mixed  $value  Option value.
	 */
	public static function on_option_add( $option, $value ) {
		if ( self::should_skip_option( $option ) ) {
			return;
		}

		$source      = self::get_current_source();
		$object_data = array(
			'option_name'  => $option,
			'option_value' => maybe_serialize( $value ),
		);

		self::log_change( 'create', 'option', 0, $object_data, $source );
	}

	/**
	 * Handle option deletion.
	 *
	 * @param string $option Option name.
	 */
	public static function on_option_delete( $option ) {
		if ( self::should_skip_option( $option ) ) {
			return;
		}

		$source      = self::get_current_source();
		$object_data = array(
			'option_name' => $option,
		);

		self::log_change( 'delete', 'option', 0, $object_data, $source );
	}

	/**
	 * Handle nav menu update.
	 *
	 * @param int   $menu_id   Menu ID.
	 * @param array $menu_data Menu data (optional).
	 */
	public static function on_nav_menu_change( $menu_id, $menu_data = array() ) {
		$source      = self::get_current_source();
		$object_data = array(
			'menu_id' => $menu_id,
		);

		if ( ! empty( $menu_data ) ) {
			$object_data['menu_data'] = $menu_data;
		}

		// Get menu items.
		$items = wp_get_nav_menu_items( $menu_id );
		if ( $items ) {
			$object_data['items_count'] = count( $items );
		}

		self::log_change( 'update', 'nav_menu', $menu_id, $object_data, $source );
	}

	/**
	 * Handle nav menu deletion.
	 *
	 * @param int $menu_id Menu ID.
	 */
	public static function on_nav_menu_delete( $menu_id ) {
		$source      = self::get_current_source();
		$object_data = array(
			'menu_id' => $menu_id,
		);

		self::log_change( 'delete', 'nav_menu', $menu_id, $object_data, $source );
	}

	/**
	 * Handle term creation or edit.
	 *
	 * @param int    $term_id  Term ID.
	 * @param int    $tt_id    Term taxonomy ID.
	 * @param string $taxonomy Taxonomy slug.
	 */
	public static function on_term_change( $term_id, $tt_id, $taxonomy ) {
		$term = get_term( $term_id, $taxonomy );

		if ( ! $term || is_wp_error( $term ) ) {
			return;
		}

		$source      = self::get_current_source();
		$object_data = array(
			'name'        => $term->name,
			'slug'        => $term->slug,
			'taxonomy'    => $taxonomy,
			'description' => $term->description,
			'parent'      => $term->parent,
		);

		self::log_change( 'update', 'term', $term_id, $object_data, $source );
	}

	/**
	 * Handle term deletion.
	 *
	 * @param int    $term_id      Term ID.
	 * @param int    $tt_id        Term taxonomy ID.
	 * @param string $taxonomy     Taxonomy slug.
	 * @param mixed  $deleted_term Deleted term object or WP_Error.
	 */
	public static function on_term_delete( $term_id, $tt_id, $taxonomy, $deleted_term ) {
		$source      = self::get_current_source();
		$object_data = array(
			'taxonomy' => $taxonomy,
		);

		if ( ! is_wp_error( $deleted_term ) && is_object( $deleted_term ) ) {
			$object_data['name'] = $deleted_term->name;
			$object_data['slug'] = $deleted_term->slug;
		}

		self::log_change( 'delete', 'term', $term_id, $object_data, $source );
	}

	/**
	 * Handle widget/sidebar changes.
	 *
	 * @param mixed $old_value Previous sidebar widgets value.
	 * @param mixed $value     New sidebar widgets value.
	 */
	public static function on_widget_change( $old_value, $value ) {
		$source      = self::get_current_source();
		$object_data = array(
			'option_name'  => 'sidebars_widgets',
			'option_value' => maybe_serialize( $value ),
		);

		self::log_change( 'update', 'option', 0, $object_data, $source );
	}

	/**
	 * Track file changes between live and staging.
	 *
	 * Compares file hashes in key directories (themes, plugins, uploads)
	 * between the live site and the staging copy. Records any differences
	 * in the change log.
	 *
	 * @param int $staging_id Staging site ID.
	 * @return array|WP_Error Array with added, modified, deleted counts, or error.
	 */
	public static function track_file_changes( $staging_id ) {
		$staging = FiveDPBR_Staging_Engine::get_staging_site( $staging_id );

		if ( ! $staging ) {
			return new WP_Error( 'not_found', __( 'Staging site not found.', '5dp-backup-restore' ) );
		}

		$staging_dir = trailingslashit( wp_normalize_path( $staging->staging_dir ) );
		$live_dir    = trailingslashit( wp_normalize_path( WP_CONTENT_DIR ) );

		$dirs_to_check = array( 'themes', 'plugins', 'uploads' );
		$source        = self::get_current_source();

		$report = array(
			'added'    => 0,
			'modified' => 0,
			'deleted'  => 0,
		);

		foreach ( $dirs_to_check as $dir ) {
			$live_path    = $live_dir . $dir;
			$staging_path = $staging_dir . $dir;

			if ( ! is_dir( $live_path ) || ! is_dir( $staging_path ) ) {
				continue;
			}

			$live_hashes    = self::hash_directory( $live_path, $live_dir );
			$staging_hashes = self::hash_directory( $staging_path, $staging_dir );

			// Files in live but not in staging (added on live side).
			foreach ( $live_hashes as $file => $hash ) {
				if ( ! isset( $staging_hashes[ $file ] ) ) {
					self::log_change( 'create', 'file', 0, array(
						'file_path' => $file,
						'hash'      => $hash,
						'directory' => $dir,
					), 'live' );

					++$report['added'];
				} elseif ( $staging_hashes[ $file ] !== $hash ) {
					// File exists on both sides but differs.
					self::log_change( 'update', 'file', 0, array(
						'file_path'    => $file,
						'live_hash'    => $hash,
						'staging_hash' => $staging_hashes[ $file ],
						'directory'    => $dir,
					), $source );

					++$report['modified'];
				}
			}

			// Files in staging but not in live (added on staging side).
			foreach ( $staging_hashes as $file => $hash ) {
				if ( ! isset( $live_hashes[ $file ] ) ) {
					self::log_change( 'create', 'file', 0, array(
						'file_path' => $file,
						'hash'      => $hash,
						'directory' => $dir,
					), 'staging' );

					++$report['added'];
				}
			}
		}

		FiveDPBR_Logger::info(
			'staging',
			sprintf(
				'File change tracking: %d added, %d modified, %d deleted.',
				$report['added'],
				$report['modified'],
				$report['deleted']
			)
		);

		return $report;
	}

	/**
	 * Get changes from the change log with optional filters.
	 *
	 * @param int    $staging_id Staging site ID.
	 * @param string $source     Source filter ('live' or 'staging'). Empty for all.
	 * @param string $since      Only return changes after this datetime (MySQL format).
	 * @return array Array of change log entries.
	 */
	public static function get_changes( $staging_id, $source = '', $since = '' ) {
		global $wpdb;

		$table  = $wpdb->prefix . 'fdpbr_change_log';
		$where  = array( 'staging_id = %d' );
		$values = array( $staging_id );

		if ( ! empty( $source ) ) {
			$where[]  = 'source = %s';
			$values[] = $source;
		}

		if ( ! empty( $since ) ) {
			$where[]  = 'detected_at > %s';
			$values[] = $since;
		}

		$where_sql = implode( ' AND ', $where );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$results = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE {$where_sql} ORDER BY detected_at ASC",
				$values
			)
		);

		return $results ? $results : array();
	}

	/**
	 * Clear synced changes for a staging site.
	 *
	 * Removes all change log entries for the specified staging site
	 * that have already been synced.
	 *
	 * @param int $staging_id Staging site ID.
	 * @return int Number of deleted rows.
	 */
	/**
	 * Mark all pending changes as synced for a staging site.
	 *
	 * @param int    $staging_id    Staging site ID.
	 * @param string $table_prefix  Optional table prefix override.
	 * @return int Number of updated rows.
	 */
	public static function mark_all_synced( $staging_id, $table_prefix = '' ) {
		global $wpdb;

		$prefix = ! empty( $table_prefix ) ? $table_prefix : $wpdb->prefix;
		$table  = $prefix . 'fdpbr_change_log';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$updated = $wpdb->query(
			$wpdb->prepare(
				"UPDATE {$table} SET synced = 1 WHERE staging_id = %d AND synced = 0",
				$staging_id
			)
		);

		return (int) $updated;
	}

	public static function clear_changes( $staging_id ) {
		global $wpdb;

		$table = $wpdb->prefix . 'fdpbr_change_log';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$deleted = $wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$table} WHERE staging_id = %d AND synced = 1",
				$staging_id
			)
		);

		if ( $deleted > 0 ) {
			FiveDPBR_Logger::debug(
				'staging',
				sprintf( 'Cleared %d synced changes for staging %d.', $deleted, $staging_id )
			);
		}

		return (int) $deleted;
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	/**
	 * Check if there are any active staging sites.
	 *
	 * @return bool
	 */
	private static function has_active_staging() {
		global $wpdb;

		$table = $wpdb->prefix . 'fdpbr_staging';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$count = $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE status = 'active'" );

		return ( (int) $count > 0 );
	}

	/**
	 * Get the current source identifier.
	 *
	 * Returns 'staging' if running within a staging context,
	 * otherwise returns 'live'.
	 *
	 * @return string 'live' or 'staging'.
	 */
	private static function get_current_source() {
		if ( defined( 'FDPBR_IS_STAGING' ) && FDPBR_IS_STAGING ) {
			return 'staging';
		}

		return 'live';
	}

	/**
	 * Get the active staging site ID.
	 *
	 * If on a staging site, returns the staging ID from the constant.
	 * Otherwise, returns the first active staging site ID.
	 *
	 * @return int Staging site ID, or 0 if none.
	 */
	private static function get_active_staging_id() {
		global $wpdb;

		$table = $wpdb->prefix . 'fdpbr_staging';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$staging = $wpdb->get_row( "SELECT id FROM {$table} WHERE status = 'active' ORDER BY id ASC LIMIT 1" );

		return $staging ? (int) $staging->id : 0;
	}

	/**
	 * Check whether an option should be skipped for change tracking.
	 *
	 * @param string $option Option name.
	 * @return bool True if the option should be skipped.
	 */
	private static function should_skip_option( $option ) {
		foreach ( self::$skip_options as $prefix ) {
			if ( strpos( $option, $prefix ) === 0 ) {
				return true;
			}
		}

		// Skip prefix-dependent options like wp_user_roles, stg2_user_roles, etc.
		if ( preg_match( '/^[a-z0-9]+_user_roles$/', $option ) ) {
			return true;
		}

		return false;
	}

	/**
	 * Log a change to the change log table.
	 *
	 * @param string $change_type Change type (create, update, delete).
	 * @param string $object_type Object type (post, option, term, nav_menu, file).
	 * @param int    $object_id   Object ID (0 for options and files).
	 * @param array  $object_data Object data as associative array.
	 * @param string $source      Source ('live' or 'staging').
	 */
	private static function log_change( $change_type, $object_type, $object_id, $object_data, $source ) {
		global $wpdb;

		$staging_id = self::get_active_staging_id();

		if ( ! $staging_id ) {
			return;
		}

		$table = $wpdb->prefix . 'fdpbr_change_log';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$wpdb->insert(
			$table,
			array(
				'staging_id'  => $staging_id,
				'source'      => $source,
				'change_type' => $change_type,
				'object_type' => $object_type,
				'object_id'   => $object_id,
				'object_data' => wp_json_encode( $object_data ),
				'synced'      => 0,
				'detected_at' => current_time( 'mysql', true ),
			),
			array( '%d', '%s', '%s', '%s', '%d', '%s', '%d', '%s' )
		);
	}

	/**
	 * Generate MD5 hashes for all files in a directory.
	 *
	 * @param string $directory   Directory to hash.
	 * @param string $base_dir    Base directory for relative paths.
	 * @return array Associative array of relative_path => md5_hash.
	 */
	private static function hash_directory( $directory, $base_dir ) {
		$hashes    = array();
		$directory = trailingslashit( wp_normalize_path( $directory ) );
		$base_dir  = trailingslashit( wp_normalize_path( $base_dir ) );

		try {
			$iterator = new RecursiveIteratorIterator(
				new RecursiveDirectoryIterator(
					$directory,
					RecursiveDirectoryIterator::SKIP_DOTS
				),
				RecursiveIteratorIterator::SELF_FIRST
			);

			foreach ( $iterator as $file ) {
				if ( ! $file->isFile() ) {
					continue;
				}

				$full_path = wp_normalize_path( $file->getPathname() );
				$relative  = str_replace( $base_dir, '', $full_path );

				// Skip very large files to avoid memory issues.
				if ( $file->getSize() > 50 * 1024 * 1024 ) {
					continue;
				}

				$hashes[ $relative ] = md5_file( $full_path );
			}
		} catch ( \Exception $e ) {
			FiveDPBR_Logger::warning(
				'staging',
				sprintf( 'File hash error in %s: %s', $directory, $e->getMessage() )
			);
		}

		return $hashes;
	}
}
