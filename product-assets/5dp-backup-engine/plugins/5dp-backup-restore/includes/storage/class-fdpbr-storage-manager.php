<?php
/**
 * Storage provider registry and factory.
 *
 * Manages all available storage providers, handles credential
 * encryption/decryption, and provides a unified API.
 *
 * @package    FiveDPBR
 * @subpackage FiveDPBR/includes/storage
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class FiveDPBR_Storage_Manager
 *
 * @since 1.0.0
 */
class FiveDPBR_Storage_Manager {

	/**
	 * Registered providers.
	 *
	 * @var array
	 */
	private static $providers = array();

	/**
	 * Register all built-in providers.
	 */
	public static function init() {
		self::register( new FiveDPBR_Storage_Local() );
		self::register( new FiveDPBR_Storage_S3() );
		self::register( new FiveDPBR_Storage_GCS() );
		self::register( new FiveDPBR_Storage_GDrive() );
		self::register( new FiveDPBR_Storage_Dropbox() );
		self::register( new FiveDPBR_Storage_OneDrive() );
		self::register( new FiveDPBR_Storage_FTP() );
		self::register( new FiveDPBR_Storage_SFTP() );
		self::register( new FiveDPBR_Storage_WebDAV() );
	}

	/**
	 * Register a storage provider.
	 *
	 * @param FiveDPBR_Storage_Interface $provider Provider instance.
	 */
	public static function register( FiveDPBR_Storage_Interface $provider ) {
		self::$providers[ $provider->get_slug() ] = $provider;
	}

	/**
	 * Get a provider instance by slug.
	 *
	 * @param string $slug Provider slug.
	 * @return FiveDPBR_Storage_Interface|null
	 */
	public static function get_provider( $slug ) {
		return isset( self::$providers[ $slug ] ) ? self::$providers[ $slug ] : null;
	}

	/**
	 * Get all registered providers.
	 *
	 * @return array
	 */
	public static function get_all_providers() {
		return self::$providers;
	}

	/**
	 * Get saved destinations (with encrypted credentials).
	 *
	 * @return array
	 */
	public static function get_destinations() {
		return get_option( 'fdpbr_storage_destinations', array() );
	}

	/**
	 * Save a destination's credentials.
	 *
	 * @param string $slug        Provider slug.
	 * @param array  $credentials Raw credentials.
	 * @return bool
	 */
	public static function save_destination( $slug, $credentials ) {
		$destinations = self::get_destinations();

		// Encrypt sensitive fields.
		$provider = self::get_provider( $slug );
		if ( $provider ) {
			$fields = $provider->get_credential_fields();
			foreach ( $fields as $field ) {
				$key = $field['name'];
				if ( ! empty( $field['encrypted'] ) && isset( $credentials[ $key ] ) ) {
					$credentials[ $key ] = FiveDPBR_Encryption::encrypt( $credentials[ $key ] );
				}
			}
		}

		$destinations[ $slug ] = array(
			'credentials' => $credentials,
			'connected'   => true,
			'updated_at'  => current_time( 'mysql', true ),
		);

		return update_option( 'fdpbr_storage_destinations', $destinations );
	}

	/**
	 * Get decrypted credentials for a destination.
	 *
	 * @param string $slug Provider slug.
	 * @return array Decrypted credentials.
	 */
	public static function get_credentials( $slug ) {
		$destinations = self::get_destinations();

		if ( ! isset( $destinations[ $slug ] ) ) {
			return array();
		}

		$credentials = $destinations[ $slug ]['credentials'];

		// Decrypt sensitive fields.
		$provider = self::get_provider( $slug );
		if ( $provider ) {
			$fields = $provider->get_credential_fields();
			foreach ( $fields as $field ) {
				$key = $field['name'];
				if ( ! empty( $field['encrypted'] ) && isset( $credentials[ $key ] ) ) {
					$credentials[ $key ] = FiveDPBR_Encryption::decrypt( $credentials[ $key ] );
				}
			}
		}

		return $credentials;
	}

	/**
	 * Remove a destination.
	 *
	 * @param string $slug Provider slug.
	 * @return bool
	 */
	public static function remove_destination( $slug ) {
		$destinations = self::get_destinations();
		unset( $destinations[ $slug ] );
		return update_option( 'fdpbr_storage_destinations', $destinations );
	}

	/**
	 * Test connection to a destination.
	 *
	 * @param string $slug        Provider slug.
	 * @param array  $credentials Raw credentials (if testing before save).
	 * @return true|WP_Error
	 */
	public static function test_connection( $slug, $credentials = array() ) {
		$provider = self::get_provider( $slug );

		if ( ! $provider ) {
			return new WP_Error( 'unknown_provider', __( 'Unknown storage provider.', '5dp-backup-restore' ) );
		}

		if ( empty( $credentials ) ) {
			$credentials = self::get_credentials( $slug );
		}

		return $provider->test_connection( $credentials );
	}

	/**
	 * Upload a file to a destination.
	 *
	 * @param string $slug        Provider slug.
	 * @param string $local_path  Local file path.
	 * @param string $remote_path Remote path.
	 * @return true|WP_Error
	 */
	public static function upload( $slug, $local_path, $remote_path ) {
		$provider    = self::get_provider( $slug );
		$credentials = self::get_credentials( $slug );

		if ( ! $provider ) {
			return new WP_Error( 'unknown_provider', __( 'Unknown storage provider.', '5dp-backup-restore' ) );
		}

		return $provider->upload( $local_path, $remote_path, $credentials );
	}

	/**
	 * Download a file from a destination.
	 *
	 * @param string $slug        Provider slug.
	 * @param string $remote_path Remote path.
	 * @param string $local_path  Local destination.
	 * @return true|WP_Error
	 */
	public static function download( $slug, $remote_path, $local_path ) {
		$provider    = self::get_provider( $slug );
		$credentials = self::get_credentials( $slug );

		if ( ! $provider ) {
			return new WP_Error( 'unknown_provider', __( 'Unknown storage provider.', '5dp-backup-restore' ) );
		}

		return $provider->download( $remote_path, $local_path, $credentials );
	}

	// =========================================================================
	// AJAX Handlers
	// =========================================================================

	/**
	 * Register AJAX handlers.
	 */
	public static function register_ajax() {
		add_action( 'wp_ajax_fdpbr_save_storage', array( __CLASS__, 'ajax_save_storage' ) );
		add_action( 'wp_ajax_fdpbr_test_storage', array( __CLASS__, 'ajax_test_storage' ) );
		add_action( 'wp_ajax_fdpbr_disconnect_storage', array( __CLASS__, 'ajax_disconnect_storage' ) );
	}

	/**
	 * AJAX: Save storage credentials.
	 */
	public static function ajax_save_storage() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$slug = isset( $_POST['provider'] ) ? sanitize_text_field( wp_unslash( $_POST['provider'] ) ) : '';
		$creds = isset( $_POST['credentials'] ) && is_array( $_POST['credentials'] )
			? array_map( 'sanitize_text_field', wp_unslash( $_POST['credentials'] ) )
			: array();

		if ( empty( $slug ) ) {
			wp_send_json_error( array( 'message' => __( 'No provider specified.', '5dp-backup-restore' ) ) );
		}

		self::save_destination( $slug, $creds );

		wp_send_json_success( array( 'message' => __( 'Storage settings saved.', '5dp-backup-restore' ) ) );
	}

	/**
	 * AJAX: Test storage connection.
	 */
	public static function ajax_test_storage() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$slug = isset( $_POST['provider'] ) ? sanitize_text_field( wp_unslash( $_POST['provider'] ) ) : '';
		$creds = isset( $_POST['credentials'] ) && is_array( $_POST['credentials'] )
			? array_map( 'sanitize_text_field', wp_unslash( $_POST['credentials'] ) )
			: array();

		$result = self::test_connection( $slug, $creds );

		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => $result->get_error_message() ) );
		}

		wp_send_json_success( array( 'message' => __( 'Connection successful!', '5dp-backup-restore' ) ) );
	}

	/**
	 * AJAX: Disconnect storage.
	 */
	public static function ajax_disconnect_storage() {
		check_ajax_referer( 'fdpbr_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', '5dp-backup-restore' ) ) );
		}

		$slug = isset( $_POST['provider'] ) ? sanitize_text_field( wp_unslash( $_POST['provider'] ) ) : '';
		self::remove_destination( $slug );

		wp_send_json_success( array( 'message' => __( 'Storage disconnected.', '5dp-backup-restore' ) ) );
	}
}
