# WP Launcher

Docker-based platform for creating isolated, temporary WordPress demo sites on demand. Users launch pre-configured WordPress environments with custom plugins/themes that auto-expire after a set duration.

## Architecture

Microservices running via Docker Compose:

| Service | Tech | Port | Purpose |
|---------|------|------|---------|
| **API** | Node.js + Express + TypeScript | 3000 | Core business logic, auth, site orchestration |
| **Provisioner** | Node.js + Express + Dockerode | 4000 (internal) | Low-level Docker container/image management |
| **Dashboard** | React + Vite + TypeScript | 80 | User-facing SPA |
| **Traefik** | v3.6 | 80, 443 | Reverse proxy, auto-discovery, Let's Encrypt SSL |
| **Mailpit** | axllent/mailpit | 8025/1025 | Local dev email server |
| **Docker Proxy** | tecnativa/docker-socket-proxy | - | Secure Docker socket access |

## Project Structure

```
packages/
  api/src/                  # Express API
    index.ts                # Entry point, middleware, route mounting
    config.ts               # Env var parsing
    routes/                 # auth.ts, sites.ts, products.ts, admin.ts, sync.ts
    services/               # user, site, product, docker, email, cleanup, sync, sync-incremental
    middleware/              # auth.ts (API key), userAuth.ts (JWT)
    utils/db.ts             # SQLite schema & init
  provisioner/src/index.ts  # Docker operations (create/delete containers, build images)
  dashboard/src/
    pages/                  # LaunchPage, SitesListPage, LoginPage, VerifyPage, SyncPage, AdminPage
    context/AuthContext.tsx  # Global JWT state
    context/SettingsContext.tsx # Settings, features, branding, colors
    components/             # CountdownTimer, ErrorBoundary, ImageUpload, PluginRepeater, ThemeRepeater
wordpress/
  Dockerfile                # Base image: wordpress:6.9-php8.3-apache + wp-cli + SQLite
  entrypoint.sh             # WP auto-install, plugin activation, DB setup
  mu-plugins/               # restrictions, branding (countdown), autologin
  plugins/wp-launcher-connector/  # WP Connector plugin for site sync
products/                   # Product config JSONs (_default, demo-sqlite, demo-mysql, etc.)
product-assets/             # Per-product plugins/, themes/, demo-content.xml
traefik/                    # traefik.yml, dynamic/middleware.yml, dynamic/tls.yml
scripts/                    # build-wp-image.sh, create-product.sh, setup.sh
guides/                     # Documentation (getting-started, creating-products, vps-deployment)
data/                       # Runtime SQLite DB (wp-launcher.db)
```

## Tech Stack

- **Backend:** Node.js, Express, TypeScript, better-sqlite3
- **Frontend:** React 19, Vite, TypeScript, React Router 6
- **Database:** SQLite (management DB); WordPress sites use SQLite, MySQL 8.4, or MariaDB 11
- **Auth:** JWT (jsonwebtoken) + email verification (nodemailer) + bcryptjs
- **Docker:** Dockerode, custom WordPress images
- **Scheduling:** node-cron (cleanup every 60s, orphan watchdog every 5min)

## Commands

```bash
# Development
npm run dev                # docker compose up with build
npm run dev:api            # API hot-reload (tsx watch)
npm run dev:dashboard      # Dashboard Vite dev server (port 4000)
npm run build              # Build all packages

# WordPress images
bash scripts/build-wp-image.sh                  # Base image only
bash scripts/build-wp-image.sh my-product       # Product-specific image
bash scripts/build-wp-image.sh my-product tag   # Custom tag

# Products
bash scripts/create-product.sh                  # Interactive product wizard

# Setup
bash scripts/setup.sh      # Local dev setup (.env, data dir, base image)
bash install.sh            # One-click VPS installer
```

## Environment Variables

**Core:** `APP_MODE` (local|agency), `NODE_ENV`, `BASE_DOMAIN` (e.g. demo.example.com), `PUBLIC_URL`
**Secrets:** `API_KEY`, `JWT_SECRET`, `PROVISIONER_INTERNAL_KEY`, `JWT_EXPIRES_IN`
**SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
**WordPress:** `WP_IMAGE`, `MAX_TOTAL_SITES` (50), `MAX_SITES_PER_USER` (3), `CONTAINER_MEMORY` (268MB), `CONTAINER_CPU` (0.5), `PRODUCT_ASSETS_PATH` (host path to product-assets/)
**UI:** `CARD_LAYOUT` (full|compact)
**SSL:** `ACME_EMAIL`, `CF_API_EMAIL`, `CF_DNS_API_TOKEN`
**CORS:** `CORS_ALLOWED_ORIGINS`

## Database Schema (SQLite)

Tables in `data/wp-launcher.db`:

- **users** — id, email, password_hash, verified, verification_token, verification_expires_at, role (user|admin)
- **sites** — id, subdomain, product_id, user_id, container_id, status (creating/running/expired/error), site_url, admin_url, admin_user, admin_password, auto_login_token, cloned_from, custom_domain, created_at, expires_at, deleted_at
- **site_logs** — id, site_id, user_id, user_email, product_id, subdomain, site_url, action, created_at
- **products** — id, name, config (JSON), created_at, updated_at
- **settings** — key, value (feature flags `feature.*`, branding `branding.*`, colors `color.*`)
- **snapshots** — id, site_id, name, db_engine, storage_path, size_bytes, created_at
- **site_shares** — id, site_id, owner_id, shared_with_email, shared_with_id, role (viewer|admin), status
- **scheduled_launches** — id, product_id, user_id, scheduled_at, config (JSON), status
- **webhooks** — id, url, secret, events, active, created_at
- **remote_connections** — id, name, url, api_key, instance_mode, last_tested_at, status, created_at
- **sync_history** — id, site_id, remote_connection_id, direction (push|pull), status, remote_site_url, snapshot_id, db_engine, size_bytes, error, started_at, completed_at

## API Endpoints

### Auth (`/api/auth/*`) — rate: 20/15min
- `POST /register` — send verification email
- `POST /verify` — token -> JWT (or passwordSetToken if new)
- `POST /set-password` — set password for new user
- `POST /login` — email + password -> JWT
- `GET /me` — current user (JWT required)
- `POST /update-password` — change password (JWT required)

### Sites (`/api/sites/*`) — read: 120/15min, write: 10/15min
- `POST /` — create demo site (JWT required)
- `GET /` — list user's sites
- `GET /:id` — site details
- `GET /:id/status` — Docker container status
- `GET /:id/ready` — WordPress readiness probe (checks wp-login.php)
- `GET /:id/php-config` — read current PHP config from running container
- `PATCH /:id/php-config` — update PHP settings live (writes ini, Apache graceful reload)
- `DELETE /:id` — delete site (JWT required)

### Products (`/api/products/*`)
- `GET /` — list all products
- `GET /:id` — get product config
- `PUT /:id` — update product (API_KEY required)

### Admin (`/api/admin/*`) — rate: 50/15min, API_KEY required
- `GET /stats` — dashboard statistics
- `GET|DELETE /users` — user management
- `GET|DELETE /sites` — site management
- `GET /logs` — site logs

### Sync (`/api/sync/*`) — JWT required
- `GET /connections` — list remote connections
- `POST /connections` — add remote connection (name, url, api_key)
- `POST /connections/:id/test` — test connection to remote WP site
- `DELETE /connections/:id` — remove connection
- `POST /push` — full push (snapshot local site → upload to remote WP Connector plugin)
- `POST /pull` — full pull (download from remote WP Connector plugin → restore locally)
- `GET /history` — sync history for a site
- `GET /connector-plugin` — download WP Launcher Connector plugin as ZIP

### Other
- `GET /health` — health check
- `GET /api/settings` — UI settings

## Site Lifecycle

1. **Create:** User POST /api/sites -> API creates DB record (status: creating) -> generates subdomain -> calls Provisioner -> container created -> status: running
2. **Ready check:** Dashboard polls GET /api/sites/:id/ready -> API probes wp-login.php internally
3. **Expiration:** Cron every 60s queries expired sites -> status: expired -> Provisioner removes containers
4. **Orphan cleanup:** Every 5min scans for containers with `wp-launcher.managed=true` label not tracked in DB

## Product Configuration

Products defined in `products/[id].json`. Key fields:
- `database`: "sqlite" | "mysql" | "mariadb"
- `plugins.preinstall[]`: source (wordpress.org/url/local), slug/url/path, activate
- `plugins.remove[]`: plugins to uninstall
- `themes.install[]`: source, slug, activate
- `demo`: default_expiration, max_concurrent_sites, admin_user, landing_page
- `restrictions`: disable_file_mods, blocked_capabilities[]
- `branding`: banner_text, description, image_url
- `docker.image`: custom Docker image tag

## WordPress MU-Plugins

- **wp-launcher-restrictions.php** — Blocks dangerous capabilities (install/edit plugins/themes, update_core, export/import), removes admin menus, blocks direct page access. Skipped entirely when `WP_LOCAL_MODE=true`
- **wp-launcher-branding.php** — Admin bar countdown timer, auto-redirect on expiry
- **wp-launcher-autologin.php** — `?autologin={token}` for instant demo access

## WP Launcher Connector Plugin

WordPress plugin (`wordpress/plugins/wp-launcher-connector/`) installed on remote WP sites to enable sync.

- **REST API endpoints** (authenticated via `X-WPL-Key` header):
  - `GET /wp-json/wpl-connector/v1/status` — site info (WP version, URL, plugins, theme, DB type)
  - `POST /wp-json/wpl-connector/v1/export` — create ZIP snapshot (wp-content + DB dump), returns download URL
  - `GET /wp-json/wpl-connector/v1/export/{id}` — download snapshot ZIP
  - `POST /wp-json/wpl-connector/v1/import` — receive snapshot (tar/zip), import files + DB with URL replacement
  - `GET /wp-json/wpl-connector/v1/changes` — list content/file changes since a timestamp (for incremental sync)
  - `POST /wp-json/wpl-connector/v1/export-content` — export specific posts/pages as JSON
  - `POST /wp-json/wpl-connector/v1/import-content` — import specific posts/pages from JSON
- **API key** auto-generated on activation, stored in `wp_options` as `wpl_connector_api_key`
- **Settings page** under Tools > WP Launcher Connector (shows Site URL + API Key with copy buttons)
- **Import safety**: pre-processes SQL dump to replace source URLs with target URLs BEFORE importing, preserves connector plugin files during wp-content sync

## Site Sync Flow

**Push (Local → Remote):**
1. API takes Docker snapshot of local site (tar with wp-content + db-snapshot.sql)
2. Reads snapshot tar, uploads to remote WP Connector plugin's `/import` endpoint
3. Plugin receives tar, extracts wp-content (skipping mu-plugins + connector plugin itself)
4. Plugin pre-processes db-snapshot.sql: replaces source URLs with current site URL
5. Plugin imports processed SQL, flushes caches

**Pull (Remote → Local):**
1. API calls remote WP Connector plugin's `/export` endpoint
2. Plugin creates ZIP with wp-content + database.sql
3. API downloads ZIP, extracts to temp dir, creates tar in provisioner snapshot format
4. Provisioner restores tar into local container with URL search-replace via wp-cli

## Docker Container Setup

Each demo site gets:
- WordPress container with Traefik labels for `{subdomain}.BASE_DOMAIN` routing
- Optional MySQL/MariaDB sidecar container (`wp-db-{subdomain}`)
- Memory/CPU limits from config
- Network: `wp-launcher-network`
- Label: `wp-launcher.managed=true`
- Entrypoint handles: DB config, WP install, plugin activation, demo content import
- PHP config: `99-wp-launcher.ini` written at startup from PHP_* env vars, live-updatable via docker exec
- Optional extensions pre-installed but disabled: redis, xdebug, sockets, calendar, pcntl, ldap, gettext
- Local mode: named volume `wp-site-{subdomain}` for `/var/www/html/wp-content`, no resource limits

## Security

- JWT + email verification auth flow
- API key for admin endpoints (constant-time comparison)
- Rate limiting on all endpoint groups
- Helmet security headers
- CORS with configurable origins
- bcryptjs password hashing
- Input validation (subdomain regex, image prefix whitelist)
- DISALLOW_FILE_MODS in WordPress (agency mode only; disabled in local mode via `WP_LOCAL_MODE` env check in wp-config)
- Capability restrictions via MU-plugin (skipped in local mode)
- Docker socket proxy (limited API surface)

## Feature Flags

Stored in `settings` table as `feature.*` keys. Controlled via Admin > Features tab.

`cloning`, `snapshots`, `templates`, `customDomains`, `phpConfig`, `siteExtend` (agency only), `sitePassword`, `exportZip`, `webhooks`, `healthMonitoring`, `scheduledLaunch`, `collaborativeSites`, `adminer`, `publicSharing`, `siteSync`

## CSS Architecture

- All dashboard styles in `packages/dashboard/src/index.css` (single file, no per-component CSS files)
- CSS class naming: prefixed by component (`lp-` LaunchPage, `sl-` SitesListPage, `ft-` FeaturesTab, `br-` BrandingTab, etc.)
- Global reusable classes: `card`, `btn`, `btn-primary`, `btn-secondary`, `btn-danger`, `badge`, `badge-*`, `status-dot`, `spinner`, `form-group`, `form-label`, `form-input`, `alert-*`
- Dynamic/conditional styles (dependent on JS state) may remain inline
- CSS custom properties for theming: `--prussian-blue`, `--orange`, `--grey`, `--text-muted`, `--text-light`, `--border`, `--bg-surface`

## Dashboard Routing

- **Local mode**: `AdminLayout` is root layout (sidebar navigation), no `App.tsx` wrapper. All pages rendered inside `AdminLayout > Outlet`. Footer added inside `admin-content`.
- **Agency mode**: `App.tsx` is root layout (header navigation + footer). Admin pages nested under `/admin` with `AdminLayout`.

## Development Notes

- Restart services: `docker compose restart`
- Rebuild single service: `docker compose build api && docker compose up -d api`
- Dashboard hot-reload: stop dashboard container, run `npm run dev:dashboard` (port 4000 with API proxy)
- Management DB is SQLite at `data/wp-launcher.db`
- Products can be file-based (products/*.json) or stored in DB
- Subdomains generated as `{adjective}-{noun}-{4chars}` pattern
- `wordpress/plugins/` directory is volume-mounted into API container; changes to connector plugin don't need rebuild
- API container runs compiled JS from `/app/dist/`; TypeScript source changes require `docker compose up -d --build api`
- DB timestamps stored as UTC without `Z` suffix; frontend must append `Z` before parsing with `new Date()`
- Docker exec output may include stream header bytes; strip non-JSON prefix when parsing wp-cli JSON output
- MySQL sidecar containers have SSL enabled; use `--skip-ssl` flag when running mysql CLI commands
