<?php
/**
 * General settings tab template.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin/partials/settings-tabs
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound
$general = isset( $settings['general'] ) ? $settings['general'] : array();
$defaults = FiveDPBR_Settings::get_defaults();
$general = wp_parse_args( $general, $defaults['general'] );
?>
<form class="fdpbr-settings-form" data-module="general">
	<?php wp_nonce_field( 'fdpbr_nonce', 'fdpbr_nonce_field' ); ?>

	<div class="fdpbr-section-card">
		<div class="fdpbr-section-card__header">
			<div>
				<h2><?php esc_html_e( 'General Settings', '5dp-backup-restore' ); ?></h2>
				<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Configure default backup behavior.', '5dp-backup-restore' ); ?></p>
			</div>
		</div>
		<div class="fdpbr-section-card__body">
			<div class="fdpbr-fields-stack">
				<div class="fdpbr-field">
					<label class="fdpbr-field__label"><?php esc_html_e( 'Archive Chunk Size (MB)', '5dp-backup-restore' ); ?></label>
					<input type="number" name="chunk_size" class="fdpbr-input" value="<?php echo esc_attr( $general['chunk_size'] ); ?>" min="10" max="500" step="10">
					<p class="fdpbr-field__help"><?php esc_html_e( 'Large files are split into chunks of this size. Lower values work better on shared hosting.', '5dp-backup-restore' ); ?></p>
				</div>

				<div class="fdpbr-field">
					<label class="fdpbr-field__label"><?php esc_html_e( 'Database Batch Size (rows)', '5dp-backup-restore' ); ?></label>
					<input type="number" name="db_batch_size" class="fdpbr-input" value="<?php echo esc_attr( $general['db_batch_size'] ); ?>" min="500" max="50000" step="500">
					<p class="fdpbr-field__help"><?php esc_html_e( 'Number of database rows processed per batch. Lower values use less memory.', '5dp-backup-restore' ); ?></p>
				</div>

				<div class="fdpbr-field">
					<label class="fdpbr-field__label"><?php esc_html_e( 'Temp File Cleanup (hours)', '5dp-backup-restore' ); ?></label>
					<input type="number" name="temp_cleanup_hours" class="fdpbr-input" value="<?php echo esc_attr( $general['temp_cleanup_hours'] ); ?>" min="1" max="168">
					<p class="fdpbr-field__help"><?php esc_html_e( 'Automatically clean up temporary files after this many hours.', '5dp-backup-restore' ); ?></p>
				</div>

				<div class="fdpbr-field">
					<label class="fdpbr-field__label"><?php esc_html_e( 'Background Processing Method', '5dp-backup-restore' ); ?></label>
					<select name="background_method" class="fdpbr-select">
						<option value="auto" <?php selected( $general['background_method'], 'auto' ); ?>><?php esc_html_e( 'Auto-detect (Recommended)', '5dp-backup-restore' ); ?></option>
						<option value="action_scheduler" <?php selected( $general['background_method'], 'action_scheduler' ); ?>><?php esc_html_e( 'Action Scheduler', '5dp-backup-restore' ); ?></option>
						<option value="wp_cron" <?php selected( $general['background_method'], 'wp_cron' ); ?>><?php esc_html_e( 'WP Cron', '5dp-backup-restore' ); ?></option>
						<option value="ajax" <?php selected( $general['background_method'], 'ajax' ); ?>><?php esc_html_e( 'AJAX Polling', '5dp-backup-restore' ); ?></option>
					</select>
				</div>
			</div>
		</div>
		<div class="fdpbr-section-card__footer">
			<button type="submit" class="fdpbr-btn fdpbr-btn--primary"><?php esc_html_e( 'Save Settings', '5dp-backup-restore' ); ?></button>
		</div>
	</div>
</form>
