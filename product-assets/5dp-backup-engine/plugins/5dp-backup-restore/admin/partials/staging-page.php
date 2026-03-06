<?php
/**
 * Staging page template.
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
$staging_table = $wpdb->prefix . 'fdpbr_staging';
// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
$staging_sites = $wpdb->get_results( "SELECT * FROM {$staging_table} WHERE status != 'deleted' ORDER BY created_at DESC" );
// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching

$active_tab = isset( $_GET['staging_tab'] ) ? sanitize_key( $_GET['staging_tab'] ) : 'server'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
?>
<div class="fdpbr-app">
	<?php include FDPBR_PLUGIN_DIR . 'admin/partials/header-nav.php'; ?>

	<div class="fdpbr-content">

		<!-- Staging Tabs -->
		<div class="fdpbr-section-card">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Staging', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Create staging copies of your site and sync changes.', '5dp-backup-restore' ); ?></p>
				</div>
			</div>
			<div class="fdpbr-section-card__body" style="padding: 0;">

				<!-- Tab Navigation -->
				<div class="fdpbr-tab-nav">
					<a href="<?php echo esc_url( add_query_arg( 'staging_tab', 'server' ) ); ?>"
					   class="fdpbr-tab-nav__item <?php echo 'server' === $active_tab ? 'fdpbr-tab-nav__item--active' : ''; ?>">
						<span class="dashicons dashicons-admin-multisite"></span>
						<?php esc_html_e( 'Server Staging', '5dp-backup-restore' ); ?>
					</a>
					<a href="<?php echo esc_url( add_query_arg( 'staging_tab', 'local' ) ); ?>"
					   class="fdpbr-tab-nav__item <?php echo 'local' === $active_tab ? 'fdpbr-tab-nav__item--active' : ''; ?>">
						<span class="dashicons dashicons-laptop"></span>
						<?php esc_html_e( 'Local ↔ Live', '5dp-backup-restore' ); ?>
					</a>
				</div>

				<?php if ( 'server' === $active_tab ) : ?>
					<!-- Server Staging -->
					<div class="fdpbr-section-card__body">
						<?php if ( empty( $staging_sites ) ) : ?>
							<div class="fdpbr-empty-state">
								<div class="fdpbr-empty-state__icon">
									<span class="dashicons dashicons-admin-multisite"></span>
								</div>
								<h3 class="fdpbr-empty-state__title"><?php esc_html_e( 'No Staging Sites', '5dp-backup-restore' ); ?></h3>
								<p class="fdpbr-empty-state__desc"><?php esc_html_e( 'Create a staging copy to safely test changes before going live.', '5dp-backup-restore' ); ?></p>
							</div>
						<?php else : ?>
							<div class="fdpbr-feature-grid">
								<?php foreach ( $staging_sites as $site ) : ?>
									<div class="fdpbr-storage-card">
										<div class="fdpbr-storage-card__header">
											<h3><?php echo esc_html( $site->name ); ?></h3>
											<span class="fdpbr-badge fdpbr-badge--<?php echo 'active' === $site->status ? 'success' : 'inactive'; ?>">
												<?php echo esc_html( ucfirst( $site->status ) ); ?>
											</span>
										</div>
										<div class="fdpbr-storage-card__body">
											<p class="fdpbr-storage-card__meta">
												<?php echo esc_html( $site->staging_url ); ?>
											</p>
											<?php if ( $site->last_sync_at ) : ?>
												<p class="fdpbr-storage-card__meta">
													<?php
													/* translators: %s: human time diff */
													printf( esc_html__( 'Last synced %s ago', '5dp-backup-restore' ), esc_html( human_time_diff( strtotime( $site->last_sync_at ) ) ) );
													?>
												</p>
											<?php endif; ?>
										</div>
										<div class="fdpbr-storage-card__footer">
											<a href="<?php echo esc_url( $site->staging_url ); ?>" target="_blank" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small"><?php esc_html_e( 'Open', '5dp-backup-restore' ); ?></a>
											<button type="button" class="fdpbr-btn fdpbr-btn--secondary fdpbr-btn--small fdpbr-sync-staging" data-id="<?php echo esc_attr( $site->id ); ?>"><?php esc_html_e( 'Sync', '5dp-backup-restore' ); ?></button>
											<button type="button" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small fdpbr-delete-staging" data-id="<?php echo esc_attr( $site->id ); ?>"><?php esc_html_e( 'Delete', '5dp-backup-restore' ); ?></button>
										</div>
									<!-- Sync Panel (hidden by default) -->
									<div class="fdpbr-sync-panel" data-id="<?php echo esc_attr( $site->id ); ?>">
										<div class="fdpbr-sync-panel__row">
											<span class="fdpbr-sync-panel__label"><?php esc_html_e( 'Direction', '5dp-backup-restore' ); ?></span>
											<div class="fdpbr-btn-group" data-name="sync_direction">
												<button type="button" class="fdpbr-btn-group__item fdpbr-btn-group__item--active" data-value="to_live"><?php esc_html_e( 'Push to Live', '5dp-backup-restore' ); ?></button>
												<button type="button" class="fdpbr-btn-group__item" data-value="to_staging"><?php esc_html_e( 'Pull to Staging', '5dp-backup-restore' ); ?></button>
											</div>
										</div>
										<div class="fdpbr-sync-panel__row">
											<label class="fdpbr-sync-panel__check">
												<input type="checkbox" class="fdpbr-sync-db" checked> <?php esc_html_e( 'Database', '5dp-backup-restore' ); ?>
											</label>
											<label class="fdpbr-sync-panel__check">
												<input type="checkbox" class="fdpbr-sync-files" checked> <?php esc_html_e( 'Files', '5dp-backup-restore' ); ?>
											</label>
										</div>
										<div class="fdpbr-sync-panel__actions">
											<button type="button" class="fdpbr-btn fdpbr-btn--primary fdpbr-btn--small fdpbr-start-sync"><?php esc_html_e( 'Start Sync', '5dp-backup-restore' ); ?></button>
											<button type="button" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small fdpbr-cancel-sync"><?php esc_html_e( 'Cancel', '5dp-backup-restore' ); ?></button>
										</div>
										<div class="fdpbr-sync-panel__result" style="display: none;"></div>
									</div>
								</div>
								<?php endforeach; ?>
							</div>
						<?php endif; ?>

						<div class="fdpbr-staging-create">
							<input type="text" class="fdpbr-input fdpbr-staging-create__input" id="fdpbr-staging-name" value="staging" placeholder="<?php esc_attr_e( 'Directory name', '5dp-backup-restore' ); ?>">
							<button type="button" id="fdpbr-create-staging" class="fdpbr-btn fdpbr-btn--primary">
								<span class="dashicons dashicons-plus"></span>
								<?php esc_html_e( 'Create Staging Site', '5dp-backup-restore' ); ?>
							</button>
						</div>
					</div>

				<?php
				// --- Change Log Section ---
				if ( ! empty( $staging_sites ) ) :
						$live_log = $wpdb->prefix . 'fdpbr_change_log';

						// Build UNION query to combine live + staging change logs.
						$union_parts = array( "SELECT * FROM {$live_log}" );
						foreach ( $staging_sites as $_stg ) {
							$stg_log = $_stg->staging_prefix . 'fdpbr_change_log';
							// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
							$exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $stg_log ) );
							if ( $exists ) {
								$union_parts[] = "SELECT * FROM {$stg_log}";
							}
						}
						$union_sql = '(' . implode( ' UNION ALL ', $union_parts ) . ') AS combined_log';

						// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
						$initial_changes = $wpdb->get_results(
							"SELECT * FROM {$union_sql} ORDER BY detected_at DESC LIMIT 50"
						);
						// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
						$change_total = (int) $wpdb->get_var(
							"SELECT COUNT(*) FROM {$union_sql}"
						);

						$sync_history = get_option( 'fdpbr_sync_history', array() );
						$sync_history = array_reverse( $sync_history );
						$sync_history = array_slice( $sync_history, 0, 10 );
					?>
					<div class="fdpbr-section-card fdpbr-changelog-section">
						<div class="fdpbr-changelog-section__header" style="padding: 20px 24px 0;">
							<div>
								<h3 style="margin: 0; font-size: 15px; font-weight: 600; color: var(--fdpbr-gray-800);"><?php esc_html_e( 'Change Log', '5dp-backup-restore' ); ?></h3>
								<p style="margin: 2px 0 0; font-size: 12px; color: var(--fdpbr-gray-500);"><?php esc_html_e( 'Track changes between live and staging sites.', '5dp-backup-restore' ); ?></p>
							</div>
							<div class="fdpbr-changelog-filters">
								<select class="fdpbr-select fdpbr-changelog-filter" data-filter="source">
									<option value=""><?php esc_html_e( 'All Sources', '5dp-backup-restore' ); ?></option>
									<option value="live"><?php esc_html_e( 'Live', '5dp-backup-restore' ); ?></option>
									<option value="staging"><?php esc_html_e( 'Staging', '5dp-backup-restore' ); ?></option>
								</select>
								<select class="fdpbr-select fdpbr-changelog-filter" data-filter="synced">
									<option value=""><?php esc_html_e( 'All Status', '5dp-backup-restore' ); ?></option>
									<option value="pending"><?php esc_html_e( 'Pending', '5dp-backup-restore' ); ?></option>
									<option value="synced"><?php esc_html_e( 'Synced', '5dp-backup-restore' ); ?></option>
								</select>
								<select class="fdpbr-select fdpbr-changelog-filter" data-filter="change_type">
									<option value=""><?php esc_html_e( 'All Types', '5dp-backup-restore' ); ?></option>
									<option value="create"><?php esc_html_e( 'Created', '5dp-backup-restore' ); ?></option>
									<option value="update"><?php esc_html_e( 'Updated', '5dp-backup-restore' ); ?></option>
									<option value="delete"><?php esc_html_e( 'Deleted', '5dp-backup-restore' ); ?></option>
								</select>
							</div>
						</div>

						<?php if ( ! empty( $sync_history ) ) : ?>
						<div class="fdpbr-sync-history-summary">
							<h4 class="fdpbr-sync-history-summary__title"><?php esc_html_e( 'Recent Syncs', '5dp-backup-restore' ); ?></h4>
							<div class="fdpbr-sync-history-list">
								<?php
								foreach ( $sync_history as $h ) :
									$dir_label = ( 'staging_to_live' === $h['direction'] ) ? __( 'Push to Live', '5dp-backup-restore' ) : __( 'Pull to Staging', '5dp-backup-restore' );
									$dir_badge = ( 'staging_to_live' === $h['direction'] ) ? 'info' : 'success';
									$parts     = array();
									if ( ! empty( $h['db_changes'] ) ) {
										$parts[] = $h['db_changes'] . ' DB';
									}
									if ( ! empty( $h['files_synced'] ) ) {
										$parts[] = $h['files_synced'] . ' files';
									}
									$detail = ! empty( $parts ) ? implode( ', ', $parts ) : __( 'No changes', '5dp-backup-restore' );
								?>
								<div class="fdpbr-sync-history-item">
									<span class="fdpbr-badge fdpbr-badge--<?php echo esc_attr( $dir_badge ); ?>"><?php echo esc_html( $dir_label ); ?></span>
									<span class="fdpbr-sync-history-item__detail"><?php echo esc_html( $detail ); ?></span>
									<?php if ( ! empty( $h['errors'] ) ) : ?>
										<span class="fdpbr-badge fdpbr-badge--danger"><?php echo esc_html( $h['errors'] ); ?> error<?php echo (int) $h['errors'] !== 1 ? 's' : ''; ?></span>
									<?php endif; ?>
									<span class="fdpbr-sync-history-item__time"><?php echo esc_html( human_time_diff( strtotime( $h['completed_at'] ) ) ); ?> ago</span>
								</div>
								<?php endforeach; ?>
							</div>
						</div>
						<?php endif; ?>

						<div id="fdpbr-changelog-container">
							<?php if ( empty( $initial_changes ) ) : ?>
								<div class="fdpbr-changelog-empty">
									<span class="dashicons dashicons-list-view"></span>
									<p><?php esc_html_e( 'No changes tracked yet. Changes will appear here as you edit content.', '5dp-backup-restore' ); ?></p>
								</div>
							<?php else : ?>
								<table class="fdpbr-table" id="fdpbr-changelog-table">
									<thead>
										<tr>
											<th><?php esc_html_e( 'Type', '5dp-backup-restore' ); ?></th>
											<th><?php esc_html_e( 'Object', '5dp-backup-restore' ); ?></th>
											<th><?php esc_html_e( 'Source', '5dp-backup-restore' ); ?></th>
											<th><?php esc_html_e( 'Status', '5dp-backup-restore' ); ?></th>
											<th><?php esc_html_e( 'Date', '5dp-backup-restore' ); ?></th>
										</tr>
									</thead>
									<tbody id="fdpbr-changelog-tbody">
										<?php
										foreach ( $initial_changes as $change ) :
											$cdata = json_decode( $change->object_data, true );

											switch ( $change->object_type ) {
												case 'post':
													$clabel   = isset( $cdata['post_title'] ) ? $cdata['post_title'] : 'Post #' . $change->object_id;
													$obj_icon = 'dashicons-admin-post';
													break;
												case 'option':
													$clabel   = isset( $cdata['option_name'] ) ? $cdata['option_name'] : 'Option';
													$obj_icon = 'dashicons-admin-generic';
													break;
												case 'term':
													$clabel   = isset( $cdata['name'] ) ? $cdata['name'] : 'Term #' . $change->object_id;
													$obj_icon = 'dashicons-tag';
													break;
												case 'nav_menu':
													$clabel   = 'Menu #' . $change->object_id;
													$obj_icon = 'dashicons-menu';
													break;
												case 'widget':
													$clabel   = isset( $cdata['option_name'] ) ? $cdata['option_name'] : 'Widget';
													$obj_icon = 'dashicons-welcome-widgets-menus';
													break;
												default:
													$clabel   = $change->object_type . ' #' . $change->object_id;
													$obj_icon = 'dashicons-admin-generic';
											}

											$type_badges  = array( 'create' => 'success', 'update' => 'warning', 'delete' => 'danger' );
											$type_badge   = isset( $type_badges[ $change->change_type ] ) ? $type_badges[ $change->change_type ] : 'info';
											$source_badge = ( 'live' === $change->source ) ? 'info' : 'success';
											$status_badge = $change->synced ? 'success' : 'warning';
											$status_text  = $change->synced ? __( 'Synced', '5dp-backup-restore' ) : __( 'Pending', '5dp-backup-restore' );
										?>
										<tr>
											<td><span class="fdpbr-badge fdpbr-badge--<?php echo esc_attr( $type_badge ); ?>"><?php echo esc_html( ucfirst( $change->change_type ) ); ?></span></td>
											<td>
												<span class="dashicons <?php echo esc_attr( $obj_icon ); ?>" style="font-size: 14px; width: 14px; height: 14px; margin-right: 4px; color: var(--fdpbr-gray-400);"></span>
												<?php echo esc_html( $clabel ); ?>
											</td>
											<td><span class="fdpbr-badge fdpbr-badge--<?php echo esc_attr( $source_badge ); ?>"><?php echo esc_html( ucfirst( $change->source ) ); ?></span></td>
											<td><span class="fdpbr-badge fdpbr-badge--<?php echo esc_attr( $status_badge ); ?>"><?php echo esc_html( $status_text ); ?></span></td>
											<td title="<?php echo esc_attr( $change->detected_at ); ?>"><?php echo esc_html( human_time_diff( strtotime( $change->detected_at ) ) ); ?> ago</td>
										</tr>
										<?php endforeach; ?>
									</tbody>
								</table>
								<?php if ( $change_total > 50 ) : ?>
								<div style="padding: 16px; text-align: center;">
									<button type="button" id="fdpbr-changelog-load-more" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small" data-offset="50" data-total="<?php echo esc_attr( $change_total ); ?>">
										<?php
										/* translators: %d: number of remaining entries */
										printf( esc_html__( 'Load More (%d remaining)', '5dp-backup-restore' ), $change_total - 50 );
										?>
									</button>
								</div>
								<?php endif; ?>
							<?php endif; ?>
						</div>
					</div>
					<?php endif; ?>

				<?php else : ?>
					<!-- Local ↔ Live -->
					<div class="fdpbr-section-card__body">
						<div class="fdpbr-fields-stack">
							<div class="fdpbr-field">
								<label class="fdpbr-field__label"><?php esc_html_e( 'Pair with Remote Site', '5dp-backup-restore' ); ?></label>
								<p class="fdpbr-field__help"><?php esc_html_e( 'Connect your local development environment with a live site for 2-way sync.', '5dp-backup-restore' ); ?></p>
							</div>

							<div class="fdpbr-field">
								<label class="fdpbr-field__label"><?php esc_html_e( 'Remote Site URL', '5dp-backup-restore' ); ?></label>
								<input type="url" class="fdpbr-input" id="fdpbr-remote-site-url" placeholder="https://example.com">
							</div>

							<div class="fdpbr-field">
								<label class="fdpbr-field__label"><?php esc_html_e( 'Remote Site Key', '5dp-backup-restore' ); ?></label>
								<input type="text" class="fdpbr-input" id="fdpbr-remote-site-key" placeholder="<?php esc_attr_e( 'Enter the migration key from the remote site', '5dp-backup-restore' ); ?>">
							</div>

							<div style="display: flex; gap: 12px; flex-wrap: wrap;">
								<button type="button" id="fdpbr-pair-remote" class="fdpbr-btn fdpbr-btn--primary">
									<?php esc_html_e( 'Connect & Pair', '5dp-backup-restore' ); ?>
								</button>
								<button type="button" id="fdpbr-pull-from-live" class="fdpbr-btn fdpbr-btn--secondary" disabled>
									<span class="dashicons dashicons-download" style="margin-top: 3px;"></span>
									<?php esc_html_e( 'Pull from Live', '5dp-backup-restore' ); ?>
								</button>
								<button type="button" id="fdpbr-push-to-live" class="fdpbr-btn fdpbr-btn--secondary" disabled>
									<span class="dashicons dashicons-upload" style="margin-top: 3px;"></span>
									<?php esc_html_e( 'Push to Live', '5dp-backup-restore' ); ?>
								</button>
								<button type="button" id="fdpbr-two-way-sync" class="fdpbr-btn fdpbr-btn--secondary" disabled>
									<span class="dashicons dashicons-update" style="margin-top: 3px;"></span>
									<?php esc_html_e( '2-Way Sync', '5dp-backup-restore' ); ?>
								</button>
							</div>
						</div>
					</div>
				<?php endif; ?>

			</div>
		</div>

	</div>
</div>
