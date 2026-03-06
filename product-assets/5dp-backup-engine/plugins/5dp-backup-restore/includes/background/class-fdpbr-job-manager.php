<?php
/**
 * Job queue manager.
 *
 * CRUD operations for the fdpbr_jobs table, stale job detection,
 * and progress reporting for the frontend.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/background
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Job_Manager
 *
 * @since 1.0.0
 */
class FiveDPBR_Job_Manager {

	/**
	 * Stale threshold in seconds (5 minutes).
	 *
	 * @var int
	 */
	const STALE_THRESHOLD = 300;

	/**
	 * Create a new job.
	 *
	 * @param array $args Job arguments.
	 * @return string|false Job ID or false on failure.
	 */
	public static function create_job( $args ) {
		global $wpdb;

		$job_id = self::generate_job_id();

		$defaults = array(
			'job_id'           => $job_id,
			'type'             => 'backup',
			'status'           => 'queued',
			'progress_percent' => 0,
			'current_step'     => __( 'Queued', '5dp-backup-restore' ),
			'data'             => '{}',
			'attempts'         => 0,
			'max_attempts'     => 3,
			'heartbeat'        => current_time( 'mysql', true ),
			'created_at'       => current_time( 'mysql', true ),
		);

		$data = wp_parse_args( $args, $defaults );
		$data['job_id'] = $job_id; // Ensure generated ID.

		if ( is_array( $data['data'] ) ) {
			$data['data'] = wp_json_encode( $data['data'] );
		}

		$table = $wpdb->prefix . 'fdpbr_jobs';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$inserted = $wpdb->insert(
			$table,
			$data,
			array( '%s', '%s', '%s', '%d', '%s', '%s', '%d', '%d', '%s', '%s' )
		);

		if ( ! $inserted ) {
			FiveDPBR_Logger::error( 'system', 'Failed to create job.', array( 'args' => $args ) );
			return false;
		}

		FiveDPBR_Logger::debug( 'system', sprintf( 'Job %s created (type: %s).', $job_id, $data['type'] ) );

		return $job_id;
	}

	/**
	 * Get a job by its job_id.
	 *
	 * @param string $job_id Job ID.
	 * @return object|null
	 */
	public static function get_job( $job_id ) {
		global $wpdb;

		$table = $wpdb->prefix . 'fdpbr_jobs';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		return $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE job_id = %s", $job_id )
		);
	}

	/**
	 * Update a job's fields.
	 *
	 * @param string $job_id Job ID.
	 * @param array  $data   Fields to update.
	 * @return bool
	 */
	public static function update_job( $job_id, $data ) {
		global $wpdb;

		$table = $wpdb->prefix . 'fdpbr_jobs';

		// Always update heartbeat.
		if ( ! isset( $data['heartbeat'] ) ) {
			$data['heartbeat'] = current_time( 'mysql', true );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$updated = $wpdb->update(
			$table,
			$data,
			array( 'job_id' => $job_id )
		);

		return false !== $updated;
	}

	/**
	 * Update heartbeat only.
	 *
	 * @param string $job_id Job ID.
	 * @return bool
	 */
	public static function heartbeat( $job_id ) {
		return self::update_job( $job_id, array(
			'heartbeat' => current_time( 'mysql', true ),
		) );
	}

	/**
	 * Delete a job.
	 *
	 * @param string $job_id Job ID.
	 * @return bool
	 */
	public static function delete_job( $job_id ) {
		global $wpdb;

		$table = $wpdb->prefix . 'fdpbr_jobs';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		return false !== $wpdb->delete( $table, array( 'job_id' => $job_id ), array( '%s' ) );
	}

	/**
	 * Get all jobs by status.
	 *
	 * @param string|array $status Status or array of statuses.
	 * @return array
	 */
	public static function get_jobs_by_status( $status ) {
		global $wpdb;

		$table = $wpdb->prefix . 'fdpbr_jobs';

		if ( is_array( $status ) ) {
			$placeholders = implode( ',', array_fill( 0, count( $status ), '%s' ) );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare
			return $wpdb->get_results(
				$wpdb->prepare( "SELECT * FROM {$table} WHERE status IN ({$placeholders}) ORDER BY created_at DESC", $status )
			);
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		return $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE status = %s ORDER BY created_at DESC", $status )
		);
	}

	/**
	 * Get active (running/queued) jobs.
	 *
	 * @return array
	 */
	public static function get_active_jobs() {
		return self::get_jobs_by_status( array( 'queued', 'running' ) );
	}

	/**
	 * Detect and handle stale jobs.
	 *
	 * A job is stale if its status is 'running' and its heartbeat is older
	 * than the stale threshold.
	 *
	 * @return int Number of stale jobs handled.
	 */
	public static function handle_stale_jobs() {
		global $wpdb;

		$table    = $wpdb->prefix . 'fdpbr_jobs';
		$cutoff   = gmdate( 'Y-m-d H:i:s', time() - self::STALE_THRESHOLD );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$stale_jobs = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE status = 'running' AND heartbeat < %s",
				$cutoff
			)
		);

		if ( empty( $stale_jobs ) ) {
			return 0;
		}

		$count = 0;

		foreach ( $stale_jobs as $job ) {
			$attempts = (int) $job->attempts + 1;

			if ( $attempts < (int) $job->max_attempts ) {
				// Retry: reset to queued.
				self::update_job( $job->job_id, array(
					'status'   => 'queued',
					'attempts' => $attempts,
				) );

				FiveDPBR_Logger::warning(
					'system',
					sprintf( 'Stale job %s reset to queued (attempt %d/%d).', $job->job_id, $attempts, $job->max_attempts )
				);
			} else {
				// Max attempts exceeded.
				self::update_job( $job->job_id, array(
					'status'       => 'failed',
					'attempts'     => $attempts,
					'current_step' => __( 'Failed: job became unresponsive.', '5dp-backup-restore' ),
				) );

				FiveDPBR_Logger::error(
					'system',
					sprintf( 'Stale job %s marked as failed after %d attempts.', $job->job_id, $attempts )
				);
			}

			++$count;
		}

		return $count;
	}

	/**
	 * Cancel a job.
	 *
	 * @param string $job_id Job ID.
	 * @return bool
	 */
	public static function cancel_job( $job_id ) {
		$job = self::get_job( $job_id );

		if ( ! $job || in_array( $job->status, array( 'completed', 'failed' ), true ) ) {
			return false;
		}

		self::update_job( $job_id, array(
			'status'       => 'cancelled',
			'current_step' => __( 'Cancelled by user.', '5dp-backup-restore' ),
		) );

		FiveDPBR_Logger::info( 'system', sprintf( 'Job %s cancelled.', $job_id ) );

		do_action( 'fdpbr_job_cancelled', $job_id );

		return true;
	}

	/**
	 * Clean up old completed/failed jobs.
	 *
	 * @param int $days Keep jobs newer than this many days. Default 7.
	 * @return int Number of deleted rows.
	 */
	public static function cleanup( $days = 7 ) {
		global $wpdb;

		$table  = $wpdb->prefix . 'fdpbr_jobs';
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - ( $days * DAY_IN_SECONDS ) );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$deleted = $wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$table} WHERE status IN ('completed', 'failed', 'cancelled') AND created_at < %s",
				$cutoff
			)
		);

		return (int) $deleted;
	}

	/**
	 * Generate a unique job ID.
	 *
	 * @return string
	 */
	private static function generate_job_id() {
		return 'fdpbr_' . bin2hex( random_bytes( 12 ) );
	}

	// =========================================================================
	// AJAX Handlers
	// =========================================================================

	/**
	 * Register AJAX handlers for job progress.
	 */
	public static function register_ajax_handlers() {
		add_action( 'wp_ajax_fdpbr_job_progress', array( __CLASS__, 'ajax_job_progress' ) );
		add_action( 'wp_ajax_fdpbr_cancel_job', array( __CLASS__, 'ajax_cancel_job' ) );
	}

	/**
	 * AJAX: Get job progress.
	 */
	public static function ajax_job_progress() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$job_id = isset( $_POST['job_id'] ) ? sanitize_text_field( wp_unslash( $_POST['job_id'] ) ) : '';
		$job    = self::get_job( $job_id );

		if ( ! $job ) {
			wp_send_json_error( array( 'message' => __( 'Job not found.', '5dp-backup-restore' ) ) );
		}

		wp_send_json_success( array(
			'job_id'  => $job->job_id,
			'type'    => $job->type,
			'status'  => $job->status,
			'percent' => (int) $job->progress_percent,
			'step'    => $job->current_step,
		) );
	}

	/**
	 * AJAX: Cancel a job.
	 */
	public static function ajax_cancel_job() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$job_id = isset( $_POST['job_id'] ) ? sanitize_text_field( wp_unslash( $_POST['job_id'] ) ) : '';

		if ( self::cancel_job( $job_id ) ) {
			wp_send_json_success( array( 'message' => __( 'Job cancelled.', '5dp-backup-restore' ) ) );
		} else {
			wp_send_json_error( array( 'message' => __( 'Could not cancel job.', '5dp-backup-restore' ) ) );
		}
	}
}
