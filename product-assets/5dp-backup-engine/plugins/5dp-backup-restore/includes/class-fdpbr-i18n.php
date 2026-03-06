<?php
/**
 * Internationalization functionality.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_I18n
 *
 * @since 1.0.0
 */
class FiveDPBR_I18n {

	/**
	 * Load the plugin text domain for translation.
	 *
	 * @since 1.0.0
	 */
	public function load_plugin_textdomain() {
		load_plugin_textdomain(
			'5dp-backup-restore',
			false,
			dirname( FDPBR_PLUGIN_BASENAME ) . '/languages/'
		);
	}
}
