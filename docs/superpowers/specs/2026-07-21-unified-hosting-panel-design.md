# Unified Hosting Control Panel — Design

**Date:** 2026-07-21
**Status:** Approved, ready for implementation planning

## Goal

Remove the `local` / `agency` mode split. WP Launcher becomes a single self-hosted
WordPress hosting control panel that includes every feature currently reachable in
either mode, with the differences between them expressed as explicit per-install
settings and per-site fields rather than a global mode flag.

## Non-goals

This project is unification only. The following are deferred to their own specs and
must not be pulled in:

- Backups and restore
- Staging environments
- Per-site domains and SSL beyond what already exists
- File manager, database manager, cron UI
- Per-site outbound email delivery
- Billing or plans

## Decisions

| Decision | Choice |
|---|---|
| Tenancy | Self-hosted single-tenant panel; one owner, optional invited team |
| Site lifetime | Permanent by default; expiry is a per-site option |
| Demo sites | Survive as options on a normal site, plus an opt-in public demo portal |
| Auth | Real auth always; first-run wizard creates the owner; no silent auto-login |
| Storage | Named volume always; optional per-site "expose files" hybrid bind-mount |
| Migration | Auto-migrate existing installs in place |
| Execution | Introduce a policy layer, rewire all mode checks to it, then delete `APP_MODE` |

## Current state

`config.appMode` is read in roughly 40 places and gates:

- Auth — `userAuth.ts` auto-logins a phantom user in local mode
- Admin routes — `admin.ts` bypasses the API key in local mode
- Quotas — `MAX_TOTAL_SITES` / `MAX_SITES_PER_USER` disabled in local mode
- WordPress — `WP_LOCAL_MODE` disables the restrictions mu-plugin and `DISALLOW_FILE_MODS`
- Storage — `SITES_HOST_PATH` bind-mount vs named volume
- CSRF and SSRF leniency
- Dashboard routing — `LocalRoutes` vs `AgencyRoutes`, two root layouts
- Feature availability — `productivityMonitor` local-only, `siteExtend` agency-only
- Config storage — `templates/` vs `products/`, served by near-duplicate route and
  service code

---

## Section 1: Domain model

### Roles

`users.role` becomes `owner | admin | member`.

- Exactly one owner, created by the first-run wizard.
- Admins manage everything except destructive install-level settings.
- Members see only sites they own or are shared into.

This replaces both the agency `user | admin` pair and the local phantom auto-user.

### Blueprints

`products` and `templates` collapse into one concept: **Blueprint**. One service, one
route file, one directory (`blueprints/`), one editor page.

A blueprint is a reusable site definition: PHP and WordPress version, DB engine,
plugins, themes, demo content, restrictions preset, default expiry.

This deletes a duplicated route + service + page triple.

### Site columns

New and repurposed columns on `sites`:

| Column | Meaning | Replaces |
|---|---|---|
| `expires_at` (already nullable) | `NULL` = permanent | mode-implied lifetime |
| `restrict_capabilities` | locks WP admin via the restrictions mu-plugin | `WP_LOCAL_MODE`, inverted |
| `expose_files` | additionally bind-mounts plugins/themes to the host | global `SITES_HOST_PATH` |
| `origin` | `panel` \| `demo_portal` \| `clone` \| `import` | — |

Storage is always a named volume `wp-site-{subdomain}`. `expose_files` adds the hybrid
plugins/themes bind-mounts on top and triggers a container recreate when toggled.

### Install settings

These move from env into the `settings` table and become admin-editable:

| Key | Default on fresh install |
|---|---|
| `panel.publicRegistration` | `false` |
| `panel.defaultExpiry` | `permanent` |
| `panel.quota.owner` / `.admin` | `0` (unlimited) |
| `panel.quota.member` | `0` (unlimited) |
| `panel.demoPortalEnabled` | `false` |
| `panel.allowInsecureRemotes` | `false` |
| `panel.setupComplete` | `false` until the wizard finishes |
| `panel.migratedFrom` | unset on fresh install; `local` or `agency` after an upgrade |

`BASE_DOMAIN`, secrets, and Docker wiring stay in env — they are deployment facts, not
preferences.

### Feature flags

All 17 flags remain, but stop being mode-gated. `productivityMonitor` and `siteExtend`
lose their mode restrictions. Flags become admin toggles for hiding unused UI, not
capability gates.

---

## Section 2: Policy layer and auth

### `packages/api/src/policy.ts`

One module, the single reader of install settings and site fields. It exports named
questions and never exposes a mode. Every `isLocalMode` call site is rewritten into the
question it was actually asking:

| Today | Becomes |
|---|---|
| `userAuth.ts:50,57` auto-login | deleted — real JWT everywhere |
| `admin.ts:27,89,142` API-key bypass | `requireRole('admin')`; `API_KEY` retained only for machine-to-machine callers |
| `sites.ts:28` quota skip | `policy.quotaFor(user)`, `0` = unlimited |
| `index.ts:418` branding auth skip | `requireRole('admin')` |
| `index.ts:523` CSRF skip | CSRF always on; heartbeat endpoint on an explicit exemption list |
| `index.ts:161`, `productivity.ts:146` local-only mounting | feature flag `productivityMonitor` |
| `index.ts:157`, `sites.ts:121` host path | `site.expose_files` |
| `site.service.ts:244` `localMode` to provisioner | `{ restrictCapabilities, exposeFiles }` per site |
| `ssrf.ts:70` allow http | `panel.allowInsecureRemotes` (default off) |
| `domain.service.ts:59` | derived from `BASE_DOMAIN` + tunnel settings |
| `config.ts:7` secret leniency | deleted — wizard generates strong secrets |
| `db.ts:386` local user seed | deleted — wizard |

The dashboard mirrors this with `usePolicy()` reading `/api/settings`.
`useIsLocalMode()` is deleted; each of its ~20 consumers resolves to a feature flag, a
role check, or a per-site field.

### WordPress containers

`WP_LOCAL_MODE` (install-wide, inverted logic) becomes `WPL_RESTRICT=true|false`, passed
per container from `site.restrict_capabilities`.

- `wordpress/mu-plugins/wp-launcher-restrictions.php` reads `WPL_RESTRICT`
- `wordpress/wp-config-docker.php` gates `DISALLOW_FILE_MODS` on `WPL_RESTRICT`
- `wordpress/mu-plugins/wp-launcher-branding.php` shows a countdown when `expires_at` is
  set and hides the badge when it is not, replacing the "Local Dev" / "Permanent" split

### First-run wizard

Fresh install with no owner: `/api/settings` returns `setup_required` and the dashboard
routes everything to `/setup`.

The wizard collects owner email and password, panel name, and base domain, and generates
`JWT_SECRET`, `API_KEY`, and `PROVISIONER_INTERNAL_KEY` into `data/secrets.json`.
Environment variables still win when set, so existing deployments are untouched.
Completing it sets `panel.setupComplete` and logs the owner in.

### Email

Owner creation requires no email verification. SMTP is needed only for public
registration and team invites; the settings UI states this and blocks those toggles
until an SMTP test succeeds.

---

## Section 3: UI and information architecture

The `isLocal ? <LocalRoutes/> : <AgencyRoutes/>` fork in `main.tsx` is deleted. One route
tree, one shell.

### Panel shell

`AdminLayout` at the root with sidebar navigation, no `/admin` prefix — there is no
non-admin panel anymore. Sections are hidden by feature flag or role, never by mode:

```
Sites · New Site · Blueprints                  (core)
Clients · Projects · Invoices                  (flag: projects)
Monitoring · Analytics · Productivity          (flags)
Sync                                           (flag: siteSync)
Settings > Team · Features · Branding · Demo Portal · System   (admin only)
```

### Public portal

`App.tsx` is repurposed rather than deleted. It stops being the agency root layout and
becomes the public portal chrome for the only routes outside the panel: `/login`,
`/verify`, `/setup`, and the opt-in demo portal at `/launch` and `/launch/:blueprint`.
Panel routes never render it.

### Page merges

- `LaunchPage.tsx` + `LocalLaunchPage.tsx` → one `NewSitePage` inside the panel, plus a
  stripped public `PortalLaunchPage` reusing its form components
- `LocalDashboard.tsx` + `OverviewTab.tsx` → one `OverviewPage`
- `ProductsTab.tsx` + `CreateProductPage.tsx` + `CreateTemplatePage.tsx` →
  `BlueprintsPage` + `BlueprintEditorPage`

### New Site form

Where the merged model becomes visible. After the blueprint picker:

- **Lifetime** — Permanent (default) or expires in…
- **Lock down WP admin** — defaults from the blueprint
- **Expose files to host** — defaults off

These three controls are the entire user-facing surface of what used to be a global mode.

### CSS

Follows the existing rule: everything in `packages/dashboard/src/index.css`. New prefixes
`bp-` (blueprints), `su-` (setup wizard), `tm-` (team). Blocks for removed pages are
deleted, not orphaned.

---

## Section 4: Migration, failure modes, verification

### One-shot `APP_MODE` read

The migration is the final reader of `APP_MODE`. It reads the value once to decide
backfill values, records the result in `settings` as `panel.migratedFrom`, and never
reads it again. The variable is then removed from `docker-compose.yml`.

### Backfill

| | prior `local` | prior `agency` |
|---|---|---|
| `sites.restrict_capabilities` | `0` | `1` |
| `sites.expose_files` | `1` if `SITES_HOST_PATH` set, else `0` | `0` |
| owner | the seeded local user | earliest `role='admin'` user |
| `panel.publicRegistration` | `false` | `true` |
| quotas | `0` (unlimited) | existing `MAX_*` env values |

`products/*.json` and `templates/*.json` both move into `blueprints/`. On id collision
the template keeps its id and the product is suffixed `-product`, logged loudly.
`sites.product_id` is repointed to the resulting blueprint id. Directories are copied,
not moved, so a failed upgrade leaves the originals intact.

### Container adoption

Running containers are adopted, not recreated. They lack `WPL_RESTRICT`, so the
restrictions mu-plugin and `wp-config-docker.php` fall back to legacy `WP_LOCAL_MODE`
when `WPL_RESTRICT` is absent. This shim is marked for removal in the release after next.

### Failure handling

- The migration copies `data/wp-launcher.db` to `data/backups/pre-v3-{timestamp}.db`
  before running.
- It runs inside a single transaction. The DB uses `DELETE` journal mode, not WAL, per
  the existing Windows bind-mount constraint.
- Any failure rolls back and the API refuses to start, printing the backup path, rather
  than booting half-migrated.
- Toggling `expose_files` on a live site requires a container recreate: confirm first,
  and revert the column if the recreate fails.

### Verification

Introduce Vitest in `packages/api`, targeting the two places this change can silently
corrupt things:

1. `policy.test.ts` — every named policy question against both prior-mode setting sets,
   asserting the answer matches today's `isLocalMode` behaviour. This is the regression
   net for the whole rewrite.
2. `migration.test.ts` — run the migration against seeded temp SQLite DBs shaped like a
   real local install and a real agency install. Assert backfilled columns, owner
   selection, blueprint collision handling, and idempotency (running twice is a no-op).

Manual verification checklist:

- Fresh install → wizard → create a permanent site
- Upgrade a real agency DB
- Upgrade a real local DB
- Toggle `expose_files` on a running site
- Enable the demo portal and launch an expiring site anonymously
