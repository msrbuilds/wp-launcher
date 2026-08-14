# Dokploy Network Isolation — Design

**Date:** 2026-08-14
**Status:** Approved, ready for planning

## Problem

On Dokploy, WP Launcher site containers join `dokploy-network` — the network
every other application on the instance also uses. A WordPress site can
therefore reach every neighbouring app over the internal network. The
standalone install does not have this problem: there, sites are confined to
`wp-launcher-network`.

This matters because the panel is used for real client sites, and a WordPress
site is a realistic point of compromise. The trigger is not a malicious client;
it is a vulnerable plugin, a weak admin password, or a hostile plugin update.
Blueprints with restrictions turned off grant plugin and theme installation,
which is arbitrary PHP execution inside the container by design.

### Verified exposure

Reachable from a site container today:

| Target | Protection | Assessment |
|---|---|---|
| Other Dokploy apps (e.g. Supabase) | whatever that app has | the core problem |
| `api:3737` | JWT / API key | authenticated, but attack surface |
| `provisioner:4000` | `INTERNAL_KEY` on every route | authenticated; compare is not constant-time |
| `adminer:8080` | none | see below |
| Other sites' WordPress containers | WP login | brute-force target |
| Other sites' DB sidecars (3306) | app-user password | password is guessable, see below |

Not reachable, and correctly so: `docker-socket-proxy` sits only on
`provisioner-internal`, which is `internal: true`, and sites never join it. No
site can reach the Docker API. That containment is the design working as
intended and this spec does not change it.

Two independent defects surfaced during the review:

1. **Adminer is internet-facing and unauthenticated.** `docker-compose.dokploy.yml`
   routes `db.${BASE_DOMAIN}` with no auth middleware. Adminer's login form
   accepts an arbitrary server address, so anyone on the internet can use the
   panel's own Adminer as a console against any host and port reachable from
   `dokploy-network`. This requires no compromised site and no foothold. In the
   standalone compose the same container exists but is confined to
   `wp-launcher-network`, so moving to Dokploy is what turned it into a general
   purpose internal scanner.

2. **DB sidecar passwords are guessable.** `packages/provisioner/src/index.ts`
   builds the password as `wp_${subdomain}_${Date.now().toString(36)}`. The
   subdomain is the public hostname, so the only secret is a millisecond
   timestamp. The root password is already random
   (`MYSQL_RANDOM_ROOT_PASSWORD=yes`), but the `wordpress` user owns that site's
   entire database.

## Goals

- A site container cannot reach any other application on the Dokploy instance.
- A site container cannot reach the provisioner.
- Adminer is not an open console.
- Site database passwords are unguessable.
- No downtime, and no forced migration of running sites.

## Non-goals

- Custom domains. Not in use today, so the two-hop routing they need under this
  design is deferred (see Follow-up work).
- Blocking a site's outbound internet access. Sites must reach wordpress.org to
  install plugins.
- Constant-time comparison in the provisioner's `internalAuth`. Worth fixing,
  but unrelated to network topology; tracked separately.

## Approach

Run a second Traefik, owned by our compose file, between Dokploy's Traefik and
the site containers. Sites move to a private network that only our Traefik and
the API can reach.

The alternative — `docker network connect wp-launcher-network dokploy-traefik` —
was rejected because Dokploy recreates its Traefik container on update, silently
dropping the attachment and breaking routing for every site. Declaring the
attachment in our own compose file survives that.

A dedicated Dokploy instance was also considered. It solves cross-app exposure
with no code, but costs another VPS and leaves site-to-site exposure intact.

### Topology

| Network | Members | Notes |
|---|---|---|
| `dokploy-network` (external) | `wpl-traefik`, `dashboard` | only what Dokploy's Traefik must route |
| `wpl-sites` (bridge) | `wpl-traefik`, `api`, `adminer`, site containers, DB sidecars | not `internal`: sites need egress for plugin installs |
| `wpl-control` (`internal`) | `dashboard`, `api`, `provisioner` | no egress, no sites |
| `provisioner-internal` (`internal`) | `provisioner`, `docker-proxy` | unchanged |
| `traefik-internal` (`internal`) | `wpl-traefik`, `traefik-docker-proxy` | new, see Discovery |

Consequences worth stating explicitly:

- The API leaves `dokploy-network`. Its only public path becomes the dashboard's
  nginx, which was already the intended design.
- The provisioner leaves `dokploy-network`. Sites cannot reach it at all. It
  ends up on two `internal` networks and so has no outbound internet access,
  which is correct: it issues image pulls through the Docker API, and the
  *daemon* performs them, so the provisioner process itself never needs egress.
- The API must be on `wpl-sites`: it probes site containers for readiness
  (`GET /api/sites/:id/ready`) and needs egress for SMTP and wordpress.org.

### Request chain

1. Browser requests `https://sub.wplauncher.xyz`.
2. Dokploy's Traefik terminates TLS with the existing `*.wplauncher.xyz`
   wildcard certificate.
3. A single catch-all router, declared as Traefik **labels on our `wpl-traefik`
   service** so Dokploy's Traefik discovers it like any other app, matches
   ``HostRegexp(`^.+\.wplauncher\.xyz$`)`` with **`priority=1`** and forwards
   plain HTTP to `wpl-traefik:80`. No configuration is added to Dokploy itself.
4. Our Traefik matches ``Host(`sub.wplauncher.xyz`)`` from the site container's
   own labels and forwards to it on `wpl-sites`.

The apex `wplauncher.xyz` does not match `^.+\.wplauncher\.xyz$`, so the
dashboard keeps its existing exact-host router at the Dokploy tier, unchanged.

This design depends on the wildcard certificate from section 6 of
`guides/dokploy-deployment.md` already being in place. Per-site HTTP-01 cannot
survive the split, because Dokploy's Traefik no longer sees individual site
containers and Traefik cannot derive ACME domains from a regexp rule. The
wildcard is confirmed present on the target deployment.

### Forwarded headers

`wordpress/wp-config-docker.php:73` sets `$_SERVER['HTTPS'] = 'on'` only when
`HTTP_X_FORWARDED_PROTO` is `https`. Traefik overwrites `X-Forwarded-*` on
requests from untrusted sources, so our Traefik must be told to trust Dokploy's.

Our `web` entrypoint therefore sets `forwardedHeaders.trustedIPs` to the
`dokploy-network` subnet. Traefik reads static configuration from environment
variables, so this is supplied as
`TRAEFIK_ENTRYPOINTS_WEB_FORWARDEDHEADERS_TRUSTEDIPS` in the compose file rather
than through a templated config file. The subnet is discovered at deploy time:

```bash
docker network inspect dokploy-network -f '{{(index .IPAM.Config 0).Subnet}}'
```

Getting this wrong does not fail loudly. WordPress sees `http`, generates `http`
URLs behind an `https` request, and sites redirect-loop. It is the most
breakable part of the design and needs an explicit verification step.

Site URLs themselves are unaffected: `packages/api/src/services/site.service.ts:124`
derives the scheme from `NODE_ENV`, not from `ENABLE_TLS`, so URLs remain
`https://` even though the inner tier is plain HTTP.

### Discovery

Our Traefik needs the Docker provider to see site containers. It must not get
the raw socket, and it must not reuse the provisioner's socket proxy, which has
`EXEC`, `POST` and `BUILD` enabled.

A second `docker-socket-proxy` is added with read-only permissions —
`CONTAINERS=1`, `NETWORKS=1`, `INFO=1`, everything else `0` — on its own
`traefik-internal` network. This keeps the Docker provider's self-healing
behaviour (container labels remain the source of truth, so orphaned routers
cannot accumulate) without widening what Traefik can do.

The file provider was considered as a way to avoid Docker access entirely, since
the provisioner already writes dynamic files for custom domains. It was rejected
because it makes routing depend on the provisioner writing and removing files
correctly, where the Docker provider is self-correcting.

### Adminer

`db.wplauncher.xyz` matches the catch-all, so Adminer needs no configuration at
the Dokploy tier. Our Traefik routes it to `adminer:8080` behind a `basicauth`
middleware defined in our dynamic configuration, with credentials from
`ADMINER_AUTH_USER` and `ADMINER_AUTH_HASH` (htpasswd/bcrypt). Adminer leaves
`dokploy-network` and joins `wpl-sites`, which is where the site databases it
exists to talk to now live.

### Provisioner configuration

Environment changes only; `packages/provisioner/src/site-labels.ts` already
handles every one of these through existing inputs:

| Variable | Was | Becomes |
|---|---|---|
| `DOCKER_NETWORK` | `dokploy-network` | `wpl-sites` |
| `TRAEFIK_NETWORK` | `dokploy-network` | `wpl-sites` |
| `ENABLE_TLS` | `true` | `false` |

`ENABLE_TLS=false` makes `buildSiteLabels` emit no `entrypoints`, `tls` or
`certresolver` labels, which is correct for a plain-HTTP inner tier. `CERT_RESOLVER`
becomes irrelevant at this tier and is dropped from the provisioner's environment.

### Database passwords

`packages/provisioner/src/index.ts:187` changes from a derived string to
`crypto.randomBytes(24).toString('base64url')`. The `db-credentials` endpoint at
`index.ts:504` reads the password back out of the container's environment rather
than re-deriving it, so running sites keep working and no migration is needed.

### Coexistence and migration

Docker labels are immutable, so existing site containers permanently carry
`traefik.docker.network=dokploy-network` and cannot be moved in place.

They do not need to be. The catch-all router's `priority=1` is lower than any
default-priority router, so the exact-host routers that current sites already
have at the Dokploy tier continue to win. Existing sites keep serving from
`dokploy-network`; new sites are isolated from the moment this deploys. Old
sites drain as they expire, or the operator relaunches them at will.

This means the deployment is not a flag day and needs no downtime window. It
also means the exposure described above persists for pre-existing sites until
they are relaunched, which the guide must say plainly.

## Testing

Unit tests, run in CI:

- `buildSiteLabels` with `enableTls: false` emits no `entrypoints`, `tls` or
  `certresolver` keys, and still emits `traefik.docker.network` when
  `traefikNetwork` is set.
- `buildSiteLabels` with `enableTls: false` and a non-empty `certResolver` still
  emits no TLS keys — the resolver must not leak through when TLS is off.
- DB password generation produces a value that contains neither the subdomain
  nor a base36 timestamp, and two consecutive calls differ.

Verification on the VPS after deploy, as a checklist in the guide:

1. A newly launched site answers over `https://{sub}.wplauncher.xyz` with a
   valid certificate and no redirect loop — this is the forwarded-headers check.
2. Inside that site's container, a connection to a neighbouring app's internal
   port fails, where the same command against a pre-existing site succeeds.
3. `docker inspect` on the new site shows `wpl-sites` and not `dokploy-network`.
4. `https://db.wplauncher.xyz` returns a `401` before showing Adminer's form.
5. Inside a site container, `curl http://provisioner:4000/health` fails to
   resolve.
6. A pre-existing site still loads, confirming coexistence.

## Follow-up work

- **Custom domains.** Under this design a custom domain needs a router at the
  Dokploy tier forwarding to our Traefik, plus a matching host router at ours.
  Certificates cannot come from the wildcard, so per-domain HTTP-01 is still
  required at the Dokploy tier. Not built here because the feature is unused.
- **Host-published ports.** A site on a bridge network can still reach ports
  published on the host via the bridge gateway address. Closing this needs a
  `DOCKER-USER` iptables rule. Documented as a known limitation rather than
  built, because IP-based rules are fragile against container churn.
- **Constant-time `internalAuth`.** `packages/provisioner/src/index.ts:48`
  compares the internal key with `!==`.
