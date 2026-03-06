<?php
/**
 * Restore page template.
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

		<!-- Restore Wizard -->
		<div class="fdpbr-section-card">
			<div class="fdpbr-section-card__header">
				<div>
					<h2><?php esc_html_e( 'Restore Your Site', '5dp-backup-restore' ); ?></h2>
					<p class="fdpbr-section-card__desc"><?php esc_html_e( 'Upload a backup file or select one from your existing backups or remote storage.', '5dp-backup-restore' ); ?></p>
				</div>
			</div>
			<div class="fdpbr-section-card__body">

				<!-- Wizard Steps -->
				<div class="fdpbr-wizard" id="fdpbr-restore-wizard">
					<div class="fdpbr-wizard__steps">
						<div class="fdpbr-wizard__step fdpbr-wizard__step--active" data-step="1">
							<span class="fdpbr-wizard__step-number">1</span>
							<span class="fdpbr-wizard__step-label"><?php esc_html_e( 'Select Source', '5dp-backup-restore' ); ?></span>
						</div>
						<div class="fdpbr-wizard__step-line"></div>
						<div class="fdpbr-wizard__step" data-step="2">
							<span class="fdpbr-wizard__step-number">2</span>
							<span class="fdpbr-wizard__step-label"><?php esc_html_e( 'Configure', '5dp-backup-restore' ); ?></span>
						</div>
						<div class="fdpbr-wizard__step-line"></div>
						<div class="fdpbr-wizard__step" data-step="3">
							<span class="fdpbr-wizard__step-number">3</span>
							<span class="fdpbr-wizard__step-label"><?php esc_html_e( 'Restore', '5dp-backup-restore' ); ?></span>
						</div>
					</div>

					<!-- Step 1: Select Source -->
					<div class="fdpbr-wizard__content fdpbr-wizard__content--active" data-step="1">
						<div class="fdpbr-upload-zone" id="fdpbr-upload-zone">

							<!-- Idle state -->
							<div class="fdpbr-upload-zone__idle" id="fdpbr-upload-idle">
								<span class="dashicons dashicons-upload"></span>
								<p><?php esc_html_e( 'Drag & drop a backup file here, or click to browse.', '5dp-backup-restore' ); ?></p>
								<p class="fdpbr-upload-zone__hint"><?php esc_html_e( 'Supports .fdpbr, .zip, and .sql files. Large files are uploaded in chunks.', '5dp-backup-restore' ); ?></p>
							</div>

							<!-- Upload progress state (hidden until upload starts) -->
							<div class="fdpbr-upload-zone__progress" id="fdpbr-upload-progress" style="display:none;">
								<div class="fdpbr-circle-spinner"></div>
								<p class="fdpbr-upload-zone__progress-filename" id="fdpbr-upload-filename"></p>
								<div class="fdpbr-progress-bar fdpbr-upload-progress-bar">
									<div class="fdpbr-progress-bar__fill" id="fdpbr-upload-progress-fill" style="width:0;"></div>
								</div>
								<p class="fdpbr-upload-zone__progress-label" id="fdpbr-upload-progress-label">0%</p>
								<p class="fdpbr-upload-zone__warning">
									<span class="dashicons dashicons-warning"></span>
									<?php esc_html_e( 'Do not reload or close this page during upload.', '5dp-backup-restore' ); ?>
								</p>
								<button type="button" id="fdpbr-cancel-upload" class="fdpbr-upload-cancel-btn">
									<?php esc_html_e( 'Cancel', '5dp-backup-restore' ); ?>
								</button>
							</div>

							<input type="file" id="fdpbr-backup-file" accept=".zip,.sql,.gz,.fdpbr" style="display: none;">
						</div>

						<!-- Previously uploaded files (populated by JS on load) -->
						<div id="fdpbr-uploaded-files-section" style="display:none;">
							<div class="fdpbr-uploaded-files__header">
								<p class="fdpbr-uploaded-files__label">
									<span class="dashicons dashicons-media-archive"></span>
									<?php esc_html_e( 'Previously Uploaded Files', '5dp-backup-restore' ); ?>
								</p>
								<button type="button" class="fdpbr-btn fdpbr-btn--small fdpbr-btn--danger" id="fdpbr-clean-uploads">
									<span class="dashicons dashicons-trash"></span>
									<?php esc_html_e( 'Clear All', '5dp-backup-restore' ); ?>
								</button>
							</div>
							<p class="fdpbr-uploaded-files__hint" id="fdpbr-uploads-hint">
								<?php esc_html_e( 'These files remain from previous uploads or aborted restores. Clear them to free disk space before a fresh import.', '5dp-backup-restore' ); ?>
							</p>
							<div id="fdpbr-uploaded-files-list" class="fdpbr-uploaded-files__list"></div>
						</div>

						<div class="fdpbr-or-divider">
							<span><?php esc_html_e( 'OR', '5dp-backup-restore' ); ?></span>
						</div>

						<div class="fdpbr-restore-sources" id="fdpbr-restore-sources">
							<button type="button" class="fdpbr-btn fdpbr-btn--secondary fdpbr-restore-source" data-source="existing">
								<span class="dashicons dashicons-cloud-saved"></span>
								<?php esc_html_e( 'Select from Existing Backups', '5dp-backup-restore' ); ?>
							</button>
							<button type="button" class="fdpbr-btn fdpbr-btn--secondary fdpbr-restore-source" data-source="remote">
								<span class="dashicons dashicons-cloud"></span>
								<?php esc_html_e( 'Download from Remote Storage', '5dp-backup-restore' ); ?>
							</button>
						</div>

						<!-- Existing backup picker (shown when "Select from Existing" is clicked) -->
						<div id="fdpbr-backup-picker" style="display:none;">
							<div class="fdpbr-backup-picker__header">
								<button type="button" class="fdpbr-backup-picker__back" id="fdpbr-picker-back">
									&larr; <?php esc_html_e( 'Back', '5dp-backup-restore' ); ?>
								</button>
								<h3><?php esc_html_e( 'Select a Backup to Restore', '5dp-backup-restore' ); ?></h3>
							</div>
							<div id="fdpbr-backup-picker-list" class="fdpbr-backup-picker__list">
								<div class="fdpbr-backup-picker__loading">
									<div class="fdpbr-circle-spinner"></div>
									<span><?php esc_html_e( 'Loading backups...', '5dp-backup-restore' ); ?></span>
								</div>
							</div>
						</div>
					</div>

					<!-- Step 2: Configure Restore -->
					<div class="fdpbr-wizard__content" data-step="2">

						<!-- File info banner (populated by JS after upload) -->
						<div class="fdpbr-restore-file-info" id="fdpbr-restore-file-info" style="display: none;">
							<span class="dashicons dashicons-media-archive"></span>
							<div class="fdpbr-restore-file-info__text">
								<strong id="fdpbr-restore-filename">&nbsp;</strong>
								<span id="fdpbr-restore-filesize"></span>
							</div>
						</div>

						<!-- Restore options -->
						<div class="fdpbr-restore-options" id="fdpbr-restore-options" style="display: none;">
							<h3><?php esc_html_e( 'What to Restore', '5dp-backup-restore' ); ?></h3>

							<label class="fdpbr-restore-option">
								<input type="checkbox" id="fdpbr-restore-db" name="restore_db" value="1" checked>
								<span class="fdpbr-restore-option__icon dashicons dashicons-database"></span>
								<span class="fdpbr-restore-option__text">
									<strong><?php esc_html_e( 'Database', '5dp-backup-restore' ); ?></strong>
									<em><?php esc_html_e( 'All tables, posts, settings and users', '5dp-backup-restore' ); ?></em>
								</span>
							</label>

							<label class="fdpbr-restore-option">
								<input type="checkbox" id="fdpbr-restore-files" name="restore_files" value="1" checked>
								<span class="fdpbr-restore-option__icon dashicons dashicons-admin-plugins"></span>
								<span class="fdpbr-restore-option__text">
									<strong><?php esc_html_e( 'Files', '5dp-backup-restore' ); ?></strong>
									<em><?php esc_html_e( 'Themes, plugins, uploads and core files', '5dp-backup-restore' ); ?></em>
								</span>
							</label>
						</div>

						<!-- Actions -->
						<div class="fdpbr-restore-actions" id="fdpbr-restore-actions" style="display: none;">
							<button type="button" class="fdpbr-btn fdpbr-btn--secondary" id="fdpbr-back-step1">
								&larr; <?php esc_html_e( 'Back', '5dp-backup-restore' ); ?>
							</button>
							<button type="button" class="fdpbr-btn fdpbr-btn--primary" id="fdpbr-start-restore-btn">
								<span class="dashicons dashicons-update"></span>
								<?php esc_html_e( 'Start Restore', '5dp-backup-restore' ); ?>
							</button>
						</div>

					</div>

					<!-- Step 3: Restore Progress -->
					<div class="fdpbr-wizard__content" data-step="3">
						<div class="fdpbr-restore-progress" id="fdpbr-restore-progress-panel">

							<!-- Big percentage -->
							<div class="fdpbr-restore-progress__pct" id="fdpbr-restore-progress-pct">0%</div>

							<!-- Progress bar (reuses progress-wrapper pattern) -->
							<div class="fdpbr-progress-wrapper fdpbr-restore-progress__bar-wrap">
								<div class="fdpbr-progress">
									<div class="fdpbr-progress__bar" id="fdpbr-restore-progress-fill" style="width: 0;"></div>
								</div>
							</div>

							<!-- Step description -->
							<p class="fdpbr-restore-progress__step" id="fdpbr-restore-step"><?php esc_html_e( 'Waiting to start...', '5dp-backup-restore' ); ?></p>

							<!-- Phase indicators -->
							<div class="fdpbr-restore-phases" id="fdpbr-restore-phases">
								<div class="fdpbr-restore-phase" data-phase="verify">
									<span class="fdpbr-restore-phase__icon dashicons dashicons-marker"></span>
									<span class="fdpbr-restore-phase__label"><?php esc_html_e( 'Verify', '5dp-backup-restore' ); ?></span>
								</div>
								<div class="fdpbr-restore-phase" data-phase="unpack">
									<span class="fdpbr-restore-phase__icon dashicons dashicons-download"></span>
									<span class="fdpbr-restore-phase__label"><?php esc_html_e( 'Unpack', '5dp-backup-restore' ); ?></span>
								</div>
								<div class="fdpbr-restore-phase" data-phase="files">
									<span class="fdpbr-restore-phase__icon dashicons dashicons-portfolio"></span>
									<span class="fdpbr-restore-phase__label"><?php esc_html_e( 'Files', '5dp-backup-restore' ); ?></span>
								</div>
								<div class="fdpbr-restore-phase" data-phase="database">
									<span class="fdpbr-restore-phase__icon dashicons dashicons-database"></span>
									<span class="fdpbr-restore-phase__label"><?php esc_html_e( 'Database', '5dp-backup-restore' ); ?></span>
								</div>
								<div class="fdpbr-restore-phase" data-phase="search_replace">
									<span class="fdpbr-restore-phase__icon dashicons dashicons-search"></span>
									<span class="fdpbr-restore-phase__label"><?php esc_html_e( 'Replace', '5dp-backup-restore' ); ?></span>
								</div>
								<div class="fdpbr-restore-phase" data-phase="cleanup">
									<span class="fdpbr-restore-phase__icon dashicons dashicons-yes-alt"></span>
									<span class="fdpbr-restore-phase__label"><?php esc_html_e( 'Finalize', '5dp-backup-restore' ); ?></span>
								</div>
							</div>

							<!-- Elapsed timer -->
							<div class="fdpbr-restore-progress__elapsed" id="fdpbr-restore-elapsed">
								<span class="dashicons dashicons-clock"></span>
								<span id="fdpbr-restore-elapsed-text"><?php esc_html_e( 'Elapsed: 0s', '5dp-backup-restore' ); ?></span>
							</div>

							<!-- Warning -->
							<div class="fdpbr-restore-progress__warning">
								<span class="dashicons dashicons-warning"></span>
								<?php esc_html_e( 'Do not close or reload this page during restore.', '5dp-backup-restore' ); ?>
							</div>
						</div>

						<!-- Completion state (hidden until done) -->
						<div class="fdpbr-restore-result fdpbr-restore-result--success" id="fdpbr-restore-result-success" style="display:none;">
							<div class="fdpbr-restore-result__icon">
								<span class="dashicons dashicons-yes-alt"></span>
							</div>
							<h3 class="fdpbr-restore-result__title"><?php esc_html_e( 'Restore Complete!', '5dp-backup-restore' ); ?></h3>
							<p class="fdpbr-restore-result__desc" id="fdpbr-restore-success-desc"><?php esc_html_e( 'Your site has been restored successfully.', '5dp-backup-restore' ); ?></p>

							<!-- Post-restore checklist -->
							<div class="fdpbr-restore-result__checklist">
								<div class="fdpbr-restore-result__checklist-item">
									<span class="dashicons dashicons-info-outline"></span>
									<div>
										<strong><?php esc_html_e( 'Re-save Permalinks', '5dp-backup-restore' ); ?></strong>
										<p><?php esc_html_e( 'Go to Settings > Permalinks and click "Save Changes" to regenerate rewrite rules.', '5dp-backup-restore' ); ?></p>
										<a href="<?php echo esc_url( admin_url( 'options-permalink.php' ) ); ?>" class="fdpbr-btn fdpbr-btn--small fdpbr-btn--secondary" target="_blank">
											<span class="dashicons dashicons-admin-links"></span>
											<?php esc_html_e( 'Open Permalinks', '5dp-backup-restore' ); ?>
										</a>
									</div>
								</div>
								<div class="fdpbr-restore-result__checklist-item">
									<span class="dashicons dashicons-info-outline"></span>
									<div>
										<strong><?php esc_html_e( 'Review Your Site', '5dp-backup-restore' ); ?></strong>
										<p><?php esc_html_e( 'Visit your site\'s frontend and admin to make sure everything looks correct.', '5dp-backup-restore' ); ?></p>
									</div>
								</div>
							</div>

							<div class="fdpbr-restore-result__actions">
								<a href="<?php echo esc_url( admin_url() ); ?>" class="fdpbr-btn fdpbr-btn--primary">
									<span class="dashicons dashicons-admin-home"></span>
									<?php esc_html_e( 'Go to Dashboard', '5dp-backup-restore' ); ?>
								</a>
								<a href="<?php echo esc_url( home_url() ); ?>" class="fdpbr-btn fdpbr-btn--secondary" target="_blank">
									<span class="dashicons dashicons-external"></span>
									<?php esc_html_e( 'View Site', '5dp-backup-restore' ); ?>
								</a>
							</div>
						</div>

						<!-- Failure state (hidden until error) -->
						<div class="fdpbr-restore-result fdpbr-restore-result--error" id="fdpbr-restore-result-error" style="display:none;">
							<div class="fdpbr-restore-result__icon">
								<span class="dashicons dashicons-dismiss"></span>
							</div>
							<h3 class="fdpbr-restore-result__title"><?php esc_html_e( 'Restore Failed', '5dp-backup-restore' ); ?></h3>
							<p class="fdpbr-restore-result__desc" id="fdpbr-restore-error-desc"><?php esc_html_e( 'An error occurred during the restore process.', '5dp-backup-restore' ); ?></p>
							<div class="fdpbr-restore-result__actions">
								<button type="button" class="fdpbr-btn fdpbr-btn--primary" onclick="location.reload()">
									<span class="dashicons dashicons-update"></span>
									<?php esc_html_e( 'Try Again', '5dp-backup-restore' ); ?>
								</button>
							</div>
						</div>
					</div>
				</div>

			</div>
		</div>

	</div>
</div>
