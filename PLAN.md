# WP-Launcher: Docker-Based WordPress Demo Site Launcher

## Context

Agencies need a way to let potential customers test their WordPress plugins/themes without manual setup. The system should spin up isolated, temporary WordPress instances on demand, pre-loaded with the agency's product, and auto-delete after expiration. This is a greenfield project.

---

## Recommended Architecture: Traefik + Pre-built Docker Images + SQLite

### Why This Approach

| Criteria | Score | Notes |
|---|---|---|
| Setup simplicity | High | Single `docker-compose up` for infrastructure |
| Resource efficiency | High | SQLite eliminates MySQL (~100MB vs ~350MB per site) |
| Provisioning speed | ~3-8 seconds | Pre-built images, no DB server to wait on |
| Site isolation | Full | Each demo = separate container |
| Agency config ease | High | JSON config per agency |

**Key insight:** Using SQLite (via WordPress's official SQLite Database Integration plugin) instead of MySQL makes each site a single container, cutting resource usage in half and dramatically simplifying cleanup.

**Rejected alternatives:**
- **Kubernetes** - overkill for agencies; too complex to operate
- **WP Multisite** - zero isolation between demo sites; one bad plugin crashes all
- **Docker Compose per site** - requires MySQL per instance; slow provisioning
- **WP Playground (WASM)** - browser-only; no server-side persistence or real plugin testing

---

## Technology Stack

| Component | Choice | Why |
|---|---|---|
| Management API | **Node.js + Express + TypeScript** | Best Docker SDK (dockerode), shared tooling with frontend |
| Management DB | **SQLite (better-sqlite3)** | No external DB for the orchestrator itself |
| WP Database | **SQLite (wordpress/sqlite-database-integration)** | Eliminates MySQL entirely |
| Reverse Proxy | **Traefik v3** | Native Docker auto-discovery via container labels |
| Frontend | **React (Vite) + TypeScript** | Agency dashboard + user launch page |
| Container Base | **wordpress:6.7-php8.3-apache** | Official image + SQLite plugin baked in |

---

## Project Structure

```
wp-launcher/
├── docker-compose.yml              # Infrastructure (Traefik + API + Dashboard)
├── .env.example
├── package.json                    # Workspace root
│
├── packages/
│   ├── api/                        # Management API
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── config.ts
│   │   │   ├── routes/
│   │   │   │   ├── sites.ts        # POST/GET/DELETE /api/sites
│   │   │   │   └── agencies.ts
│   │   │   ├── services/
│   │   │   │   ├── docker.service.ts
│   │   │   │   ├── site.service.ts
│   │   │   │   └── cleanup.service.ts
│   │   │   ├── models/
│   │   │   └── utils/
│   │   │       ├── db.ts           # better-sqlite3
│   │   │       └── nameGenerator.ts
│   │   └── Dockerfile
│   │
│   └── dashboard/                  # React SPA
│       ├── src/
│       │   ├── pages/
│       │   │   ├── LaunchPage.tsx
│       │   │   ├── SitesListPage.tsx
│       │   │   └── AgencyConfigPage.tsx
│       │   └── components/
│       └── Dockerfile
│
├── wordpress/                      # Custom WP image
│   ├── Dockerfile
│   ├── wp-config-docker.php
│   ├── entrypoint.sh
│   └── mu-plugins/
│       ├── wp-launcher-restrictions.php
│       └── wp-launcher-branding.php
│
├── agency-configs/
│   └── _default.json
│
├── traefik/
│   └── traefik.yml
│
└── scripts/
    ├── setup.sh
    └── build-wp-image.sh
```

---

## Core Components

### 1. Custom WordPress Docker Image
- Extends official `wordpress:6.7-php8.3-apache`
- Bakes in SQLite Database Integration plugin + `db.php` drop-in
- Copies MU-plugins for admin restrictions and demo branding
- Sets `DISALLOW_FILE_MODS`, `DISALLOW_FILE_EDIT` in wp-config
- Pre-installs agency plugins/themes at build time
- Entrypoint script runs `wp core install` + plugin activation on first boot

### 2. Traefik Reverse Proxy
- Watches Docker socket for containers with `traefik.enable=true`
- Auto-routes `{subdomain}.demos.agency.com` to the right container
- Handles wildcard HTTPS via Let's Encrypt DNS-01 challenge

### 3. Management API (Express/TypeScript)
- `POST /api/sites` - Create demo site (spins up container with Traefik labels)
- `GET /api/sites` - List active sites
- `DELETE /api/sites/:id` - Manual teardown
- `GET /api/sites/:id/status` - Container health
- Uses `dockerode` to manage containers programmatically
- SQLite tracks site metadata, expiration times

### 4. Cleanup Service
- Cron job (every 60s) checks for expired sites
- Stops + removes container + volumes
- Updates DB status to "expired"
- Failsafe: watchdog script scans Docker labels for orphaned containers

### 5. Admin Restriction MU-Plugin
- Strips capabilities: `install_plugins`, `install_themes`, `edit_plugins`, `edit_themes`, `update_core`, etc.
- Removes admin menu items (Plugins > Add New, Themes > Add New, Tools)
- Blocks REST API write endpoints for plugins/themes
- Cannot be deactivated (MU-plugins load automatically)

### 6. Live Countdown Timer (Admin Bar)
- Adds a node to the WordPress admin bar with a real-time JS countdown
- Reads expiration timestamp from a PHP-injected `wp_localize_script` variable
- JavaScript ticks every second, showing `"Demo expires in: 47m 23s"`
- Color-coded: green (>30min), yellow (<30min), red (<5min)
- Visible on every admin page AND on the frontend when the admin bar is shown
- When timer hits zero, displays "Demo expired" and optionally redirects to a landing page
- Implemented inside `wp-launcher-branding.php` MU-plugin (hooks into `admin_bar_menu` + `wp_enqueue_scripts`)

### 7. Dashboard (React)
- Launch page with "Start Demo" button + product selector
- Real-time provisioning progress
- Active sites list with countdown timers
- Agency config management UI

---

## Data Flow: "Launch Demo"

```
User clicks "Start Demo"
  -> POST /api/sites { agencyId, expiresIn: "1h" }
  -> API generates subdomain: "coral-sunset-7x3k"
  -> API creates Docker container via dockerode with Traefik labels
  -> Container starts (~2-3s), WP auto-installs via entrypoint
  -> Traefik detects container (<1s), creates route
  -> API returns: { url, adminUrl, credentials, expiresAt }
  -> User gets working WordPress site in ~5 seconds
```

---

## Agency Configuration Format

```json
{
  "id": "awesome-plugin",
  "name": "Awesome Plugin Agency",
  "wordpress": { "version": "6.7", "locale": "en_US" },
  "plugins": {
    "preinstall": [
      { "source": "wordpress.org", "slug": "awesome-plugin", "activate": true },
      { "source": "url", "url": "https://example.com/pro.zip", "activate": true },
      { "source": "local", "path": "./plugins/my-plugin/", "activate": true }
    ],
    "remove": ["hello", "akismet"]
  },
  "themes": {
    "install": [{ "source": "wordpress.org", "slug": "flavor", "activate": true }],
    "remove": ["twentytwentythree"]
  },
  "demo": {
    "default_expiration": "1h",
    "max_expiration": "24h",
    "max_concurrent_sites": 10,
    "admin_user": "demo",
    "admin_password": "demo123",
    "landing_page": "/wp-admin/admin.php?page=awesome-settings"
  },
  "restrictions": {
    "disable_file_mods": true,
    "hidden_menu_items": ["tools.php"],
    "blocked_capabilities": ["install_plugins", "install_themes", "export"]
  },
  "branding": {
    "banner_text": "Demo site - expires in {time_remaining}",
    "logo_url": "https://agency.com/logo.png"
  }
}
```

---

## Implementation Phases

### Phase 1: WordPress Image + Restrictions
- Custom Dockerfile (WP + SQLite + MU-plugins)
- wp-launcher-restrictions.php
- wp-launcher-branding.php
- Entrypoint script for auto-install
- Manual testing

### Phase 2: Infrastructure + API
- docker-compose.yml (Traefik + API)
- Traefik config with Docker provider
- Express API with dockerode
- Site create/delete/list endpoints
- SQLite management DB
- Cleanup scheduler

### Phase 3: Agency Config + Image Builder
- JSON config parser + validator
- Dynamic Docker image builder per agency
- Plugin/theme pre-installation logic

### Phase 4: Dashboard
- React app with Vite
- Launch page, sites list, config UI
- WebSocket for real-time status

### Phase 5: Production Hardening
- Wildcard HTTPS (DNS-01)
- Resource limits per container (CPU/memory caps)
- Rate limiting, auth, monitoring

---

## Verification

1. `docker-compose up` starts Traefik + API
2. `POST /api/sites` creates a WordPress container
3. Visit `{subdomain}.localhost` - WordPress loads with demo content
4. wp-admin shows restriction banner, no plugin/theme install options
5. After expiration, container is auto-removed
6. `docker ps` confirms cleanup
