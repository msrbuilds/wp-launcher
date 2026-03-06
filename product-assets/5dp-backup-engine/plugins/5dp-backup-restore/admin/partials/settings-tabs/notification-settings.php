<?php
/**
 * Notification settings tab template.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin/partials/settings-tabs
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound
$notif = isset( $settings['notifications'] ) ? $settings['notifications'] : array();
$defaults = FiveDPBR_Settings::get_defaults();
$notif = wp_parse_args( $notif, $defaults['notifications'] );
?>
<form class="fdpbr-settings-form" data-module="notifications">
	<?php wp_nonce_field( 'fdpbr_nonce', 'fdpbr_nonce_field' ); ?>

	<div class="fdpbr-section-card">
		<div class="fdpbr-section-card__header">
			<div>
				<h2><?php esc_html_e( 'Email Notifications', '5dp-backup-restore' ); ?></h2>
				<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Get notified about backup events.', '5dp-backup-restore' ); ?></p>
			</div>
			<label class="fdpbr-switch">
				<input type="checkbox" name="email_enabled" value="1" <?php checked( $notif['email_enabled'] ); ?>>
				<span class="fdpbr-switch__slider"></span>
			</label>
		</div>
		<div class="fdpbr-section-card__body">
			<div class="fdpbr-fields-stack">
				<div class="fdpbr-field">
					<label class="fdpbr-field__label"><?php esc_html_e( 'Email Recipients', '5dp-backup-restore' ); ?></label>
					<input type="text" name="email_recipients" class="fdpbr-input" value="<?php echo esc_attr( $notif['email_recipients'] ); ?>" placeholder="<?php echo esc_attr( get_option( 'admin_email' ) ); ?>">
					<p class="fdpbr-field__help"><?php esc_html_e( 'Comma-separated list of email addresses.', '5dp-backup-restore' ); ?></p>
				</div>

				<div class="fdpbr-feature-grid">
					<div class="fdpbr-feature-card">
						<div class="fdpbr-feature-card__icon fdpbr-feature-card__icon--success">
							<span class="dashicons dashicons-yes-alt"></span>
						</div>
						<div class="fdpbr-feature-card__info">
							<h3 class="fdpbr-feature-card__title"><?php esc_html_e( 'Backup Success', '5dp-backup-restore' ); ?></h3>
							<p class="fdpbr-feature-card__desc"><?php esc_html_e( 'Notify when backup completes.', '5dp-backup-restore' ); ?></p>
						</div>
						<label class="fdpbr-switch">
							<input type="checkbox" name="notify_on_success" value="1" <?php checked( $notif['notify_on_success'] ); ?>>
							<span class="fdpbr-switch__slider"></span>
						</label>
					</div>

					<div class="fdpbr-feature-card">
						<div class="fdpbr-feature-card__icon fdpbr-feature-card__icon--rose">
							<span class="dashicons dashicons-warning"></span>
						</div>
						<div class="fdpbr-feature-card__info">
							<h3 class="fdpbr-feature-card__title"><?php esc_html_e( 'Backup Failure', '5dp-backup-restore' ); ?></h3>
							<p class="fdpbr-feature-card__desc"><?php esc_html_e( 'Notify when backup fails.', '5dp-backup-restore' ); ?></p>
						</div>
						<label class="fdpbr-switch">
							<input type="checkbox" name="notify_on_failure" value="1" <?php checked( $notif['notify_on_failure'] ); ?>>
							<span class="fdpbr-switch__slider"></span>
						</label>
					</div>
				</div>
			</div>
		</div>
		<div class="fdpbr-section-card__footer">
			<button type="submit" class="fdpbr-btn fdpbr-btn--primary"><?php esc_html_e( 'Save Settings', '5dp-backup-restore' ); ?></button>
		</div>
	</div>
</form>
