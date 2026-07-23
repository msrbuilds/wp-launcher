import { ValidationError } from '../utils/errors';

export const IMAGE_PREFIX = 'wp-launcher/';
export const DEFAULT_PHP = '8.3';
export const DEFAULT_WP = '6.9';
export const ALL_PHP_VERSIONS = ['8.5', '8.4', '8.3', '8.2', '8.1', '7.4'] as const;
export type PhpVersion = typeof ALL_PHP_VERSIONS[number];

// WordPress versions with published base images across the PHP 8.x range. PHP 7.4
// is legacy and only pairs with the older WP 6.1 tag. These lists gate which
// PHP×WP combinations can be built so we never request a tag that doesn't exist.
export const WP_VERSIONS_MODERN = ['6.9', '6.8', '6.7'] as const;
export const WP_VERSION_LEGACY = '6.1';

/** Default WordPress version paired with a PHP version. */
export function wpVersionForPhp(php: string): string {
  if (!ALL_PHP_VERSIONS.includes(php as PhpVersion)) {
    throw new ValidationError(`Unsupported PHP version: ${php}`);
  }
  return php === '7.4' ? WP_VERSION_LEGACY : DEFAULT_WP;
}

/** WordPress versions selectable for a given PHP version, newest first. */
export function allowedWpVersions(php: string): string[] {
  return php === '7.4' ? [WP_VERSION_LEGACY] : [...WP_VERSIONS_MODERN];
}

/** Throw unless (php, wp) is a supported, buildable combination. */
export function validatePhpWp(php: string, wp: string): void {
  if (!ALL_PHP_VERSIONS.includes(php as PhpVersion)) {
    throw new ValidationError(`Unsupported PHP version: ${php}`);
  }
  if (!allowedWpVersions(php).includes(wp)) {
    throw new ValidationError(`WordPress ${wp} is not available for PHP ${php}`);
  }
}

/**
 * The tag for a base image. The default WordPress pairing keeps the legacy
 * php-only tag (backward compatible with existing bases and the
 * wp-launcher/wordpress:latest default); any other WordPress version gets a
 * `-wp<ver>` suffix so the two coexist without clobbering each other.
 */
export function baseImageTag(php: string, wp?: string): string {
  const w = wp || wpVersionForPhp(php);
  return w === wpVersionForPhp(php)
    ? `${IMAGE_PREFIX}wordpress:php${php}`
    : `${IMAGE_PREFIX}wordpress:php${php}-wp${w}`;
}
