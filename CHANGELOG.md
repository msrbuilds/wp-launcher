# Changelog

All notable changes to WP Launcher are documented here.

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
