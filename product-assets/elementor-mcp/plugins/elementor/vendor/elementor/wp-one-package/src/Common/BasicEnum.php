<?php

namespace ElementorOne\Common;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

/*
 * BasicEnum class
 */
abstract class BasicEnum {

	/**
	 * Entries
	 * @var array
	 */
	private static array $entries = [];

	/**
	 * @throws \ReflectionException
	 */
	public static function get_values(): array {
		return array_values( self::get_entries() );
	}

	/**
	 * @throws \ReflectionException
	 */
	protected static function get_entries(): array {
		$caller = get_called_class();

		if ( ! array_key_exists( $caller, self::$entries ) ) {
			$reflect = new \ReflectionClass( $caller );
			self::$entries[ $caller ] = $reflect->getConstants();
		}

		return self::$entries[ $caller ];
	}
}
