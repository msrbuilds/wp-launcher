# Adding New WordPress Products

Each JSON file in `products/` creates a product card on the launch page.

## Quick Start

```bash
# 1. Create the product config (id inside must match filename)
cp products/_default.json products/my-product.json
# Edit products/my-product.json with your settings

# 2. (Optional) Add local plugins
mkdir -p product-assets/my-product/plugins/
cp -r /path/to/my-plugin product-assets/my-product/plugins/my-plugin

# 3. Build the product Docker image (bakes in plugins/themes)
./scripts/build-wp-image.sh my-product

# 4. Restart the API to pick up the new config
docker compose restart api
```

The new product will appear on the dashboard automatically.

## One-Liner: Add Product While Server Is Running

```bash
./scripts/build-wp-image.sh my-product && docker compose restart api
```

That's all you need. The build script creates the Docker image with your plugins baked in, and restarting the API clears its config cache so it picks up the new JSON file.

## Config File Reference

Key fields to set in your product JSON:

| Field | What it does |
|---|---|
| `id` | Unique identifier (**must match filename** without `.json`) |
| `name` | Title shown on the product card |
| `plugins.preinstall` | Array of plugins to install (see below) |
| `docker.image` | Custom Docker image tag (set after building) |
| `demo.landing_page` | Where the user lands after WP login |
| `branding.description` | Card description text |
| `branding.image_url` | Card image URL |

## Plugin Sources

You can mix multiple source types in the `preinstall` array:

```json
{
  "plugins": {
    "preinstall": [
      {
        "source": "wordpress.org",
        "slug": "contact-form-7",
        "activate": true
      },
      {
        "source": "url",
        "url": "https://example.com/my-premium-plugin.zip",
        "activate": true
      },
      {
        "source": "local",
        "path": "./product-assets/my-product/plugins/my-custom-plugin",
        "activate": true
      }
    ],
    "remove": ["hello", "akismet"]
  }
}
```

| Source | How it works |
|---|---|
| `wordpress.org` | Downloaded from WP plugin repo by `slug` |
| `url` | Downloaded from any URL (must be a `.zip`) |
| `local` | Copied from a local directory (path relative to project root) |

## Example: WooCommerce Product

Create `products/woocommerce.json`:

```json
{
  "id": "woocommerce",
  "name": "WooCommerce Demo",
  "wordpress": { "version": "6.7", "locale": "en_US" },
  "plugins": {
    "preinstall": [
      { "source": "wordpress.org", "slug": "woocommerce", "activate": true }
    ],
    "remove": ["hello", "akismet"]
  },
  "themes": { "install": [], "remove": [] },
  "demo": {
    "default_expiration": "2h",
    "max_expiration": "24h",
    "max_concurrent_sites": 5,
    "admin_user": "demo",
    "admin_email": "demo@example.com",
    "landing_page": "/wp-admin/admin.php?page=wc-admin"
  },
  "restrictions": {
    "disable_file_mods": true,
    "hidden_menu_items": ["tools.php"],
    "blocked_capabilities": [
      "install_plugins", "install_themes",
      "edit_plugins", "edit_themes",
      "update_core", "export", "import"
    ]
  },
  "docker": {
    "image": "wp-launcher/woocommerce:latest"
  },
  "branding": {
    "banner_text": "WooCommerce demo — expires in {time_remaining}.",
    "description": "Try WooCommerce — the open-source eCommerce platform for WordPress.",
    "image_url": "https://ps.w.org/woocommerce/assets/icon-256x256.gif"
  }
}
```

Then build and deploy:

```bash
./scripts/build-wp-image.sh woocommerce
docker compose restart api
```

## Updating an Existing Product

When you change a product config (add/remove plugins, change settings):

```bash
# Rebuild the Docker image (plugins are baked in at build time)
./scripts/build-wp-image.sh my-product

# Restart API to clear the config cache
docker compose restart api
```

## Finding Plugin Icons

Every WordPress.org plugin has a standard icon URL:
```
https://ps.w.org/PLUGIN-SLUG/assets/icon-256x256.png
```
Replace `PLUGIN-SLUG` with the plugin slug (e.g. `contact-form-7`, `woocommerce`, `elementor`).

## Notes

- The `id` field **must match** the filename (e.g. `my-product.json` needs `"id": "my-product"`)
- Filenames starting with `_` (like `_default.json`) are ignored in the listing
- Each file = one product card on the launch page
- No `image_url`? The card shows a placeholder letter instead
- Local plugins must be placed under `product-assets/` and referenced with a relative path
