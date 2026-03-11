# Creating Products

Guide to creating product configurations for WP Launcher using the interactive script.

## Quick Start

```bash
bash scripts/create-product.sh
```

The script walks you through every step and creates all the files and directories you need.

## What Gets Created

After running the script, you'll have:

```
products/your-product.json          # Product config (controls everything)
product-assets/your-product/
  plugins/                          # Place local plugin .zip files here
  themes/                           # Place local theme .zip files here
```

If no local files are needed, the script also builds the Docker image automatically.

## Step-by-Step Walkthrough

### Step 1: Basic Info

```
Product ID: my-plugin-demo
Product display name: My Plugin Demo
```

- **Product ID** — URL-safe identifier (auto-sanitized: lowercase, dashes only). This becomes the JSON filename, Docker image name, and is used in API calls.
- **Display name** — Human-readable name shown on the dashboard.

If a product with the same ID already exists, you'll be asked to confirm before overwriting.

### Step 2: Database Engine

```
1) SQLite   — fastest startup, no external DB needed (recommended)
2) MySQL    — traditional WordPress database
3) MariaDB  — MySQL-compatible alternative
```

- **SQLite** is best for quick demos — instant startup, no shared database.
- **MySQL/MariaDB** are better when your plugin/theme relies on MySQL-specific features.

### Step 3: WordPress Settings

```
WordPress version [6.9]:
Locale [en_US]:
```

Set the WordPress version and language. Defaults are usually fine.

### Step 4: Plugins

Three sources are supported:

#### WordPress.org plugins
Enter plugin slugs (the part after `wordpress.org/plugins/`):
```
Plugin slug: woocommerce
Plugin slug: contact-form-7
Plugin slug: (blank to finish)
```

#### URL plugins
Direct download URLs to `.zip` files:
```
Plugin URL: https://example.com/my-premium-plugin-v2.zip
Plugin URL: (blank to finish)
```

#### Local plugins
Zip files you'll upload manually after the script runs:
```
Plugin zip filename: my-custom-plugin.zip
Plugin zip filename: (blank to finish)
```

These go in `product-assets/<product-id>/plugins/`.

#### Plugins to remove
Default WordPress plugins to remove (comma-separated):
```
Plugins to remove [hello,akismet]: hello,akismet
```

### Step 5: Themes

Same three sources as plugins:

- **WordPress.org** — by theme slug (e.g., `astra`, `flavflavor`)
- **URL** — direct download link to a `.zip`
- **Local** — zip filename to upload later to `product-assets/<product-id>/themes/`

Plus:
- **Active theme** — which theme to activate (leave blank for WordPress default)
- **Themes to remove** — comma-separated list of default themes to remove

### Step 6: Demo Settings

```
Default expiration [1h]: 2h
Max expiration [24h]: 48h
Max concurrent sites [10]: 5
Admin username [demo]: demo
Admin email [demo@example.com]: demo@example.com
Landing page after login (blank = wp-admin):
```

- **Default expiration** — how long demo sites last by default
- **Max expiration** — maximum time a user can request
- **Max concurrent sites** — limit per product to control server resources
- **Landing page** — redirect users here after auto-login (e.g., `/wp-admin/admin.php?page=my-plugin`)

### Step 7: Branding

```
Product description: Try our awesome plugin with a live WordPress demo.
Banner text [This is a temporary demo site...]:
Logo URL:
Image URL:
```

- **Description** — shown on the product card on the dashboard
- **Banner text** — displayed inside demo sites. Use `{time_remaining}` as a placeholder.
- **Logo/Image URL** — optional branding for the dashboard card

### Step 8: Restrictions

```
Disable file modifications? [Y/n]: Y
Hidden menu items [tools.php]: tools.php
```

- **Disable file mods** — prevents plugin/theme installs from wp-admin (recommended)
- **Hidden menu items** — WordPress admin menu slugs to hide (comma-separated)

Default blocked capabilities: `install_plugins`, `install_themes`, `edit_plugins`, `edit_themes`, `update_core`, `export`, `import`.

## After the Script

### If you have local plugin/theme files

1. Upload your `.zip` files:
   ```
   product-assets/your-product/plugins/my-plugin.zip
   product-assets/your-product/themes/my-theme.zip
   ```

2. Ensure `PRODUCT_ASSETS_PATH` is set in `.env` to the **absolute host path** of the `product-assets/` directory:
   ```bash
   # Example for VPS (install.sh sets this automatically)
   PRODUCT_ASSETS_PATH=/opt/wp-launcher/product-assets
   ```
   This is required so containers can access local plugin/theme zip files at runtime.

3. Build the Docker image:
   ```bash
   bash scripts/build-wp-image.sh your-product
   ```

4. Restart the API to pick up the new product:
   ```bash
   docker compose restart api
   ```

### If you don't have local files

The image is already built. Just restart the API:
```bash
docker compose restart api
```

The product will appear on the dashboard automatically.

## Editing a Product

Edit the JSON file directly:
```bash
nano products/your-product.json
```

Or re-run the script with the same product ID — it will ask to overwrite.

After editing, rebuild and restart:
```bash
bash scripts/build-wp-image.sh your-product
docker compose restart api
```

## Product Config Reference

Full JSON structure with all available fields:

```json
{
  "id": "my-product",
  "name": "My Product Demo",
  "wordpress": {
    "version": "6.9",
    "locale": "en_US"
  },
  "plugins": {
    "preinstall": [
      { "source": "wordpress.org", "slug": "woocommerce", "activate": true },
      { "source": "url", "url": "https://example.com/plugin.zip", "activate": true },
      { "source": "local", "path": "product-assets/my-product/plugins/plugin.zip", "activate": true }
    ],
    "remove": ["hello", "akismet"]
  },
  "themes": {
    "install": [
      { "source": "wordpress.org", "slug": "astra" },
      { "source": "url", "url": "https://example.com/theme.zip" },
      { "source": "local", "path": "product-assets/my-product/themes/theme.zip" }
    ],
    "active": "astra",
    "remove": []
  },
  "demo": {
    "default_expiration": "1h",
    "max_concurrent_sites": 10,
    "admin_user": "demo",
    "admin_email": "demo@example.com",
    "landing_page": ""
  },
  "database": "sqlite",
  "restrictions": {
    "disable_file_mods": true,
    "hidden_menu_items": ["tools.php"],
    "blocked_capabilities": [
      "install_plugins", "install_themes", "edit_plugins",
      "edit_themes", "update_core", "export", "import"
    ]
  },
  "branding": {
    "banner_text": "This is a temporary demo site. It will expire in {time_remaining}.",
    "logo_url": "",
    "description": "Try our product with a live WordPress demo.",
    "image_url": ""
  },
  "docker": {
    "image": "wp-launcher/my-product:latest"
  }
}
```

## Plugin/Theme Sources

| Source | How it works | When to use |
|---|---|---|
| `wordpress.org` | Downloaded from wp.org during Docker build | Free/public plugins and themes |
| `url` | Downloaded from a direct URL during Docker build | Premium plugins with a download link |
| `local` | Copied from `product-assets/` during Docker build | Private or custom plugins/themes |

## Tips

- **Keep product IDs short** — they're used in Docker image names and subdomains
- **Use SQLite for fastest demos** — MySQL adds startup time for DB provisioning
- **Set a landing page** if your plugin has a custom admin page — users see it immediately after login
- **Test locally first** — run `docker compose up` and create a demo site before deploying to VPS
- **Rebuild after changes** — any config change affecting the Docker image (plugins, themes) requires `bash scripts/build-wp-image.sh <product-id>`
