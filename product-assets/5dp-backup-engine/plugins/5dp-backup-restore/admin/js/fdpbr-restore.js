/**
 * 5DP Backup & Restore - Restore Page JavaScript
 *
 * Handles restore wizard, file upload, and progress tracking.
 *
 * @package FiveDPBR
 * @since   1.0.0
 */

(function( $ ) {
	'use strict';

	var RestoreManager = {

		uploadedFilePath:   '',  // Path to uploaded file (upload flow).
		selectedBackupId:   '',  // backup_id from existing backup picker.
		_uploadXhr:         null,
		_uploadCancelled:   false,
		_restoreToken:      '',  // Secret token for nonce-free progress polling.
		_restoreJobId:      '',  // Current restore job ID.
		_restoreStartTime:  null,
		_elapsedInterval:   null,

		/**
		 * Ordered list of restore phases — must match server phase names.
		 */
		PHASES: [ 'verify', 'unpack', 'files', 'database', 'search_replace', 'cleanup' ],

		/**
		 * Map server step text to a phase key.
		 */
		stepToPhase: function( step ) {
			if ( ! step ) { return ''; }
			var s = step.toLowerCase();
			if ( s.indexOf( 'verif' ) !== -1 )          { return 'verify'; }
			if ( s.indexOf( 'unpack' ) !== -1 )          { return 'unpack'; }
			if ( s.indexOf( 'restor' ) !== -1 && s.indexOf( 'file' ) !== -1 ) { return 'files'; }
			if ( s.indexOf( 'extract' ) !== -1 )         { return 'files'; }
			if ( s.indexOf( 'import' ) !== -1 )          { return 'database'; }
			if ( s.indexOf( 'database' ) !== -1 )        { return 'database'; }
			if ( s.indexOf( 'search' ) !== -1 || s.indexOf( 'replace' ) !== -1 ) { return 'search_replace'; }
			if ( s.indexOf( 'finaliz' ) !== -1 || s.indexOf( 'cleanup' ) !== -1 ) { return 'cleanup'; }
			return '';
		},

		/**
		 * Update phase indicator UI.
		 */
		updatePhases: function( currentPhase ) {
			if ( ! currentPhase ) { return; }
			var found = false;
			var phases = this.PHASES;

			for ( var i = 0; i < phases.length; i++ ) {
				var $el = $( '.fdpbr-restore-phase[data-phase="' + phases[i] + '"]' );
				if ( phases[i] === currentPhase ) {
					found = true;
					$el.removeClass( 'fdpbr-restore-phase--done' ).addClass( 'fdpbr-restore-phase--active' );
				} else if ( ! found ) {
					$el.removeClass( 'fdpbr-restore-phase--active' ).addClass( 'fdpbr-restore-phase--done' );
				} else {
					$el.removeClass( 'fdpbr-restore-phase--active fdpbr-restore-phase--done' );
				}
			}
		},

		/**
		 * Mark all phases as done.
		 */
		markAllPhasesDone: function() {
			$( '.fdpbr-restore-phase' )
				.removeClass( 'fdpbr-restore-phase--active' )
				.addClass( 'fdpbr-restore-phase--done' );
		},

		/**
		 * Start the elapsed timer display.
		 */
		startElapsedTimer: function() {
			var self = this;
			self._restoreStartTime = Date.now();
			self.stopElapsedTimer();
			self._elapsedInterval = setInterval( function() {
				self.updateElapsedDisplay();
			}, 1000 );
		},

		/**
		 * Stop the elapsed timer.
		 */
		stopElapsedTimer: function() {
			if ( this._elapsedInterval ) {
				clearInterval( this._elapsedInterval );
				this._elapsedInterval = null;
			}
		},

		/**
		 * Update the elapsed time display.
		 */
		updateElapsedDisplay: function() {
			if ( ! this._restoreStartTime ) { return; }
			var elapsed = Math.floor( ( Date.now() - this._restoreStartTime ) / 1000 );
			var text;
			if ( elapsed < 60 ) {
				text = elapsed + 's';
			} else if ( elapsed < 3600 ) {
				var m = Math.floor( elapsed / 60 );
				var s = elapsed % 60;
				text = m + 'm ' + s + 's';
			} else {
				var h = Math.floor( elapsed / 3600 );
				var rm = Math.floor( ( elapsed % 3600 ) / 60 );
				text = h + 'h ' + rm + 'm';
			}
			$( '#fdpbr-restore-elapsed-text' ).text( 'Elapsed: ' + text );
		},

		init: function() {
			this.bindUploadZone();
			this.bindRestoreSources();
			this.bindStep2Actions();
			this.bindCancelUpload();
			this.bindCleanUploads();
			this.loadUploadedFiles();
			this.checkActiveRestoreJob();
		},

		/**
		 * Check for an in-progress restore job and resume the progress display.
		 * Called on page load so the user sees progress after a page reload.
		 * Uses both nonce-auth and token-based endpoints for resilience.
		 */
		checkActiveRestoreJob: function() {
			// Restore saved token from localStorage (survives page reload).
			var saved = RestoreManager.getSavedRestore();

			// Try nonce-based endpoint first (works when session is valid).
			$.ajax({
				url:  fdpbrAdmin.ajax_url,
				type: 'POST',
				data: { action: 'fdpbr_get_active_restore_job', nonce: fdpbrAdmin.nonce },
				success: function( response ) {
					if ( response && response.success && response.data.job && response.data.job.job_id ) {
						var job = response.data.job;
						RestoreManager._restoreJobId = job.job_id;
						if ( saved && saved.token ) {
							RestoreManager._restoreToken = saved.token;
						}
						RestoreManager.resumeRestoreUI( job );
						return;
					}
					// No active job via auth — try token-based if we have saved state.
					if ( saved && saved.token && saved.jobId ) {
						RestoreManager.checkActiveViaToken( saved );
					}
				},
				error: function() {
					// Auth failed (session lost) — try token-based.
					if ( saved && saved.token && saved.jobId ) {
						RestoreManager.checkActiveViaToken( saved );
					}
				}
			});
		},

		/**
		 * Check for active restore job via token-based endpoint (no auth needed).
		 */
		checkActiveViaToken: function( saved ) {
			$.ajax({
				url:  fdpbrAdmin.ajax_url,
				type: 'POST',
				data: {
					action:        'fdpbr_restore_chunk_token',
					restore_token: saved.token,
					job_id:        saved.jobId
				},
				success: function( response ) {
					if ( ! response || ! response.success || ! response.data ) { return; }
					var data = response.data;
					if ( 'completed' === data.status || 'failed' === data.status ) {
						RestoreManager.clearSavedRestore();
						return;
					}
					RestoreManager._restoreToken = saved.token;
					RestoreManager._restoreJobId = saved.jobId;
					RestoreManager.resumeRestoreUI( {
						job_id:  data.job_id,
						percent: data.percent,
						step:    data.step
					} );
				}
			});
		},

		/**
		 * Jump to step 3 and resume polling.
		 */
		resumeRestoreUI: function( job ) {
			if ( typeof fdpbrGoToStep === 'function' ) {
				fdpbrGoToStep( 'fdpbr-restore-wizard', 3 );
			}
			var pct = job.percent || 0;
			$( '#fdpbr-restore-progress-fill' ).css( 'width', pct + '%' );
			$( '#fdpbr-restore-progress-pct' ).text( pct + '%' );
			$( '#fdpbr-restore-step' ).text( job.step || '' );
			RestoreManager.updatePhases( RestoreManager.stepToPhase( job.step ) );
			RestoreManager.startElapsedTimer();
			FDPBR.showToast( 'Restore is in progress. Resuming display...', 'info' );
			RestoreManager.pollRestoreProgress( job.job_id );
		},

		/**
		 * Save restore token + job ID to localStorage (survives page reload).
		 */
		saveRestore: function( jobId, token ) {
			try {
				localStorage.setItem( 'fdpbr_restore', JSON.stringify( { jobId: jobId, token: token } ) );
			} catch ( e ) { /* localStorage unavailable */ }
		},

		/**
		 * Get saved restore state from localStorage.
		 */
		getSavedRestore: function() {
			try {
				var raw = localStorage.getItem( 'fdpbr_restore' );
				return raw ? JSON.parse( raw ) : null;
			} catch ( e ) { return null; }
		},

		/**
		 * Clear saved restore state.
		 */
		clearSavedRestore: function() {
			try { localStorage.removeItem( 'fdpbr_restore' ); } catch ( e ) { /* */ }
		},

		/**
		 * Bind drag-and-drop upload zone.
		 */
		bindUploadZone: function() {
			var $zone  = $( '#fdpbr-upload-zone' );
			var $input = $( '#fdpbr-backup-file' );

			if ( ! $zone.length ) {
				return;
			}

			// Click to open file browser.
			$zone.on( 'click', function( e ) {
				// Avoid triggering click when already uploading or clicking input.
				if ( $zone.hasClass( 'fdpbr-upload-zone--uploading' ) ) {
					return;
				}
				if ( $( e.target ).is( 'input' ) ) {
					return;
				}
				$input.trigger( 'click' );
			});

			// Drag events.
			$zone.on( 'dragover dragenter', function( e ) {
				e.preventDefault();
				e.stopPropagation();
				if ( ! $zone.hasClass( 'fdpbr-upload-zone--uploading' ) ) {
					$zone.addClass( 'fdpbr-upload-zone--active' );
				}
			});

			$zone.on( 'dragleave', function( e ) {
				e.preventDefault();
				e.stopPropagation();
				$zone.removeClass( 'fdpbr-upload-zone--active' );
			});

			$zone.on( 'drop', function( e ) {
				e.preventDefault();
				e.stopPropagation();
				$zone.removeClass( 'fdpbr-upload-zone--active' );
				if ( $zone.hasClass( 'fdpbr-upload-zone--uploading' ) ) {
					return;
				}
				var files = e.originalEvent.dataTransfer.files;
				if ( files.length ) {
					RestoreManager.handleFileUpload( files[0] );
				}
			});

			$input.on( 'change', function() {
				if ( this.files.length ) {
					RestoreManager.handleFileUpload( this.files[0] );
					// Reset so same file can be re-selected if needed.
					this.value = '';
				}
			});
		},

		/**
		 * Load previously uploaded files and display them below the upload zone.
		 */
		loadUploadedFiles: function() {
			$.ajax({
				url:  fdpbrAdmin.ajax_url,
				type: 'POST',
				data: { action: 'fdpbr_get_uploaded_files', nonce: fdpbrAdmin.nonce },
				success: function( response ) {
					if ( ! response || ! response.success ) { return; }
					var files = response.data.files || [];
					if ( ! files.length ) { return; }

					var $section = $( '#fdpbr-uploaded-files-section' );
					var $list    = $( '#fdpbr-uploaded-files-list' );
					var html     = '';

					$.each( files, function( i, f ) {
						var safeName = $( '<div>' ).text( f.name ).html();
						var safePath = $( '<div>' ).text( f.path ).html();
						html +=
							'<button type="button" class="fdpbr-uploaded-file-item"' +
							' data-path="' + safePath + '"' +
							' data-name="' + safeName + '"' +
							' data-size="' + $( '<div>' ).text( f.size ).html() + '">' +
							'<span class="dashicons dashicons-media-archive fdpbr-uploaded-file-item__icon"></span>' +
							'<span class="fdpbr-uploaded-file-item__info">' +
							'<strong>' + safeName + '</strong>' +
							'<span>' + f.size + ' &bull; ' + f.modified + '</span>' +
							'</span>' +
							'<span class="dashicons dashicons-yes-alt fdpbr-uploaded-file-item__use">Use</span>' +
							'</button>';
					});

					$list.html( html );
					$section.show();

					// Handle click.
					$list.on( 'click', '.fdpbr-uploaded-file-item', function() {
						var $item = $( this );
						RestoreManager.uploadedFilePath  = $item.data( 'path' );
						RestoreManager.selectedBackupId  = '';

						var fakeFile = {
							name:       $item.data( 'name' ),
							size:       0,
							_sizeLabel: $item.data( 'size' )
						};
						RestoreManager.showStep2( fakeFile );
					});
				}
			});
		},

		/**
		 * Bind the Cancel upload button.
		 */
		bindCancelUpload: function() {
			$( document ).on( 'click', '#fdpbr-cancel-upload', function( e ) {
				e.stopPropagation(); // Don't trigger zone click.
				RestoreManager._uploadCancelled = true;
				if ( RestoreManager._uploadXhr ) {
					RestoreManager._uploadXhr.abort();
					RestoreManager._uploadXhr = null;
				}
				RestoreManager.onUploadError(
					$( '#fdpbr-upload-zone' ),
					'Upload cancelled.'
				);
			});
		},

		/**
		 * Bind the "Clear All" button for cleaning the uploads directory.
		 */
		bindCleanUploads: function() {
			$( document ).on( 'click', '#fdpbr-clean-uploads', function() {
				if ( ! confirm( 'Delete all previously uploaded backup files? This cannot be undone.' ) ) {
					return;
				}

				var $btn = $( this );
				$btn.prop( 'disabled', true ).text( 'Cleaning...' );

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: { action: 'fdpbr_clean_uploads', nonce: fdpbrAdmin.nonce },
					success: function( response ) {
						if ( response && response.success ) {
							FDPBR.showToast( response.data.message, 'success' );
							$( '#fdpbr-uploaded-files-section' ).hide();
							$( '#fdpbr-uploaded-files-list' ).empty();
						} else {
							var msg = ( response && response.data && response.data.message )
								? response.data.message
								: 'Failed to clean uploads.';
							FDPBR.showToast( msg, 'error' );
							$btn.prop( 'disabled', false ).html( '<span class="dashicons dashicons-trash"></span> Clear All' );
						}
					},
					error: function() {
						FDPBR.showToast( 'Network error while cleaning uploads.', 'error' );
						$btn.prop( 'disabled', false ).html( '<span class="dashicons dashicons-trash"></span> Clear All' );
					}
				});
			});
		},

		/**
		 * Handle file upload (chunked for large files).
		 *
		 * @param {File} file The file to upload.
		 */
		handleFileUpload: function( file ) {
			// Use server-calculated chunk size (based on PHP upload limits), fall back to 10MB.
			var chunkSize    = ( fdpbrAdmin.upload_chunk_size > 0 )
			                   ? parseInt( fdpbrAdmin.upload_chunk_size, 10 )
			                   : 10 * 1024 * 1024;
			var totalChunks  = Math.ceil( file.size / chunkSize );
			var currentChunk = 0;

			var $zone = $( '#fdpbr-upload-zone' );

			// Reset state.
			RestoreManager._uploadCancelled  = false;
			RestoreManager._uploadXhr        = null;
			RestoreManager.selectedBackupId  = '';

			// Warn browser before unload while upload is in progress.
			$( window ).on( 'beforeunload.fdpbr_upload', function() {
				return 'Upload is in progress. Are you sure you want to leave?';
			});

			// Switch zone to progress state and hide other source options.
			$zone.addClass( 'fdpbr-upload-zone--uploading' );
			$( '#fdpbr-upload-idle' ).hide();
			$( '#fdpbr-upload-progress' ).show();
			$( '.fdpbr-or-divider' ).hide();
			$( '#fdpbr-restore-sources' ).hide();
			$( '#fdpbr-uploaded-files-section' ).hide();
			$( '#fdpbr-upload-filename' ).text( file.name );
			RestoreManager.setUploadProgress( 0 );

			var uploadChunk = function() {
				// Bail if cancelled between chunks.
				if ( RestoreManager._uploadCancelled ) {
					return;
				}
				var start = currentChunk * chunkSize;
				var end   = Math.min( start + chunkSize, file.size );
				var chunk = file.slice( start, end );

				var formData = new FormData();
				formData.append( 'action',       'fdpbr_upload_backup_chunk' );
				formData.append( 'nonce',        fdpbrAdmin.nonce );
				formData.append( 'file',         chunk );
				formData.append( 'filename',     file.name );
				formData.append( 'chunk_index',  currentChunk );
				formData.append( 'total_chunks', totalChunks );

				RestoreManager._uploadXhr = $.ajax({
					url:         fdpbrAdmin.ajax_url,
					type:        'POST',
					data:        formData,
					processData: false,
					contentType: false,
					success: function( raw ) {
						if ( RestoreManager._uploadCancelled ) { return; }
						// Safely parse JSON — PHP debug output may prepend text.
						var response = null;
						if ( typeof raw === 'object' ) {
							response = raw;
						} else {
							try {
								// Strip anything before first '{'.
								var jsonStart = String( raw ).indexOf( '{' );
								if ( jsonStart >= 0 ) {
									response = JSON.parse( String( raw ).slice( jsonStart ) );
								}
							} catch ( e ) {
								response = null;
							}
						}

						if ( response && response.success ) {
							currentChunk++;
							var pct = Math.round( ( currentChunk / totalChunks ) * 100 );
							RestoreManager.setUploadProgress( pct );

							// Use server's complete flag OR client-side count.
							var isComplete = ( response.data && response.data.complete ) ||
							                 ( currentChunk >= totalChunks );

							if ( ! isComplete ) {
								uploadChunk();
							} else {
								RestoreManager.uploadedFilePath = ( response.data && response.data.file ) || '';
								RestoreManager.onUploadComplete( file );
							}
						} else {
							RestoreManager.onUploadError(
								$zone,
								( response && response.data && response.data.message )
									? response.data.message
									: fdpbrAdmin.i18n.error
							);
						}
					},
					error: function( jqXHR, textStatus ) {
						// Ignore abort — already handled by cancel button.
						if ( 'abort' === textStatus || RestoreManager._uploadCancelled ) {
							return;
						}
						var rawText = jqXHR.responseText || '';
						var msg     = fdpbrAdmin.i18n.network_error;

						// Try to extract a JSON error message from dirty response.
						try {
							var jsonStart = rawText.indexOf( '{' );
							if ( jsonStart >= 0 ) {
								var parsed = JSON.parse( rawText.slice( jsonStart ) );
								if ( parsed && parsed.data && parsed.data.message ) {
									msg = parsed.data.message;
								}
							}
						} catch ( e ) { /* ignore */ }

						RestoreManager.onUploadError( $zone, msg );
					}
				});
			};

			uploadChunk();
		},

		/**
		 * Update the upload progress bar and label.
		 *
		 * @param {number} pct Percentage 0–100.
		 */
		setUploadProgress: function( pct ) {
			$( '#fdpbr-upload-progress-fill' ).css( 'width', pct + '%' );
			$( '#fdpbr-upload-progress-label' ).text( pct + '%' );
		},

		/**
		 * Remove the beforeunload guard (call when upload ends for any reason).
		 */
		clearBeforeUnload: function() {
			$( window ).off( 'beforeunload.fdpbr_upload' );
		},

		/**
		 * Handle a failed upload: reset zone and show error.
		 *
		 * @param {jQuery} $zone
		 * @param {string} msg
		 */
		onUploadError: function( $zone, msg ) {
			RestoreManager.clearBeforeUnload();
			$zone.removeClass( 'fdpbr-upload-zone--uploading' );
			$( '#fdpbr-upload-progress' ).hide();
			$( '#fdpbr-upload-idle' ).show();
			$( '.fdpbr-or-divider' ).show();
			$( '#fdpbr-restore-sources' ).show();
			RestoreManager.loadUploadedFiles();
			FDPBR.showToast( msg, 'error' );
		},

		/**
		 * Called when all chunks have been uploaded.
		 *
		 * @param {File} file
		 */
		onUploadComplete: function( file ) {
			RestoreManager.clearBeforeUnload();
			var $zone = $( '#fdpbr-upload-zone' );
			$zone.removeClass( 'fdpbr-upload-zone--uploading' );
			$( '#fdpbr-upload-progress' ).hide();
			$( '#fdpbr-upload-idle' ).show();

			RestoreManager.showStep2( file );
		},

		/**
		 * Show step 2 with restore configuration for the given file.
		 *
		 * @param {File} file The uploaded file object.
		 */
		showStep2: function( file ) {
			// Use pre-formatted label if available (picker items), otherwise format bytes.
			var sizeLabel = file._sizeLabel || ( file.size ? RestoreManager.formatBytes( file.size ) : '' );

			$( '#fdpbr-restore-filename' ).text( file.name );
			$( '#fdpbr-restore-filesize' ).text( sizeLabel );
			$( '#fdpbr-restore-file-info' ).show();
			$( '#fdpbr-restore-options' ).show();
			$( '#fdpbr-restore-actions' ).show();

			if ( typeof fdpbrGoToStep === 'function' ) {
				fdpbrGoToStep( 'fdpbr-restore-wizard', 2 );
			}
			FDPBR.showToast( 'File uploaded successfully. Configure your restore options below.', 'success' );
		},

		/**
		 * Format bytes to human-readable string.
		 *
		 * @param {number} bytes
		 * @return {string}
		 */
		formatBytes: function( bytes ) {
			if ( bytes < 1024 ) { return bytes + ' B'; }
			if ( bytes < 1048576 ) { return ( bytes / 1024 ).toFixed( 1 ) + ' KB'; }
			if ( bytes < 1073741824 ) { return ( bytes / 1048576 ).toFixed( 1 ) + ' MB'; }
			return ( bytes / 1073741824 ).toFixed( 2 ) + ' GB';
		},

		/**
		 * Show the upload zone / source buttons (step 1 default view).
		 */
		showStep1Default: function() {
			$( '#fdpbr-upload-zone' ).show();
			$( '.fdpbr-or-divider' ).show();
			$( '#fdpbr-restore-sources' ).show();
			$( '#fdpbr-backup-picker' ).hide();
		},

		/**
		 * Bind restore source buttons.
		 */
		bindRestoreSources: function() {
			// "Select from Existing Backups".
			$( document ).on( 'click', '.fdpbr-restore-source[data-source="existing"]', function() {
				$( '#fdpbr-upload-zone' ).hide();
				$( '.fdpbr-or-divider' ).hide();
				$( '#fdpbr-restore-sources' ).hide();
				$( '#fdpbr-backup-picker' ).show();
				RestoreManager.loadBackupPicker();
			});

			// Back button inside picker.
			$( document ).on( 'click', '#fdpbr-picker-back', function() {
				RestoreManager.showStep1Default();
			});
		},

		/**
		 * Load and render the existing backup list in the picker.
		 */
		loadBackupPicker: function() {
			var $list = $( '#fdpbr-backup-picker-list' );

			$list.html(
				'<div class="fdpbr-backup-picker__loading">' +
				'<div class="fdpbr-circle-spinner"></div>' +
				'<span>Loading backups\u2026</span>' +
				'</div>'
			);

			$.ajax({
				url:  fdpbrAdmin.ajax_url,
				type: 'POST',
				data: { action: 'fdpbr_get_backups', nonce: fdpbrAdmin.nonce },
				success: function( response ) {
					if ( ! response || ! response.success ) {
						$list.html( '<p class="fdpbr-backup-picker__empty">Could not load backups.</p>' );
						return;
					}

					var backups = response.data.backups || [];
					var completed = [];
					$.each( backups, function( i, b ) {
						if ( 'completed' === b.status ) { completed.push( b ); }
					});

					if ( ! completed.length ) {
						$list.html( '<p class="fdpbr-backup-picker__empty">No completed backups found. Create a backup first.</p>' );
						return;
					}

					var html = '';
					$.each( completed, function( i, b ) {
						var typeLabel = b.type.charAt(0).toUpperCase() + b.type.slice(1);
						var date = b.completed_at ? b.completed_at.replace( 'T', ' ' ).substring( 0, 16 ) : '';
						var safeName = $( '<div>' ).text( b.name ).html();
						var safeSize = $( '<div>' ).text( b.total_size ).html();
						html +=
							'<button type="button" class="fdpbr-backup-picker__item"' +
							' data-backup-id="' + b.backup_id + '"' +
							' data-name="' + safeName + '"' +
							' data-size="' + safeSize + '">' +
							'<span class="dashicons dashicons-media-archive fdpbr-backup-picker__item-icon"></span>' +
							'<span class="fdpbr-backup-picker__item-info">' +
							'<strong>' + safeName + '</strong>' +
							'<span>' + typeLabel + ' &bull; ' + safeSize + ( date ? ' &bull; ' + date : '' ) + '</span>' +
							'</span>' +
							'<span class="dashicons dashicons-arrow-right-alt2 fdpbr-backup-picker__item-arrow"></span>' +
							'</button>';
					});

					$list.html( html );
				},
				error: function() {
					$list.html( '<p class="fdpbr-backup-picker__empty">Network error loading backups.</p>' );
				}
			});

			// Handle item click (delegated — list is populated dynamically).
			$list.off( 'click.picker' ).on( 'click.picker', '.fdpbr-backup-picker__item', function() {
				var $item = $( this );
				RestoreManager.selectedBackupId = $item.data( 'backup-id' );
				RestoreManager.uploadedFilePath  = '';

				var fakeFile = {
					name:       $item.data( 'name' ),
					size:       0,
					_sizeLabel: $item.data( 'size' )
				};

				RestoreManager.showStep1Default();
				RestoreManager.showStep2( fakeFile );
			});
		},

		/**
		 * Bind step 2 action buttons.
		 */
		bindStep2Actions: function() {
			// Back button.
			$( document ).on( 'click', '#fdpbr-back-step1', function() {
				if ( typeof fdpbrGoToStep === 'function' ) {
					fdpbrGoToStep( 'fdpbr-restore-wizard', 1 );
				}
			});

			// Start Restore button.
			$( document ).on( 'click', '#fdpbr-start-restore-btn', function() {
				var $btn       = $( this );
				var restoreDb  = $( '#fdpbr-restore-db' ).is( ':checked' ) ? 1 : 0;
				var restoreFiles = $( '#fdpbr-restore-files' ).is( ':checked' ) ? 1 : 0;

				if ( ! restoreDb && ! restoreFiles ) {
					FDPBR.showToast( 'Please select at least one restore option.', 'error' );
					return;
				}

				$btn.prop( 'disabled', true ).text( fdpbrAdmin.i18n.restoring );

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action:        'fdpbr_start_restore',
						nonce:         fdpbrAdmin.nonce,
						backup_id:     RestoreManager.selectedBackupId,
						backup_file:   RestoreManager.uploadedFilePath,
						restore_db:    restoreDb,
						restore_files: restoreFiles
					},
					success: function( response ) {
						if ( response && response.success ) {
							var jobId = response.data.job_id;
							var token = response.data.restore_token || '';
							RestoreManager._restoreJobId = jobId;
							RestoreManager._restoreToken = token;
							RestoreManager.saveRestore( jobId, token );

							if ( typeof fdpbrGoToStep === 'function' ) {
								fdpbrGoToStep( 'fdpbr-restore-wizard', 3 );
							}
							RestoreManager.startElapsedTimer();
							RestoreManager.pollRestoreProgress( jobId );
						} else {
							$btn.prop( 'disabled', false ).html( '<span class="dashicons dashicons-update"></span> Start Restore' );
							var msg = ( response && response.data && response.data.message )
								? response.data.message
								: fdpbrAdmin.i18n.error;
							FDPBR.showToast( msg, 'error' );
						}
					},
					error: function() {
						$btn.prop( 'disabled', false ).html( '<span class="dashicons dashicons-update"></span> Start Restore' );
						FDPBR.showToast( fdpbrAdmin.i18n.network_error, 'error' );
					}
				});
			});
		},

		/**
		 * Poll restore job progress.
		 *
		 * Uses the nonce-based endpoint first. If auth fails (session invalidated
		 * by DB import), automatically falls back to the token-based nopriv
		 * endpoint so polling continues uninterrupted — just like AIOWPM.
		 *
		 * @param {string} jobId
		 */
		pollRestoreProgress: function( jobId ) {
			var interval    = 3000;
			var useTokenPoll = false; // Switch to token-based after auth failure.
			var authFailCount = 0;    // Track consecutive auth failures.

			var switchToToken = function() {
				if ( ! useTokenPoll ) {
	
					useTokenPoll = true;
				}
				setTimeout( poll, interval );
			};

			var poll = function() {
				if ( useTokenPoll && RestoreManager._restoreToken ) {
					RestoreManager.pollViaToken( jobId, poll, interval );
				} else if ( RestoreManager._restoreToken ) {
					RestoreManager.pollViaAuth( jobId, poll, interval, switchToToken );
				} else {
					// No token available — retry auth-based.
					RestoreManager.pollViaAuth( jobId, poll, interval, function() {
						setTimeout( poll, interval );
					} );
				}
			};

			poll();
		},

		/**
		 * Poll via nonce-authenticated chunk endpoint.
		 *
		 * Each call BOTH processes one chunk of restore work AND returns progress.
		 * This ensures the restore advances even when WP Cron loopback is broken
		 * (AJAX tier 3 fallback). If Action Scheduler or WP Cron is also running,
		 * the chunk endpoint gracefully handles the concurrent access.
		 */
		pollViaAuth: function( jobId, poll, interval, onAuthFail ) {
			$.ajax({
				url:  fdpbrAdmin.ajax_url,
				type: 'POST',
				data: {
					action: 'fdpbr_restore_chunk',
					nonce:  fdpbrAdmin.nonce,
					job_id: jobId
				},
				success: function( raw ) {
					var response = null;

					if ( typeof raw === 'object' ) {
						response = raw;
					} else {
						var str = String( raw );
						if ( str.indexOf( 'wp-login' ) !== -1 || str.indexOf( '<html' ) !== -1 ) {

							onAuthFail();
							return;
						}
						try {
							var jsonStart = str.indexOf( '{' );
							if ( jsonStart >= 0 ) {
								response = JSON.parse( str.slice( jsonStart ) );
							}
						} catch ( e ) {
							response = null;
						}
					}

					// If the response is not a successful JSON object, treat as auth failure.
					// After DB import, the nonce may be invalid causing {success:false} or
					// the action handler might not exist causing a bare "0" response.
					if ( ! response || ! response.success ) {

						onAuthFail();
						return;
					}

					RestoreManager.handlePollResponse( response, poll, interval );
				},
				error: function( jqXHR ) {

					// Any error = session likely invalidated after DB import.
					onAuthFail();
				}
			});
		},

		/**
		 * Poll via token-based nopriv chunk endpoint (survives session loss).
		 *
		 * Uses the restore token for authentication and processes one chunk per call.
		 */
		pollViaToken: function( jobId, poll, interval ) {
			$.ajax({
				url:  fdpbrAdmin.ajax_url,
				type: 'POST',
				data: {
					action:        'fdpbr_restore_chunk_token',
					restore_token: RestoreManager._restoreToken,
					job_id:        jobId
				},
				success: function( response ) {
					if ( typeof response !== 'object' ) {
						try {
							var str = String( response );
							var idx = str.indexOf( '{' );
							response = idx >= 0 ? JSON.parse( str.slice( idx ) ) : null;
						} catch ( e ) {
							response = null;
						}
					}

					if ( response ) {

					} else {

					}

					RestoreManager.handlePollResponse( response, poll, interval );
				},
				error: function( jqXHR ) {

					setTimeout( poll, interval );
				}
			});
		},

		/**
		 * Process a poll response (shared by both auth and token polling).
		 */
		handlePollResponse: function( response, poll, interval ) {
			if ( response && response.success && response.data ) {
				var data = response.data;
				var pct  = data.percent || 0;

				$( '#fdpbr-restore-progress-fill' ).css( 'width', pct + '%' );
				$( '#fdpbr-restore-progress-pct' ).text( pct + '%' );
				$( '#fdpbr-restore-step' ).text( data.step || '' );
				RestoreManager.updatePhases( RestoreManager.stepToPhase( data.step ) );

				if ( 'completed' === data.status ) {
					RestoreManager.clearSavedRestore();
					RestoreManager.stopElapsedTimer();
					RestoreManager.updateElapsedDisplay();
					RestoreManager.markAllPhasesDone();

					// Show success panel, hide progress.
					$( '#fdpbr-restore-progress-panel' ).hide();
					var elapsed = $( '#fdpbr-restore-elapsed-text' ).text();
					$( '#fdpbr-restore-success-desc' ).text(
						'Your site has been restored successfully. ' + elapsed + '.'
					);
					$( '#fdpbr-restore-result-success' ).show();
					FDPBR.showToast( fdpbrAdmin.i18n.restore_complete, 'success' );
					return;
				}
				if ( 'failed' === data.status ) {
					RestoreManager.clearSavedRestore();
					RestoreManager.stopElapsedTimer();

					// Show error panel, hide progress.
					$( '#fdpbr-restore-progress-panel' ).hide();
					if ( data.message ) {
						$( '#fdpbr-restore-error-desc' ).text( data.message );
					}
					$( '#fdpbr-restore-result-error' ).show();
					FDPBR.showToast( fdpbrAdmin.i18n.restore_failed, 'error' );
					return;
				}
			}

			setTimeout( poll, interval );
		}
	};

	$( document ).ready( function() {
		RestoreManager.init();
	});

})( jQuery );
