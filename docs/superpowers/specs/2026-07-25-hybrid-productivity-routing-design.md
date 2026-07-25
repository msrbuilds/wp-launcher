# Hybrid Productivity Heartbeat Routing — Design

**Goal:** Make productivity tracking work on any deployment: a localhost install
tracks entirely on its own, and a VPS install additionally forwards heartbeats to
a central cloud account — with the client→API address resolved rather than guessed.

**Tech Stack:** Node/Express + better-sqlite3 (API), Dockerode (provisioner),
WordPress mu-plugin (browser JS), React panel. No new services or dependencies.

---

## Background: what exists today

- Heartbeats already **store-and-forward**: clients POST `/api/productivity/heartbeats`
  → rows in `productivity_heartbeats` → a cron pushes unsynced rows to
  `${cloud_url}/api/v1/sync/heartbeats` every 6 hours.
- Two client sources: the **VS Code extension** and the **`wp-launcher-productivity`
  mu-plugin** baked into every launched demo site (browser JS in `wp-admin`).
- The old "local mode" gate was replaced by an owner/admin check
  (`requireGlobalReader`), so nothing restricts the feature to localhost.

### Problems

1. **Local tracking cannot work standalone.** Ingestion hard-requires
   `cloud_url && cloud_api_key`, and `heartbeat_secret` is minted *only* by
   `PUT /cloud/config`. With no cloud account, tracking is dead.
2. **The client→API address is guessed.** The mu-plugin derives the public API URL
   by stripping the subdomain off `WP_SITE_URL`. The one env var it could use,
   `WP_LAUNCHER_API_URL`, is set to `http://api:3737` — the internal Docker
   address, unreachable from a browser, so that fallback is dead code for browser
   traffic. Custom-domain sites derive the wrong host.
3. **Re-linking the cloud rotates the secret**, silently breaking already-running
   sites that carry the old secret as a baked-in env var.
4. **Sync is 6-hourly**, coarse for a VPS acting as a feeder.

## Decisions (from brainstorming)

- VPS behaviour is **store locally, auto-sync to cloud** — not direct-to-cloud from
  clients. Direct-to-cloud would require embedding the cloud API key in demo-site
  page HTML, where any visitor could read it.
- Mode is **auto-detected with an explicit override**.
- The heartbeat secret is **minted once when the feature is enabled** and never
  auto-rotated; rotation is an explicit, warned action.

---

## Architecture: one ingestion path, optional cloud fan-out

```
VS Code extension ─┐
                   ├─> POST /api/productivity/heartbeats ─> SQLite ─┬─> local dashboard
WP demo site (JS) ─┘        (public API URL + secret)               └─> cloud sync (if enabled)
                                                                        → ${cloud_url}/api/v1/sync/heartbeats
```

Ingestion never changes shape. "Localhost vs VPS" decides only **(a)** what URL
clients post to and **(b)** whether cloud sync runs. Local SQLite is always the
source of truth for the panel, so the dashboard works with or without a cloud
account and survives cloud outages.

## Components

### 1. Deployment resolution (`utils/deployment.ts`)

Two pure functions over existing config, no I/O:

- `publicApiBaseUrl()` — the browser-reachable base URL of this install, from
  `PUBLIC_URL` (falling back to `BASE_DOMAIN`). Localhost keeps the API port
  (`http://localhost:3737`) because the dashboard and API are separate origins in
  dev; a real domain does not (Traefik fronts both on 443).
- `isLocalDeployment()` — true for `localhost`, `127.0.0.1`, `::1`, `*.local`, and
  RFC1918 private IPv4 ranges; false otherwise.

### 2. Decouple ingestion from the cloud

- Mint `heartbeat_secret` when `feature.productivityMonitor` flips on, and on boot
  if the feature is enabled but the secret is missing (covers installs enabled
  before this change).
- `PUT /cloud/config` **no longer touches** the secret.
- Ingestion requires *feature enabled + valid secret* only. The cloud-link check
  is removed.
- New `POST /cloud/rotate-secret` returns the new secret and is documented as
  stopping existing sites from reporting until relaunched.
- `GET /cloud/status` reports `{ tracking, cloudLinked, isLocal, destination,
  syncing }` so clients and the panel can explain the current state.

### 3. Tracking destination setting

New `settings` key `productivity.destination`, one of:

| Value   | Local storage | Cloud sync |
|---------|---------------|------------|
| `auto` (default) | always | iff cloud linked **and** deployment is non-local |
| `local` | always | never |
| `cloud` | always | iff cloud linked (even on localhost) |

`local` lets a VPS operator keep productivity data off a client-facing box's sync
path; `cloud` lets a dev laptop feed a central account. Resolution is a pure
function `resolveSyncEnabled({ destination, cloudLinked, isLocal })`, unit-tested
as a matrix.

### 4. Sync cadence

Cron moves from every 6 hours to **every 15 minutes**, and each tick is a no-op
unless `resolveSyncEnabled(...)` is true. Batching, the `synced` flag, the manual
trigger, and `productivity_sync_log` are unchanged.

### 5. Resolved public API URL to containers

- `site.service` passes `publicApiBaseUrl()` as a new container env var
  `WP_LAUNCHER_PUBLIC_API_URL`; the provisioner sets it alongside the existing
  `WP_LAUNCHER_API_URL` (which stays as-is for server-side PHP use).
- The mu-plugin **prefers** `WP_LAUNCHER_PUBLIC_API_URL` and keeps subdomain
  derivation as a fallback.

The fallback is load-bearing, not dead weight: sites created before this change
have their own bind-mounted copy of the mu-plugin under
`sites/<subdomain>/wp-content/mu-plugins/`, so they pick up new plugin *code* on
the next page load but cannot gain a new env var without being recreated. Those
sites keep working via derivation instead of going dark.

## Error handling

- **Cloud unreachable** — rows stay `synced = 0`, retried next tick, recorded in
  `productivity_sync_log`. The local dashboard is unaffected.
- **Missing/invalid secret** — 401 (unchanged).
- **Feature disabled** — 403 (unchanged).
- **Sites launched before the feature was enabled** carry no secret and only report
  after relaunch. Documented in the panel next to the rotate action.

## Testing

- **Unit, deployment resolution:** table-driven over localhost, `127.0.0.1`,
  private IP, `*.local`, custom domain, https, and non-default port.
- **Unit, destination matrix:** `auto|local|cloud` × linked/unlinked × local/VPS.
- **Unit, secret lifecycle:** enabling the feature mints a secret; linking the
  cloud does **not** rotate it; rotating changes it.
- **Regression (the core fix):** ingestion succeeds with **no cloud account
  linked**.
- **Manual:** launch a site on the local install and confirm heartbeats land and
  appear in the dashboard; flip `BASE_DOMAIN`/`PUBLIC_URL` to simulate a VPS and
  confirm the container receives the public URL.

## Out of scope (YAGNI)

Injecting secrets into already-running containers; a cloud-only/purge mode that
discards local rows after push; per-user productivity scoping; any change to the
cloud API contract or the VS Code extension's protocol.
