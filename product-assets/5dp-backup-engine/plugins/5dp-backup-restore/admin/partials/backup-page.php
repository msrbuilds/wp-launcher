<?php
/**
 * Backup page template.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin/partials
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound -- Template partial loaded within class method scope.
$settings     = get_option( FiveDPBR_Settings::OPTION_NAME, FiveDPBR_Settings::get_defaults() );
$destinations = get_option( 'fdpbr_storage_destinations', array() );

global $wpdb;
$backups_table = $wpdb->prefix . 'fdpbr_backups';
// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
$backups = $wpdb->get_results( "SELECT * FROM {$backups_table} ORDER BY created_at DESC LIMIT 50" );
// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
?>
<div class="fdpbr-app">
	<?php include FDPBR_PLUGIN_DIR . 'admin/partials/header-nav.php'; ?>

	<div class="fdpbr-content">

		<!-- Create Backup -->
		<div class="fdpbr-section-card">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Create Backup', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Create a manual backup of your site. Choose what to include and where to store it.', '5dp-backup-restore' ); ?></p>
				</div>
			</div>
			<div class="fdpbr-section-card__body">
				<form id="fdpbr-backup-form" data-module="backup">
					<?php wp_nonce_field( 'fdpbr_nonce', 'fdpbr_nonce_field' ); ?>

					<!-- Row 1: Backup Type + Storage + Name -->
					<div class="fdpbr-form-grid fdpbr-form-grid--3">
						<div class="fdpbr-field">
							<label class="fdpbr-field__label"><?php esc_html_e( 'Backup Type', '5dp-backup-restore' ); ?></label>
							<div class="fdpbr-btn-group" data-name="backup_type">
								<button type="button" class="fdpbr-btn-group__item fdpbr-btn-group__item--active" data-value="full"><?php esc_html_e( 'Full Site', '5dp-backup-restore' ); ?></button>
								<button type="button" class="fdpbr-btn-group__item" data-value="database"><?php esc_html_e( 'Database', '5dp-backup-restore' ); ?></button>
								<button type="button" class="fdpbr-btn-group__item" data-value="files"><?php esc_html_e( 'Files', '5dp-backup-restore' ); ?></button>
								<button type="button" class="fdpbr-btn-group__item" data-value="custom"><?php esc_html_e( 'Custom', '5dp-backup-restore' ); ?></button>
							</div>
						</div>

						<div class="fdpbr-field">
							<label class="fdpbr-field__label"><?php esc_html_e( 'Storage Destination', '5dp-backup-restore' ); ?></label>
							<div class="fdpbr-btn-group" data-name="storage_dest">
								<button type="button" class="fdpbr-btn-group__item fdpbr-btn-group__item--active" data-value="local"><?php esc_html_e( 'Local', '5dp-backup-restore' ); ?></button>
								<?php foreach ( $destinations as $dest_id => $dest ) : ?>
									<button type="button" class="fdpbr-btn-group__item" data-value="<?php echo esc_attr( $dest_id ); ?>"><?php echo esc_html( $dest['name'] ?? ucfirst( $dest_id ) ); ?></button>
								<?php endforeach; ?>
							</div>
							<?php if ( empty( $destinations ) ) : ?>
								<p class="fdpbr-field__help">
									<a href="<?php echo esc_url( admin_url( 'admin.php?page=fdpbr-storage' ) ); ?>"><?php esc_html_e( 'Configure remote storage', '5dp-backup-restore' ); ?></a>
								</p>
							<?php endif; ?>
						</div>

						<div class="fdpbr-field">
							<label class="fdpbr-field__label"><?php esc_html_e( 'Backup Name', '5dp-backup-restore' ); ?></label>
							<input type="text" name="backup_name" class="fdpbr-input" placeholder="<?php esc_attr_e( 'e.g., Before plugin update', '5dp-backup-restore' ); ?>">
							<p class="fdpbr-field__help"><?php esc_html_e( 'Optional label for this backup.', '5dp-backup-restore' ); ?></p>
						</div>
					</div>

					<!-- Content to Include (shown only for Custom type) -->
					<div class="fdpbr-field" id="fdpbr-content-section" style="display: none;">
						<label class="fdpbr-field__label"><?php esc_html_e( 'Content to Include', '5dp-backup-restore' ); ?></label>
						<div class="fdpbr-toggle-grid">
							<label class="fdpbr-toggle-card">
								<div class="fdpbr-toggle-card__icon" style="background: #EDE9FE; color: #7C3AED;">
									<span class="dashicons dashicons-database"></span>
								</div>
								<span class="fdpbr-toggle-card__label"><?php esc_html_e( 'Database', '5dp-backup-restore' ); ?></span>
								<div class="fdpbr-toggle">
									<input type="checkbox" name="include[]" value="database" checked>
									<span class="fdpbr-toggle__slider"></span>
								</div>
							</label>

							<label class="fdpbr-toggle-card">
								<div class="fdpbr-toggle-card__icon" style="background: #DBEAFE; color: #2563EB;">
									<span class="dashicons dashicons-admin-appearance"></span>
								</div>
								<span class="fdpbr-toggle-card__label"><?php esc_html_e( 'Themes', '5dp-backup-restore' ); ?></span>
								<div class="fdpbr-toggle">
									<input type="checkbox" name="include[]" value="themes" checked>
									<span class="fdpbr-toggle__slider"></span>
								</div>
							</label>

							<label class="fdpbr-toggle-card">
								<div class="fdpbr-toggle-card__icon" style="background: #FEE2E2; color: #DC2626;">
									<span class="dashicons dashicons-admin-plugins"></span>
								</div>
								<span class="fdpbr-toggle-card__label"><?php esc_html_e( 'Plugins', '5dp-backup-restore' ); ?></span>
								<div class="fdpbr-toggle">
									<input type="checkbox" name="include[]" value="plugins" checked>
									<span class="fdpbr-toggle__slider"></span>
								</div>
							</label>

							<label class="fdpbr-toggle-card">
								<div class="fdpbr-toggle-card__icon" style="background: #D1FAE5; color: #059669;">
									<span class="dashicons dashicons-format-image"></span>
								</div>
								<span class="fdpbr-toggle-card__label"><?php esc_html_e( 'Uploads', '5dp-backup-restore' ); ?></span>
								<div class="fdpbr-toggle">
									<input type="checkbox" name="include[]" value="uploads" checked>
									<span class="fdpbr-toggle__slider"></span>
								</div>
							</label>

							<label class="fdpbr-toggle-card">
								<div class="fdpbr-toggle-card__icon" style="background: #FEF3C7; color: #D97706;">
									<span class="dashicons dashicons-wordpress"></span>
								</div>
								<span class="fdpbr-toggle-card__label"><?php esc_html_e( 'WordPress Core', '5dp-backup-restore' ); ?></span>
								<div class="fdpbr-toggle">
									<input type="checkbox" name="include[]" value="core">
									<span class="fdpbr-toggle__slider"></span>
								</div>
							</label>

							<label class="fdpbr-toggle-card">
								<div class="fdpbr-toggle-card__icon" style="background: #E0E7FF; color: #4F46E5;">
									<span class="dashicons dashicons-media-text"></span>
								</div>
								<span class="fdpbr-toggle-card__label"><?php esc_html_e( 'Must-Use Plugins', '5dp-backup-restore' ); ?></span>
								<div class="fdpbr-toggle">
									<input type="checkbox" name="include[]" value="mu-plugins" checked>
									<span class="fdpbr-toggle__slider"></span>
								</div>
							</label>

							<label class="fdpbr-toggle-card">
								<div class="fdpbr-toggle-card__icon" style="background: #FCE7F3; color: #DB2777;">
									<span class="dashicons dashicons-translation"></span>
								</div>
								<span class="fdpbr-toggle-card__label"><?php esc_html_e( 'Languages', '5dp-backup-restore' ); ?></span>
								<div class="fdpbr-toggle">
									<input type="checkbox" name="include[]" value="languages" checked>
									<span class="fdpbr-toggle__slider"></span>
								</div>
							</label>

							<label class="fdpbr-toggle-card">
								<div class="fdpbr-toggle-card__icon" style="background: #CCFBF1; color: #0D9488;">
									<span class="dashicons dashicons-admin-settings"></span>
								</div>
								<span class="fdpbr-toggle-card__label"><?php esc_html_e( 'Drop-ins', '5dp-backup-restore' ); ?></span>
								<div class="fdpbr-toggle">
									<input type="checkbox" name="include[]" value="dropins">
									<span class="fdpbr-toggle__slider"></span>
								</div>
							</label>

							<label class="fdpbr-toggle-card">
								<div class="fdpbr-toggle-card__icon" style="background: #F3E8FF; color: #9333EA;">
									<span class="dashicons dashicons-admin-generic"></span>
								</div>
								<span class="fdpbr-toggle-card__label"><?php esc_html_e( 'wp-config.php', '5dp-backup-restore' ); ?></span>
								<div class="fdpbr-toggle">
									<input type="checkbox" name="include[]" value="wp-config">
									<span class="fdpbr-toggle__slider"></span>
								</div>
							</label>
						</div>
					</div>

					<!-- Exclude Paths (shown only for Custom type) -->
					<div class="fdpbr-form-grid fdpbr-form-grid--2" id="fdpbr-exclude-section" style="display: none;">
						<div class="fdpbr-field">
							<label class="fdpbr-field__label"><?php esc_html_e( 'Exclude Paths', '5dp-backup-restore' ); ?></label>
							<textarea name="exclude_paths" class="fdpbr-textarea" rows="3" placeholder="<?php esc_attr_e( "wp-content/cache/*\nwp-content/debug.log", '5dp-backup-restore' ); ?>"></textarea>
							<p class="fdpbr-field__help"><?php esc_html_e( 'One path per line. Supports * wildcards.', '5dp-backup-restore' ); ?></p>
						</div>
						<div class="fdpbr-field">
							<label class="fdpbr-field__label"><?php esc_html_e( 'Exclude Database Tables', '5dp-backup-restore' ); ?></label>
							<textarea name="exclude_tables" class="fdpbr-textarea" rows="3" placeholder="<?php esc_attr_e( "wp_actionscheduler_actions\nwp_actionscheduler_logs", '5dp-backup-restore' ); ?>"></textarea>
							<p class="fdpbr-field__help"><?php esc_html_e( 'One table name per line.', '5dp-backup-restore' ); ?></p>
						</div>
					</div>

				</form>
			</div>
			<div class="fdpbr-section-card__footer">
				<button type="button" id="fdpbr-start-backup" class="fdpbr-btn fdpbr-btn--primary">
					<span class="dashicons dashicons-cloud-upload" style="margin-top: 3px;"></span>
					<?php esc_html_e( 'Start Backup', '5dp-backup-restore' ); ?>
				</button>
			</div>
		</div>

		<!-- Backup Progress (hidden by default) -->
		<div id="fdpbr-backup-progress" class="fdpbr-section-card" style="display: none;">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Backup Progress', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc" id="fdpbr-backup-step"><?php esc_html_e( 'Initializing...', '5dp-backup-restore' ); ?></p>
				</div>
				<span class="fdpbr-badge fdpbr-badge--warning" id="fdpbr-backup-status-badge"><?php esc_html_e( 'Running', '5dp-backup-restore' ); ?></span>
			</div>
			<div class="fdpbr-section-card__body">
				<!-- Progress bar -->
				<div class="fdpbr-progress-wrapper">
					<div class="fdpbr-progress-wrapper__header">
						<span class="fdpbr-progress-wrapper__label" id="fdpbr-backup-phase"><?php esc_html_e( 'Preparing...', '5dp-backup-restore' ); ?></span>
						<span class="fdpbr-progress-wrapper__percent" id="fdpbr-backup-percent">0%</span>
					</div>
					<div class="fdpbr-progress">
						<div class="fdpbr-progress__bar" id="fdpbr-backup-bar" style="width: 0;"></div>
					</div>
				</div>

				<!-- Activity Log -->
				<div class="fdpbr-mini-log">
					<div class="fdpbr-mini-log__header">
						<span class="dashicons dashicons-list-view"></span>
						<?php esc_html_e( 'Activity Log', '5dp-backup-restore' ); ?>
					</div>
					<div class="fdpbr-mini-log__body" id="fdpbr-backup-log">
						<div class="fdpbr-mini-log__line fdpbr-mini-log__line--info">
							<span class="fdpbr-mini-log__time"><?php echo esc_html( wp_date( 'H:i:s' ) ); ?></span>
							<span class="fdpbr-mini-log__msg"><?php esc_html_e( 'Waiting to start...', '5dp-backup-restore' ); ?></span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Backup History -->
		<div class="fdpbr-section-card">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Backup History', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc"><?php esc_html_e( 'All your backups in one place.', '5dp-backup-restore' ); ?></p>
				</div>
			</div>
			<div class="fdpbr-section-card__body" style="padding: 0;">
				<?php if ( empty( $backups ) ) : ?>
					<div class="fdpbr-empty-state">
						<span class="dashicons dashicons-cloud-upload"></span>
						<p><?php esc_html_e( 'No backups yet. Create your first backup above.', '5dp-backup-restore' ); ?></p>
					</div>
				<?php else : ?>
					<table class="fdpbr-backup-table">
						<thead>
							<tr>
								<th><?php esc_html_e( 'Name', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Type', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Size', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Storage', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Status', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Date', '5dp-backup-restore' ); ?></th>
								<th><?php esc_html_e( 'Actions', '5dp-backup-restore' ); ?></th>
							</tr>
						</thead>
						<tbody>
							<?php foreach ( $backups as $backup ) : ?>
								<tr data-backup-id="<?php echo esc_attr( $backup->backup_id ); ?>">
									<td><strong><?php echo esc_html( $backup->name ?: $backup->backup_id ); ?></strong></td>
									<td>
										<span class="fdpbr-badge"><?php echo esc_html( ucfirst( $backup->type ) ); ?></span>
									</td>
									<td><?php echo esc_html( $backup->total_size ? size_format( $backup->total_size ) : '—' ); ?></td>
									<td><?php echo esc_html( $backup->storage_destinations ? implode( ', ', json_decode( $backup->storage_destinations, true ) ) : 'Local' ); ?></td>
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
									<td>
										<div class="fdpbr-row-actions">
											<?php if ( 'completed' === $backup->status ) : ?>
												<button type="button" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small fdpbr-download-backup" data-id="<?php echo esc_attr( $backup->backup_id ); ?>" title="<?php esc_attr_e( 'Download', '5dp-backup-restore' ); ?>">
													<span class="dashicons dashicons-download"></span>
												</button>
												<button type="button" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small fdpbr-restore-backup" data-id="<?php echo esc_attr( $backup->backup_id ); ?>" title="<?php esc_attr_e( 'Restore', '5dp-backup-restore' ); ?>">
													<span class="dashicons dashicons-backup"></span>
												</button>
											<?php endif; ?>
											<button type="button" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small fdpbr-delete-backup" data-id="<?php echo esc_attr( $backup->backup_id ); ?>" title="<?php esc_attr_e( 'Delete', '5dp-backup-restore' ); ?>">
												<span class="dashicons dashicons-trash"></span>
											</button>
										</div>
									</td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>
			</div>
		</div>

	</div>
</div>
