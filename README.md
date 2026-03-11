# WP Launcher

Docker-based WordPress environment with two modes:

- **Local Mode** — Full-featured local WordPress development tool (like Local by Flywheel / Laragon) with multi-PHP, multi-DB support, and a `wpl` CLI
- **Agency Mode** — Demo hosting platform that spins up temporary WordPress sites pre-loaded with your plugins/themes, auto-deleted after expiration

Each site runs in its own Docker container with a choice of SQLite, MySQL, or MariaDB, routed through Traefik with automatic subdomain assignment.

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
- **Full isolation** — Each site is a separate container, no shared databases
- **3 database engines** — SQLite (fastest), MySQL 8.4, or MariaDB 11 per site
- **3 PHP versions** — PHP 8.1, 8.2, or 8.3 selectable per site
- **Per-site PHP config** — Tune memory_limit, upload size, execution time, and toggle extensions (Redis, Xdebug, etc.) per site — live, no restart needed
- **`wpl` CLI** — Global command to start/stop services, manage sites, run WP-CLI, and more
- **Persistent data** — Local mode sites survive container restarts via Docker volumes
- **Auto-cleanup** — Agency mode sites auto-expire and get removed
- **One-click admin login** — Auto-login URLs for instant WP admin access
- **Email testing** — Built-in Mailpit catches all outgoing emails locally
- **Multi-product** — Host demos for multiple products from a single installation
- **Wildcard subdomains** — Each site gets a unique URL like `coral-sunset-7x3k.localhost`
- **Modern dashboard** — React SPA with real-time provisioning progress

## Architecture

| Component | Technology |
|---|---|
| Management API | Node.js + Express + TypeScript |
| Management DB | SQLite (better-sqlite3) |
| WordPress DB | SQLite, MySQL 8.4, or MariaDB 11 (per product) |
| Reverse Proxy | Traefik v3 (auto-discovery via Docker labels) |
| Dashboard | React + Vite + TypeScript |
| Container Base | wordpress:6.9 (PHP 8.1 / 8.2 / 8.3) |

## Project Structure

```
wp-launcher/
├── docker-compose.yml          # Infrastructure (Traefik + API + Dashboard)
├── .env.example                # Environment configuration
├── install.sh                  # One-click VPS installer
├── install-local.sh            # Local mode installer
├── bin/wpl                     # Global CLI command
├── packages/
│   ├── api/                    # Management API (Express/TypeScript)
│   ├── provisioner/            # Docker container management service
│   └── dashboard/              # React SPA (Vite)
├── wordpress/                  # Custom WP Docker image
│   ├── Dockerfile
│   ├── entrypoint.sh           # Auto-installs WP + activates plugins
│   ├── wp-config-docker.php
│   └── mu-plugins/             # Admin restrictions, branding & auto-login
├── products/                   # Product configs (agency mode)
│   └── _default.json
├── templates/                  # Template configs (local mode)
│   └── starter.json
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

### Local Mode (WordPress Development Environment)

Use WP Launcher as a local WordPress development tool — like Local by Flywheel or Laragon, but Docker-based with multi-PHP support.

```bash
git clone https://github.com/msrbuilds/wp-launcher.git
cd wp-launcher
bash install-local.sh
```

That's it. The installer will:
1. Check for Docker & Docker Compose
2. Generate `.env` with local mode defaults
3. Build WordPress images for PHP 8.1, 8.2, and 8.3
4. Install the `wpl` CLI command globally
5. Start all services
6. Open **http://localhost** in your browser

**What you get:**
- No authentication, no site limits, no WordPress restrictions (file mods, updates, cron all enabled)
- Choose PHP version (8.1 / 8.2 / 8.3), database engine (MySQL / MariaDB / SQLite), and admin credentials per site
- Sites at `http://{subdomain}.localhost` (works in Chrome, Firefox, Edge — no hosts file needed)
- Persistent site data via Docker volumes (survives restarts)
- Built-in email testing via Mailpit at `http://localhost:8025`
- Global `wpl` CLI command (see [CLI Reference](#cli-reference) below)

### Agency Mode (Demo Hosting Platform)

Host temporary WordPress demo sites for your products — with auth, site limits, auto-expiration, and admin restrictions.

#### Quick Setup (VPS)

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

#### Manual Setup

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/), [Node.js](https://nodejs.org/) 18+, Git Bash (Windows) or any Unix shell.

```bash
git clone https://github.com/msrbuilds/wp-launcher.git
cd wp-launcher
cp .env.example .env
# Edit .env with your settings (see Configuration section)
```

Build the WordPress images:

```bash
bash scripts/build-wp-image.sh
```

Add your first product — create `products/my-product.json`:

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

Build the product image and start:

```bash
bash scripts/build-wp-image.sh my-product
docker compose up -d
```

Visit **http://localhost** — the dashboard is ready.

## Configuration

### Environment Variables (`.env`)

| Variable | Description | Default |
|---|---|---|
| `APP_MODE` | `agency` (auth, limits, restrictions) or `local` (no auth, no limits) | `agency` |
| `BASE_DOMAIN` | Your domain (subdomains will be `*.BASE_DOMAIN`) | `localhost` |
| `NODE_ENV` | `development` or `production` | `development` |
| `API_KEY` | Admin API key (bypasses rate limits, site limits, ownership checks) | (required) |
| `JWT_SECRET` | Secret for user JWT tokens | (required) |
| `PUBLIC_URL` | Public URL for email verification links | `http://localhost` |
| `SMTP_HOST` | SMTP server for verification emails | `mailpit` |
| `SMTP_PORT` | SMTP port | `1025` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |
| `SMTP_FROM` | Sender address for emails | — |
| `EMAIL_PROVIDER` | `smtp` or `brevo` (HTTP API, bypasses SMTP port blocks) | `smtp` |
| `BREVO_API_KEY` | Brevo API key (when `EMAIL_PROVIDER=brevo`) | — |
| `WP_IMAGE` | Default WordPress image | `wp-launcher/wordpress:latest` |
| `MAX_SITES_PER_USER` | Max active sites per user (0 = unlimited) | `3` |
| `MAX_TOTAL_SITES` | Max total active sites across all users (0 = unlimited) | `50` |
| `CONTAINER_MEMORY` | Per-container memory limit in bytes | `268435456` (256MB) |
| `CONTAINER_CPU` | Per-container CPU limit | `0.5` |
| `PRODUCT_ASSETS_PATH` | Absolute host path to `product-assets/` dir (required for local plugins) | — |
| `PROVISIONER_INTERNAL_KEY` | Shared secret for API ↔ provisioner communication | (required) |
| `JWT_EXPIRES_IN` | JWT token expiry duration | `7d` |
| `CARD_LAYOUT` | Dashboard card layout: `full` or `compact` | `full` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | — |
| `SMTP_SECURE` | Use TLS for SMTP (`true` / `false`) | `false` |
| `ACME_EMAIL` | Email for Let's Encrypt certificate notifications | — |
| `CF_API_EMAIL` | Cloudflare API email (for DNS-01 wildcard certs) | — |
| `CF_DNS_API_TOKEN` | Cloudflare DNS API token (for DNS-01 wildcard certs) | — |

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
      { "source": "local", "path": "product-assets/my-product/plugins/my-plugin.zip", "activate": true }
    ]
  }
}
```

| Source | Description |
|---|---|
| `wordpress.org` | Downloaded from the WP plugin directory by slug |
| `url` | Downloaded from any URL (must be a .zip) |
| `local` | Copied from `product-assets/` directory (path relative to project root, must be a .zip) |

### PHP Configuration

Each site supports per-site PHP settings, configurable at creation time and live-updatable from the Sites dashboard (PHP button).

**Configurable settings:** `memory_limit`, `upload_max_filesize`, `post_max_size`, `max_execution_time`, `max_input_vars`, `display_errors`

**Optional extensions** (pre-installed in the Docker image, disabled by default):

| Extension | Description |
|---|---|
| `redis` | Redis object cache |
| `xdebug` | Step debugger (auto-configures for `host.docker.internal:9003`) |
| `sockets` | Socket functions |
| `calendar` | Calendar conversion functions |
| `pcntl` | Process control |
| `ldap` | LDAP directory access |
| `gettext` | GNU gettext internationalization |

PHP settings are written to `/usr/local/etc/php/conf.d/99-wp-launcher.ini` inside the container and applied via Apache graceful reload — no container restart required.

### Local Mode vs Agency Mode

| Behavior | Local Mode | Agency Mode |
|---|---|---|
| Authentication | None (auto-authenticated) | Email verification + JWT |
| Site limits | Unlimited | Configurable per-user and global |
| WordPress restrictions | None (full admin) | `DISALLOW_FILE_MODS`, blocked capabilities |
| WordPress updates | Allowed (core, plugins, themes) | Blocked |
| WP-Cron | Enabled | Disabled |
| Site expiration | Default: never | Default: 1 hour |
| Data persistence | Docker volumes (survives restarts) | Ephemeral (deleted on expiry) |

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
| `GET` | `/api/sites/:id/ready` | — | Check if site setup is complete (plugins, themes, content) |
| `GET` | `/api/sites/:id/status` | — | Docker container status |
| `GET` | `/api/sites/:id/php-config` | — | Read current PHP configuration from running site |
| `PATCH` | `/api/sites/:id/php-config` | User | Update PHP settings (live, Apache graceful reload) |
| `DELETE` | `/api/sites/:id` | User | Delete a demo site |

## CLI Reference

The `wpl` command is installed globally by `install-local.sh` and works from any directory.

```bash
wpl start                            # Start all services
wpl stop                             # Stop all services
wpl restart                          # Restart all services
wpl rebuild                          # Rebuild and restart (after code changes)
wpl status                           # Show running containers
wpl logs [service]                   # Tail logs (all or specific service)
wpl sites                            # List active WordPress sites
wpl open                             # Open dashboard in browser
wpl open mail                        # Open Mailpit in browser
wpl open <subdomain>                 # Open a site in browser
wpl shell <subdomain>                # Bash into a site container
wpl wp <subdomain> plugin list       # Run WP-CLI in a site container
wpl build:wp                         # Rebuild WordPress images (all PHP versions)
wpl dir                              # Print project directory path
wpl help                             # Show all commands
```

You can also use `npm` scripts from the project directory:

```bash
npm start          # Start services
npm stop           # Stop services
npm run rebuild    # Rebuild and restart
npm run status     # Show containers
npm run logs       # Tail logs
```

## Resource Requirements

Each demo container uses approximately:

- **RAM**: ~100MB (WordPress + PHP + Apache + SQLite)
- **Disk**: ~200MB per container
- **CPU**: Minimal when idle

A server with 4GB RAM can comfortably run 20-30 concurrent demo sites.

## License

MIT
