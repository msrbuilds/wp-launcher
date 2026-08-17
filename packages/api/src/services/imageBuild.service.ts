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

/**
 * The alias every install points at by default (`config.wpImage`, and the
 * fallback in both compose files). `baseImageTag` cannot produce it, so it is
 * applied as a second tag after building the default pair — the same thing
 * scripts/build-wp-image.sh does with `docker tag`.
 */
export const LATEST_TAG = `${IMAGE_PREFIX}wordpress:latest`;

export interface BaseImageSpec {
  phpVersion: string;
  wpVersion: string;
}

/**
 * Whether building this tag should also move `:latest` onto the result.
 *
 * True for the default pair only, mirroring scripts/build-wp-image.sh, which
 * tags the default PHP image as `:latest` after building it. Keeping the rule
 * here — rather than as a flag threaded through each build request — is what
 * stops the panel and the script from drifting apart again.
 */
export function isDefaultBaseTag(tag: string): boolean {
  return tag === baseImageTag(DEFAULT_PHP, DEFAULT_WP);
}

/**
 * Recover the build inputs for one of our base image tags, or null if the tag
 * is not a base image we know how to produce.
 *
 * Null matters as much as the parse: custom product images
 * (`wp-launcher/<product>:latest`, built by scripts/create-product.sh with
 * plugins and themes baked in) share our namespace. Rebuilding one from a base
 * spec would replace it with a bare WordPress image under the same name and
 * silently discard everything it contained.
 */
export function parseBaseImageTag(tag: string): BaseImageSpec | null {
  // :latest is an alias for the default pair. Rebuilding it therefore means
  // building that pair — and because its tag is the default one,
  // isDefaultBaseTag re-applies the alias afterwards.
  if (tag === LATEST_TAG) {
    return { phpVersion: DEFAULT_PHP, wpVersion: DEFAULT_WP };
  }

  const match = /^wp-launcher\/wordpress:php(\d+\.\d+)(?:-wp(\d+\.\d+))?$/.exec(tag);
  if (!match) return null;

  const phpVersion = match[1];
  if (!ALL_PHP_VERSIONS.includes(phpVersion as PhpVersion)) return null;

  return {
    phpVersion,
    // A php-only tag means the legacy default pairing for that PHP version;
    // that is precisely what the suffix's absence encodes.
    wpVersion: match[2] || wpVersionForPhp(phpVersion),
  };
}
