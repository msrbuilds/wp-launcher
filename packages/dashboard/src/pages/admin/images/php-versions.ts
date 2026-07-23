// Selectable PHP versions for image builds, newest first. Must stay in sync with
// ALL_PHP_VERSIONS in packages/api/src/services/imageBuild.service.ts (the server
// validates against that list) and with the WordPress base tags that actually
// exist (wordpress:6.9-php<ver>-apache; 7.4 pairs with WP 6.1).
export const PHP_VERSIONS = ['8.5', '8.4', '8.3', '8.2', '8.1', '7.4'];
