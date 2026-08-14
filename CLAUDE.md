# WP Launcher

Docker-based platform for creating isolated, temporary WordPress demo sites on demand. Users launch pre-configured WordPress environments with custom plugins/themes that auto-expire after a set duration.

## Architecture

Microservices running via Docker Compose:

| Service | Tech | Port | Purpose |
|---------|------|------|---------|
| **API** | Node.js + Express + TypeScript | 3737 | Core business logic, auth, site orchestration |
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
    routes/                 # auth.ts, sites.ts, products.ts, admin.ts, sync.ts, projects.ts
    services/               # user, site, product, docker, email, cleanup, sync, sync-incremental, project
    middleware/              # auth.ts (API key), userAuth.ts (JWT)
    utils/db.ts             # SQLite schema & init
  provisioner/src/index.ts  # Docker operations (create/delete containers, build images)
  dashboard/src/
    pages/                  # LaunchPage, SitesListPage, LoginPage, VerifyPage, SyncPage, AdminPage, ClientsPage, ProjectsPage, InvoicesPage
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
traefik/                    # traefik.yml, dynamic/middleware.yml, dynamic/tls.yml (standalone only)
scripts/                    # build-wp-image.sh, create-product.sh, setup.sh
guides/                     # Documentation (getting-started, creating-products, vps-deployment, dokploy-deployment)
docker-compose.dokploy.yml  # Dokploy variant: two-tier Traefik, sites on private wpl-sites
.env.dokploy.example        # Environment template for Dokploy
data/                       # Runtime SQLite DB (wp-launcher.db)
sites/                      # Site wp-content bind mounts (when SITES_HOST_PATH is set)
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
# NOTE: base images (PHP + WordPress version) can now also be built from the
# panel (Settings > Images). Custom product images with baked-in plugins/themes
# are still this script's job; the panel leaves plugins/themes to blueprints.
bash scripts/build-wp-image.sh                  # Base image only
bash scripts/build-wp-image.sh my-product       # Product-specific image
bash scripts/build-wp-image.sh my-product tag   # Custom tag

# Products
bash scripts/create-product.sh                  # Interactive product wizard

# Setup
bash scripts/setup.sh      # Local dev setup (.env, data dir, base image)
bash install.sh            # One-click VPS installer (standalone; bundles Traefik)

# Dokploy: create a Compose service pointing at docker-compose.dokploy.yml.
# Dokploy's Traefik forwards *.BASE_DOMAIN to our own `wpl-traefik` by SNI
# (tls.passthrough) without decrypting; ours terminates TLS, owns ACME, and
# routes to site containers on the private `wpl-sites` network. Sites therefore
# cannot reach other apps on the instance. Nothing is configured on the host, so
# a Dokploy upgrade cannot break renewal. Per-site HTTP-01 by default; set
# ACME_DNS_PROVIDER for a wildcard. Requires ACME_EMAIL, BASE_DOMAIN_REGEX,
# ADMINER_AUTH_USERS. See guides/dokploy-deployment.md.
```

## Environment Variables

**Core:** `NODE_ENV`, `BASE_DOMAIN` (e.g. demo.example.com), `PUBLIC_URL`
**Secrets:** `API_KEY`, `JWT_SECRET`, `PROVISIONER_INTERNAL_KEY`, `JWT_EXPIRES_IN`
**SMTP:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
**WordPress:** `WP_IMAGE`, `MAX_TOTAL_SITES` (50), `MAX_SITES_PER_USER` (3), `CONTAINER_MEMORY` (268MB), `CONTAINER_CPU` (0.5), `PRODUCT_ASSETS_PATH` (host path to product-assets/), `SITES_HOST_PATH` (host path to sites/ — enables direct file access to wp-content)
**UI:** `CARD_LAYOUT` (full|compact)
**SSL:** `ACME_EMAIL`, `CF_API_EMAIL`, `CF_DNS_API_TOKEN`
**CORS:** `CORS_ALLOWED_ORIGINS`

## Database Schema (SQLite)

Tables in `data/wp-launcher.db`:

- **users** — id, email, password_hash, verified, verification_token, verification_expires_at, role (user|admin)
- **sites** — id, subdomain, product_id, user_id, container_id, status (creating/running/expired/error), site_url, admin_url, admin_user, admin_password, auto_login_token, cloned_from, custom_domain, created_at, expires_at, deleted_at
- **site_logs** — id, site_id, user_id, user_email, product_id, subdomain, site_url, action, created_at
- **products** — id, name, config (JSON), created_at, updated_at
- **blueprint_deletions** — id, deleted_at. Tombstones for *file-based* blueprints. Deleting one unlinks its JSON, but platforms that re-clone the checkout on redeploy (Dokploy) restore it from git; the row is what makes the deletion stick. Saving a blueprint under the same id clears the tombstone. Note `getBlueprint`/`listBlueprints` read the **DB before the directory**, so a panel edit to a shipped blueprint survives the file reverting to git's version
- **settings** — key, value (feature flags `feature.*`, branding `branding.*`, colors `color.*`)
- **snapshots** — id, site_id, name, db_engine, storage_path, size_bytes, created_at
- **site_shares** — id, site_id, owner_id, shared_with_email, shared_with_id, role (viewer|admin), status
- **scheduled_launches** — id, product_id, user_id, scheduled_at, config (JSON), status
- **webhooks** — id, url, secret, events, active, created_at
- **remote_connections** — id, name, url, api_key, instance_mode, last_tested_at, status, created_at
- **sync_history** — id, site_id, remote_connection_id, direction (push|pull), status, remote_site_url, snapshot_id, db_engine, size_bytes, error, started_at, completed_at
- **clients** — id, user_id, name, email, phone, company, notes, created_at, updated_at
- **projects** — id, user_id, client_id, name, description, status (active/completed/on-hold/archived), created_at, updated_at
- **project_sites** — id, project_id, site_id, created_at (link table)
- **invoices** — id, invoice_number (INV-0001), user_id, client_id, project_id, items (JSON line items), subtotal, tax_rate, tax_amount, total, currency, status (draft/sent/paid/overdue/cancelled), issue_date, due_date, notes, created_at, updated_at
- **productivity_heartbeats** — id, source (editor|wordpress), entity, entity_type, project, language, category, editor, site_id, machine_id, branch, is_write, created_at, synced
- **productivity_goals** — id, daily_goal_seconds, updated_at
- **productivity_cloud_config** — key, value (cloud_url, cloud_api_key, device_name, machine_id, last_synced_at, heartbeat_secret — the secret is per-install and outlives cloud linking)
- **productivity_sync_log** — id, heartbeats_count, status, error, started_at, completed_at
- **image_builds** — id, tag, kind (base|custom), status (queued/building/success/failed), log, error, spec (JSON), created_by, started_at, completed_at, created_at

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

### Admin Images (`/api/admin/images/*`) — adminAuth (owner/admin or API key)
Base runtime images only (PHP + WordPress version). Plugins/themes are a blueprint concern, not baked into images.
- `GET /` — built `wp-launcher/*` images with `usedByBlueprints[]`
- `POST /builds` — build a base image for `{ phpVersion, wpVersion }` (JSON). Validated against buildable PHP×WP pairs (PHP 8.1–8.5 × WP 6.7–6.9; PHP 7.4 × WP 6.1). Returns `{ jobId, tag }`. Tag is `wp-launcher/wordpress:php<php>` for the default WP pairing (backward-compatible) or `…:php<php>-wp<wp>` otherwise
- `GET /builds` — recent build jobs (metadata)
- `GET /builds/:id` — one job with live `log` (poll endpoint)
- `DELETE /:tag` — remove an image (409 if a blueprint uses it, unless `?force=true`)
- Builds run as one-at-a-time background jobs: the API tars its read-only `/app/wordpress` context and streams it to the provisioner's `POST /images/build-stream` with `PHP_VERSION`/`WP_VERSION` build-args, relaying the ndjson build log into the `image_builds` row. Stuck `building` jobs are failed on API restart. Blueprints select a built image via their `docker.image` field.

### Sync (`/api/sync/*`) — JWT required
- `GET /connections` — list remote connections
- `POST /connections` — add remote connection (name, url, api_key)
- `POST /connections/:id/test` — test connection to remote WP site
- `DELETE /connections/:id` — remove connection
- `POST /push` — full push (snapshot local site → upload to remote WP Connector plugin)
- `POST /pull` — full pull (download from remote WP Connector plugin → restore locally)
- `GET /history` — sync history for a site
- `GET /connector-plugin` — download WP Launcher Connector plugin as ZIP

### Projects (`/api/projects/*`) — JWT required, feature-gated (`projects`)
- `GET /dropdown/clients` — all clients for dropdowns
- `GET /dropdown/projects` — all projects for dropdowns
- `GET|POST /clients` — list (paginated, ?search=) / create client
- `GET|PUT|DELETE /clients/:id` — get / update / delete client
- `GET|POST /list` — list projects (paginated, ?status=, ?clientId=) / create project
- `GET|PUT|DELETE /list/:id` — get (includes linked sites) / update / delete project
- `POST /list/:id/sites` — link site to project
- `DELETE /list/:id/sites/:siteId` — unlink site from project
- `GET|POST /invoices` — list invoices (paginated, ?status=, ?clientId=) / create invoice
- `GET|PUT|DELETE /invoices/:id` — get / update (draft only) / delete (draft only)
- `PATCH /invoices/:id/status` — change status (draft→sent→paid, any→cancelled)

### Productivity (`/api/productivity/*`) — feature-gated (`productivityMonitor`)
- `POST /heartbeats` — batch heartbeat ingestion (no auth, requires cloud linked, CSRF exempt)
- `GET /stats/today` — today's stats + breakdowns by source/project/language/category/editor
- `GET /stats/daily?days=14` — daily totals with editor/wordpress split
- `GET /stats/hourly?date=` — activity by hour of day
- `GET /stats/weekdays?days=30` — average time per weekday
- `GET /stats/screens` — WordPress screen breakdown
- `GET /stats/summary?days=14` — summary with best day, write count
- `GET|PUT /goals` — daily goal (seconds)
- `GET|PUT|DELETE /cloud/config` — cloud connection (URL, API key, device name). `PUT` never rotates the heartbeat secret; `DELETE` unlinks the account but keeps the secret so local tracking survives
- `GET /cloud/status` — tracking/cloud state (no auth, CSRF exempt): `{ tracking, cloudLinked, isLocal, destination, syncing, apiBaseUrl }`
- `POST /cloud/sync` — trigger manual sync to cloud
- `GET /cloud/sync-log` — recent sync history
- `GET /secret` — the install's heartbeat secret (+ the public API base URL clients should post to)
- `POST /secret/rotate` — mint a new secret; running demo sites keep the old one and stop reporting until relaunched
- `GET|PUT /destination` — heartbeat destination: `auto` (default) | `local` | `cloud`

**Hybrid routing.** Heartbeats always land in local SQLite (that's what the dashboard reads) and are optionally forwarded to a linked cloud account. Ingestion requires the feature enabled + a valid heartbeat secret — **not** a cloud account — so a localhost install tracks standalone. The secret is minted when `productivityMonitor` is enabled (and backfilled at boot for installs enabled earlier). `auto` syncs only on a non-local deployment with a linked account; `local` never syncs; `cloud` syncs whenever linked. Cloud push runs every 15 min and is a no-op unless the resolved destination says otherwise. Local vs public is derived by `utils/deployment.ts` from `PUBLIC_URL`/`BASE_DOMAIN` (loopback, RFC1918, `*.local`, `*.localhost` → local).

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
- `restrictions`: disable_file_mods, blocked_capabilities[], hidden_menu_items[] — **authoritative**: these decide what a launched site locks down. A blueprint with an empty block restricts nothing; only a blueprint with *no* block falls back to `panel.defaultRestrictCapabilities`
- `branding`: banner_text, description, image_url
- `docker.image`: custom Docker image tag

## WordPress MU-Plugins

- **wp-launcher-restrictions.php** — Applies the blueprint's lockdown. Reads `WPL_BLOCKED_CAPS`, `WPL_HIDDEN_MENUS` and `WPL_DISABLE_FILE_MODS`, injected at container creation from the blueprint's `restrictions`. Submenu removals, admin-page blocks and REST write blocks are all derived from the capability list rather than hardcoded. Skipped entirely when `WPL_RESTRICT` is not `true` (or legacy `WP_LOCAL_MODE=true`).
  **Fails closed:** an *absent* `WPL_BLOCKED_CAPS` (a container predating this, or an older panel) applies the full legacy 12-capability lockdown. Only an explicitly empty value means block nothing.

  Capability grouping lives in `services/restrictions.service.ts`, not the plugin: the 7 UI toggles expand to 12 capabilities (`install_plugins` → install/update/delete plugins; `edit_plugins` → edit_plugins + edit_files, etc.). Blocking install while allowing update would be no restriction at all, since an "update" can carry arbitrary code. A test asserts all 7 toggles expand to exactly the 12 stripped historically, so a fully-checked blueprint can never be weaker than the old behaviour.
- **wp-launcher-branding.php** — Admin bar countdown timer, auto-redirect on expiry
- **wp-launcher-autologin.php** — `?autologin={token}` for instant demo access
- **wp-launcher-productivity.php** — Tracks wp-admin activity (editing, customizer, media, plugins, themes, settings, WooCommerce). Sends heartbeats via `sendBeacon(text/plain)` to the WP Launcher API. Prefers `WP_LAUNCHER_PUBLIC_API_URL` (the panel-resolved, browser-reachable URL, injected at container creation); falls back to deriving one from `WP_SITE_URL` (strips subdomain, adds `:3737` for localhost) for sites created before that env var existed. Note `WP_LAUNCHER_API_URL` is the *internal* `http://api:3737` and is not usable from a browser

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
- Local mode: if `SITES_HOST_PATH` is set, bind-mounts `{SITES_HOST_PATH}/{subdomain}/wp-content` for direct file access; otherwise falls back to named volume `wp-site-{subdomain}`. No resource limits

## Security

- JWT + email verification auth flow
- API key for admin endpoints (constant-time comparison)
- Rate limiting on all endpoint groups
- Helmet security headers
- CORS with configurable origins
- bcryptjs password hashing
- Input validation (subdomain regex, image prefix whitelist)
- DISALLOW_FILE_MODS in WordPress, driven by the blueprint's `disable_file_mods`
- Capability restrictions via MU-plugin, driven by the blueprint's `blocked_capabilities` (fails closed when the env is absent)
- Docker socket proxy (limited API surface)

## Feature Flags

Stored in the `settings` table. Controlled via Admin > Features.

Two scopes. `feature.<key>` is the **admin/owner** set (the original rows — unchanged). `feature.demo.<key>` is the **member** set, and absent means off, so members start with nothing until granted.

**Admin-only (5)** — no member counterpart, never granted:
`projects`, `productivityMonitor`, `siteSync`, `webhooks`, `collaborativeSites`

**Grantable (12)** — one toggle per audience:
`cloning`, `snapshots`, `templates`, `customDomains`, `phpConfig`, `siteExtend`, `sitePassword`, `exportZip`, `healthMonitoring`, `scheduledLaunch`, `adminer`, `publicSharing`

Resolution lives in `services/features.service.ts`: `isFeatureEnabled(key, role)` reads the admin namespace for owner/admin and the demo namespace for members, with anonymous callers treated as members. The two toggles are independent. The Members column in the UI appears only when `panel.publicRegistration` or `panel.demoPortalEnabled` is on; enforcement is unconditional either way. `GET /api/settings` returns the **effective** map for the caller, so member UI cannot offer actions the API would refuse.

`collaborativeSites` is admin-only because it invites users by email. `share.service.ts` resolves the role from the `userId` it already receives rather than taking a role parameter. The productivity heartbeat and `/cloud/status` endpoints use a separate machine-client guard: they have no session and are authenticated by the heartbeat secret, so resolving them by role would reject every client as anonymous.

`productivityMonitor` works on any deployment, local or VPS — it is off by default, not local-only. Reads are gated to owner/admin (`requireGlobalReader`), and heartbeat ingestion additionally requires a matching per-install heartbeat secret.

## CSS Architecture

- **Tailwind CSS v4 + shadcn/ui.** There is no `index.css`; the old 7,464-line
  stylesheet and its `lp-`/`sl-`/`ft-` class prefixes are gone.
- Design tokens live in `packages/dashboard/src/styles/theme.css` as semantic pairs:
  `background`/`foreground`, `card`, `popover`, `primary`, `secondary`, `muted`,
  `accent`, `destructive`, `success`, plus `border`, `input`, `ring`. Two sets:
  `:root` (light) and `.dark`.
- **Never write a hex value or an inline `style` prop in a component.** Use tokens.
  The only sanctioned exceptions, each commented at its site: user-supplied colour
  swatches in BrandingTab, editor brand colours in `lib/editor-colors.ts`, the
  decorative shortcut tints in LocalDashboard, and InvoicePrintPage which is pinned
  to black-on-white so it prints correctly.
- Primitives are in `src/components/ui/` (added via `npx shadcn@latest add <name>`).
  Compose classes with `cn()` from `@/lib/utils`. Icons come from `lucide-react`.
- Theme is `light | dark | system`, stored in `localStorage` under `wpl-theme` and
  applied as a `dark` class on `<html>`. `public/theme-init.js` applies it before
  first paint — it is an external file because the CSP forbids inline scripts.
- The admin-configurable accent colour maps to the `primary` token; its foreground
  is derived from WCAG luminance in `lib/color.ts`.
- Charts (recharts) take colours as props, so they read the resolved CSS custom
  properties and recompute on theme change.

## Dashboard Routing

- One route tree. `AppShell` (`src/components/shell/`) is the panel frame: collapsible
  grouped sidebar, topbar with breadcrumb, theme toggle and account menu. There is no
  `/admin` prefix and no `App.tsx`.
- Routes outside the shell: `/login`, `/verify`, `/setup`. Old paths (`/admin/*`,
  `/products`, `/create`) redirect to their new equivalents.
- Sidebar entries are defined in `src/components/shell/nav-items.ts` and hidden by
  feature flag and role only.

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
