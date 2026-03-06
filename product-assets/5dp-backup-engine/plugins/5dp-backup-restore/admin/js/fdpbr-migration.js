/**
 * 5DP Backup & Restore - Migration Page JavaScript (PUSH model)
 *
 * Handles migration wizard, connection testing, progress with token-based
 * polling, and activity log. This site is the SOURCE — data is pushed
 * to the destination.
 *
 * @package FiveDPBR
 * @since   1.0.0
 */

(function( $ ) {
	'use strict';

	var PHASES = ['connect', 'package', 'upload', 'restore', 'finalize'];

	var MigrationManager = {

		_migrationStartTime: null,
		_elapsedInterval: null,
		_migrationToken: null,
		_migrationJobId: null,
		_logInterval: null,
		_lastLogId: 0,
		_useTokenPolling: false,
		_incomingPollInterval: null,

		init: function() {
			this.restoreSavedFields();
			this.bindFieldPersistence();
			this.bindTestConnection();
			this.bindStartMigration();
			this.bindBackButton();
			this.bindCopyKey();
			this.bindRegenerateKey();
			this.bindNewMigration();
			this.bindRetry();
			this.bindAbortIncoming();
			this.startIncomingPoll();
		},

		/* ── Persist fields to localStorage ─────────────────── */

		restoreSavedFields: function() {
			// Clean up old keys from previous UI layouts.
			localStorage.removeItem( 'fdpbr_mig_source_url' );

			var destUrl = localStorage.getItem( 'fdpbr_mig_dest_url' );
			var migKey  = localStorage.getItem( 'fdpbr_mig_key' );
			if ( destUrl ) {
				$( '#fdpbr-migration-dest-url' ).val( destUrl );
			}
			if ( migKey ) {
				$( '#fdpbr-migration-key' ).val( migKey );
			}
		},

		bindFieldPersistence: function() {
			$( '#fdpbr-migration-dest-url' ).on( 'input', function() {
				localStorage.setItem( 'fdpbr_mig_dest_url', $( this ).val() );
			});
			$( '#fdpbr-migration-key' ).on( 'input', function() {
				localStorage.setItem( 'fdpbr_mig_key', $( this ).val() );
			});
		},

		/* ── Step 1: Test Connection ────────────────────────── */

		bindTestConnection: function() {
			var self = this;
			$( '#fdpbr-migration-test' ).on( 'click', function() {
				var $btn = $( this );
				var destUrl = $( '#fdpbr-migration-dest-url' ).val().trim();
				var migKey  = $( '#fdpbr-migration-key' ).val().trim();

				if ( ! destUrl || ! migKey ) {
					FDPBR.showToast( 'Please enter both destination URL and migration key.', 'error' );
					return;
				}

				$btn.prop( 'disabled', true ).html(
					'<span class="fdpbr-spinner fdpbr-spinner--small"></span> Testing...'
				);

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action:        'fdpbr_test_migration_connection',
						nonce:         fdpbrAdmin.nonce,
						dest_url:      destUrl,
						migration_key: migKey
					},
					success: function( response ) {
						if ( response.success ) {
							FDPBR.showToast( 'Connection successful!', 'success' );
							fdpbrGoToStep( 'fdpbr-migration-wizard', 2 );
						} else {
							FDPBR.showToast( response.data.message || 'Connection failed.', 'error' );
						}
					},
					error: function() {
						FDPBR.showToast( fdpbrAdmin.i18n.network_error || 'Network error.', 'error' );
					},
					complete: function() {
						$btn.prop( 'disabled', false ).html(
							'<span class="dashicons dashicons-rest-api"></span> Test Connection'
						);
					}
				});
			});
		},

		/* ── Step 2: Back button ─────────────────────────────── */

		bindBackButton: function() {
			$( '#fdpbr-migration-back' ).on( 'click', function() {
				fdpbrGoToStep( 'fdpbr-migration-wizard', 1 );
			});
		},

		/* ── Step 2: Start Migration (PUSH to destination) ──── */

		bindStartMigration: function() {
			var self = this;
			$( '#fdpbr-migration-start' ).on( 'click', function() {
				var $btn = $( this );
				$btn.prop( 'disabled', true ).html(
					'<span class="fdpbr-spinner fdpbr-spinner--small"></span> Starting...'
				);

				fdpbrGoToStep( 'fdpbr-migration-wizard', 3 );
				self.resetProgressUI();
				self.startElapsedTimer();
				self._useTokenPolling = false;

				// Add beforeunload guard.
				$( window ).on( 'beforeunload.fdpbr_migration', function() {
					return 'Migration is in progress. Are you sure you want to leave?';
				});

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action:          'fdpbr_start_migration',
						nonce:           fdpbrAdmin.nonce,
						source_url:      fdpbrAdmin.home_url,
						dest_url:        $( '#fdpbr-migration-dest-url' ).val().trim(),
						migration_key:   $( '#fdpbr-migration-key' ).val().trim(),
						include_db:      $( 'input[name="migrate_db"]' ).is( ':checked' ) ? 1 : 0,
						include_plugins: $( 'input[name="migrate_plugins"]' ).is( ':checked' ) ? 1 : 0,
						include_themes:  $( 'input[name="migrate_themes"]' ).is( ':checked' ) ? 1 : 0,
						include_uploads: $( 'input[name="migrate_uploads"]' ).is( ':checked' ) ? 1 : 0
					},
					success: function( response ) {
						if ( response.success && response.data.job_id ) {
							self._migrationJobId = response.data.job_id;
							self._migrationToken = response.data.migration_token || null;

							// Save token to localStorage for page reload recovery.
							if ( self._migrationToken ) {
								localStorage.setItem( 'fdpbr_mig_token', self._migrationToken );
								localStorage.setItem( 'fdpbr_mig_job_id', self._migrationJobId );
							}

							self.appendLog( 'info', 'Migration started — pushing to destination.' );
							self.pollProgress();
							self.startLogPolling();
						} else {
							self.showError( response.data.message || 'Migration failed to start.' );
						}
					},
					error: function() {
						self.showError( 'Network error. Please try again.' );
					},
					complete: function() {
						$btn.prop( 'disabled', false ).html(
							'<span class="dashicons dashicons-migrate"></span> Start Migration'
						);
					}
				});
			});
		},

		/* ── Custom polling with token fallback ──────────────── */

		pollProgress: function() {
			var self = this;

			var doPoll = function() {
				var data;

				if ( self._useTokenPolling && self._migrationToken ) {
					// Token-based (nopriv) — survives session loss.
					data = {
						action:          'fdpbr_migration_progress_token',
						migration_token: self._migrationToken,
						job_id:          self._migrationJobId
					};
				} else {
					// Nonce-based (standard).
					data = {
						action: 'fdpbr_job_progress',
						nonce:  fdpbrAdmin.nonce,
						job_id: self._migrationJobId
					};
				}

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: data,
					success: function( response ) {
						// Detect auth failure (wp-login redirect).
						var raw = typeof response === 'string' ? response : '';
						if ( raw.indexOf && raw.indexOf( 'wp-login' ) !== -1 ) {
							self._useTokenPolling = true;
							self.appendLog( 'warning', 'Session lost — switching to token auth.' );
							setTimeout( doPoll, 2000 );
							return;
						}

						if ( response.success && response.data ) {
							self.handlePollResponse( response.data );

							if ( response.data.status === 'completed' || response.data.status === 'failed' ) {
								return;
							}
						} else if ( ! self._useTokenPolling && self._migrationToken ) {
							// Nonce auth may have failed — try token.
							self._useTokenPolling = true;
							self.appendLog( 'warning', 'Auth failed — falling back to token-based polling.' );
						}
						setTimeout( doPoll, 2500 );
					},
					error: function( xhr ) {
						// On 403/401, switch to token polling.
						if ( ! self._useTokenPolling && self._migrationToken ) {
							self._useTokenPolling = true;
							self.appendLog( 'warning', 'Session expired — switching to token-based polling.' );
						}
						setTimeout( doPoll, 3000 );
					}
				});
			};

			doPoll();
		},

		/* ── Poll response handler ───────────────────────────── */

		handlePollResponse: function( data ) {
			var percent = data.percent || 0;
			var step = data.step || '';

			$( '#fdpbr-migration-progress-pct' ).text( percent + '%' );
			$( '#fdpbr-migration-progress-fill' ).css( 'width', percent + '%' );
			$( '#fdpbr-migration-step' ).text( step );

			var currentPhase = this.stepToPhase( step );
			if ( currentPhase ) {
				this.updatePhases( currentPhase );
			}

			if ( 'completed' === data.status ) {
				this.markAllPhasesDone();
				this.stopElapsedTimer();
				this.stopLogPolling();
				this.removeBeforeUnload();
				var elapsed = this.getElapsedText();

				$( '#fdpbr-migration-progress-panel' ).hide();
				$( '#fdpbr-migration-result-time' ).text( 'Completed in ' + elapsed );
				$( '#fdpbr-migration-result-success' ).show();
				this.appendLog( 'info', 'Migration completed successfully in ' + elapsed + '.' );

				// Clean up localStorage.
				localStorage.removeItem( 'fdpbr_mig_token' );
				localStorage.removeItem( 'fdpbr_mig_job_id' );
			} else if ( 'failed' === data.status ) {
				this.stopLogPolling();
				this.removeBeforeUnload();
				this.showError( data.error || data.step || 'Migration failed.' );
				this.appendLog( 'error', data.error || data.step || 'Migration failed.' );

				localStorage.removeItem( 'fdpbr_mig_token' );
				localStorage.removeItem( 'fdpbr_mig_job_id' );
			}
		},

		/* ── Phase mapping ───────────────────────────────────── */

		stepToPhase: function( step ) {
			if ( ! step ) return null;
			var s = step.toLowerCase();
			if ( s.indexOf( 'connect' ) !== -1 || s.indexOf( 'handshake' ) !== -1 || s.indexOf( 'destination' ) !== -1 ) return 'connect';
			if ( s.indexOf( 'package' ) !== -1 || s.indexOf( 'creating migration' ) !== -1 ) return 'package';
			if ( s.indexOf( 'upload' ) !== -1 || s.indexOf( 'sending' ) !== -1 ) return 'upload';
			if ( s.indexOf( 'restor' ) !== -1 || s.indexOf( 'import' ) !== -1 || s.indexOf( 'database' ) !== -1 || s.indexOf( 'extract' ) !== -1 ) return 'restore';
			if ( s.indexOf( 'finaliz' ) !== -1 || s.indexOf( 'cleanup' ) !== -1 || s.indexOf( 'search' ) !== -1 || s.indexOf( 'replace' ) !== -1 ) return 'finalize';
			return null;
		},

		updatePhases: function( currentPhase ) {
			var idx = PHASES.indexOf( currentPhase );
			if ( idx === -1 ) return;

			$( '#fdpbr-migration-phases .fdpbr-restore-phase' ).each( function( i ) {
				var $phase = $( this );
				$phase.removeClass( 'fdpbr-restore-phase--active fdpbr-restore-phase--done' );

				if ( i < idx ) {
					$phase.addClass( 'fdpbr-restore-phase--done' );
					$phase.find( '.fdpbr-restore-phase__icon' )
						.removeClass( 'dashicons-marker' )
						.addClass( 'dashicons-yes' );
				} else if ( i === idx ) {
					$phase.addClass( 'fdpbr-restore-phase--active' );
				}
			});
		},

		markAllPhasesDone: function() {
			$( '#fdpbr-migration-phases .fdpbr-restore-phase' ).each( function() {
				$( this )
					.removeClass( 'fdpbr-restore-phase--active' )
					.addClass( 'fdpbr-restore-phase--done' );
				$( this ).find( '.fdpbr-restore-phase__icon' )
					.removeClass( 'dashicons-marker' )
					.addClass( 'dashicons-yes' );
			});
		},

		/* ── Elapsed timer ───────────────────────────────────── */

		startElapsedTimer: function() {
			this._migrationStartTime = Date.now();
			this.stopElapsedTimer();
			var self = this;
			this.updateElapsedDisplay();
			this._elapsedInterval = setInterval( function() {
				self.updateElapsedDisplay();
			}, 1000 );
		},

		stopElapsedTimer: function() {
			if ( this._elapsedInterval ) {
				clearInterval( this._elapsedInterval );
				this._elapsedInterval = null;
			}
		},

		updateElapsedDisplay: function() {
			if ( ! this._migrationStartTime ) return;
			var secs = Math.floor( ( Date.now() - this._migrationStartTime ) / 1000 );
			var text;
			if ( secs < 60 ) {
				text = secs + 's';
			} else {
				var m = Math.floor( secs / 60 );
				var s = secs % 60;
				text = m + 'm ' + s + 's';
			}
			$( '#fdpbr-migration-elapsed-text' ).text( 'Elapsed: ' + text );
		},

		getElapsedText: function() {
			if ( ! this._migrationStartTime ) return '0s';
			var secs = Math.floor( ( Date.now() - this._migrationStartTime ) / 1000 );
			if ( secs < 60 ) return secs + 's';
			var m = Math.floor( secs / 60 );
			var s = secs % 60;
			return m + 'm ' + s + 's';
		},

		/* ── Activity Log ────────────────────────────────────── */

		appendLog: function( level, msg ) {
			var $log = $( '#fdpbr-migration-log' );
			var now = new Date();
			var time = ( '0' + now.getHours() ).slice( -2 ) + ':' +
				( '0' + now.getMinutes() ).slice( -2 ) + ':' +
				( '0' + now.getSeconds() ).slice( -2 );
			var line = '<div class="fdpbr-mini-log__line fdpbr-mini-log__line--' + level + '">' +
				'<span class="fdpbr-mini-log__time">' + time + '</span>' +
				'<span class="fdpbr-mini-log__msg">' + $( '<span>' ).text( msg ).html() + '</span>' +
				'</div>';
			$log.append( line );
			$log.scrollTop( $log[0].scrollHeight );
		},

		startLogPolling: function() {
			var self = this;
			this._lastLogId = 0;
			this.stopLogPolling();

			var pollLog = function() {
				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action: 'fdpbr_migration_log',
						nonce:  fdpbrAdmin.nonce
					},
					success: function( response ) {
						if ( response.success && response.data.entries ) {
							var entries = response.data.entries;
							for ( var i = 0; i < entries.length; i++ ) {
								var entry = entries[ i ];
								if ( entry.id > self._lastLogId ) {
									self._lastLogId = entry.id;
									var t = entry.time ? entry.time.split( ' ' ).pop() : '';
									if ( t.length > 8 ) t = t.substring( 0, 8 );
									self.appendServerLog( entry.level, t, entry.message );
								}
							}
						}
					}
				});
			};

			this._logInterval = setInterval( pollLog, 3000 );
			pollLog();
		},

		stopLogPolling: function() {
			if ( this._logInterval ) {
				clearInterval( this._logInterval );
				this._logInterval = null;
			}
		},

		appendServerLog: function( level, time, msg ) {
			var $log = $( '#fdpbr-migration-log' );
			var line = '<div class="fdpbr-mini-log__line fdpbr-mini-log__line--' + level + '">' +
				'<span class="fdpbr-mini-log__time">' + time + '</span>' +
				'<span class="fdpbr-mini-log__msg">' + $( '<span>' ).text( msg ).html() + '</span>' +
				'</div>';
			$log.append( line );
			$log.scrollTop( $log[0].scrollHeight );
		},

		/* ── UI helpers ──────────────────────────────────────── */

		resetProgressUI: function() {
			$( '#fdpbr-migration-progress-pct' ).text( '0%' );
			$( '#fdpbr-migration-progress-fill' ).css( 'width', '0' );
			$( '#fdpbr-migration-step' ).text( 'Waiting to start...' );
			$( '#fdpbr-migration-elapsed-text' ).text( 'Elapsed: 0s' );

			// Reset phases.
			$( '#fdpbr-migration-phases .fdpbr-restore-phase' ).each( function() {
				$( this ).removeClass( 'fdpbr-restore-phase--active fdpbr-restore-phase--done' );
				$( this ).find( '.fdpbr-restore-phase__icon' )
					.removeClass( 'dashicons-yes' )
					.addClass( 'dashicons-marker' );
			});

			// Show progress, hide results.
			$( '#fdpbr-migration-progress-panel' ).show();
			$( '#fdpbr-migration-result-success' ).hide();
			$( '#fdpbr-migration-result-error' ).hide();

			// Clear log.
			$( '#fdpbr-migration-log' ).html( '' );
		},

		showError: function( message ) {
			this.stopElapsedTimer();
			this.stopLogPolling();
			this.removeBeforeUnload();
			$( '#fdpbr-migration-progress-panel' ).hide();
			$( '#fdpbr-migration-error-msg' ).text( message );
			$( '#fdpbr-migration-result-error' ).show();
		},

		removeBeforeUnload: function() {
			$( window ).off( 'beforeunload.fdpbr_migration' );
		},

		/* ── Incoming Migration Polling (destination-side) ──── */

		_migrationToken: null,
		_useTokenPolling: false,

		startIncomingPoll: function() {
			var self = this;

			// Try to restore token from localStorage (for page reload).
			try {
				var saved = localStorage.getItem( 'fdpbr_migration_token' );
				if ( saved ) {
					self._migrationToken = saved;
				}
			} catch( e ) {}

			var poll = function() {
				if ( self._useTokenPolling && self._migrationToken ) {
					self.pollViaToken();
				} else {
					self.pollViaAuth();
				}
			};

			// Poll every 5 seconds.
			poll();
			this._incomingPollInterval = setInterval( poll, 5000 );
		},

		/**
		 * Poll using standard nonce-authenticated AJAX.
		 */
		pollViaAuth: function() {
			var self = this;
			$.ajax({
				url:  fdpbrAdmin.ajax_url,
				type: 'POST',
				data: {
					action: 'fdpbr_incoming_migration_status',
					nonce:  fdpbrAdmin.nonce
				},
				success: function( response ) {
					if ( response.success && response.data.active ) {
						// Save the polling token if provided.
						if ( response.data.migration_token ) {
							self._migrationToken = response.data.migration_token;
							try {
								localStorage.setItem( 'fdpbr_migration_token', response.data.migration_token );
							} catch( e ) {}
						}
						self.showIncomingStatus( response.data );
					} else {
						self.hideIncomingStatus();
					}
				},
				error: function( xhr ) {
					// 400 = bad nonce, 403 = forbidden — session is dead.
					if ( ( xhr.status === 400 || xhr.status === 403 ) && self._migrationToken ) {
						self._useTokenPolling = true;
						self.pollViaToken();
					}
				}
			});
		},

		/**
		 * Poll using token-based nopriv endpoint (works after session loss).
		 */
		pollViaToken: function() {
			var self = this;
			$.ajax({
				url:  fdpbrAdmin.ajax_url,
				type: 'POST',
				data: {
					action:          'fdpbr_incoming_migration_status_token',
					migration_token: self._migrationToken
				},
				success: function( response ) {
					if ( response.success && response.data.active ) {
						self.showIncomingStatus( response.data );
					} else {
						self.hideIncomingStatus();
					}
				}
			});
		},

		showIncomingStatus: function( data ) {
			var $card = $( '#fdpbr-incoming-migration-card' );
			$card.show();

			// Hide wizard and accept-incoming cards.
			$( '#fdpbr-migration-wizard-card' ).hide();
			$( '#fdpbr-accept-incoming-card' ).hide();

			// Source URL.
			if ( data.source_url ) {
				$( '#fdpbr-incoming-source-url' ).text( 'Receiving data from: ' + data.source_url );
			}

			// Step text.
			$( '#fdpbr-incoming-step' ).text( data.message || 'Working...' );

			// Elapsed.
			var elapsed = data.elapsed || 0;
			var elText;
			if ( elapsed < 60 ) {
				elText = elapsed + 's';
			} else {
				elText = Math.floor( elapsed / 60 ) + 'm ' + ( elapsed % 60 ) + 's';
			}
			$( '#fdpbr-incoming-elapsed' ).text( 'Elapsed: ' + elText );

			// Progress bar.
			var percent = 0;
			if ( data.total > 0 && data.transferred > 0 ) {
				percent = Math.round( ( data.transferred / data.total ) * 100 );
			} else if ( data.phase === 'verifying' ) {
				percent = 10;
			} else if ( data.phase === 'receiving' ) {
				percent = 30;
			} else if ( data.phase === 'restoring' ) {
				percent = 70;
			} else if ( data.phase === 'completed' ) {
				percent = 100;
			}
			$( '#fdpbr-incoming-progress-fill' ).css( 'width', percent + '%' );

			// Badge + abort button visibility.
			var $badge = $( '#fdpbr-incoming-badge' );
			if ( data.phase === 'completed' ) {
				$badge.addClass( 'fdpbr-incoming-badge--done' );
				$( '#fdpbr-incoming-badge-text' ).text( 'Completed' );
				$( '#fdpbr-incoming-abort' ).hide();

				// Clean up token + stop polling.
				try { localStorage.removeItem( 'fdpbr_migration_token' ); } catch( e ) {}
				if ( this._incomingPollInterval ) {
					clearInterval( this._incomingPollInterval );
					this._incomingPollInterval = null;
				}

				// Auto-hide the card after 10 seconds and restore the wizard.
				var self = this;
				setTimeout( function() {
					self.hideIncomingStatus();
				}, 10000 );
			} else {
				$badge.removeClass( 'fdpbr-incoming-badge--done' );
				$( '#fdpbr-incoming-badge-text' ).text( 'Active' );
				$( '#fdpbr-incoming-abort' ).show();
			}
		},

		hideIncomingStatus: function() {
			$( '#fdpbr-incoming-migration-card' ).hide();

			// Show wizard and accept-incoming cards again.
			$( '#fdpbr-migration-wizard-card' ).show();
			$( '#fdpbr-accept-incoming-card' ).show();
		},

		/* ── Copy key ────────────────────────────────────────── */

		bindCopyKey: function() {
			$( '#fdpbr-copy-key' ).on( 'click', function() {
				var key = $( '#fdpbr-this-migration-key' ).val();
				if ( navigator.clipboard ) {
					navigator.clipboard.writeText( key );
				} else {
					var $input = $( '#fdpbr-this-migration-key' );
					$input[0].select();
					document.execCommand( 'copy' );
				}
				var $text = $( this ).find( '.fdpbr-copy-key__text' );
				$text.text( 'Copied!' );
				setTimeout( function() {
					$text.text( 'Copy' );
				}, 2000 );
			});
		},

		/* ── Regenerate key ──────────────────────────────────── */

		bindRegenerateKey: function() {
			$( '#fdpbr-regenerate-key' ).on( 'click', function() {
				var $btn = $( this );
				$btn.prop( 'disabled', true );

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action: 'fdpbr_regenerate_migration_key',
						nonce:  fdpbrAdmin.nonce
					},
					success: function( response ) {
						if ( response.success && response.data.key ) {
							$( '#fdpbr-this-migration-key' ).val( response.data.key );
							FDPBR.showToast( 'Migration key regenerated.', 'success' );
						} else {
							FDPBR.showToast( 'Failed to regenerate key.', 'error' );
						}
					},
					error: function() {
						FDPBR.showToast( 'Network error.', 'error' );
					},
					complete: function() {
						$btn.prop( 'disabled', false );
					}
				});
			});
		},

		/* ── New Migration / Retry ───────────────────────────── */

		bindNewMigration: function() {
			$( '#fdpbr-migration-new' ).on( 'click', function() {
				fdpbrGoToStep( 'fdpbr-migration-wizard', 1 );
			});
		},

		bindRetry: function() {
			$( '#fdpbr-migration-retry' ).on( 'click', function() {
				fdpbrGoToStep( 'fdpbr-migration-wizard', 1 );
			});
		},

		/* ── Abort incoming migration (destination-side) ────── */

		bindAbortIncoming: function() {
			var self = this;
			$( '#fdpbr-incoming-abort' ).on( 'click', function() {
				if ( ! confirm( 'Are you sure you want to abort this incoming migration?' ) ) {
					return;
				}

				var $btn = $( this );
				$btn.prop( 'disabled', true ).html(
					'<span class="fdpbr-spinner fdpbr-spinner--small"></span> Aborting...'
				);

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action: 'fdpbr_abort_incoming_migration',
						nonce:  fdpbrAdmin.nonce
					},
					success: function( response ) {
						if ( response.success ) {
							FDPBR.showToast( 'Incoming migration aborted.', 'success' );

							// Stop polling so the card doesn't reappear.
							if ( self._incomingPollInterval ) {
								clearInterval( self._incomingPollInterval );
								self._incomingPollInterval = null;
							}

							self.hideIncomingStatus();

							// Restart incoming poll after a delay (after transient expires).
							setTimeout( function() {
								self.startIncomingPoll();
							}, 65000 );
						} else {
							FDPBR.showToast( response.data.message || 'Failed to abort.', 'error' );
						}
					},
					error: function() {
						FDPBR.showToast( 'Network error.', 'error' );
					},
					complete: function() {
						$btn.prop( 'disabled', false ).html(
							'<span class="dashicons dashicons-no-alt"></span> Abort Migration'
						);
					}
				});
			});
		}
	};

	$( document ).ready( function() {
		MigrationManager.init();
	});

})( jQuery );
