# WP Launcher - Getting Started Guide

## Prerequisites

- Docker Desktop installed and running
- Node.js 20+ installed
- PowerShell or terminal access

---

## Step 1: Initial Setup

```bash
# Clone/navigate to the project
cd wp-launcher

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Create Docker network
docker network create wp-launcher-network
```

## Step 2: Build the Base WordPress Image

This base image includes WordPress + SQLite + admin restrictions + countdown timer.

```bash
docker build -t wp-launcher/wordpress:latest ./wordpress
```

## Step 3: Start the Platform

```bash
docker compose up --build
```

This starts three services:
- **Traefik** (reverse proxy) on port 80
- **API** (site management) on port 3000
- **Dashboard** (web UI) on port 80 via Traefik

Open `http://localhost` to see the dashboard.

## Step 4: Launch a Demo Site

1. Open `http://localhost` in your browser
2. Select an product from the dropdown
3. Choose an expiration time
4. Click "Launch Demo Site"
5. You'll get a URL, admin credentials, and countdown timer

---

## Creating Custom Plugin/Theme Images

### Overview

Each plugin or product you want to demo gets:
1. An **product config** JSON file (defines plugins, settings, branding)
2. A **Docker image** built on top of the base image (with your plugins baked in)
3. Optionally, a folder in **product-assets/** for local plugin/theme files

### Method 1: WordPress.org Plugins Only

If your plugins are all on wordpress.org, you only need a config file.

**Step A: Create the config**

Create `products/my-plugin.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin Demo",
  "plugins": {
    "preinstall": [
      { "source": "wordpress.org", "slug": "contact-form-7", "activate": true },
      { "source": "wordpress.org", "slug": "flamingo", "activate": true }
    ],
    "remove": ["hello", "akismet"]
  },
  "demo": {
    "default_expiration": "2h",
    "max_concurrent_sites": 10,
    "admin_user": "demo",

    "landing_page": "/wp-admin/admin.php?page=wpcf7"
  },
  "docker": {
    "image": "wp-launcher/my-plugin:latest"
  }
}
```

**Step B: Build the image**

```bash
bash scripts/build-wp-image.sh my-plugin
```

**Step C: Restart the platform**

```bash
docker compose restart api
```

The new product now appears in the dashboard dropdown.

---

### Method 2: Local/Custom Plugins (Premium, Private, or In-Development)

For plugins that aren't on wordpress.org.

**Step A: Create the assets folder**

```
product-assets/
  my-premium-plugin/
    plugins/
      my-premium-plugin/        <-- your full plugin folder
        my-premium-plugin.php
        includes/
        assets/
        ...
    themes/
      my-custom-theme/          <-- optional: your theme folder
        style.css
        functions.php
        ...
    demo-content.xml            <-- optional: WXR export for sample content
```

**Step B: Create the config**

Create `products/my-premium-plugin.json`:

```json
{
  "id": "my-premium-plugin",
  "name": "My Premium Plugin Demo",
  "plugins": {
    "preinstall": [
      {
        "source": "local",
        "path": "./product-assets/my-premium-plugin/plugins/my-premium-plugin/",
        "activate": true
      }
    ],
    "remove": ["hello", "akismet"]
  },
  "demo": {
    "default_expiration": "1h",
    "admin_user": "demo",

    "landing_page": "/wp-admin/admin.php?page=my-premium-plugin"
  },
  "branding": {
    "banner_text": "Welcome to the My Premium Plugin demo!"
  },
  "docker": {
    "image": "wp-launcher/my-premium-plugin:latest"
  }
}
```

**Step C: Build the image**

```bash
bash scripts/build-wp-image.sh my-premium-plugin
```

**Step D: Restart**

```bash
docker compose restart api
```

---

### Method 3: Mixed Sources (WordPress.org + Local + URL)

Combine plugins from multiple sources in one image.

```json
{
  "id": "woo-addon-demo",
  "name": "WooCommerce Addon Demo",
  "plugins": {
    "preinstall": [
      {
        "source": "wordpress.org",
        "slug": "woocommerce",
        "activate": true
      },
      {
        "source": "url",
        "url": "https://your-server.com/downloads/my-woo-addon.zip",
        "activate": true
      },
      {
        "source": "local",
        "path": "./product-assets/woo-addon-demo/plugins/woo-addon-helper/",
        "activate": true
      }
    ],
    "remove": ["hello", "akismet"]
  },
  "themes": {
    "install": [
      { "source": "wordpress.org", "slug": "flavor", "activate": true }
    ]
  },
  "demo": {
    "default_expiration": "4h",
    "admin_user": "demo",

    "landing_page": "/wp-admin/admin.php?page=wc-settings"
  },
  "docker": {
    "image": "wp-launcher/woo-addon-demo:latest"
  }
}
```

```bash
bash scripts/build-wp-image.sh woo-addon-demo
```

---

## Managing Multiple Products

You can have as many products as you want. Each gets its own config + image:

```
products/
  seo-plugin.json           --> wp-launcher/seo-plugin:latest
  form-builder.json         --> wp-launcher/form-builder:latest
  woo-payments.json         --> wp-launcher/woo-payments:latest
  theme-starter.json        --> wp-launcher/theme-starter:latest
```

Build all images at once:

```bash
bash scripts/build-wp-image.sh seo-plugin
bash scripts/build-wp-image.sh form-builder
bash scripts/build-wp-image.sh woo-payments
bash scripts/build-wp-image.sh theme-starter
```

All products appear in the dashboard dropdown for users to select.

---

## Configuration Reference

### Product Config Fields

| Field | Description | Required |
|---|---|---|
| `id` | Unique identifier (used for filenames and URLs) | Yes |
| `name` | Display name shown in dashboard dropdown | Yes |
| `plugins.preinstall[]` | Array of plugins to install | No |
| `plugins.remove[]` | Default plugins to remove (e.g., "hello") | No |
| `themes.install[]` | Array of themes to install | No |
| `demo.default_expiration` | Default time before auto-delete (e.g., "1h", "30m", "24h") | No |
| `demo.max_concurrent_sites` | Max simultaneous demos for this product | No |
| `demo.admin_user` | WordPress admin username for demos | No |

| `demo.admin_email` | WordPress admin email | No |
| `demo.landing_page` | URL path to redirect to after login | No |
| `restrictions.disable_file_mods` | Block plugin/theme install (default: true) | No |
| `restrictions.hidden_menu_items` | WP admin menu pages to hide | No |
| `branding.banner_text` | Custom text for admin bar. Use `{time_remaining}` placeholder | No |
| `branding.logo_url` | URL to product logo | No |
| `docker.image` | Custom Docker image name for this product | No |

### Plugin Source Types

| Source | Fields | Example |
|---|---|---|
| `wordpress.org` | `slug` | `{ "source": "wordpress.org", "slug": "woocommerce" }` |
| `url` | `url` | `{ "source": "url", "url": "https://example.com/plugin.zip" }` |
| `local` | `path` | `{ "source": "local", "path": "./product-assets/my/plugins/my-plugin/" }` |

### Expiration Format

- `30m` = 30 minutes
- `1h` = 1 hour
- `4h` = 4 hours
- `24h` = 24 hours
- `1d` = 1 day

---

## Demo Site Features

Every launched demo site includes:

1. **Live Countdown Timer** - Green/yellow/red timer in the WordPress admin bar showing time remaining
2. **Admin Restrictions** - Users cannot install/remove plugins or themes, access file editors, or run updates
3. **Auto-Cleanup** - Sites are automatically deleted when the timer expires
4. **Full Isolation** - Each demo runs in its own Docker container with its own database
5. **SQLite Database** - No MySQL needed; each site is fully self-contained

---

## Updating a Plugin in an Existing Image

When you release a new version of your plugin:

1. Replace the plugin files in `product-assets/your-product/plugins/your-plugin/`
2. Rebuild the image:
   ```bash
   bash scripts/build-wp-image.sh your-product
   ```
3. New demos will use the updated image. Existing running demos are not affected.

---

## Troubleshooting

### "No such image" error when launching
The Docker image hasn't been built yet. Run:
```bash
bash scripts/build-wp-image.sh <product-id>
```

### Dashboard shows empty dropdown
No product config files found. Create at least one JSON file in `products/`.

### Demo site not accessible
Check that Traefik is running and the Docker network exists:
```bash
docker ps
docker network ls | grep wp-launcher
```

### Timer shows "Demo: loading..."
The WordPress image needs to be rebuilt with the latest MU-plugin:
```bash
docker build -t wp-launcher/wordpress:latest ./wordpress
bash scripts/build-wp-image.sh <product-id>
```

### Port 80 already in use
Another service (IIS, Apache, Nginx) is using port 80. Either stop it or change the port in `docker-compose.yml`.
