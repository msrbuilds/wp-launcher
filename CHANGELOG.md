# Changelog

All notable changes to WP Launcher are documented here.

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
