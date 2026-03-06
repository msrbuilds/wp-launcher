<?php
/**
 * Advanced settings tab template.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin/partials/settings-tabs
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound
$advanced = isset( $settings['advanced'] ) ? $settings['advanced'] : array();
$defaults = FiveDPBR_Settings::get_defaults();
$advanced = wp_parse_args( $advanced, $defaults['advanced'] );
?>
<form class="fdpbr-settings-form" data-module="advanced">
	<?php wp_nonce_field( 'fdpbr_nonce', 'fdpbr_nonce_field' ); ?>

	<div class="fdpbr-section-card">
		<div class="fdpbr-section-card__header">
			<div>
				<h2><?php esc_html_e( 'Advanced Settings', '5dp-backup-restore' ); ?></h2>
				<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Debug mode, exclusions, and performance tuning.', '5dp-backup-restore' ); ?></p>
			</div>
		</div>
		<div class="fdpbr-section-card__body">
			<div class="fdpbr-fields-stack">

				<div class="fdpbr-feature-card">
					<div class="fdpbr-feature-card__icon fdpbr-feature-card__icon--amber">
						<span class="dashicons dashicons-admin-tools"></span>
					</div>
					<div class="fdpbr-feature-card__info">
						<h3 class="fdpbr-feature-card__title"><?php esc_html_e( 'Debug Mode', '5dp-backup-restore' ); ?></h3>
						<p class="fdpbr-feature-card__desc"><?php esc_html_e( 'Enable verbose logging for troubleshooting.', '5dp-backup-restore' ); ?></p>
					</div>
					<label class="fdpbr-switch">
						<input type="checkbox" name="debug_mode" value="1" <?php checked( $advanced['debug_mode'] ); ?>>
						<span class="fdpbr-switch__slider"></span>
					</label>
				</div>

				<div class="fdpbr-field">
					<label class="fdpbr-field__label"><?php esc_html_e( 'Max Execution Time Override (seconds)', '5dp-backup-restore' ); ?></label>
					<input type="number" name="max_execution_time" class="fdpbr-input" value="<?php echo esc_attr( $advanced['max_execution_time'] ); ?>" min="0" max="600">
					<p class="fdpbr-field__help"><?php esc_html_e( '0 = auto-detect from server. Only change if you know what you are doing.', '5dp-backup-restore' ); ?></p>
				</div>

				<div class="fdpbr-field">
					<label class="fdpbr-field__label"><?php esc_html_e( 'Exclude Paths', '5dp-backup-restore' ); ?></label>
					<textarea name="exclude_paths" class="fdpbr-textarea" rows="4" placeholder="wp-content/cache&#10;wp-content/uploads/large-files"><?php echo esc_textarea( is_array( $advanced['exclude_paths'] ) ? implode( "\n", $advanced['exclude_paths'] ) : '' ); ?></textarea>
					<p class="fdpbr-field__help"><?php esc_html_e( 'One path per line, relative to WordPress root. These paths will be excluded from file backups.', '5dp-backup-restore' ); ?></p>
				</div>

				<div class="fdpbr-field">
					<label class="fdpbr-field__label"><?php esc_html_e( 'Exclude Database Tables', '5dp-backup-restore' ); ?></label>
					<textarea name="exclude_tables" class="fdpbr-textarea" rows="3" placeholder="wp_actionscheduler_logs&#10;wp_actionscheduler_actions"><?php echo esc_textarea( is_array( $advanced['exclude_tables'] ) ? implode( "\n", $advanced['exclude_tables'] ) : '' ); ?></textarea>
					<p class="fdpbr-field__help"><?php esc_html_e( 'One table name per line. These tables will be excluded from database backups.', '5dp-backup-restore' ); ?></p>
				</div>
			</div>
		</div>
		<div class="fdpbr-section-card__footer">
			<button type="submit" class="fdpbr-btn fdpbr-btn--primary"><?php esc_html_e( 'Save Settings', '5dp-backup-restore' ); ?></button>
		</div>
	</div>
</form>
