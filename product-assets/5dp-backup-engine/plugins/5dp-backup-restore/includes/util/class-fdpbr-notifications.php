<?php
/**
 * Email notifications.
 *
 * Sends notification emails for backup completion, failure, etc.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/util
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Notifications
 *
 * @since 1.0.0
 */
class FiveDPBR_Notifications {

	/**
	 * Initialize notification hooks.
	 */
	public static function init() {
		add_action( 'fdpbr_job_completed', array( __CLASS__, 'on_job_completed' ), 10, 3 );
		add_action( 'fdpbr_job_failed', array( __CLASS__, 'on_job_failed' ), 10, 3 );
	}

	/**
	 * Handle job completion.
	 *
	 * @param string $job_id Job ID.
	 * @param string $action Action type.
	 * @param array  $data   Job data.
	 */
	public static function on_job_completed( $job_id, $action, $data ) {
		$settings = self::get_settings();

		if ( empty( $settings['enable_notifications'] ) || '1' !== $settings['enable_notifications'] ) {
			return;
		}

		if ( empty( $settings['notify_success'] ) || '1' !== $settings['notify_success'] ) {
			return;
		}

		$type    = isset( $data['type'] ) ? $data['type'] : 'backup';
		$subject = sprintf(
			/* translators: 1: Type (Backup/Restore), 2: Site name */
			__( '[%2$s] %1$s Completed Successfully', '5dp-backup-restore' ),
			ucfirst( $type ),
			get_bloginfo( 'name' )
		);

		$message = sprintf(
			/* translators: 1: Type, 2: Job ID, 3: Site URL */
			__( "Your %1\$s has completed successfully.\n\nJob ID: %2\$s\nSite: %3\$s\nTime: %4\$s", '5dp-backup-restore' ),
			$type,
			$job_id,
			home_url(),
			current_time( 'mysql' )
		);

		self::send( $subject, $message );
	}

	/**
	 * Handle job failure.
	 *
	 * @param string   $job_id Job ID.
	 * @param string   $action Action type.
	 * @param WP_Error $error  The error.
	 */
	public static function on_job_failed( $job_id, $action, $error ) {
		$settings = self::get_settings();

		if ( empty( $settings['enable_notifications'] ) || '1' !== $settings['enable_notifications'] ) {
			return;
		}

		if ( empty( $settings['notify_failure'] ) || '1' !== $settings['notify_failure'] ) {
			return;
		}

		$subject = sprintf(
			/* translators: %s: Site name */
			__( '[%s] Backup Job Failed', '5dp-backup-restore' ),
			get_bloginfo( 'name' )
		);

		$error_msg = is_wp_error( $error ) ? $error->get_error_message() : __( 'Unknown error', '5dp-backup-restore' );

		$message = sprintf(
			/* translators: 1: Job ID, 2: Error message, 3: Site URL */
			__( "A backup job has failed.\n\nJob ID: %1\$s\nError: %2\$s\nSite: %3\$s\nTime: %4\$s\n\nPlease check the logs for more details.", '5dp-backup-restore' ),
			$job_id,
			$error_msg,
			home_url(),
			current_time( 'mysql' )
		);

		self::send( $subject, $message );
	}

	/**
	 * Send a notification email.
	 *
	 * @param string $subject Email subject.
	 * @param string $message Email body.
	 * @return bool
	 */
	public static function send( $subject, $message ) {
		$settings   = self::get_settings();
		$recipients = self::get_recipients( $settings );

		if ( empty( $recipients ) ) {
			return false;
		}

		$headers = array( 'Content-Type: text/plain; charset=UTF-8' );

		return wp_mail( $recipients, $subject, $message, $headers );
	}

	/**
	 * Get notification recipients.
	 *
	 * @param array $settings Plugin settings.
	 * @return array Email addresses.
	 */
	private static function get_recipients( $settings ) {
		if ( empty( $settings['notification_recipients'] ) ) {
			return array( get_option( 'admin_email' ) );
		}

		$emails = array_map( 'trim', explode( ',', $settings['notification_recipients'] ) );
		return array_filter( $emails, 'is_email' );
	}

	/**
	 * Get notification settings.
	 *
	 * @return array
	 */
	private static function get_settings() {
		return get_option( 'fdpbr_settings', array() );
	}
}
