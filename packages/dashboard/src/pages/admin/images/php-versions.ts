// Selectable PHP/WordPress versions for base-image builds, newest first. Must
// stay in sync with imageBuild.service.ts on the API (which validates the pair)
// and with the WordPress base tags that actually exist (wordpress:<wp>-php<php>-
// apache). PHP 7.4 is legacy and only pairs with WP 6.1.
export const PHP_VERSIONS = ['8.5', '8.4', '8.3', '8.2', '8.1', '7.4'];
export const WP_VERSIONS_MODERN = ['6.9', '6.8', '6.7'];
export const WP_VERSION_LEGACY = '6.1';

/** WordPress versions offered for a given PHP version. */
export function allowedWpVersions(php: string): string[] {
  return php === '7.4' ? [WP_VERSION_LEGACY] : WP_VERSIONS_MODERN;
}
