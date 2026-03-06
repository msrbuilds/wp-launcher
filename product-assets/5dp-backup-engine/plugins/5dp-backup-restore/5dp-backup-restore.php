<?php
/**
 * Plugin Name:       5DP Backup & Restore
 * Plugin URI:        https://5dollarplugins.com/product/5dp-backup-restore/
 * Description:       Complete WordPress backup, restore, migration, and staging solution with chunked processing for any site size.
 * Version:           1.0.63
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            5 Dollar Plugins
 * Author URI:        https://5dollarplugins.com/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       5dp-backup-restore
 * Domain Path:       /languages
 *
 * @package FiveDPBR
 */

// Prevent direct access.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Plugin constants.
define( 'FDPBR_VERSION', '1.0.63' );
define( 'FDPBR_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'FDPBR_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'FDPBR_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

// Include core classes.
require_once FDPBR_PLUGIN_DIR . 'includes/class-fdpbr-activator.php';
require_once FDPBR_PLUGIN_DIR . 'includes/class-fdpbr-deactivator.php';
require_once FDPBR_PLUGIN_DIR . 'includes/class-fdpbr.php';

// Activation and deactivation.
register_activation_hook( __FILE__, array( 'FiveDPBR_Activator', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'FiveDPBR_Deactivator', 'deactivate' ) );

// Custom cron schedules (must be registered early).
add_filter( 'cron_schedules', array( 'FiveDPBR', 'add_cron_schedules' ) );

/**
 * Begin plugin execution.
 *
 * @since 1.0.0
 */
function fdpbr_run() {
	$plugin = new FiveDPBR();
	$plugin->run();
}
fdpbr_run();
