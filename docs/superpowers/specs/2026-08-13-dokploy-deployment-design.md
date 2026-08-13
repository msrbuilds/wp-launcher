# Dokploy Deployment — Design

**Goal:** Let WP Launcher run as a Docker Compose app on a Dokploy host, using
Dokploy's Traefik instead of its own, without disturbing the existing standalone
VPS install.

**Tech Stack:** Docker Compose, Traefik v3, Dokploy. No application dependencies
added; one small provisioner change.

---

## Background: why this is not just "point Dokploy at the compose file"

WP Launcher is itself a container orchestrator. Three things make it unusual as a
PaaS workload:

1. It ships **its own Traefik bound to :80/:443** — the same ports Dokploy's
   Traefik owns. They cannot coexist.
2. The provisioner **creates sibling containers at runtime** via the host Docker
   daemon. Dokploy's UI can never manage their domains, so those containers must
   carry their own Traefik labels and sit on a network Traefik watches.
3. It **bind-mounts host paths into those containers** (`PRODUCT_ASSETS_PATH`,
   `SITES_HOST_PATH`). Those are resolved by the host daemon, not the API
   container, so they must be real host paths.

### Verified facts this design rests on

Each was confirmed rather than assumed:

- Dokploy exposes an external network named **`dokploy-network`**; compose
  services must join it and set `traefik.docker.network=dokploy-network`, or
  their labels are ignored.
- Dokploy's Traefik reads dynamic config from **`/etc/dokploy/traefik/dynamic/`**.
- Dokploy's Traefik uses the **`web`/`websecure`** entrypoints and a resolver
  named **`letsencrypt`** — identical to what the provisioner already emits, so
  per-site routing needs no label changes.
- Dokploy **deletes `code/` on every redeploy**. Only `../files/` and named
  volumes survive.
- Traefik v3.6's file provider **does** read subdirectories. Tested directly
  against the running stack: configs written to both `/etc/traefik/dynamic/` and
  `/etc/traefik/dynamic/custom-domains/` produced matching routers (502 from the
  dead upstream), while an unknown host returned 404. Published summaries claiming
  the file provider ignores subdirectories are wrong for this version. The
  existing `custom-domains/` layout is therefore sound and is reused as-is.

## Decisions (from brainstorming)

- Ship a **separate `docker-compose.dokploy.yml`**, leaving the standalone path
  untouched, so nothing that works today can regress.
- **Named volume for `data/`; `../files/` bind mounts** for the paths the
  provisioner hands to the host daemon.
- **Support both TLS modes**: per-site HTTP-01 stays the default; a blank
  `CERT_RESOLVER` enables wildcard mode. Wildcard is the documented production
  recommendation.
- Site containers join **`dokploy-network`** — chosen for reliability over
  isolation, with the trade-off documented (see Security).

---

## Architecture

```
Dokploy Traefik (:80/:443) ── dokploy-network ──┬── dashboard (nginx) ──► api:3737
                                                ├── adminer
                                                └── {site}.BASE_DOMAIN
                                                    (labels written by provisioner)

provisioner ── provisioner-internal (internal) ── docker-proxy ──► host Docker daemon
```

Routing is entirely label-driven, including for WP Launcher's own services. That
is not a stylistic choice: the dynamically created site containers *must* be
label-routed, so using Dokploy's UI for the static services as well would split
one concern across two mechanisms.

## The compose file

`docker-compose.dokploy.yml`, self-contained. Differences from the base file:

| Change | Reason |
|--------|--------|
| `traefik` service removed, with its ports and `traefik-certs` volume | Dokploy's Traefik owns :80/:443 |
| `dokploy-network` declared `external: true`; routable services join it | Traefik only watches that network |
| `traefik.docker.network=dokploy-network` added to every routed service | Required by Dokploy when a service is on more than one network |
| API host port removed | nginx proxies `/api/` to `api:3737`; the API never needs to face the host |
| `mailpit` removed | Its loopback ports are unreachable on a PaaS host; real SMTP becomes required |
| `DOCKER_NETWORK=dokploy-network` | Puts new site containers where Traefik can see them |
| Provisioner mounts `/etc/dokploy/traefik/dynamic` | Custom-domain configs land in Traefik's watched tree |
| `data/` on named volume, assets/sites under `../files/` | Survives the `code/` wipe (see Persistence) |

`api.${BASE_DOMAIN}` is not routed. Everything — panel, demo-site heartbeats, the
WP Connector — reaches the API through the dashboard origin at `/api/`.

## Persistence

Nothing stateful may live in `code/`.

| Path | Storage | Why |
|------|---------|-----|
| `data/` — SQLite DB, secrets, snapshots, uploads | named volume `wpl-data` | Only the API and provisioner touch it, and Dokploy's volume backup covers named volumes. This is the database; backup coverage matters most here. |
| `product-assets/` | `../files/product-assets` | The host daemon bind-mounts this into WordPress containers, so it must be a real host path. |
| `sites/` | `../files/sites` | Same: per-site `wp-content` is bind-mounted by the daemon. |
| `wordpress/`, `blueprints/` | from `code/` | Build context and seed data, rebuilt each deploy by design. Blueprints' authoritative store is the DB. |

`PRODUCT_ASSETS_PATH` and `SITES_HOST_PATH` must be set to absolute host paths —
`/etc/dokploy/compose/<app-name>/files/product-assets` and `.../files/sites` —
because the daemon resolves them outside any container's filesystem. Getting this
wrong is the most likely setup error, so the guide calls it out explicitly.

## Code change: optional cert resolver

`ENABLE_TLS=true` currently always emits
`traefik.http.routers.<sub>.tls.certresolver=<CERT_RESOLVER>`. The change: when
`CERT_RESOLVER` is blank, omit that label and emit only `tls=true`, so Traefik
serves a pre-loaded wildcard certificate instead of requesting one per site.

- `CERT_RESOLVER=letsencrypt` (default, unchanged) — one HTTP-01 certificate per
  site. Zero configuration, but Let's Encrypt allows only **50 certificates per
  registered domain per week**; a busy launcher will hit that ceiling and new
  sites will silently fall back to no HTTPS.
- `CERT_RESOLVER=""` — wildcard mode. Requires a `*.BASE_DOMAIN` certificate via
  DNS-01 in Dokploy's Traefik static config. No rate limit, and launches skip the
  ACME round trip entirely.

This is the only change to application code; everything else is configuration and
documentation.

## Security: network isolation trade-off

Placing site containers on `dokploy-network` means **a demo WordPress site can
reach every other application hosted on the same Dokploy instance** over the
internal network. On the standalone install they are confined to
`wp-launcher-network`. Since demo sites run visitor-installable plugins, this is a
genuine widening of the blast radius and is documented as such.

The alternative — keeping sites on `wp-launcher-network` and attaching Dokploy's
Traefik with `docker network connect wp-launcher-network dokploy-traefik` — is
rejected as the default because Dokploy recreates its Traefik container on
updates, which drops the attachment and breaks all site routing with no error
until someone re-runs the command. Reliability wins; the guide documents the
hardening option for operators who want it and will maintain it.

Unchanged from standalone: the provisioner still reaches Docker only through
`docker-socket-proxy` on an internal network, never the raw socket.

## Error handling and failure modes

- **Wrong `SITES_HOST_PATH`/`PRODUCT_ASSETS_PATH`** — sites launch with empty or
  missing `wp-content`. The guide gives the exact absolute paths.
- **Service not on `dokploy-network`** — Traefik silently ignores its labels and
  the domain 404s. Covered by the deployment checklist.
- **Redeploy** — `code/` is replaced; `wpl-data` and `../files/` persist, so
  existing sites and the database survive. Running site containers are untouched
  by a panel redeploy, since they are separate containers owned by the daemon.
- **Cert rate limit** — new sites serve HTTP rather than failing outright; the
  wildcard path is the documented fix.

## Testing

This is deployment configuration, so verification is operational rather than unit
tests:

1. `docker compose -f docker-compose.dokploy.yml config` parses and resolves every
   variable.
2. The dashboard answers on `BASE_DOMAIN` over HTTPS, and `/api/settings` responds
   through it — proving the nginx proxy path without a published API port.
3. A launched site is reachable at `{sub}.BASE_DOMAIN` with a valid certificate.
4. A custom domain writes a file into `/etc/dokploy/traefik/dynamic/custom-domains/`
   and routes.
5. A redeploy preserves the database and existing sites — the check that matters
   most, since the failure mode is silent data loss.

## Out of scope (YAGNI)

Coolify/CapRover/Kubernetes variants; a Dokploy template or one-click marketplace
entry; changing the standalone install or `install.sh`; migrating an existing
standalone install onto Dokploy; multi-node Docker Swarm scheduling of site
containers.
