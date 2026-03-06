<?php

namespace ElementorOne\Admin;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class Config
 */
class Config {
	const APP_NAME = 'elementor-one';
	const APP_PREFIX = 'elementor_one';
	const APP_REST_NAMESPACE = 'elementor-one/v1';
	const BASE_URL = 'https://my.elementor.com/connect';
	const ADMIN_PAGE = 'elementor-home';
	const APP_TYPE = 'app_one';
	const PLUGIN_SLUG = 'elementor-one';
	const SCOPES = 'openid offline_access share_usage_data';
	const STATE_NONCE = 'elementor_one_auth_nonce';
	const CONNECT_MODE = 'site';
}
