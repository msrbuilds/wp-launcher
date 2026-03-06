/**
 * 5DP Backup & Restore - Backup Page JavaScript
 *
 * Handles backup creation, progress polling, and backup management.
 *
 * @package FiveDPBR
 * @since   1.0.0
 */

(function( $ ) {
	'use strict';

	var BackupManager = {

		init: function() {
			this.bindBackupType();
			this.bindStartBackup();
			this.bindBackupActions();
			this.updateSections();
		},

		/**
		 * Bind backup type switching — show/hide sections based on type.
		 */
		bindBackupType: function() {
			var self = this;

			$( document ).on( 'click', '[data-name="backup_type"] .fdpbr-btn-group__item', function() {
				self.updateSections();
			});
		},

		/**
		 * Show/hide content and exclude sections based on backup type.
		 */
		updateSections: function() {
			var type = $( '[data-name="backup_type"] .fdpbr-btn-group__item--active' ).data( 'value' ) || 'full';
			var $content = $( '#fdpbr-content-section' );
			var $exclude = $( '#fdpbr-exclude-section' );

			if ( 'custom' === type ) {
				// Custom — user picks everything.
				$content.slideDown( 200 );
				$content.find( 'input[type="checkbox"]' ).prop( 'disabled', false );
				$exclude.slideDown( 200 );
				$exclude.find( '.fdpbr-field' ).slideDown( 200 );
			} else {
				// Full / Database / Files — hide content toggles and excludes.
				$content.slideUp( 200 );
				$exclude.slideUp( 200 );
			}
		},

		/**
		 * Bind start backup button.
		 */
		bindStartBackup: function() {
			var self = this;

			$( '#fdpbr-start-backup' ).on( 'click', function() {
				var $btn = $( this );
				var $form = $( '#fdpbr-backup-form' );

				// Get backup type from button group.
				var backupType = $form.find( '[data-name="backup_type"] .fdpbr-btn-group__item--active' ).data( 'value' ) || 'full';

				// Get selected storage destinations.
				var storage = [];
				$form.find( '[data-name="storage_dest"] .fdpbr-btn-group__item--active' ).each( function() {
					storage.push( $( this ).data( 'value' ) );
				});
				if ( ! storage.length ) {
					storage.push( 'local' );
				}

				// Get included components.
				var include = [];
				$form.find( 'input[name="include[]"]:checked:not(:disabled)' ).each( function() {
					include.push( $( this ).val() );
				});

				var backupName   = $form.find( 'input[name="backup_name"]' ).val();
				var excludePaths  = $form.find( 'textarea[name="exclude_paths"]' ).val();
				var excludeTables = $form.find( 'textarea[name="exclude_tables"]' ).val();

				$btn.prop( 'disabled', true ).html(
					'<span class="fdpbr-spinner fdpbr-spinner--white"></span> ' +
					( fdpbrAdmin.i18n.backing_up || 'Backing up...' )
				);

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action:         'fdpbr_start_backup',
						nonce:          fdpbrAdmin.nonce,
						type:           backupType,
						destinations:   storage,
						include:        include,
						name:           backupName,
						exclude_paths:  excludePaths,
						exclude_tables: excludeTables
					},
					success: function( response ) {
						if ( response.success && response.data.job_id ) {
							self.showProgress( response.data.job_id );
						} else {
							FDPBR.showToast( response.data.message || fdpbrAdmin.i18n.backup_failed, 'error' );
							self.resetButton();
						}
					},
					error: function() {
						FDPBR.showToast( fdpbrAdmin.i18n.network_error, 'error' );
						self.resetButton();
					}
				});
			});
		},

		/**
		 * Reset the start button.
		 */
		resetButton: function() {
			$( '#fdpbr-start-backup' ).prop( 'disabled', false ).html(
				'<span class="dashicons dashicons-cloud-upload" style="margin-top: 3px;"></span> ' +
				( fdpbrAdmin.i18n.backup_now || 'Start Backup' )
			);
		},

		/**
		 * Get current time string HH:MM:SS.
		 */
		timeNow: function() {
			var d = new Date();
			return ('0' + d.getHours()).slice(-2) + ':' +
			       ('0' + d.getMinutes()).slice(-2) + ':' +
			       ('0' + d.getSeconds()).slice(-2);
		},

		/**
		 * Append a line to the mini activity log.
		 *
		 * @param {string} msg   Log message.
		 * @param {string} level info|success|warning|error
		 */
		addLogLine: function( msg, level ) {
			level = level || 'info';
			var $log = $( '#fdpbr-backup-log' );
			var line = '<div class="fdpbr-mini-log__line fdpbr-mini-log__line--' + level + '">' +
				'<span class="fdpbr-mini-log__time">' + this.timeNow() + '</span>' +
				'<span class="fdpbr-mini-log__msg">' + $( '<span>' ).text( msg ).html() + '</span>' +
				'</div>';
			$log.append( line );
			$log.scrollTop( $log[0].scrollHeight );
		},

		/** Track last step to avoid duplicate log entries. */
		_lastStep: '',

		/**
		 * Show and poll backup progress.
		 *
		 * @param {string} jobId The job ID to track.
		 */
		showProgress: function( jobId ) {
			$( '#fdpbr-backup-progress' ).slideDown();
			this.addLogLine( 'Backup job started (ID: ' + jobId + ')', 'info' );
			this._lastStep = '';

			var self = this;

			FDPBR.pollJobProgress( jobId, function( data ) {
				var pct = data.percent || 0;

				// Update progress bar.
				$( '#fdpbr-backup-bar' ).css( 'width', pct + '%' );
				$( '#fdpbr-backup-percent' ).text( pct + '%' );

				// Update phase label.
				var step = data.step || '';
				$( '#fdpbr-backup-phase' ).text( step );
				$( '#fdpbr-backup-step' ).text( step );

				// Append log line if step changed.
				if ( step && step !== self._lastStep ) {
					self._lastStep = step;
					self.addLogLine( step, 'info' );
				}

				if ( 'completed' === data.status ) {
					// Success state.
					$( '#fdpbr-backup-bar' ).css( 'width', '100%' );
					$( '#fdpbr-backup-percent' ).text( '100%' );
					$( '#fdpbr-backup-status-badge' )
						.removeClass( 'fdpbr-badge--warning' )
						.addClass( 'fdpbr-badge--success' )
						.text( 'Completed' );
					$( '#fdpbr-backup-bar' ).css( 'background', 'var(--fdpbr-success)' );
					self.addLogLine( 'Backup completed successfully!', 'success' );
					FDPBR.showToast( fdpbrAdmin.i18n.backup_complete || 'Backup complete!', 'success' );
					setTimeout( function() { location.reload(); }, 2000 );
				} else if ( 'failed' === data.status ) {
					// Error state.
					$( '#fdpbr-backup-status-badge' )
						.removeClass( 'fdpbr-badge--warning' )
						.addClass( 'fdpbr-badge--danger' )
						.text( 'Failed' );
					$( '#fdpbr-backup-bar' ).css( 'background', 'var(--fdpbr-danger)' );
					self.addLogLine( data.error || 'Backup failed.', 'error' );
					FDPBR.showToast( data.error || fdpbrAdmin.i18n.backup_failed, 'error' );
					self.resetButton();
				}
			});
		},

		/**
		 * Bind backup row action buttons.
		 */
		bindBackupActions: function() {
			// Delete backup.
			$( document ).on( 'click', '.fdpbr-delete-backup', function() {
				if ( ! confirm( fdpbrAdmin.i18n.confirm_delete || 'Are you sure you want to delete this backup?' ) ) {
					return;
				}

				var $btn = $( this );
				var backupId = $btn.data( 'id' );

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action:    'fdpbr_delete_backup',
						nonce:     fdpbrAdmin.nonce,
						backup_id: backupId
					},
					success: function( response ) {
						if ( response.success ) {
							$btn.closest( 'tr' ).fadeOut( function() { $( this ).remove(); } );
							FDPBR.showToast( response.data.message, 'success' );
						} else {
							FDPBR.showToast( response.data.message || fdpbrAdmin.i18n.error, 'error' );
						}
					}
				});
			});

			// Download backup.
			$( document ).on( 'click', '.fdpbr-download-backup', function() {
				var backupId = $( this ).data( 'id' );
				var url = fdpbrAdmin.ajax_url +
					'?action=fdpbr_download_backup' +
					'&backup_id=' + encodeURIComponent( backupId ) +
					'&nonce=' + encodeURIComponent( fdpbrAdmin.nonce );

				window.location.href = url;
			});

			// Restore from backup.
			$( document ).on( 'click', '.fdpbr-restore-backup', function() {
				if ( ! confirm( fdpbrAdmin.i18n.confirm_restore || 'Are you sure you want to restore this backup?' ) ) {
					return;
				}
				window.location.href = fdpbrAdmin.ajax_url.replace( 'admin-ajax.php', 'admin.php?page=fdpbr-restore&backup_id=' + $( this ).data( 'id' ) );
			});
		}
	};

	$( document ).ready( function() {
		BackupManager.init();
	});

})( jQuery );
