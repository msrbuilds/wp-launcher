<?php

namespace ElementorOne\Connect\Classes;

use ElementorOne\Common\BasicEnum;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class GrantTypes
 */
class GrantTypes extends BasicEnum {

	/**
	 * Client credentials
	 * @var string
	 */
	const CLIENT_CREDENTIALS = 'client_credentials';

	/**
	 * Authorization code
	 * @var string
	 */
	const AUTHORIZATION_CODE = 'authorization_code';

	/**
	 * Refresh token
	 * @var string
	 */
	const REFRESH_TOKEN = 'refresh_token';
}
