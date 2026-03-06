<?php
/**
 * Fired during plugin deactivation.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Deactivator
 *
 * Cleans up scheduled events on deactivation.
 *
 * @since 1.0.0
 */
class FiveDPBR_Deactivator {

	/**
	 * Run deactivation routines.
	 *
	 * @since 1.0.0
	 */
	public static function deactivate() {
		// Clear all scheduled cron events.
		$cron_hooks = array(
			'fdpbr_scheduled_backup',
			'fdpbr_process_job',
			'fdpbr_cleanup_temp',
			'fdpbr_stale_job_check',
		);

		foreach ( $cron_hooks as $hook ) {
			$timestamp = wp_next_scheduled( $hook );
			if ( $timestamp ) {
				wp_unschedule_event( $timestamp, $hook );
			}
		}

		// Clear all cron events for these hooks.
		foreach ( $cron_hooks as $hook ) {
			wp_clear_scheduled_hook( $hook );
		}
	}
}
