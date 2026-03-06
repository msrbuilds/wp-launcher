<?php

namespace ElementorOne\Admin\Services;

use ElementorOne\Admin\Helpers\Utils;
use ElementorOne\Logger;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Feedback
 */
class Feedback {

	/**
	 * Logger instance
	 * @var Logger
	 */
	private Logger $logger;

	/**
	 * Instance
	 * @var Feedback|null
	 */
	private static ?Feedback $instance = null;

	/**
	 * Get instance
	 * @return Feedback|null
	 */
	public static function instance(): ?Feedback {
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
	public function get_product_feedback_url(): string {
		return Client::get_client_base_url() . '/feedback/api/v1/product-feedback';
	}

	/**
	 * Send product feedback
	 * @param string $product
	 * @param string $subject
	 * @param string $title
	 * @param string $description
	 * @return void
	 * @throws \ElementorOne\Admin\Exceptions\ClientException
	 */
	public function send_product_feedback( string $product, string $subject, string $title, string $description ): void {
		try {
			Utils::get_api_client()->request(
				$this->get_product_feedback_url(),
				[
					'method' => 'POST',
					'body' => wp_json_encode( [
						'product' => $product,
						'subject' => $subject,
						'title' => $title,
						'description' => $description,
						'referrerUrl' => wp_get_referer(),
					] ),
				]
			);
		} catch ( \Throwable $th ) {
			$this->logger->error( $th->getMessage() );

			if ( $th instanceof \ElementorOne\Admin\Exceptions\ClientException ) {
				throw $th;
			}
		}
	}
}
