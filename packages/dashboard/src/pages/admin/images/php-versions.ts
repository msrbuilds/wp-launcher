// Offline fallback for the base-image build dialog. The live list of buildable
// PHP/WordPress pairs comes from GET /api/admin/images/versions (read from Docker
// Hub); this mirrors the API's static baseline so the dialog still works if that
// fetch fails. PHP 7.4 is legacy and only pairs with WP 6.1.
export const PHP_VERSIONS = ['8.5', '8.4', '8.3', '8.2', '8.1', '7.4'];

export const STATIC_WP_BY_PHP: Record<string, string[]> = {
  '8.5': ['6.9', '6.8', '6.7'],
  '8.4': ['6.9', '6.8', '6.7'],
  '8.3': ['6.9', '6.8', '6.7'],
  '8.2': ['6.9', '6.8', '6.7'],
  '8.1': ['6.9', '6.8', '6.7'],
  '7.4': ['6.1'],
};
