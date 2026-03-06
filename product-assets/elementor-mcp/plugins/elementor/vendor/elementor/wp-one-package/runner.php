<?php

global $__composer_autoload_files, $wp_one_package_versions;

/**
 * Allow this file to be executed multiple times across different plugin instances.
 *
 * This package may be bundled with multiple plugins, and each plugin needs to register
 * its version. By default, Composer's autoloader prevents the same file from being loaded
 * more than once. To enable re-execution, we remove this file from Composer's global
 * registry of loaded files ($__composer_autoload_files).
 *
 * Process:
 * 1. Locate the vendor directory (2 levels up when installed as a Composer package)
 * 2. Load Composer's autoload files map (hash => file path mappings)
 * 3. Find this file's unique hash ID in the map
 * 4. Remove the hash from the loaded files registry to allow subsequent executions
 */
$vendor_dir = dirname( __DIR__, 2 );
$autoload_files_path = $vendor_dir . '/composer/autoload_files.php';

if ( file_exists( $autoload_files_path ) ) {
	$autoload_files_map = require $autoload_files_path;
	$autoload_files_id = array_search( __FILE__, $autoload_files_map, true );

	if ( false !== $autoload_files_id && isset( $__composer_autoload_files[ $autoload_files_id ] ) ) {
		unset( $__composer_autoload_files[ $autoload_files_id ] );
	}
}

$pattern = '#/([^/]+)/vendor/elementor/#';
if ( preg_match( $pattern, __DIR__, $matches ) ) {
	$wp_one_package_versions[ $matches[1] ] = '1.0.52';
}

if ( ! function_exists( 'elementor_one_register_1_dot_0_dot_52' ) && function_exists( 'add_action' ) ) {

	if ( ! class_exists( '\ElementorOne\Versions', false ) ) {
		require_once __DIR__ . '/src/Versions.php';
		add_action( 'plugins_loaded', [ \ElementorOne\Versions::class, 'initialize_latest_version' ], -15, 0 );
	}

	add_action( 'plugins_loaded', 'elementor_one_register_1_dot_0_dot_52', -20, 0 );

	function elementor_one_register_1_dot_0_dot_52() {
		$versions = \ElementorOne\Versions::instance();
		$versions->register( '1.0.52', 'elementor_one_initialize_1_dot_0_dot_52' );
	}

	function elementor_one_initialize_1_dot_0_dot_52() {
		// The Loader class will be autoloaded from the highest version source
		\ElementorOne\Loader::init();
	}
}
