/**
 * 5DP Backup & Restore - Core Admin JavaScript
 *
 * Handles settings forms, toast notifications, and shared UI logic.
 *
 * @package FiveDPBR
 * @since   1.0.0
 */

(function( $ ) {
	'use strict';

	var FDPBR = {

		/**
		 * Initialize all core handlers.
		 */
		init: function() {
			this.bindSettingsForms();
			this.bindBtnGroups();
			this.bindWizards();
		},

		// =====================================================================
		// Toast Notifications
		// =====================================================================

		/**
		 * Show a toast notification.
		 *
		 * @param {string} message The message to display.
		 * @param {string} type    'success' or 'error'.
		 */
		showToast: function( message, type ) {
			type = type || 'success';

			// Remove existing toasts.
			$( '.fdpbr-toast' ).remove();

			var $toast = $( '<div class="fdpbr-toast fdpbr-toast--' + type + '">' +
				'<span class="fdpbr-toast__message">' + message + '</span>' +
				'<button type="button" class="fdpbr-toast__close">&times;</button>' +
			'</div>' );

			$( 'body' ).append( $toast );

			// Auto-remove after 4 seconds.
			setTimeout( function() {
				$toast.addClass( 'fdpbr-toast--hide' );
				setTimeout( function() { $toast.remove(); }, 300 );
			}, 4000 );

			// Close on click.
			$toast.on( 'click', '.fdpbr-toast__close', function() {
				$toast.remove();
			});
		},

		// =====================================================================
		// Settings Form AJAX Save
		// =====================================================================

		/**
		 * Bind AJAX save to all settings forms.
		 */
		bindSettingsForms: function() {
			var self = this;

			$( document ).on( 'submit', '.fdpbr-settings-form', function( e ) {
				e.preventDefault();

				var $form  = $( this );
				var module = $form.data( 'module' );
				var $btn   = $form.find( '[type="submit"]' );
				var originalText = $btn.text();

				$btn.text( fdpbrAdmin.i18n.saving ).prop( 'disabled', true );

				// Collect form data.
				var formSettings = {};
				$form.find( 'input, select, textarea' ).each( function() {
					var $input = $( this );
					var name   = $input.attr( 'name' );

					if ( ! name || name === 'fdpbr_nonce_field' || name === '_wpnonce' || name === '_wp_http_referer' ) {
						return;
					}

					if ( $input.is( ':checkbox' ) ) {
						formSettings[ name ] = $input.is( ':checked' ) ? '1' : '0';
					} else if ( $input.is( ':radio' ) ) {
						if ( $input.is( ':checked' ) ) {
							formSettings[ name ] = $input.val();
						}
					} else {
						formSettings[ name ] = $input.val();
					}
				});

				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action:   'fdpbr_save_settings',
						nonce:    fdpbrAdmin.nonce,
						module:   module,
						settings: formSettings
					},
					success: function( response ) {
						if ( response.success ) {
							self.showToast( response.data.message, 'success' );
						} else {
							self.showToast( response.data.message || fdpbrAdmin.i18n.error, 'error' );
						}
					},
					error: function() {
						self.showToast( fdpbrAdmin.i18n.network_error, 'error' );
					},
					complete: function() {
						$btn.text( originalText ).prop( 'disabled', false );
					}
				});
			});
		},

		// =====================================================================
		// Button Groups (radio-like toggle)
		// =====================================================================

		/**
		 * Bind button group toggle behavior.
		 */
		bindBtnGroups: function() {
			$( document ).on( 'click', '.fdpbr-btn-group__item', function() {
				var $btn = $( this );
				var $group = $btn.closest( '.fdpbr-btn-group' );

				$group.find( '.fdpbr-btn-group__item' ).removeClass( 'fdpbr-btn-group__item--active' );
				$btn.addClass( 'fdpbr-btn-group__item--active' );
			});
		},

		// =====================================================================
		// Wizard Steps
		// =====================================================================

		/**
		 * Bind wizard step navigation.
		 */
		bindWizards: function() {
			// Expose goToStep for external use.
			window.fdpbrGoToStep = function( wizardId, step ) {
				var $wizard = $( '#' + wizardId );
				if ( ! $wizard.length ) {
					return;
				}

				// Update step indicators.
				$wizard.find( '.fdpbr-wizard__step' ).each( function() {
					var $s = $( this );
					var sNum = parseInt( $s.data( 'step' ), 10 );

					$s.removeClass( 'fdpbr-wizard__step--active fdpbr-wizard__step--completed' );
					if ( sNum < step ) {
						$s.addClass( 'fdpbr-wizard__step--completed' );
					} else if ( sNum === step ) {
						$s.addClass( 'fdpbr-wizard__step--active' );
					}
				});

				// Show corresponding content.
				$wizard.find( '.fdpbr-wizard__content' ).removeClass( 'fdpbr-wizard__content--active' );
				$wizard.find( '.fdpbr-wizard__content[data-step="' + step + '"]' ).addClass( 'fdpbr-wizard__content--active' );
			};
		},

		// =====================================================================
		// Job Progress Polling
		// =====================================================================

		/**
		 * Poll a background job for progress updates.
		 *
		 * @param {string}   jobId    The job ID to poll.
		 * @param {Function} onUpdate Callback: function( data ) where data = { percent, step, status }.
		 * @param {number}   interval Polling interval in ms (default 2000).
		 */
		pollJobProgress: function( jobId, onUpdate, interval ) {
			interval = interval || 2000;
			var self = this;

			var poll = function() {
				$.ajax({
					url:  fdpbrAdmin.ajax_url,
					type: 'POST',
					data: {
						action: 'fdpbr_job_progress',
						nonce:  fdpbrAdmin.nonce,
						job_id: jobId
					},
					success: function( response ) {
						if ( response.success && response.data ) {
							onUpdate( response.data );

							if ( response.data.status === 'completed' || response.data.status === 'failed' ) {
								return; // Stop polling.
							}
						}
						setTimeout( poll, interval );
					},
					error: function() {
						setTimeout( poll, interval );
					}
				});
			};

			poll();
		}
	};

	$( document ).ready( function() {
		FDPBR.init();
	});

	// Expose globally.
	window.FDPBR = FDPBR;

})( jQuery );
