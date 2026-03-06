# WP Launcher

Spin up isolated, temporary WordPress demo sites on demand — pre-loaded with your plugins and themes, auto-deleted after expiration. Perfect for letting potential customers test your WordPress products without manual setup.

Each demo site runs in its own Docker container with a choice of SQLite, MySQL, or MariaDB, routed through Traefik with automatic subdomain assignment.

## How It Works

```
User clicks "Launch Demo"
  → API creates a Docker container with your product pre-installed
  → Traefik auto-routes a unique subdomain to the container
  → WordPress auto-installs via entrypoint script
  → User gets a working WordPress site in ~10 seconds
  → Site auto-deletes after expiration (default: 1 hour)
```

## Features

- **Instant provisioning** — Pre-built Docker images with plugins baked in (~10s launch time)
- **Full isolation** — Each demo is a separate container, no shared databases
- **3 database engines** — SQLite (fastest), MySQL 8.4, or MariaDB 11 per product
- **Auto-cleanup** — Expired sites are automatically stopped and removed
- **One-click admin login** — Auto-login URLs for instant WP admin access
- **Admin restrictions** — MU-plugins prevent demo users from installing plugins, editing code, etc.
- **Email verification** — Optional email gate before launching demos (rate limiting built-in)
- **Multi-product** — Host demos for multiple products from a single installation
- **Wildcard subdomains** — Each demo gets a unique URL like `coral-sunset-7x3k.yourdomain.com`
- **Modern dashboard** — React SPA with real-time provisioning progress

## Architecture

| Component | Technology |
|---|---|
| Management API | Node.js + Express + TypeScript |
| Management DB | SQLite (better-sqlite3) |
| WordPress DB | SQLite, MySQL 8.4, or MariaDB 11 (per product) |
| Reverse Proxy | Traefik v3 (auto-discovery via Docker labels) |
| Dashboard | React + Vite + TypeScript |
| Container Base | wordpress:6.9-php8.3-apache |

## Project Structure

```
wp-launcher/
├── docker-compose.yml          # Infrastructure (Traefik + API + Dashboard)
├── .env.example                # Environment configuration
├── install.sh                  # One-click VPS installer
├── packages/
│   ├── api/                    # Management API (Express/TypeScript)
│   ├── provisioner/            # Docker container management service
│   └── dashboard/              # React SPA (Vite)
├── wordpress/                  # Custom WP Docker image
│   ├── Dockerfile
│   ├── entrypoint.sh           # Auto-installs WP + activates plugins
│   ├── wp-config-docker.php
│   └── mu-plugins/             # Admin restrictions, branding & auto-login
├── products/                   # Product config files (one per product)
│   ├── _default.json
│   ├── demo-sqlite.json
│   ├── demo-mysql.json
│   └── demo-mariadb.json
├── product-assets/             # Local plugins/themes per product
│   └── my-product/
│       └── plugins/
├── traefik/                    # Traefik reverse proxy config
├── scripts/
│   ├── setup.sh                # Initial setup script
│   └── build-wp-image.sh       # Builds product Docker images
└── guides/                     # Documentation
    ├── vps-deployment.md       # Full VPS deployment guide
    ├── getting-started.md
    └── adding-product-images.md
```

## Installation

### Quick Setup (VPS — Recommended)

Run the one-click installer on a fresh Ubuntu VPS:

```bash
curl -sSL https://scripts.msrbuilds.com/wplauncher/install.sh | bash
```

This will:
1. Install Docker & Docker Compose
2. Clone the repository
3. Prompt for your domain, email, and SMTP settings
4. Generate secure secrets
5. Configure Traefik with automatic Let's Encrypt SSL
6. Build all Docker images
7. Start all services

For a detailed step-by-step guide, see [guides/vps-deployment.md](guides/vps-deployment.md).

### Manual Setup (Local Development)

#### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Docker Compose)
- [Node.js](https://nodejs.org/) 18+ (for the build script)
- Git Bash (on Windows) or any Unix shell

#### 1. Clone and configure

```bash
git clone https://github.com/msrbuilds/wp-launcher.git
cd wp-launcher
cp .env.example .env
# Edit .env with your settings (see Configuration section)
```

#### 2. Build the base WordPress image

```bash
bash scripts/build-wp-image.sh
```

#### 3. Add your first product

Create `products/my-product.json`:

```json
{
  "id": "my-product",
  "name": "My Awesome Plugin",
  "plugins": {
    "preinstall": [
      { "source": "wordpress.org", "slug": "my-plugin", "activate": true }
    ],
    "remove": ["hello", "akismet"]
  },
  "demo": {
    "default_expiration": "1h",
    "max_concurrent_sites": 5,
    "admin_user": "demo",
    "landing_page": "/wp-admin/admin.php?page=my-plugin"
  },
  "restrictions": {
    "disable_file_mods": true,
    "blocked_capabilities": [
      "install_plugins", "install_themes",
      "edit_plugins", "edit_themes", "update_core"
    ]
  },
  "database": "sqlite",
  "docker": {
    "image": "wp-launcher/my-product:latest"
  },
  "branding": {
    "banner_text": "Demo site — expires in {time_remaining}.",
    "description": "Try My Awesome Plugin in a live WordPress environment."
  }
}
```

Build the product image:

```bash
bash scripts/build-wp-image.sh my-product
```

#### 4. Start everything

```bash
docker compose up -d
```

Visit **http://localhost** — the dashboard is ready.

## Configuration

### Environment Variables (`.env`)

| Variable | Description | Default |
|---|---|---|
| `BASE_DOMAIN` | Your domain (subdomains will be `*.BASE_DOMAIN`) | `localhost` |
| `NODE_ENV` | `development` or `production` | `development` |
| `API_KEY` | Admin API key | `dev-api-key` |
| `JWT_SECRET` | Secret for user JWT tokens | (required) |
| `PUBLIC_URL` | Public URL for email verification links | `http://localhost` |
| `SMTP_HOST` | SMTP server for verification emails | — |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |
| `SMTP_FROM` | Sender address for emails | — |
| `WP_IMAGE` | Default WordPress image | `wp-launcher/wordpress:latest` |

### Product Config Reference

Each JSON file in `products/` defines a demo product. The filename must match the `id` field (e.g., `my-product.json` → `"id": "my-product"`).

| Field | Description |
|---|---|
| `id` | Unique identifier (must match filename) |
| `name` | Display name on the dashboard |
| `plugins.preinstall` | Array of plugins to install (see Plugin Sources) |
| `plugins.remove` | Plugin slugs to remove from default WP install |
| `themes.install` | Array of themes to install |
| `demo.default_expiration` | How long demos last (`1h`, `2h`, `24h`) |
| `demo.max_concurrent_sites` | Max active demos for this product |
| `demo.admin_user` | Demo admin username (password is auto-generated) |
| `demo.landing_page` | Redirect path after WP login |
| `restrictions.disable_file_mods` | Block plugin/theme installs |
| `restrictions.blocked_capabilities` | WP capabilities to remove |
| `database` | `"sqlite"` (default), `"mysql"`, or `"mariadb"` — use MySQL/MariaDB for plugins that require it |
| `docker.image` | Docker image tag (set after building) |
| `branding.banner_text` | Banner shown in wp-admin (`{time_remaining}` placeholder) |
| `branding.description` | Card description on the dashboard |
| `branding.image_url` | Product card image URL |

### Plugin Sources

Three ways to include plugins:

```json
{
  "plugins": {
    "preinstall": [
      { "source": "wordpress.org", "slug": "contact-form-7", "activate": true },
      { "source": "url", "url": "https://example.com/pro-plugin.zip", "activate": true },
      { "source": "local", "path": "./product-assets/my-product/plugins/my-plugin", "activate": true }
    ]
  }
}
```

| Source | Description |
|---|---|
| `wordpress.org` | Downloaded from the WP plugin directory by slug |
| `url` | Downloaded from any URL (must be a .zip) |
| `local` | Copied from a local directory (path relative to project root) |

## Adding a Product (While Running)

```bash
# 1. Create/edit the product JSON in products/
# 2. Build the Docker image and restart the API:
bash scripts/build-wp-image.sh my-product && docker compose restart api
```

The new product appears on the dashboard immediately.

## Development

### Run the dashboard with hot reload

```bash
# Stop the dashboard container
docker compose stop dashboard

# Start Vite dev server (proxies API calls to the Docker API)
cd packages/dashboard && npm run dev
```

Dashboard available at **http://localhost:4000** with instant hot reload.

### API changes

The API runs inside Docker. After editing API source files:

```bash
docker compose build api && docker compose up -d api
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Send verification email |
| `POST` | `/api/auth/verify` | — | Verify email token |
| `GET` | `/api/products` | — | List all products |
| `GET` | `/api/products/:id` | — | Get product config |
| `POST` | `/api/sites` | User | Create a demo site |
| `GET` | `/api/sites` | Optional | List sites (user's or all) |
| `GET` | `/api/sites/:id` | — | Get site details |
| `GET` | `/api/sites/:id/ready` | — | Check if WP is fully installed |
| `DELETE` | `/api/sites/:id` | User | Delete a demo site |

## Resource Requirements

Each demo container uses approximately:

- **RAM**: ~100MB (WordPress + PHP + Apache + SQLite)
- **Disk**: ~200MB per container
- **CPU**: Minimal when idle

A server with 4GB RAM can comfortably run 20-30 concurrent demo sites.

## License

MIT
