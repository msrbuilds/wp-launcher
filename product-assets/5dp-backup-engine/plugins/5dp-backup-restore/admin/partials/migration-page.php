<?php
/**
 * Migration page template.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/admin/partials
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="fdpbr-app">
	<?php include FDPBR_PLUGIN_DIR . 'admin/partials/header-nav.php'; ?>

	<div class="fdpbr-content">

		<div class="fdpbr-section-card" id="fdpbr-migration-wizard-card">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Site Migration', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Migrate your site to or from another server. Both sites must have 5DP Backup & Restore installed.', '5dp-backup-restore' ); ?></p>
				</div>
			</div>
			<div class="fdpbr-section-card__body">

				<!-- Migration Wizard -->
				<div class="fdpbr-wizard" id="fdpbr-migration-wizard">
					<div class="fdpbr-wizard__steps">
						<div class="fdpbr-wizard__step fdpbr-wizard__step--active" data-step="1">
							<span class="fdpbr-wizard__step-number">1</span>
							<span class="fdpbr-wizard__step-label"><?php esc_html_e( 'Connect', '5dp-backup-restore' ); ?></span>
						</div>
						<div class="fdpbr-wizard__step-line"></div>
						<div class="fdpbr-wizard__step" data-step="2">
							<span class="fdpbr-wizard__step-number">2</span>
							<span class="fdpbr-wizard__step-label"><?php esc_html_e( 'Configure', '5dp-backup-restore' ); ?></span>
						</div>
						<div class="fdpbr-wizard__step-line"></div>
						<div class="fdpbr-wizard__step" data-step="3">
							<span class="fdpbr-wizard__step-number">3</span>
							<span class="fdpbr-wizard__step-label"><?php esc_html_e( 'Migrate', '5dp-backup-restore' ); ?></span>
						</div>
					</div>

					<!-- Step 1: Connect -->
					<div class="fdpbr-wizard__content fdpbr-wizard__content--active" data-step="1">
						<div class="fdpbr-mig-connect">
							<!-- Source / Destination visual -->
							<div class="fdpbr-mig-connect__sites">
								<div class="fdpbr-mig-connect__site">
									<div class="fdpbr-mig-connect__site-icon">
										<span class="dashicons dashicons-admin-home"></span>
									</div>
									<span class="fdpbr-mig-connect__site-label"><?php esc_html_e( 'This Site (Source)', '5dp-backup-restore' ); ?></span>
									<span class="fdpbr-mig-connect__site-url"><?php echo esc_html( home_url() ); ?></span>
								</div>

								<div class="fdpbr-mig-connect__arrow">
									<span class="dashicons dashicons-arrow-right-alt"></span>
								</div>

								<div class="fdpbr-mig-connect__site fdpbr-mig-connect__site--dest">
									<div class="fdpbr-mig-connect__site-icon fdpbr-mig-connect__site-icon--dest">
										<span class="dashicons dashicons-migrate"></span>
									</div>
									<span class="fdpbr-mig-connect__site-label"><?php esc_html_e( 'Destination (Push To)', '5dp-backup-restore' ); ?></span>
									<input type="url" name="dest_url" class="fdpbr-input fdpbr-mig-connect__site-input" id="fdpbr-migration-dest-url" placeholder="https://example.com">
								</div>
							</div>

							<!-- Migration Key -->
							<div class="fdpbr-mig-connect__key">
								<label class="fdpbr-field__label">
									<span class="dashicons dashicons-admin-network"></span>
									<?php esc_html_e( 'Migration Key', '5dp-backup-restore' ); ?>
								</label>
								<input type="text" name="migration_key" class="fdpbr-input" id="fdpbr-migration-key" placeholder="<?php esc_attr_e( 'Paste the migration key from the destination site', '5dp-backup-restore' ); ?>">
								<p class="fdpbr-field__help"><?php esc_html_e( 'Generate a migration key on the destination site in the "Accept Incoming Migration" section, then paste it here.', '5dp-backup-restore' ); ?></p>
							</div>
						</div>

						<div class="fdpbr-mig-connect__actions">
							<button type="button" id="fdpbr-migration-test" class="fdpbr-btn fdpbr-btn--primary">
								<span class="dashicons dashicons-rest-api"></span>
								<?php esc_html_e( 'Test Connection', '5dp-backup-restore' ); ?>
							</button>
						</div>
					</div>

					<!-- Step 2: Configure -->
					<div class="fdpbr-wizard__content" data-step="2">
						<div class="fdpbr-mig-configure">
							<!-- Connection status badge -->
							<div class="fdpbr-mig-configure__status" id="fdpbr-mig-status">
								<span class="dashicons dashicons-yes-alt"></span>
								<span><?php esc_html_e( 'Connected to destination site', '5dp-backup-restore' ); ?></span>
							</div>

							<h3 class="fdpbr-mig-configure__title"><?php esc_html_e( 'What to Migrate', '5dp-backup-restore' ); ?></h3>

							<div class="fdpbr-mig-configure__grid">
								<label class="fdpbr-mig-option">
									<input type="checkbox" name="migrate_db" value="1" checked>
									<div class="fdpbr-mig-option__card">
										<div class="fdpbr-mig-option__icon" style="background: #EDE9FE; color: var(--fdpbr-primary);">
											<span class="dashicons dashicons-database"></span>
										</div>
										<div class="fdpbr-mig-option__text">
											<strong><?php esc_html_e( 'Database', '5dp-backup-restore' ); ?></strong>
											<span><?php esc_html_e( 'Posts, pages, users, settings', '5dp-backup-restore' ); ?></span>
										</div>
										<div class="fdpbr-mig-option__check">
											<span class="dashicons dashicons-yes"></span>
										</div>
									</div>
								</label>

								<label class="fdpbr-mig-option">
									<input type="checkbox" name="migrate_plugins" value="1" checked>
									<div class="fdpbr-mig-option__card">
										<div class="fdpbr-mig-option__icon" style="background: #DBEAFE; color: var(--fdpbr-sky);">
											<span class="dashicons dashicons-admin-plugins"></span>
										</div>
										<div class="fdpbr-mig-option__text">
											<strong><?php esc_html_e( 'Plugins', '5dp-backup-restore' ); ?></strong>
											<span><?php esc_html_e( 'All installed plugins', '5dp-backup-restore' ); ?></span>
										</div>
										<div class="fdpbr-mig-option__check">
											<span class="dashicons dashicons-yes"></span>
										</div>
									</div>
								</label>

								<label class="fdpbr-mig-option">
									<input type="checkbox" name="migrate_themes" value="1" checked>
									<div class="fdpbr-mig-option__card">
										<div class="fdpbr-mig-option__icon" style="background: #FEF3C7; color: var(--fdpbr-amber);">
											<span class="dashicons dashicons-admin-appearance"></span>
										</div>
										<div class="fdpbr-mig-option__text">
											<strong><?php esc_html_e( 'Themes', '5dp-backup-restore' ); ?></strong>
											<span><?php esc_html_e( 'All installed themes', '5dp-backup-restore' ); ?></span>
										</div>
										<div class="fdpbr-mig-option__check">
											<span class="dashicons dashicons-yes"></span>
										</div>
									</div>
								</label>

								<label class="fdpbr-mig-option">
									<input type="checkbox" name="migrate_uploads" value="1" checked>
									<div class="fdpbr-mig-option__card">
										<div class="fdpbr-mig-option__icon" style="background: #D1FAE5; color: var(--fdpbr-success);">
											<span class="dashicons dashicons-format-image"></span>
										</div>
										<div class="fdpbr-mig-option__text">
											<strong><?php esc_html_e( 'Media Uploads', '5dp-backup-restore' ); ?></strong>
											<span><?php esc_html_e( 'Images, videos, documents', '5dp-backup-restore' ); ?></span>
										</div>
										<div class="fdpbr-mig-option__check">
											<span class="dashicons dashicons-yes"></span>
										</div>
									</div>
								</label>
							</div>
						</div>

						<div class="fdpbr-mig-configure__actions">
							<button type="button" class="fdpbr-btn fdpbr-btn--secondary" id="fdpbr-migration-back">
								<span class="dashicons dashicons-arrow-left-alt2"></span>
								<?php esc_html_e( 'Back', '5dp-backup-restore' ); ?>
							</button>
							<button type="button" id="fdpbr-migration-start" class="fdpbr-btn fdpbr-btn--primary">
								<span class="dashicons dashicons-migrate"></span>
								<?php esc_html_e( 'Start Migration', '5dp-backup-restore' ); ?>
							</button>
						</div>
					</div>

					<!-- Step 3: Migration Progress -->
					<div class="fdpbr-wizard__content" data-step="3">
						<!-- Active progress panel -->
						<div class="fdpbr-restore-progress" id="fdpbr-migration-progress-panel">
							<div class="fdpbr-restore-progress__pct" id="fdpbr-migration-progress-pct">0%</div>

							<div class="fdpbr-progress-wrapper fdpbr-restore-progress__bar-wrap">
								<div class="fdpbr-progress">
									<div class="fdpbr-progress__bar" id="fdpbr-migration-progress-fill" style="width: 0;"></div>
								</div>
							</div>

							<p class="fdpbr-restore-progress__step" id="fdpbr-migration-step"><?php esc_html_e( 'Waiting to start...', '5dp-backup-restore' ); ?></p>

							<!-- Phase indicators -->
							<div class="fdpbr-restore-phases" id="fdpbr-migration-phases">
								<div class="fdpbr-restore-phase" data-phase="connect">
									<span class="fdpbr-restore-phase__icon dashicons dashicons-marker"></span>
									<span class="fdpbr-restore-phase__label"><?php esc_html_e( 'Connect', '5dp-backup-restore' ); ?></span>
								</div>
								<div class="fdpbr-restore-phase" data-phase="package">
									<span class="fdpbr-restore-phase__icon dashicons dashicons-marker"></span>
									<span class="fdpbr-restore-phase__label"><?php esc_html_e( 'Package', '5dp-backup-restore' ); ?></span>
								</div>
								<div class="fdpbr-restore-phase" data-phase="upload">
									<span class="fdpbr-restore-phase__icon dashicons dashicons-marker"></span>
									<span class="fdpbr-restore-phase__label"><?php esc_html_e( 'Upload', '5dp-backup-restore' ); ?></span>
								</div>
								<div class="fdpbr-restore-phase" data-phase="restore">
									<span class="fdpbr-restore-phase__icon dashicons dashicons-marker"></span>
									<span class="fdpbr-restore-phase__label"><?php esc_html_e( 'Restore', '5dp-backup-restore' ); ?></span>
								</div>
								<div class="fdpbr-restore-phase" data-phase="finalize">
									<span class="fdpbr-restore-phase__icon dashicons dashicons-marker"></span>
									<span class="fdpbr-restore-phase__label"><?php esc_html_e( 'Finalize', '5dp-backup-restore' ); ?></span>
								</div>
							</div>

							<!-- Elapsed timer -->
							<div class="fdpbr-restore-progress__elapsed" id="fdpbr-migration-elapsed">
								<span class="dashicons dashicons-clock"></span>
								<span id="fdpbr-migration-elapsed-text"><?php esc_html_e( 'Elapsed: 0s', '5dp-backup-restore' ); ?></span>
							</div>

							<!-- Warning -->
							<div class="fdpbr-restore-progress__warning">
								<span class="dashicons dashicons-warning"></span>
								<?php esc_html_e( 'Do not close this page during migration.', '5dp-backup-restore' ); ?>
							</div>
						</div>

						<!-- Activity Log -->
						<div class="fdpbr-mini-log" style="margin-top: 24px;">
							<div class="fdpbr-mini-log__header">
								<span class="dashicons dashicons-list-view"></span>
								<?php esc_html_e( 'Activity Log', '5dp-backup-restore' ); ?>
							</div>
							<div class="fdpbr-mini-log__body" id="fdpbr-migration-log">
								<div class="fdpbr-mini-log__line fdpbr-mini-log__line--info">
									<span class="fdpbr-mini-log__time"><?php echo esc_html( wp_date( 'H:i:s' ) ); ?></span>
									<span class="fdpbr-mini-log__msg"><?php esc_html_e( 'Waiting to start...', '5dp-backup-restore' ); ?></span>
								</div>
							</div>
						</div>

						<!-- Success panel -->
						<div class="fdpbr-restore-result fdpbr-restore-result--success" id="fdpbr-migration-result-success" style="display:none;">
							<div class="fdpbr-restore-result__icon">
								<span class="dashicons dashicons-yes-alt"></span>
							</div>
							<h3 class="fdpbr-restore-result__title"><?php esc_html_e( 'Migration Complete!', '5dp-backup-restore' ); ?></h3>
							<p class="fdpbr-restore-result__desc" id="fdpbr-migration-result-time"></p>
							<div class="fdpbr-restore-result__checklist">
								<div class="fdpbr-restore-result__checklist-item">
									<span class="dashicons dashicons-info-outline"></span>
									<div>
										<strong><?php esc_html_e( 'Re-save Permalinks on Destination', '5dp-backup-restore' ); ?></strong>
										<p><?php esc_html_e( 'Go to Settings > Permalinks on the destination site and click Save Changes to flush rewrite rules.', '5dp-backup-restore' ); ?></p>
									</div>
								</div>
								<div class="fdpbr-restore-result__checklist-item">
									<span class="dashicons dashicons-info-outline"></span>
									<div>
										<strong><?php esc_html_e( 'Review the Destination Site', '5dp-backup-restore' ); ?></strong>
										<p><?php esc_html_e( 'Verify that all content, media, and settings transferred correctly.', '5dp-backup-restore' ); ?></p>
									</div>
								</div>
							</div>
							<div class="fdpbr-restore-result__actions">
								<a href="<?php echo esc_url( admin_url() ); ?>" class="fdpbr-btn fdpbr-btn--primary"><?php esc_html_e( 'Go to Dashboard', '5dp-backup-restore' ); ?></a>
								<button type="button" class="fdpbr-btn fdpbr-btn--secondary" id="fdpbr-migration-new"><?php esc_html_e( 'New Migration', '5dp-backup-restore' ); ?></button>
							</div>
						</div>

						<!-- Failure panel -->
						<div class="fdpbr-restore-result fdpbr-restore-result--error" id="fdpbr-migration-result-error" style="display:none;">
							<div class="fdpbr-restore-result__icon">
								<span class="dashicons dashicons-dismiss"></span>
							</div>
							<h3 class="fdpbr-restore-result__title"><?php esc_html_e( 'Migration Failed', '5dp-backup-restore' ); ?></h3>
							<p class="fdpbr-restore-result__desc" id="fdpbr-migration-error-msg"><?php esc_html_e( 'An error occurred during migration.', '5dp-backup-restore' ); ?></p>
							<div class="fdpbr-restore-result__actions">
								<button type="button" class="fdpbr-btn fdpbr-btn--primary" id="fdpbr-migration-retry"><?php esc_html_e( 'Try Again', '5dp-backup-restore' ); ?></button>
							</div>
						</div>
					</div>
				</div>

			</div>
		</div>

		<!-- Incoming Migration Activity (source-side) -->
		<div class="fdpbr-section-card" id="fdpbr-incoming-migration-card" style="display: none;">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Incoming Migration Activity', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc" id="fdpbr-incoming-source-url"></p>
				</div>
				<span class="fdpbr-incoming-badge" id="fdpbr-incoming-badge">
					<span class="fdpbr-incoming-badge__dot"></span>
					<span id="fdpbr-incoming-badge-text"><?php esc_html_e( 'Active', '5dp-backup-restore' ); ?></span>
				</span>
			</div>
			<div class="fdpbr-section-card__body">
				<div class="fdpbr-mig-incoming-progress">
					<!-- Progress bar -->
					<div class="fdpbr-progress-wrapper" style="margin-bottom: 12px;">
						<div class="fdpbr-progress" style="height: 8px; border-radius: 4px; background: var(--fdpbr-gray-100);">
							<div class="fdpbr-progress__bar" id="fdpbr-incoming-progress-fill" style="width: 0; border-radius: 4px; background: linear-gradient(90deg, var(--fdpbr-primary), #9333EA);"></div>
						</div>
					</div>

					<div class="fdpbr-mig-incoming-progress__info">
						<span class="fdpbr-mig-incoming-progress__step" id="fdpbr-incoming-step"><?php esc_html_e( 'Waiting...', '5dp-backup-restore' ); ?></span>
						<span class="fdpbr-mig-incoming-progress__elapsed" id="fdpbr-incoming-elapsed"></span>
					</div>
				<div class="fdpbr-mig-incoming-progress__actions" style="margin-top: 16px; text-align: center;">
					<button type="button" class="fdpbr-btn fdpbr-btn--danger fdpbr-btn--small" id="fdpbr-incoming-abort">
						<span class="dashicons dashicons-no-alt"></span>
						<?php esc_html_e( 'Abort Migration', '5dp-backup-restore' ); ?>
					</button>
				</div>
				</div>
			</div>
		</div>

		<!-- Accept Incoming Migration -->
		<div class="fdpbr-section-card" id="fdpbr-accept-incoming-card">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Accept Incoming Migration', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Share this key with the source site to allow it to push data to this site.', '5dp-backup-restore' ); ?></p>
				</div>
			</div>
			<div class="fdpbr-section-card__body">
				<?php
				$migration_key = get_option( 'fdpbr_migration_key', '' );
				if ( empty( $migration_key ) ) {
					$migration_key = wp_generate_password( 32, false );
					update_option( 'fdpbr_migration_key', $migration_key, false );
				}
				?>
				<div class="fdpbr-mig-incoming">
					<div class="fdpbr-mig-incoming__key-row">
						<div class="fdpbr-mig-incoming__key-icon">
							<span class="dashicons dashicons-admin-network"></span>
						</div>
						<input type="text" class="fdpbr-input fdpbr-mig-incoming__key-input" value="<?php echo esc_attr( $migration_key ); ?>" readonly id="fdpbr-this-migration-key">
						<button type="button" class="fdpbr-btn fdpbr-btn--secondary fdpbr-btn--small" id="fdpbr-copy-key">
							<span class="dashicons dashicons-clipboard"></span>
							<span class="fdpbr-copy-key__text"><?php esc_html_e( 'Copy', '5dp-backup-restore' ); ?></span>
						</button>
						<button type="button" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small" id="fdpbr-regenerate-key">
							<span class="dashicons dashicons-update"></span>
							<?php esc_html_e( 'Regenerate', '5dp-backup-restore' ); ?>
						</button>
					</div>
					<p class="fdpbr-field__help"><?php esc_html_e( 'Copy this key and paste it into the "Migration Key" field on the site you want to migrate from.', '5dp-backup-restore' ); ?></p>
				</div>
			</div>
		</div>

	</div>
</div>
