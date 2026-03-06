/**
 * 5DP Backup & Restore - Staging Page JavaScript
 *
 * Handles staging site creation, sync, and management.
 *
 * @package FiveDPBR
 * @since   1.0.0
 */

(function( $ ) {
	'use strict';

	var StagingManager = {

		init: function() {
			this.bindCreateStaging();
			this.bindSyncStaging();
			this.bindDeleteStaging();
			this.bindLocalLive();
			this.bindRemoteSync();
			this.bindChangeLog();
		},

		bindCreateStaging: function() {
			$( '#fdpbr-create-staging' ).on( 'click', function() {
				var $btn = $( this );
				var name = $( '#fdpbr-staging-name' ).val().trim() || 'staging';

				$btn.text( fdpbrAdmin.i18n.creating_staging ).prop( 'disabled', true );

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action: 'fdpbr_create_staging',
						nonce:  fdpbrAdmin.nonce,
						name:   name
					},
					success: function( response ) {
						if ( response.success ) {
							FDPBR.showToast( 'Staging site creation started.', 'success' );
							if ( response.data.job_id ) {
								FDPBR.pollJobProgress( response.data.job_id, function( data ) {
									if ( 'completed' === data.status ) {
										FDPBR.showToast( 'Staging site created!', 'success' );
										setTimeout( function() { location.reload(); }, 1500 );
									} else if ( 'failed' === data.status ) {
										FDPBR.showToast( data.error || 'Failed to create staging site.', 'error' );
										$btn.text( 'Create Staging Site' ).prop( 'disabled', false );
									}
								});
							}
						} else {
							FDPBR.showToast( response.data.message || 'Failed to create staging site.', 'error' );
							$btn.text( 'Create Staging Site' ).prop( 'disabled', false );
						}
					},
					error: function() {
						FDPBR.showToast( fdpbrAdmin.i18n.network_error, 'error' );
						$btn.text( 'Create Staging Site' ).prop( 'disabled', false );
					}
				});
			});
		},

		// =====================================================================
		// Server Staging Sync
		// =====================================================================

		bindSyncStaging: function() {
			var self = this;

			// Toggle sync panel on "Sync" button click.
			$( document ).on( 'click', '.fdpbr-sync-staging', function() {
				var id = $( this ).data( 'id' );
				var $panel = $( '.fdpbr-sync-panel[data-id="' + id + '"]' );

				// Close any other open panels.
				$( '.fdpbr-sync-panel--open' ).not( $panel ).removeClass( 'fdpbr-sync-panel--open' );

				$panel.toggleClass( 'fdpbr-sync-panel--open' );

				// Hide previous result when reopening.
				$panel.find( '.fdpbr-sync-panel__result' ).hide().empty();
			});

			// Cancel button.
			$( document ).on( 'click', '.fdpbr-cancel-sync', function() {
				$( this ).closest( '.fdpbr-sync-panel' ).removeClass( 'fdpbr-sync-panel--open' );
			});

			// Start Sync button.
			$( document ).on( 'click', '.fdpbr-start-sync', function() {
				var $btn    = $( this );
				var $panel  = $btn.closest( '.fdpbr-sync-panel' );
				var id      = $panel.data( 'id' );

				var direction = $panel.find( '[data-name="sync_direction"] .fdpbr-btn-group__item--active' ).data( 'value' ) || 'to_live';
				var syncDb    = $panel.find( '.fdpbr-sync-db' ).is( ':checked' );
				var syncFiles = $panel.find( '.fdpbr-sync-files' ).is( ':checked' );

				if ( ! syncDb && ! syncFiles ) {
					FDPBR.showToast( 'Select at least Database or Files to sync.', 'error' );
					return;
				}

				self.runSync( $btn, $panel, id, direction, syncDb, syncFiles );
			});
		},

		runSync: function( $btn, $panel, id, direction, syncDb, syncFiles ) {
			var self    = this;
			var btnText = $btn.text();

			console.log( '[FDPBR Sync] Starting sync:', { id: id, direction: direction, syncDb: syncDb, syncFiles: syncFiles } );

			// Disable controls.
			$btn.text( 'Syncing...' ).prop( 'disabled', true );
			$panel.find( 'input, button:not(.fdpbr-start-sync)' ).prop( 'disabled', true );

			var $result = $panel.find( '.fdpbr-sync-panel__result' );
			$result.hide().empty().removeClass( 'fdpbr-sync-panel__result--success fdpbr-sync-panel__result--error' );

			$.ajax({
				url:  fdpbrAdmin.ajax_url,
				type: 'POST',
				data: {
					action:     'fdpbr_sync_staging',
					nonce:      fdpbrAdmin.nonce,
					staging_id: id,
					direction:  direction,
					sync_db:    syncDb ? 1 : 0,
					sync_files: syncFiles ? 1 : 0
				},
				success: function( response ) {
					console.log( '[FDPBR Sync] Response:', response );
					if ( response.success ) {
						var report = response.data.report || {};
						var msg = 'Sync complete.';
						var parts = [];

						if ( report.db_changes ) {
							parts.push( report.db_changes + ' DB change' + ( report.db_changes !== 1 ? 's' : '' ) );
						}
						if ( report.files_synced ) {
							parts.push( report.files_synced + ' file' + ( report.files_synced !== 1 ? 's' : '' ) );
						}
						if ( parts.length ) {
							msg = 'Synced ' + parts.join( ', ' ) + '.';
						}
						if ( report.errors && report.errors.length ) {
							msg += ' (' + report.errors.length + ' error' + ( report.errors.length !== 1 ? 's' : '' ) + ')';
						}

						$result.addClass( 'fdpbr-sync-panel__result--success' ).text( msg ).show();
						FDPBR.showToast( msg, 'success' );

						// Refresh change log after sync.
						self.loadChangeLog( 0 );
					} else {
						var errMsg = ( response.data && response.data.message ) || 'Sync failed.';
						$result.addClass( 'fdpbr-sync-panel__result--error' ).text( errMsg ).show();
						FDPBR.showToast( errMsg, 'error' );
					}
				},
				error: function( xhr, status, error ) {
					console.error( '[FDPBR Sync] AJAX error:', status, error, xhr.responseText );
					$result.addClass( 'fdpbr-sync-panel__result--error' ).text( 'Network error.' ).show();
					FDPBR.showToast( fdpbrAdmin.i18n.network_error, 'error' );
				},
				complete: function() {
					$btn.text( btnText ).prop( 'disabled', false );
					$panel.find( 'input, button' ).prop( 'disabled', false );
				}
			});
		},

		// =====================================================================
		// Delete Staging
		// =====================================================================

		bindDeleteStaging: function() {
			$( document ).on( 'click', '.fdpbr-delete-staging', function() {
				if ( ! confirm( 'Are you sure you want to delete this staging site?' ) ) {
					return;
				}

				var $btn = $( this );
				var id = $btn.data( 'id' );

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action:     'fdpbr_delete_staging',
						nonce:      fdpbrAdmin.nonce,
						staging_id: id
					},
					success: function( response ) {
						if ( response.success ) {
							$btn.closest( '.fdpbr-storage-card' ).fadeOut( function() { $( this ).remove(); } );
							FDPBR.showToast( 'Staging site deleted.', 'success' );
						} else {
							FDPBR.showToast( response.data.message || 'Delete failed.', 'error' );
						}
					}
				});
			});
		},

		// =====================================================================
		// Local ↔ Live (Remote Pairing + Sync)
		// =====================================================================

		bindLocalLive: function() {
			$( '#fdpbr-pair-remote' ).on( 'click', function() {
				var $btn = $( this );
				var url = $( '#fdpbr-remote-site-url' ).val();
				var key = $( '#fdpbr-remote-site-key' ).val();

				if ( ! url || ! key ) {
					FDPBR.showToast( 'Please enter both URL and key.', 'error' );
					return;
				}

				$btn.text( fdpbrAdmin.i18n.testing ).prop( 'disabled', true );

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action:   'fdpbr_pair_remote',
						nonce:    fdpbrAdmin.nonce,
						site_url: url,
						site_key: key
					},
					success: function( response ) {
						if ( response.success ) {
							FDPBR.showToast( 'Connected successfully!', 'success' );
							$( '#fdpbr-pull-from-live, #fdpbr-push-to-live, #fdpbr-two-way-sync' ).prop( 'disabled', false );
						} else {
							FDPBR.showToast( response.data.message || 'Connection failed.', 'error' );
						}
						$btn.text( 'Connect & Pair' ).prop( 'disabled', false );
					},
					error: function() {
						FDPBR.showToast( fdpbrAdmin.i18n.network_error, 'error' );
						$btn.text( 'Connect & Pair' ).prop( 'disabled', false );
					}
				});
			});
		},

		bindRemoteSync: function() {
			var directions = {
				'fdpbr-pull-from-live': 'pull',
				'fdpbr-push-to-live':  'push',
				'fdpbr-two-way-sync':  'two_way'
			};

			$.each( directions, function( btnId, direction ) {
				$( '#' + btnId ).on( 'click', function() {
					var $btn     = $( this );
					var btnText  = $btn.text();
					var url      = $( '#fdpbr-remote-site-url' ).val();
					var key      = $( '#fdpbr-remote-site-key' ).val();

					if ( ! url || ! key ) {
						FDPBR.showToast( 'Please pair with a remote site first.', 'error' );
						return;
					}

					$btn.text( 'Syncing...' ).prop( 'disabled', true );

					$.ajax({
						url:  fdpbrAdmin.ajax_url,
						type: 'POST',
						data: {
							action:     'fdpbr_remote_sync',
							nonce:      fdpbrAdmin.nonce,
							direction:  direction,
							remote_url: url,
							remote_key: key
						},
						success: function( response ) {
							if ( response.success ) {
								var report = response.data.report || {};
								var parts  = [];

								if ( report.pushed ) {
									parts.push( report.pushed + ' pushed' );
								}
								if ( report.pulled ) {
									parts.push( report.pulled + ' pulled' );
								}
								if ( report.conflicts && report.conflicts.length ) {
									parts.push( report.conflicts.length + ' conflict' + ( report.conflicts.length !== 1 ? 's' : '' ) );
								}

								var msg = parts.length ? 'Remote sync: ' + parts.join( ', ' ) + '.' : 'Remote sync complete.';
								FDPBR.showToast( msg, 'success' );
							} else {
								FDPBR.showToast( ( response.data && response.data.message ) || 'Remote sync failed.', 'error' );
							}
						},
						error: function() {
							FDPBR.showToast( fdpbrAdmin.i18n.network_error, 'error' );
						},
						complete: function() {
							$btn.text( btnText ).prop( 'disabled', false );
						}
					});
				});
			});
		},

		// =====================================================================
		// Change Log
		// =====================================================================

		bindChangeLog: function() {
			var self = this;

			// Filter change handler.
			$( document ).on( 'change', '.fdpbr-changelog-filter', function() {
				self.loadChangeLog( 0 );
			});

			// Load More button.
			$( document ).on( 'click', '#fdpbr-changelog-load-more', function() {
				var offset = parseInt( $( this ).data( 'offset' ), 10 ) || 0;
				self.loadChangeLog( offset, true );
			});
		},

		loadChangeLog: function( offset, append ) {
			var self    = this;
			var filters = {};

			$( '.fdpbr-changelog-filter' ).each( function() {
				var key = $( this ).data( 'filter' );
				var val = $( this ).val();
				if ( val ) {
					filters[ key ] = val;
				}
			});

			var data = $.extend( {
				action: 'fdpbr_get_change_log',
				nonce:  fdpbrAdmin.nonce,
				offset: offset || 0
			}, filters );

			var $container = $( '#fdpbr-changelog-container' );
			var $loadMore  = $( '#fdpbr-changelog-load-more' );

			if ( ! append ) {
				$container.css( 'opacity', '0.5' );
			}
			if ( $loadMore.length ) {
				$loadMore.prop( 'disabled', true ).text( 'Loading...' );
			}

			$.ajax({
				url:  fdpbrAdmin.ajax_url,
				type: 'POST',
				data: data,
				success: function( response ) {
					if ( ! response.success ) {
						FDPBR.showToast( ( response.data && response.data.message ) || 'Failed to load changes.', 'error' );
						return;
					}

					var d       = response.data;
					var entries = d.entries || [];

					if ( ! append ) {
						if ( entries.length === 0 ) {
							$container.html(
								'<div class="fdpbr-changelog-empty">' +
								'<span class="dashicons dashicons-list-view"></span>' +
								'<p>No changes found.</p></div>'
							);
							return;
						}

						var html = '<table class="fdpbr-table" id="fdpbr-changelog-table"><thead><tr>' +
							'<th>Type</th><th>Object</th><th>Source</th><th>Status</th><th>Date</th>' +
							'</tr></thead><tbody id="fdpbr-changelog-tbody">';
						html += self.renderChangeRows( entries );
						html += '</tbody></table>';

						if ( d.has_more ) {
							html += '<div style="padding: 16px; text-align: center;">' +
								'<button type="button" id="fdpbr-changelog-load-more" class="fdpbr-btn fdpbr-btn--ghost fdpbr-btn--small" ' +
								'data-offset="' + d.per_page + '" data-total="' + d.total + '">' +
								'Load More (' + ( d.total - d.per_page ) + ' remaining)</button></div>';
						}

						$container.html( html );
					} else {
						var newRows = self.renderChangeRows( entries );
						$( '#fdpbr-changelog-tbody' ).append( newRows );

						var newOffset = offset + d.per_page;
						if ( d.has_more ) {
							$loadMore.data( 'offset', newOffset )
								.text( 'Load More (' + ( d.total - newOffset ) + ' remaining)' )
								.prop( 'disabled', false );
						} else {
							$loadMore.parent().remove();
						}
					}
				},
				error: function() {
					FDPBR.showToast( 'Network error loading changes.', 'error' );
				},
				complete: function() {
					$container.css( 'opacity', '1' );
				}
			});
		},

		renderChangeRows: function( entries ) {
			var html       = '';
			var typeColors  = { create: 'success', update: 'warning', 'delete': 'danger' };
			var typeIcons   = {
				post: 'dashicons-admin-post',
				option: 'dashicons-admin-generic',
				term: 'dashicons-tag',
				nav_menu: 'dashicons-menu',
				widget: 'dashicons-welcome-widgets-menus'
			};

			for ( var i = 0; i < entries.length; i++ ) {
				var e           = entries[i];
				var typeBadge   = typeColors[ e.change_type ] || 'info';
				var icon        = typeIcons[ e.object_type ] || 'dashicons-admin-generic';
				var sourceBadge = ( 'live' === e.source ) ? 'info' : 'success';
				var statusBadge = e.synced ? 'success' : 'warning';
				var statusText  = e.synced ? 'Synced' : 'Pending';
				var typeText    = e.change_type.charAt(0).toUpperCase() + e.change_type.slice(1);
				var sourceText  = e.source.charAt(0).toUpperCase() + e.source.slice(1);

				html += '<tr>' +
					'<td><span class="fdpbr-badge fdpbr-badge--' + typeBadge + '">' + this.escHtml( typeText ) + '</span></td>' +
					'<td><span class="dashicons ' + icon + '" style="font-size:14px;width:14px;height:14px;margin-right:4px;color:var(--fdpbr-gray-400);"></span>' + this.escHtml( e.label ) + '</td>' +
					'<td><span class="fdpbr-badge fdpbr-badge--' + sourceBadge + '">' + this.escHtml( sourceText ) + '</span></td>' +
					'<td><span class="fdpbr-badge fdpbr-badge--' + statusBadge + '">' + statusText + '</span></td>' +
					'<td title="' + this.escHtml( e.detected_at ) + '">' + this.escHtml( e.time_ago ) + ' ago</td>' +
					'</tr>';
			}
			return html;
		},

		escHtml: function( text ) {
			var div = document.createElement( 'div' );
			div.appendChild( document.createTextNode( text || '' ) );
			return div.innerHTML;
		}
	};

	$( document ).ready( function() {
		StagingManager.init();
	});

})( jQuery );
