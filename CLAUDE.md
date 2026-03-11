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
    routes/                 # auth.ts, sites.ts, products.ts, admin.ts
    services/               # user, site, product, docker, email, cleanup
    middleware/              # auth.ts (API key), userAuth.ts (JWT)
    utils/db.ts             # SQLite schema & init
  provisioner/src/index.ts  # Docker operations (create/delete containers, build images)
  dashboard/src/
    pages/                  # LaunchPage, SitesListPage, LoginPage, VerifyPage, AdminPage
    context/AuthContext.tsx  # Global JWT state
    components/             # CountdownTimer, etc.
wordpress/
  Dockerfile                # Base image: wordpress:6.9-php8.3-apache + wp-cli + SQLite
  entrypoint.sh             # WP auto-install, plugin activation, DB setup
  mu-plugins/               # restrictions, branding (countdown), autologin
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

**Core:** `NODE_ENV`, `BASE_DOMAIN` (e.g. demo.example.com), `PUBLIC_URL`
**Secrets:** `API_KEY`, `JWT_SECRET`, `PROVISIONER_INTERNAL_KEY`, `JWT_EXPIRES_IN`
**SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
**WordPress:** `WP_IMAGE`, `MAX_TOTAL_SITES` (50), `MAX_SITES_PER_USER` (3), `CONTAINER_MEMORY` (268MB), `CONTAINER_CPU` (0.5), `PRODUCT_ASSETS_PATH` (host path to product-assets/)
**SSL:** `ACME_EMAIL`, `CF_API_EMAIL`, `CF_DNS_API_TOKEN`
**CORS:** `CORS_ALLOWED_ORIGINS`

## Database Schema (SQLite)

4 tables in `data/wp-launcher.db`:

- **users** — id, email, password_hash, verified, verification_token, verification_expires_at
- **sites** — id, subdomain, product_id, user_id, container_id, status (creating/running/expired/error), site_url, admin_url, admin_user, admin_password, auto_login_token, created_at, expires_at, deleted_at
- **site_logs** — id, site_id, user_id, user_email, product_id, subdomain, site_url, action, created_at
- **products** — id, name, config (JSON), created_at, updated_at

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
- `demo`: default_expiration, max_expiration, max_concurrent_sites, admin_user, landing_page
- `restrictions`: disable_file_mods, blocked_capabilities[]
- `branding`: banner_text, description, image_url
- `docker.image`: custom Docker image tag

## WordPress MU-Plugins

- **wp-launcher-restrictions.php** — Blocks dangerous capabilities (install/edit plugins/themes, update_core, export/import), removes admin menus, blocks direct page access
- **wp-launcher-branding.php** — Admin bar countdown timer, auto-redirect on expiry
- **wp-launcher-autologin.php** — `?autologin={token}` for instant demo access

## Docker Container Setup

Each demo site gets:
- WordPress container with Traefik labels for `{subdomain}.BASE_DOMAIN` routing
- Optional MySQL/MariaDB sidecar container (`wp-db-{subdomain}`)
- Memory/CPU limits from config
- Network: `wp-launcher-network`
- Label: `wp-launcher.managed=true`
- Entrypoint handles: DB config, WP install, plugin activation, demo content import

## Security

- JWT + email verification auth flow
- API key for admin endpoints (constant-time comparison)
- Rate limiting on all endpoint groups
- Helmet security headers
- CORS with configurable origins
- bcryptjs password hashing
- Input validation (subdomain regex, image prefix whitelist)
- DISALLOW_FILE_MODS in WordPress
- Capability restrictions via MU-plugin
- Docker socket proxy (limited API surface)

## Development Notes

- Restart services: `docker compose restart`
- Rebuild single service: `docker compose build api && docker compose up -d api`
- Dashboard hot-reload: stop dashboard container, run `npm run dev:dashboard` (port 4000 with API proxy)
- Management DB is SQLite at `data/wp-launcher.db`
- Products can be file-based (products/*.json) or stored in DB
- Subdomains generated as `{adjective}-{noun}-{4chars}` pattern
