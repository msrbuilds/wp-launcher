# Changelog

All notable changes to WP Launcher are documented here.

## [2.1.0] - 2026-03-24

### Added
- **Productivity Monitor** — WakaTime-like productivity tracking system for local mode
  - **WordPress MU-Plugin** — Auto-installed on every launched site, tracks all wp-admin activity (editing, customizer, media, plugins, themes, settings, WooCommerce) via `navigator.sendBeacon()`
  - **VS Code Extension** — Published to marketplace as `msrbuilds.wpl-productivity`, tracks coding time per language, project, and git branch with status bar display
  - **Dashboard Page** — WakaTime-style stats with 5 stat cards (today, goal, daily avg, best day, streak), daily activity chart, hourly activity, weekday averages, and 4 breakdown panels (projects, categories, editors, WP screens)
  - **Cloud Sync** — Heartbeats stored locally in SQLite, synced to cloud every 6 hours (or manual trigger). API key verification on connect. Reduces cloud load from real-time writes to batch syncs
  - **Integrations Panel** — Grid of 30 editor/tool cards with icons, showing available extensions (VS Code), built-in (WordPress), and coming soon integrations
  - **Feature Flag** — `productivityMonitor` (local mode only), toggleable in Features tab
- **Local Mode Update System** — Update check and one-click update UI now available in local mode (previously agency-only). System tab shows version check, update notification, log viewer, and manual SSH instructions
- New API endpoints: `/api/productivity/*` — heartbeat ingestion, stats (today, daily, hourly, weekday, screens, summary), goals, cloud config, sync
- New env vars injected into WordPress containers: `WP_LAUNCHER_API_URL`, `WP_SUBDOMAIN`

### Changed
- CSRF middleware now exempts `/api/productivity/heartbeats` (cross-origin from WP sites)
- Heartbeat endpoint sets `Cross-Origin-Resource-Policy: cross-origin` to override Helmet defaults
- Heartbeat endpoint accepts `text/plain` content type (for `sendBeacon` CORS compatibility)
- API port documented correctly as `3737` in CLAUDE.md

### Security
- Heartbeat ingestion requires cloud account to be linked (no anonymous tracking)
- Cloud API key verified against sync endpoint before saving connection config

## [2.0.0] - 2026-03-23

### Security
- **CSRF protection** — New middleware (`csrf.ts`) enforces Origin validation + `X-Requested-With: XMLHttpRequest` custom header on all state-changing requests. Blocks same-site CSRF from demo sites on sibling subdomains. All dashboard fetch calls migrated to `apiFetch()` wrapper.
- **Sync tenant isolation** — `remote_connections` and `sync_history` tables now include `user_id` column. All sync operations (connections, push/pull, history, previews, status) are scoped to the authenticated user. Admins retain global access.
- **SSRF protection** — New utility (`ssrf.ts`) validates remote sync URLs: protocol allowlist (HTTPS-only in production), DNS resolution with private IP blocking (loopback, RFC1918, link-local, cloud metadata), hostname blocklist, DNS rebinding defense, and redirect blocking. Applied to all outbound sync fetches via `safeFetch()`.
- **JWT removed from auth responses** — Login, verify, and set-password endpoints no longer return JWT tokens in JSON response bodies. Auth relies solely on `HttpOnly` cookies, eliminating JS-accessible token exposure.
- **SVG upload rejection** — Branding logo uploads no longer accept SVG files (XSS risk via embedded scripts). Allowed formats: PNG, JPEG, WebP, GIF only.
- **Upload file serving hardened** — `/api/uploads` and `/api/assets` now serve files with restrictive `Content-Security-Policy: default-src 'none'` header, neutralizing script execution in any uploaded content.
- **Upload filename sanitization** — Product/template image extensions validated against allowlist instead of trusting `file.originalname`. Plugin/theme filenames sanitized (non-alphanumeric stripped, extension validated).
- **Content Security Policy** — CSP headers added via Helmet (API), Traefik middleware, and nginx (dashboard): `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `frame-ancestors 'none'`, `form-action 'self'`.

### Added
- `packages/api/src/middleware/csrf.ts` — CSRF protection middleware
- `packages/api/src/utils/ssrf.ts` — SSRF validation and safe fetch utilities
- `packages/dashboard/src/utils/api.ts` — Frontend fetch wrapper with automatic CSRF headers
- `tests/test_security_fixes.py` — Runtime security test suite (22 tests covering all 6 fixes)
- `reports/security_fixes_implementation_report.md` — Detailed implementation report

### Changed
- **Database migration** — `remote_connections` and `sync_history` tables gain `user_id` column with index (auto-migrated, existing rows backfilled as admin-owned)
- **Sync service API** — All sync functions now require `userId` and `isAdmin` parameters for tenant isolation
- **`addConnection()` is now async** — performs SSRF validation with DNS resolution before storing

### Breaking Changes
- **Auth responses no longer include `token` field** — Frontend code relying on `data.token` from login/verify/set-password must use cookie-based auth instead. The `HttpOnly` cookie (`wpl_token`) is still set.
- **All state-changing API requests require CSRF headers** — Requests must include both `Origin` header (matching the dashboard origin) and `X-Requested-With: XMLHttpRequest`. API key auth (`X-Api-Key` header) is exempt. This affects custom scripts making cookie-authenticated requests.
- **SVG logo uploads no longer accepted** — Use PNG, JPEG, WebP, or GIF instead.

## [1.9.0] - 2026-03-22

### Added
- **Projects & Client Management** — Minimal CRM system for managing clients, projects, and invoices
  - **Clients** — CRUD with search, linked to projects and invoices
  - **Projects** — CRUD with status tracking (active/completed/on-hold/archived), link sites to projects
  - **Invoices** — Full invoice generation with auto-numbered invoices (INV-0001), line items, tax calculation, status workflow (draft→sent→paid), and print-friendly view via browser print
  - Print/PDF invoice layout with business branding, client details, line items table, and totals
  - Dashboard stats cards for Clients, Projects, and Invoices counts
  - Feature flag `projects` to enable/disable the entire feature
- **Database tables** — `clients`, `projects`, `project_sites`, `invoices` with proper indexes and foreign keys

### Changed
- **Sidebar navigation** — Reorganized into logical groups:
  - Dashboard / Sites / Templates
  - Bulk Launch / Logs / Sync
  - Clients / Projects / Invoices (when enabled)
  - Features / Branding / System
- Removed "New Site" and "New Template" from sidebar; added action buttons to Sites and Templates pages instead
- Added `+ New Site` button on Sites page header, `+ New Template/Product` button on Templates/Products page header

### Fixed
- **Form inputs** — Added standalone `.form-input` CSS class so inputs work consistently both inside and outside `.form-group` wrappers
- **Modal backgrounds** — Added white background, border-radius, and shadow to `.lp-modal-card` (was transparent)

## [1.8.0] - 2026-03-21

### Added
- **Site Sync (Push/Pull)** — Sync WordPress content between local WP Launcher sites and any remote WordPress site
  - **Push** — Upload local site's database and wp-content to a remote WordPress site
  - **Pull** — Download remote site's database and wp-content to a local site
  - **WP Launcher Connector plugin** — WordPress plugin for remote sites that exposes REST API endpoints for sync operations
  - Plugin downloadable directly from the Sync page in the dashboard
  - Remote connection management with API key authentication and connection testing
  - Pre-import URL search-replace to prevent broken URLs when syncing between different domains
  - Connector plugin self-preservation during push (skips overwriting itself and mu-plugins)
  - Sync history tracking with timestamps and error details
- **Feature toggle** — `siteSync` feature flag in admin Features tab (agency-only)

### Changed
- **CSS refactor** — Extracted all inline styles across 30+ dashboard components into proper CSS classes in `index.css`
  - All admin tabs (Overview, Analytics, Features, Branding, Bulk, System, Logs, Products, Sites, Users, Pagination)
  - All pages (LaunchPage, LocalLaunchPage, SitesListPage, LoginPage, VerifyPage, AccountPage, CreateProductPage, CreateTemplatePage, LocalDashboard)
  - All components (ErrorBoundary, ImageUpload, PluginRepeater, ThemeRepeater, AdminLayout, App)
  - Dynamic/conditional styles kept as inline where necessary
- **Features tab** — 2-column grid layout on desktop for feature modules
- **Site Extend** — Marked as agency-only feature

### Fixed
- Sync timestamp display using UTC-aware parsing (appends Z suffix for correct timezone handling)
- Docker dangling image cleanup integrated into cleanup service

## [1.7.1] - 2026-03-19

### Added
- **Public Sharing** — Share local WordPress sites publicly via three methods:
  - **Cloudflare Quick Tunnel** — Free public HTTPS URL (`*.trycloudflare.com`), no account needed
  - **ngrok** — Public URL via ngrok (requires free auth token)
  - **LAN** — Share on local network via IP address and auto-assigned port
- **Share Publicly** button in Tools dropdown with inline tunnel panel
- Tunnel status polling with auto-retry until URL is established
- Feature toggle for public sharing in admin Features tab
- Auto-cleanup of tunnel containers when sites are deleted or expire

### Security
- Tunnel containers are ephemeral, discovered via Docker labels (no DB state)
- Share endpoints require JWT auth with site ownership check
- Tunnel containers isolated on internal Docker network

## [1.7.0] - 2026-03-19

### Added
- **Database Manager (Adminer)** — Built-in Adminer container for managing MySQL/MariaDB databases directly from the dashboard
- **DB credentials modal** — Secure modal showing server, username, password, database with copy buttons and "Open Adminer" link
- **Adminer custom theme** — Styled to match WP Launcher admin panel (dark navy sidebar, orange accents, flat design)
- **Adminer feature toggle** — Enable/disable via admin Features tab; works in both local and agency modes
- **Local mode dashboard** — New dashboard home page with shortcut cards (Sites, New Site, New Template, Mailpit, Admin)
- **Local mode unified layout** — All pages wrapped in AdminLayout; sites list replaces admin Sites tab

### Changed
- **Local mode UI restructure** — Dashboard index shows shortcut cards instead of launch page; everything wrapped in admin sidebar layout
- **Admin sidebar** — Hidden logo/version section in agency mode (already in header); wider content area for sites table

### Security
- DB credentials only accessible via authenticated API endpoint with ownership check
- Adminer requires MySQL login — no auto-login; passwords never in URL
- DB containers isolated on internal Docker network, not exposed on host ports

## [1.6.1] - 2026-03-18

### Added
- **Local mode admin panel** — Full admin panel (Overview, Sites, Logs, Templates, Features, Branding, System) accessible in local mode with automatic admin auth
- **Tools dropdown** — Site action buttons (Clone, Template, Snapshots, PHP, Stats, Password, Export) consolidated into a dropdown menu in local mode table view
- **Site readiness indicator** — New sites show "Setting up..." spinner until WordPress is fully initialized, preventing premature access errors
- **Clone URL rewriting** — Cloned sites automatically get `wp search-replace` to update URLs from source to clone domain (supports both MySQL and SQLite)

### Fixed
- **Version display showing stale version** — Fixed Docker layer cache serving old `version.json`; added proper generation pipeline via `generate-version.sh` → `packages/api/version.json`
- **Admin panel inaccessible in local mode** — Admin routes were only mounted in agency mode; now available in both modes with JWT-based auth for local-user
- **Clone producing empty sites (MySQL)** — `mysqldump` failed silently due to MySQL 8.4 TLS enforcement; fixed with `--skip-ssl --no-tablespaces` flags
- **Clone wrong database engine** — Clone now inherits the source site's actual DB engine from the snapshot instead of the product config default
- **Clone race condition** — Restore now waits for the WordPress entrypoint to complete before overwriting wp-content
- **Features showing when disabled** — Changed `DEFAULT_FEATURES` to all `false` so features only appear when explicitly enabled
- **Password modal missing in local mode** — Modal was only rendered in agency mode return block; now included in local mode
- **Rate limiting in local mode** — All rate limiters bypassed in local mode for unrestricted development

### Changed
- **Admin panel adapted for local mode** — Hidden Users/Analytics tabs; filtered sites/logs/stats by local-user; renamed Product→Template throughout; agency-only features greyed out with "Agency only" badge; hidden update/SSH sections
- **Dockerfile** — Updated API Dockerfile to include `version.json` and expose port 3737

## [1.6.0] - 2026-03-18

### Added
- **Custom domain SSL fix** — Custom domains now use a dedicated HTTP challenge cert resolver, fixing SSL for domains not managed by Cloudflare
- **DNS recheck button** — Recheck DNS verification status for custom domains from the dashboard
- **Configurable API port** — `API_PORT` env variable to change the host port the API is exposed on (default: 3737)

### Fixed
- DNS verification showing "Pending" even when domain is correctly pointed (Cloudflare proxy masking base domain IPs)
- Traefik cert resolver mismatch for custom domains on VPS installations
- Detached HEAD state after failed update rollback

## [1.5.0] - 2026-03-16

### Added
- **Collaborative sites** — Share sites with other users via email, with role-based access (viewer/editor)
- Site sharing management UI on the Sites page

## [1.4.0] - 2026-03-14

### Added
- **Site health monitoring** — Real-time container CPU, memory, and network stats with color-coded dashboard
- **Scheduled site launch** — Schedule sites to launch automatically at a future date/time (up to 7 days)

## [1.3.0] - 2026-03-12

### Added
- **Site password protection** — Optional basic auth on frontend only, admin only, or entire site for private previews
- **Export site as ZIP** — Download wp-content + DB dump as tar.gz to migrate demo customizations
- **Webhook notifications** — HMAC-SHA256 signed HTTP POST on site.created/expired/deleted with admin UI for management

## [1.2.0] - 2026-03-10

### Added
- **Site extend** — Extend expiration time on running sites
- **Product categories** — Organize products into categories on the launch page
- **Activity logs** — Track site creation, deletion, and expiration events
- **Self-update** — One-click update from the admin dashboard with rollback support
- Custom domain support for sites (CNAME or A record)
- Site cloning and snapshot/restore
- Template export from existing sites

### Fixed
- Gitignore cleanup for generated files

## [1.1.0] - 2026-03-06

### Added
- **Role-based admin** — Admin/user roles with promote/demote CLI commands
- **Admin dashboard** — System stats, user management, site management, feature toggles
- **Version system** — `version.json` generation, version display in dashboard and CLI
- **Security hardening** — Constant-time API key comparison, rate limiting, input validation

### Fixed
- Executable permissions on shell scripts
- Product deletion checks

## [1.0.0] - 2026-02-28

### Added
- Initial release
- Docker-based WordPress site provisioning
- Two modes: Local (development) and Agency (demo hosting)
- SQLite, MySQL, and MariaDB database engine support
- PHP 8.1, 8.2, 8.3 version selection
- Per-site PHP configuration (live-updatable)
- Traefik reverse proxy with auto-discovery
- Product system with wordpress.org, URL, and local plugin sources
- JWT authentication with email verification
- Auto-cleanup of expired sites
- `wpl` CLI for managing services
- Mailpit integration for email testing
- One-click VPS installer with Let's Encrypt SSL
