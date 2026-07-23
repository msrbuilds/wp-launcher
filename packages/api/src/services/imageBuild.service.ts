import { ValidationError } from '../utils/errors';

export const IMAGE_PREFIX = 'wp-launcher/';
export const DEFAULT_PHP = '8.3';
export const DEFAULT_WP = '6.9';
export const ALL_PHP_VERSIONS = ['8.5', '8.4', '8.3', '8.2', '8.1', '7.4'] as const;
export type PhpVersion = typeof ALL_PHP_VERSIONS[number];

/**
 * The legacy default WordPress pairing for a PHP version. This only decides the
 * backward-compatible base tag scheme (see baseImageTag) — the versions actually
 * offered to build come from wpImageTags.service, which reads live Docker Hub
 * tags. PHP 7.4 predates WP 6.9 so it pairs with 6.1.
 */
export function wpVersionForPhp(php: string): string {
  if (!ALL_PHP_VERSIONS.includes(php as PhpVersion)) {
    throw new ValidationError(`Unsupported PHP version: ${php}`);
  }
  return php === '7.4' ? '6.1' : DEFAULT_WP;
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
