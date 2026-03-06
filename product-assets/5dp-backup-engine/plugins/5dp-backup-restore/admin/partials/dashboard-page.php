<?php
/**
 * Dashboard page template.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin/partials
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound -- Template partial loaded within class method scope.
$settings = get_option( FiveDPBR_Settings::OPTION_NAME, FiveDPBR_Settings::get_defaults() );

// Gather stats.
global $wpdb;
$backups_table   = $wpdb->prefix . 'fdpbr_backups';
$schedules_table = $wpdb->prefix . 'fdpbr_schedules';
$staging_table   = $wpdb->prefix . 'fdpbr_staging';

// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Dashboard stats; caching not needed for admin-only page.
$total_backups    = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$backups_table}" );
$last_backup      = $wpdb->get_row( "SELECT * FROM {$backups_table} WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1" );
$active_schedules = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$schedules_table} WHERE is_active = 1" );
$staging_count    = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$staging_table} WHERE status = 'active'" );
$recent_backups   = $wpdb->get_results( "SELECT * FROM {$backups_table} ORDER BY created_at DESC LIMIT 5" );
// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching

$last_backup_display = $last_backup ? human_time_diff( strtotime( $last_backup->completed_at ) ) . ' ' . __( 'ago', '5dp-backup-restore' ) : __( 'Never', '5dp-backup-restore' );
$last_backup_size    = $last_backup ? size_format( $last_backup->total_size ) : '—';
?>
<div class="fdpbr-app">
	<?php include FDPBR_PLUGIN_DIR . 'admin/partials/header-nav.php'; ?>

	<div class="fdpbr-content">

		<!-- Stats Row -->
		<div class="fdpbr-stats-row">
			<div class="fdpbr-stat-card">
				<div class="fdpbr-stat-card__icon fdpbr-stat-card__icon--success">
					<span class="dashicons dashicons-cloud-saved"></span>
				</div>
				<div class="fdpbr-stat-card__info">
					<span class="fdpbr-stat-card__number"><?php echo esc_html( $total_backups ); ?></span>
					<span class="fdpbr-stat-card__label"><?php esc_html_e( 'Total Backups', '5dp-backup-restore' ); ?></span>
				</div>
			</div>

			<div class="fdpbr-stat-card">
				<div class="fdpbr-stat-card__icon fdpbr-stat-card__icon--purple">
					<span class="dashicons dashicons-calendar-alt"></span>
				</div>
				<div class="fdpbr-stat-card__info">
					<span class="fdpbr-stat-card__number"><?php echo esc_html( $active_schedules ); ?></span>
					<span class="fdpbr-stat-card__label"><?php esc_html_e( 'Active Schedules', '5dp-backup-restore' ); ?></span>
				</div>
			</div>

			<div class="fdpbr-stat-card">
				<div class="fdpbr-stat-card__icon fdpbr-stat-card__icon--teal">
					<span class="dashicons dashicons-clock"></span>
				</div>
				<div class="fdpbr-stat-card__info">
					<span class="fdpbr-stat-card__number"><?php echo esc_html( $last_backup_display ); ?></span>
					<span class="fdpbr-stat-card__label"><?php esc_html_e( 'Last Backup', '5dp-backup-restore' ); ?></span>
				</div>
			</div>

			<div class="fdpbr-stat-card">
				<div class="fdpbr-stat-card__icon fdpbr-stat-card__icon--orange">
					<span class="dashicons dashicons-admin-multisite"></span>
				</div>
				<div class="fdpbr-stat-card__info">
					<span class="fdpbr-stat-card__number"><?php echo esc_html( $staging_count ); ?></span>
					<span class="fdpbr-stat-card__label"><?php esc_html_e( 'Staging Sites', '5dp-backup-restore' ); ?></span>
				</div>
			</div>
		</div>

		<!-- Quick Actions -->
		<div class="fdpbr-section-card">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Quick Actions', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Common backup and restore operations.', '5dp-backup-restore' ); ?></p>
				</div>
			</div>
			<div class="fdpbr-section-card__body">
				<div style="display: flex; gap: 12px; flex-wrap: wrap;">
					<a href="<?php echo esc_url( admin_url( 'admin.php?page=fdpbr-backup' ) ); ?>" class="fdpbr-btn fdpbr-btn--primary">
						<span class="dashicons dashicons-cloud-upload" style="margin-top: 3px;"></span>
						<?php esc_html_e( 'Backup Now', '5dp-backup-restore' ); ?>
					</a>
					<a href="<?php echo esc_url( admin_url( 'admin.php?page=fdpbr-restore' ) ); ?>" class="fdpbr-btn fdpbr-btn--secondary">
						<span class="dashicons dashicons-cloud-saved" style="margin-top: 3px;"></span>
						<?php esc_html_e( 'Restore', '5dp-backup-restore' ); ?>
					</a>
					<a href="<?php echo esc_url( admin_url( 'admin.php?page=fdpbr-migration' ) ); ?>" class="fdpbr-btn fdpbr-btn--secondary">
						<span class="dashicons dashicons-migrate" style="margin-top: 3px;"></span>
						<?php esc_html_e( 'Migrate', '5dp-backup-restore' ); ?>
					</a>
					<a href="<?php echo esc_url( admin_url( 'admin.php?page=fdpbr-staging' ) ); ?>" class="fdpbr-btn fdpbr-btn--secondary">
						<span class="dashicons dashicons-admin-multisite" style="margin-top: 3px;"></span>
						<?php esc_html_e( 'Create Staging', '5dp-backup-restore' ); ?>
					</a>
				</div>
			</div>
		</div>

		<!-- Recent Backups -->
		<div class="fdpbr-section-card">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Recent Backups', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Your most recent backup history.', '5dp-backup-restore' ); ?></p>
				</div>
				<?php if ( $total_backups > 0 ) : ?>
					<a href="<?php echo esc_url( admin_url( 'admin.php?page=fdpbr-backup' ) ); ?>" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small">
						<?php esc_html_e( 'View All', '5dp-backup-restore' ); ?>
					</a>
				<?php endif; ?>
			</div>
			<div class="fdpbr-section-card__body" style="padding: 0;">
				<?php if ( empty( $recent_backups ) ) : ?>
					<div class="fdpbr-empty-state">
						<span class="dashicons dashicons-cloud-upload"></span>
						<p><?php esc_html_e( 'No backups yet. Create your first backup to get started.', '5dp-backup-restore' ); ?></p>
					</div>
				<?php else : ?>
					<table class="fdpbr-backup-table">
						<thead>
							<tr>
								<th><?php esc_html_e( 'Name', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Type', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Size', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Status', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Date', '5dp-backup-restore' ); ?></th>
							</tr>
						</thead>
						<tbody>
							<?php foreach ( $recent_backups as $backup ) : ?>
								<tr>
									<td>
										<strong><?php echo esc_html( $backup->name ?: $backup->backup_id ); ?></strong>
									</td>
									<td>
										<span class="fdpbr-badge fdpbr-badge--<?php echo esc_attr( $backup->type ); ?>">
											<?php echo esc_html( ucfirst( $backup->type ) ); ?>
										</span>
									</td>
									<td><?php echo esc_html( $backup->total_size ? size_format( $backup->total_size ) : '—' ); ?></td>
									<td>
										<?php
										$status_class = 'fdpbr-badge--inactive';
										if ( 'completed' === $backup->status ) {
											$status_class = 'fdpbr-badge--success';
										} elseif ( 'failed' === $backup->status ) {
											$status_class = 'fdpbr-badge--danger';
										} elseif ( 'running' === $backup->status ) {
											$status_class = 'fdpbr-badge--warning';
										}
										?>
										<span class="fdpbr-badge <?php echo esc_attr( $status_class ); ?>">
											<?php echo esc_html( ucfirst( $backup->status ) ); ?>
										</span>
									</td>
									<td><?php echo esc_html( wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), strtotime( $backup->created_at ) ) ); ?></td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>
			</div>
		</div>

		<!-- System Status -->
		<div class="fdpbr-section-card">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'System Status', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Server capabilities and plugin environment.', '5dp-backup-restore' ); ?></p>
				</div>
			</div>
			<div class="fdpbr-section-card__body">
				<?php
				$max_exec    = (int) ini_get( 'max_execution_time' );
				$memory      = ini_get( 'memory_limit' );
				$upload_max  = ini_get( 'upload_max_filesize' );
				$post_max    = ini_get( 'post_max_size' );
				$has_zip     = class_exists( 'ZipArchive' );
				$has_curl    = function_exists( 'curl_version' );
				$has_openssl = extension_loaded( 'openssl' );
				$server_sw   = isset( $_SERVER['SERVER_SOFTWARE'] ) ? sanitize_text_field( wp_unslash( $_SERVER['SERVER_SOFTWARE'] ) ) : __( 'Unknown', '5dp-backup-restore' );
				?>
				<div class="fdpbr-feature-grid">
					<?php
					$status_items = array(
						array( 'label' => __( 'PHP Version', '5dp-backup-restore' ), 'value' => PHP_VERSION, 'ok' => version_compare( PHP_VERSION, '7.4', '>=' ) ),
						array( 'label' => __( 'WordPress Version', '5dp-backup-restore' ), 'value' => get_bloginfo( 'version' ), 'ok' => true ),
						array( 'label' => __( 'Max Execution Time', '5dp-backup-restore' ), 'value' => $max_exec . 's', 'ok' => 0 === $max_exec || $max_exec >= 30 ),
						array( 'label' => __( 'Memory Limit', '5dp-backup-restore' ), 'value' => $memory, 'ok' => wp_convert_hr_to_bytes( $memory ) >= 128 * MB_IN_BYTES ),
						array( 'label' => __( 'Upload Max Size', '5dp-backup-restore' ), 'value' => $upload_max, 'ok' => true ),
						array( 'label' => __( 'Post Max Size', '5dp-backup-restore' ), 'value' => $post_max, 'ok' => true ),
						array( 'label' => __( 'ZipArchive', '5dp-backup-restore' ), 'value' => $has_zip ? __( 'Available', '5dp-backup-restore' ) : __( 'Not available', '5dp-backup-restore' ), 'ok' => $has_zip ),
						array( 'label' => __( 'cURL', '5dp-backup-restore' ), 'value' => $has_curl ? __( 'Available', '5dp-backup-restore' ) : __( 'Not available', '5dp-backup-restore' ), 'ok' => $has_curl ),
						array( 'label' => __( 'OpenSSL', '5dp-backup-restore' ), 'value' => $has_openssl ? __( 'Available', '5dp-backup-restore' ) : __( 'Not available', '5dp-backup-restore' ), 'ok' => $has_openssl ),
						array( 'label' => __( 'Server Software', '5dp-backup-restore' ), 'value' => $server_sw, 'ok' => true ),
					);
					foreach ( $status_items as $item ) :
					?>
						<div class="fdpbr-feature-card">
							<div class="fdpbr-feature-card__icon <?php echo $item['ok'] ? 'fdpbr-feature-card__icon--success' : 'fdpbr-feature-card__icon--rose'; ?>">
								<span class="dashicons <?php echo $item['ok'] ? 'dashicons-yes-alt' : 'dashicons-warning'; ?>"></span>
							</div>
							<div class="fdpbr-feature-card__info">
								<h3 class="fdpbr-feature-card__title"><?php echo esc_html( $item['label'] ); ?></h3>
								<p class="fdpbr-feature-card__desc"><?php echo esc_html( $item['value'] ); ?></p>
							</div>
						</div>
					<?php endforeach; ?>
				</div>
			</div>
		</div>

	</div>
</div>
