<?php

namespace ElementorOne\Admin\Services;

use ElementorOne\Admin\Helpers\Utils;
use ElementorOne\Common\SupportedPlugins;
use ElementorOne\Connect\Classes\GrantTypes;
use ElementorOne\Connect\Facade;
use ElementorOne\Logger;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Editor
 */
class Editor {

	const PRO_APP_TYPE = 'PLUGIN';
	const PRO_APP_PREFIX = 'elementor_pro';
	const CORE_APP_PREFIX = 'elementor';

	const CONNECT_APP_LIBRARY = 'library';
	const CONNECT_APP_ACTIVATE = 'activate';

	const GET_CLIENT_ID_ENDPOINT = 'get_client_id';

	const SITE_KEY_OPTION_NAME = 'elementor_connect_site_key';
	const LICENSE_KEY_OPTION_NAME = 'elementor_pro_license_key';
	const LICENSE_DATA_OPTION_NAME = '_elementor_pro_license_v2_data';
	const LICENSE_DATA_FALLBACK_OPTION_NAME = self::LICENSE_DATA_OPTION_NAME . '_fallback';
	const COMMON_DATA_USER_OPTION_NAME = 'elementor_connect_common_data';

	/**
	 * Logger instance
	 * @var Logger
	 */
	private Logger $logger;

	/**
	 * Instance
	 * @var Editor|null
	 */
	private static ?Editor $instance = null;

	/**
	 * Get instance
	 * @return Editor|null
	 */
	public static function instance(): ?Editor {
		if ( ! self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor
	 */
	private function __construct() {
		$this->logger = new Logger( self::class );

		// Set tracker opt-in
		add_action( 'elementor_one/elementor_one_connected', [ $this, 'set_tracker_opt_in' ] );
		add_action( 'elementor_one/elementor_one_disconnected', [ $this, 'set_tracker_opt_in' ] );

		// Filter additional connect info
		add_filter( 'elementor/connect/additional-connect-info', [ $this, 'filter_additional_connect_info' ], 10, 2 );
	}

	/**
	 * Get editor data URL
	 * @param string $client_id
	 * @return string
	 */
	public function get_editor_data_url( string $client_id ): string {
		return Client::get_client_base_url() . "/connect/api/v1/sites/{$client_id}/editor-data";
	}

	/**
	 * Get app download URL
	 * @param string $app_type
	 * @param string $app_version
	 * @return string
	 */
	private function get_app_download_url( string $app_type, string $app_version = 'latest' ): string {
		return Client::get_client_base_url() . "/api/v2/artifacts/{$app_type}/{$app_version}/download-link";
	}

	/**
	 * Get active license key
	 * @return string|null
	 */
	public static function get_active_license_key(): ?string {
		$active_license_key = get_option( self::LICENSE_KEY_OPTION_NAME, null );
		return ! empty( $active_license_key ) ? $active_license_key : null;
	}

	/**
	 * Validate connect type
	 * @param string $connect_type
	 * @return void
	 */
	public static function validate_connect_type( string $connect_type ): void {
		if ( ! in_array( $connect_type, [ self::CONNECT_APP_LIBRARY, self::CONNECT_APP_ACTIVATE ], true ) ) {
			throw new \InvalidArgumentException( 'Invalid connect type' );
		}
	}

	/**
	 * Update editor data
	 * @param string $connect_type
	 * @param bool $deactivate_license
	 * @return void
	 */
	public function update_editor_data( string $connect_type, bool $deactivate_license = false ): void {
		self::validate_connect_type( $connect_type );

		$client_id = Utils::get_one_connect()->data()->get_client_id();
		if ( ! $client_id ) {
			throw new \RuntimeException( 'Client ID is not set' );
		}

		$owner_id = Utils::get_one_connect()->data()->get_owner_user_id();
		if ( ! $owner_id ) {
			throw new \RuntimeException( 'Owner user ID is not set' );
		}

		try {
			$response = Utils::get_api_client()->request(
				$this->get_editor_data_url( $client_id ),
				[
					'method' => 'POST',
					'body' => wp_json_encode( [
						'app' => $connect_type,
						'local_id' => $owner_id,
						'site_key' => $this->get_site_key(),
						'deactivate_license_key' => $deactivate_license
							? self::get_active_license_key()
							: null,
					] ),
				],
				function ( $raw_response ) {
					return (array) json_decode( $raw_response );
				}
			);

			// Update common data user option
			update_user_option( $owner_id, self::COMMON_DATA_USER_OPTION_NAME, (array) $response['connectData'] );

			// Update license key if it exists
			if ( isset( $response['licenseKey'] ) ) {
				update_option( self::LICENSE_KEY_OPTION_NAME, $response['licenseKey'] );
			} elseif ( $deactivate_license ) {
				delete_option( self::LICENSE_KEY_OPTION_NAME );
				delete_option( self::LICENSE_DATA_OPTION_NAME );
				delete_option( self::LICENSE_DATA_FALLBACK_OPTION_NAME );
			}
		} catch ( \Throwable $th ) {
			$this->logger->error( $th->getMessage() );
		}
	}

	/**
	 * Delete editor data
	 * @return void
	 */
	public function delete_editor_data(): void {
		$client_id = Utils::get_one_connect()->data()->get_client_id();
		if ( ! $client_id ) {
			throw new \RuntimeException( 'Client ID is not set' );
		}

		try {
			Utils::get_api_client()->request(
				$this->get_editor_data_url( $client_id ),
				[
					'method' => 'DELETE',
					'headers' => [
						'X-Elementor-Pro-Client-Id' => $this->get_site_owner_client_id(),
					],
				]
			);

			delete_option( self::LICENSE_KEY_OPTION_NAME );
			delete_option( self::LICENSE_DATA_OPTION_NAME );
			delete_option( self::LICENSE_DATA_FALLBACK_OPTION_NAME );
		} catch ( \Throwable $th ) {
			$this->logger->error( $th->getMessage() );
		}
	}

	/**
	 * Get site key
	 * @return string
	 */
	private function get_site_key(): string {
		$site_key = get_option( self::SITE_KEY_OPTION_NAME );
		if ( ! $site_key ) {
			$site_key = md5( uniqid( wp_generate_password() ) );
			update_option( self::SITE_KEY_OPTION_NAME, $site_key );
		}
		return $site_key;
	}

	/**
	 * Filter plugins API result for Elementor Pro
	 * @param \stdClass $result
	 * @return \stdClass|\WP_Error
	 */
	public function filter_plugins_api_result( $result ) {
		try {
			$response = Utils::get_api_client()->request(
				$this->get_app_download_url( self::PRO_APP_TYPE ),
				[
					'method' => \WP_REST_Server::READABLE,
				],
				null,
				GrantTypes::REFRESH_TOKEN
			);

			$result = new \stdClass();
			$result->download_link = $response['downloadLink'];
			$result->language_packs = [];

			return $result;
		} catch ( \Throwable $th ) {
			$this->logger->error( $th->getMessage() );

			return new \WP_Error(
				'plugin_not_found',
				'Plugin not found.',
				json_decode( $th->getMessage(), true )
			);
		}
	}

	/**
	 * Filter additional connect info
	 * @param array $additional_info
	 * @param Base_App $app
	 * @return array
	 */
	public function filter_additional_connect_info( array $additional_info, $app ): array {
		$is_ai_request = class_exists( '\Elementor\Modules\Ai\Connect\Ai' )
			&& $app instanceof \Elementor\Modules\Ai\Connect\Ai;

		$is_activate_request = class_exists( '\ElementorPro\Core\Connect\Apps\Activate' )
			&& $app instanceof \ElementorPro\Core\Connect\Apps\Activate;

		if ( $is_ai_request ) {
			$access_token = $this->get_one_connect_access_token();
			if ( $access_token ) {
				$additional_info['X-Elementor-One-Auth'] = $access_token;
			}
		} elseif ( $is_activate_request ) {
			$inject_authorize_url = function ( $parsed_args, $url ) use ( &$inject_authorize_url ) {
				if ( str_ends_with( $url, self::GET_CLIENT_ID_ENDPOINT ) ) {
					$authorize_url = Utils::get_authorize_url();
					if ( $authorize_url && is_array( $parsed_args['body'] ) ) {
						$parsed_args['body']['one_authorize_url'] = $authorize_url;
					}

					// Remove filter after it has been applied
					remove_filter( 'http_request_args', $inject_authorize_url, 10 );
				}

				return $parsed_args;
			};

			add_filter( 'http_request_args', $inject_authorize_url, 10, 2 );
		}

		return $additional_info;
	}

	/**
	 * Get ONE connect access token
	 * @return string|null
	 */
	private function get_one_connect_access_token(): ?string {
		$facade = Utils::get_connect( SupportedPlugins::ELEMENTOR );

		if ( ! $facade || ! $facade->utils()->is_connected() ) {
			return null;
		}

		$access_token = $facade->data()->get_access_token( GrantTypes::REFRESH_TOKEN );

		if ( ! Utils::is_jwt_expired( $access_token ) ) {
			return $access_token;
		}

		try {
			[ 'access_token' => $renewed_token ] = $facade->service()->renew_access_token( GrantTypes::REFRESH_TOKEN );
			return $renewed_token;
		} catch ( \Throwable $th ) {
			$this->logger->error( $th->getMessage() );
			return null;
		}
	}

	/**
	 * Get owner client ID
	 * @return string|null
	 */
	public function get_site_owner_client_id(): ?string {
		$connect_data = $this->get_site_owner_connect_data();
		return $connect_data['client_id'] ?? null;
	}

	/**
	 * Get site owner connect data
	 * @return array|null
	 */
	public function get_site_owner_connect_data(): ?array {
		$owner_id = Utils::get_one_connect()->data()->get_owner_user_id();
		if ( ! $owner_id ) {
			return null;
		}

		$connect_data = get_user_option( self::COMMON_DATA_USER_OPTION_NAME, $owner_id );
		return is_array( $connect_data ) ? $connect_data : null;
	}

	/**
	 * Sync Elementor tracker opt-in with ONE connect preference
	 * @param Facade $facade
	 * @return void
	 */
	public function set_tracker_opt_in( Facade $facade ): void {
		if ( is_callable( '\Elementor\Tracker::set_opt_in' ) ) {
			$allow_tracking = 'yes' === $facade->data()->get_share_usage_data();
			\Elementor\Tracker::set_opt_in( $allow_tracking );
		}
	}
}
