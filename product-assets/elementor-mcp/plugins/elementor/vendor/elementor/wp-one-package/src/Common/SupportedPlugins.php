<?php

namespace ElementorOne\Common;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly
}

/**
 * Class SupportedPlugins
 */
class SupportedPlugins extends BasicEnum {
	const ANGIE = 'angie';
	const MANAGE = 'manage';
	const ELEMENTOR = 'elementor';
	const ELEMENTOR_PRO = 'elementor-pro';
	const SITE_MAILER = 'site-mailer';
	const IMAGE_OPTIMIZATION = 'image-optimization';
	const POJO_ACCESSIBILITY = 'pojo-accessibility';
}
