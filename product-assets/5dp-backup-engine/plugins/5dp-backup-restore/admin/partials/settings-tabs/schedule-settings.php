<?php
/**
 * Schedule settings tab template.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin/partials/settings-tabs
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound
global $wpdb;
$schedules_table = $wpdb->prefix . 'fdpbr_schedules';
// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
$schedules = $wpdb->get_results( "SELECT * FROM {$schedules_table} ORDER BY created_at DESC" );
// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
?>
<div class="fdpbr-section-card">
	<div class="fdpbr-section-card__header">
		<div>
			<h2><?php esc_html_e( 'Backup Schedules', '5dp-backup-restore' ); ?></h2>
			<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Configure automated backup schedules.', '5dp-backup-restore' ); ?></p>
		</div>
		<button type="button" id="fdpbr-add-schedule" class="fdpbr-btn fdpbr-btn--primary fdpbr-btn--small">
			<span class="dashicons dashicons-plus" style="margin-top: 3px;"></span>
			<?php esc_html_e( 'Add Schedule', '5dp-backup-restore' ); ?>
		</button>
	</div>
	<div class="fdpbr-section-card__body" style="padding: 0;">
		<?php if ( empty( $schedules ) ) : ?>
			<div class="fdpbr-empty-state">
				<span class="dashicons dashicons-calendar-alt"></span>
				<p><?php esc_html_e( 'No schedules configured. Add one to automate your backups.', '5dp-backup-restore' ); ?></p>
			</div>
		<?php else : ?>
			<table class="fdpbr-backup-table">
				<thead>
					<tr>
						<th><?php esc_html_e( 'Name', '5dp-backup-restore' ); ?></th>
						<th><?php esc_html_e( 'Type', '5dp-backup-restore' ); ?></th>
						<th><?php esc_html_e( 'Frequency', '5dp-backup-restore' ); ?></th>
						<th><?php esc_html_e( 'Next Run', '5dp-backup-restore' ); ?></th>
						<th><?php esc_html_e( 'Status', '5dp-backup-restore' ); ?></th>
						<th><?php esc_html_e( 'Actions', '5dp-backup-restore' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php foreach ( $schedules as $schedule ) : ?>
						<tr data-schedule-id="<?php echo esc_attr( $schedule->id ); ?>">
							<td><strong><?php echo esc_html( $schedule->name ); ?></strong></td>
							<td><span class="fdpbr-badge"><?php echo esc_html( ucfirst( $schedule->type ) ); ?></span></td>
							<td><?php echo esc_html( ucfirst( $schedule->frequency ) ); ?></td>
							<td><?php echo $schedule->next_run ? esc_html( wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), strtotime( $schedule->next_run ) ) ) : '—'; ?></td>
							<td>
								<span class="fdpbr-badge <?php echo $schedule->is_active ? 'fdpbr-badge--success' : 'fdpbr-badge--inactive'; ?>">
									<?php echo $schedule->is_active ? esc_html__( 'Active', '5dp-backup-restore' ) : esc_html__( 'Paused', '5dp-backup-restore' ); ?>
								</span>
							</td>
							<td>
								<div class="fdpbr-row-actions">
									<button type="button" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small fdpbr-edit-schedule" data-id="<?php echo esc_attr( $schedule->id ); ?>"><?php esc_html_e( 'Edit', '5dp-backup-restore' ); ?></button>
									<button type="button" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small fdpbr-delete-schedule" data-id="<?php echo esc_attr( $schedule->id ); ?>"><?php esc_html_e( 'Delete', '5dp-backup-restore' ); ?></button>
								</div>
							</td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		<?php endif; ?>
	</div>
</div>
