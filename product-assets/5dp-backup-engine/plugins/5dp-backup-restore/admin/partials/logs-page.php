<?php
/**
 * Logs page template.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin/partials
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound
global $wpdb;
$logs_table = $wpdb->prefix . 'fdpbr_logs';

$filter_level   = isset( $_GET['level'] ) ? sanitize_key( $_GET['level'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
$filter_context = isset( $_GET['context'] ) ? sanitize_key( $_GET['context'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

$where = '1=1';
$args  = array();

if ( $filter_level ) {
	$where .= ' AND level = %s';
	$args[] = $filter_level;
}
if ( $filter_context ) {
	$where .= ' AND context = %s';
	$args[] = $filter_context;
}

// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
if ( ! empty( $args ) ) {
	$logs = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$logs_table} WHERE {$where} ORDER BY created_at DESC LIMIT 100", ...$args ) );
} else {
	$logs = $wpdb->get_results( "SELECT * FROM {$logs_table} ORDER BY created_at DESC LIMIT 100" );
}
// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
?>
<div class="fdpbr-app">
	<?php include FDPBR_PLUGIN_DIR . 'admin/partials/header-nav.php'; ?>

	<div class="fdpbr-content">

		<div class="fdpbr-section-card">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Activity Log', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc"><?php esc_html_e( 'View recent plugin activity and debug information.', '5dp-backup-restore' ); ?></p>
				</div>
				<div style="display: flex; gap: 8px;">
					<select class="fdpbr-select" id="fdpbr-log-level-filter" onchange="location.href=this.value">
						<option value="<?php echo esc_url( remove_query_arg( 'level' ) ); ?>" <?php selected( '', $filter_level ); ?>><?php esc_html_e( 'All Levels', '5dp-backup-restore' ); ?></option>
						<option value="<?php echo esc_url( add_query_arg( 'level', 'info' ) ); ?>" <?php selected( 'info', $filter_level ); ?>><?php esc_html_e( 'Info', '5dp-backup-restore' ); ?></option>
						<option value="<?php echo esc_url( add_query_arg( 'level', 'warning' ) ); ?>" <?php selected( 'warning', $filter_level ); ?>><?php esc_html_e( 'Warning', '5dp-backup-restore' ); ?></option>
						<option value="<?php echo esc_url( add_query_arg( 'level', 'error' ) ); ?>" <?php selected( 'error', $filter_level ); ?>><?php esc_html_e( 'Error', '5dp-backup-restore' ); ?></option>
					</select>
					<select class="fdpbr-select" id="fdpbr-log-context-filter" onchange="location.href=this.value">
						<option value="<?php echo esc_url( remove_query_arg( 'context' ) ); ?>" <?php selected( '', $filter_context ); ?>><?php esc_html_e( 'All Contexts', '5dp-backup-restore' ); ?></option>
						<option value="<?php echo esc_url( add_query_arg( 'context', 'backup' ) ); ?>" <?php selected( 'backup', $filter_context ); ?>><?php esc_html_e( 'Backup', '5dp-backup-restore' ); ?></option>
						<option value="<?php echo esc_url( add_query_arg( 'context', 'restore' ) ); ?>" <?php selected( 'restore', $filter_context ); ?>><?php esc_html_e( 'Restore', '5dp-backup-restore' ); ?></option>
						<option value="<?php echo esc_url( add_query_arg( 'context', 'migration' ) ); ?>" <?php selected( 'migration', $filter_context ); ?>><?php esc_html_e( 'Migration', '5dp-backup-restore' ); ?></option>
						<option value="<?php echo esc_url( add_query_arg( 'context', 'staging' ) ); ?>" <?php selected( 'staging', $filter_context ); ?>><?php esc_html_e( 'Staging', '5dp-backup-restore' ); ?></option>
						<option value="<?php echo esc_url( add_query_arg( 'context', 'storage' ) ); ?>" <?php selected( 'storage', $filter_context ); ?>><?php esc_html_e( 'Storage', '5dp-backup-restore' ); ?></option>
					</select>
				</div>
			</div>
			<div class="fdpbr-section-card__body" style="padding: 0;">
				<?php if ( empty( $logs ) ) : ?>
					<div class="fdpbr-empty-state">
						<span class="dashicons dashicons-list-view"></span>
						<p><?php esc_html_e( 'No log entries yet.', '5dp-backup-restore' ); ?></p>
					</div>
				<?php else : ?>
					<table class="fdpbr-backup-table">
						<thead>
							<tr>
								<th><?php esc_html_e( 'Level', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Context', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Message', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Date', '5dp-backup-restore' ); ?></th>
							</tr>
						</thead>
						<tbody>
							<?php foreach ( $logs as $log ) :
								$level_class = 'fdpbr-badge--inactive';
								if ( 'error' === $log->level ) {
									$level_class = 'fdpbr-badge--danger';
								} elseif ( 'warning' === $log->level ) {
									$level_class = 'fdpbr-badge--warning';
								} elseif ( 'info' === $log->level ) {
									$level_class = 'fdpbr-badge--success';
								}
							?>
								<tr class="fdpbr-log-entry fdpbr-log-entry--<?php echo esc_attr( $log->level ); ?>">
									<td><span class="fdpbr-badge <?php echo esc_attr( $level_class ); ?>"><?php echo esc_html( ucfirst( $log->level ) ); ?></span></td>
									<td><span class="fdpbr-badge"><?php echo esc_html( ucfirst( $log->context ) ); ?></span></td>
									<td><?php echo esc_html( $log->message ); ?></td>
									<td><?php echo esc_html( wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), strtotime( $log->created_at ) ) ); ?></td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>
			</div>
		</div>

	</div>
</div>
