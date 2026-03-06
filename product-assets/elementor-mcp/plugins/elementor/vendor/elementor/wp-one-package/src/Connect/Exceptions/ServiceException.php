<?php

namespace ElementorOne\Connect\Exceptions;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/**
 * Service Exception
 */
class ServiceException extends \Exception {
	protected $message = 'Service Exception';
}
