<?php

namespace ElementorOne\Admin\Services;

use ElementorOne\Admin\Helpers\Utils;
use ElementorOne\Logger;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class License
 */
class License {

	/**
	 * Logger instance
	 * @var Logger
	 */
	private Logger $logger;

	/**
	 * Instance
	 * @var License|null
	 */
	private static ?License $instance = null;

	/**
	 * Get instance
	 * @return License|null
	 */
	public static function instance(): ?License {
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
	}

	/**
	 * Get product feedback URL
	 * @return string
	 */
	public function get_license_info_url(): string {
		return Client::get_client_base_url() . '/connect/api/v1/license/info';
	}

	/**
	 * Get license info
	 * @return array|null
	 * @throws \Throwable
	 */
	public function get_license_info(): array {
		try {
			return Utils::get_api_client()->request(
				$this->get_license_info_url(),
				[
					'method' => 'GET',
				]
			);
		} catch ( \Throwable $th ) {
			$this->logger->error( $th->getMessage() );

			throw $th;
		}
	}

	/**
	 * Check if connected
	 * @return bool
	 */
	public static function is_connected(): bool {
		$facade = Utils::get_one_connect();

		if ( ! $facade->utils()->is_connected() ) {
			return false;
		}

		try {
			$license_info = self::instance()->get_license_info();
			$license_is_valid = 'ACTIVE' === $license_info['status'] ?? null;
			if ( ! $license_is_valid ) {
				$facade->service()->disconnect();
			}
			return $license_is_valid;
		} catch ( \Throwable $th ) {
			if ( in_array( $th->getCode(), [ \WP_Http::UNAUTHORIZED, \WP_Http::FORBIDDEN ], true ) ) {
				$facade->data()->clear_session();
			}
			return false;
		}
	}
}
