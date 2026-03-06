<?php
/**
 * Storage provider interface.
 *
 * All storage providers must implement this interface.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Interface FiveDPBR_Storage_Interface
 *
 * @since 1.0.0
 */
interface FiveDPBR_Storage_Interface {

	/**
	 * Get the provider slug.
	 *
	 * @return string
	 */
	public function get_slug();

	/**
	 * Get the provider display name.
	 *
	 * @return string
	 */
	public function get_name();

	/**
	 * Test the connection to the storage provider.
	 *
	 * @param array $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function test_connection( $credentials );

	/**
	 * Upload a file.
	 *
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path/key.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function upload( $local_path, $remote_path, $credentials );

	/**
	 * Upload a chunk (for resumable uploads).
	 *
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote file path/key.
	 * @param array  $credentials Provider credentials.
	 * @param int    $offset      Byte offset to resume from.
	 * @return int|WP_Error Bytes uploaded or error.
	 */
	public function upload_chunk( $local_path, $remote_path, $credentials, $offset = 0 );

	/**
	 * Download a file.
	 *
	 * @param string $remote_path Remote file path/key.
	 * @param string $local_path  Local destination path.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function download( $remote_path, $local_path, $credentials );

	/**
	 * Delete a file.
	 *
	 * @param string $remote_path Remote file path/key.
	 * @param array  $credentials Provider credentials.
	 * @return true|WP_Error
	 */
	public function delete( $remote_path, $credentials );

	/**
	 * List files in a directory/prefix.
	 *
	 * @param string $prefix     Remote path prefix.
	 * @param array  $credentials Provider credentials.
	 * @return array|WP_Error Array of file info or error.
	 */
	public function list_files( $prefix, $credentials );

	/**
	 * Get the credential fields required by this provider.
	 *
	 * @return array Array of field definitions.
	 */
	public function get_credential_fields();
}
