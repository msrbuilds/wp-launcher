# Dokploy Deployment Guide

WP Launcher runs on [Dokploy](https://dokploy.com) as a Docker Compose service.
Dokploy's Traefik stays the host's ingress and routes the panel, while WP
Launcher runs its own Traefik for site traffic — which Dokploy forwards by SNI
without decrypting. Everything WP Launcher needs is declared in its compose
file, so a Dokploy upgrade cannot break it.

If you want a plain VPS with no PaaS, use [vps-deployment.md](vps-deployment.md)
instead — that path bundles Traefik and is unaffected by anything here.

## Prerequisites

- A Dokploy host with Docker installed (Dokploy's standard install).
- **DNS**, both records pointing at the host's IP:
  - `wplauncher.xyz` — the panel
  - `*.wplauncher.xyz` — a **wildcard** record; every launched site lives at
    `{subdomain}.wplauncher.xyz`
- An **SMTP account**. Unlike the standalone install there is no bundled Mailpit,
  so account verification and invitations need real mail.

## 1. Create the application

In Dokploy: **Project → Create Service → Compose**.

- **Source**: this Git repository
- **Compose Path**: `docker-compose.dokploy.yml`

Do not deploy yet.

## 2. Create the persistent directories

The compose file bind-mounts two directories. Create them **before the first
deploy**, or Docker creates them root-owned and site launches fail with
permission errors. Replace `<app-name>` with your Dokploy application name:

```bash
mkdir -p /etc/dokploy/compose/<app-name>/files/product-assets
mkdir -p /etc/dokploy/compose/<app-name>/files/sites
```

These sit under `files/` deliberately: Dokploy **deletes `code/` on every
redeploy**, so nothing stateful can live in the checkout.

## 3. Set the environment

Copy [`.env.dokploy.example`](../.env.dokploy.example) into Dokploy's
**Environment** tab, then:

- Generate each secret with `openssl rand -hex 32`
- Replace `<app-name>` in **both** paths
- Fill in the SMTP block

`PRODUCT_ASSETS_PATH` and `SITES_HOST_PATH` must be **absolute host paths**. The
host Docker daemon resolves them when bind-mounting into WordPress containers, so
a path relative to a container means nothing. This is the most common setup
mistake.

## 4. Deploy, then build the WordPress base image

Deploy from the Dokploy UI. Sites cannot launch until a base image exists, so
build one once on the host:

```bash
cd /etc/dokploy/compose/<app-name>/code && bash scripts/build-wp-image.sh
```

After the first deploy you can also do this from the panel under
**Settings → Images**, which is the easier route for later PHP/WordPress versions.

## 5. First run

Visit `https://wplauncher.xyz` and complete the setup wizard to create the
owner account.

## 6. Certificates

WP Launcher terminates TLS itself. Dokploy's Traefik forwards the encrypted
stream to it by SNI, so **there is nothing to configure on the host** — no
edits to `/etc/dokploy/traefik/traefik.yml`, no environment variables on
Dokploy's Traefik container, and nothing a Dokploy upgrade can undo.

Set `ACME_EMAIL` and you are done. Each site gets its own Let's Encrypt
certificate over **TLS-ALPN-01** as it launches — issued on port 443, which
reaches WP Launcher's Traefik untouched thanks to SNI passthrough.

HTTP-01 is deliberately not used. Any outer Traefik with an ACME resolver of
its own registers an internal router for `/.well-known/acme-challenge/` at
maximum priority, so it intercepts every challenge on port 80 and answers 404
for tokens it did not issue. TLS-ALPN-01 avoids port 80 entirely.

### When to switch to a wildcard

Let's Encrypt issues at most **50 certificates per registered domain per week**.
Since each launch on a new subdomain is one certificate, a busy launcher reaches
that ceiling, after which new sites get no HTTPS until the window rolls over.

To switch, set `ACME_DNS_PROVIDER` to a
[Traefik DNS provider](https://doc.traefik.io/traefik/https/acme/#providers)
name and supply its credentials in the same Environment tab — for Cloudflare,
`ACME_DNS_PROVIDER=cloudflare` and `CF_DNS_API_TOKEN=...` from a token scoped to
`Zone -> DNS -> Edit` on your zone only. Redeploy, and one `*.BASE_DOMAIN`
certificate replaces the per-site ones.

The switch needs no relaunches: certificates are requested by the proxy's
entrypoint rather than by each site's router.

The panel itself, at the apex domain, is unaffected either way — it keeps its
certificate from Dokploy's own resolver.

## Upgrading from a release before self-contained TLS

Earlier versions had Dokploy's Traefik terminate TLS and route each site
individually. Sites created under that arrangement are matched by the new SNI
router but are unknown to WP Launcher's Traefik, so **they must be relaunched**.
Take a snapshot first if they hold anything you need.

Afterwards you may remove the `dnsChallenge` resolver you previously added to
`/etc/dokploy/traefik/traefik.yml`, and `CF_DNS_API_TOKEN` from Dokploy's
Traefik container. Neither is read any more. This is optional — leaving them in
place is inert, and reverting carries more risk than ignoring them.

Delete `TRAEFIK_TRUSTED_IPS` and `WILDCARD_CERT_RESOLVER` from the Environment
tab; they are no longer read.

## What survives a redeploy

| Location | Survives | Contents |
|----------|----------|----------|
| `wpl-data` named volume | yes | SQLite database, secrets, snapshots, uploads |
| `files/product-assets` | yes | Plugin/theme zips used by blueprints |
| `files/sites` | yes | Per-site `wp-content` |
| `code/` | **no — replaced** | Application source, `blueprints/`, `wordpress/` |

Deleting a shipped blueprint is durable: the deletion is recorded in the
database, so a redeploy restoring its JSON file from git does not bring it back.
Panel edits to a shipped blueprint are durable too — the database copy takes
precedence over the file, which reverts to git's version on every redeploy.

Blueprints created in the panel are written to the database as well as to disk,
so they survive the `code/` wipe even though their JSON files do not.

Running site containers are **not** touched by a panel redeploy — they are
separate containers owned by the Docker daemon, not part of this compose project.

### A redeploy can leave the image builder with a stale mount

Dokploy deletes and re-clones `code/` on redeploy. A container that keeps
running through that stays bound to the **deleted** directory inode, so it sees
an empty `/app/wordpress` even though the host path is populated — the path
string matches, the inode does not.

Only image building notices: `blueprints/`, `products/` and `templates/` all
fall back to the database, but a build genuinely needs files on disk. The build
fails with "build context has no Dockerfile — the directory is empty or its
mount is stale". Fix it by restarting the API container so the bind re-resolves:

```bash
docker restart $(docker ps --filter name=-api --filter label=com.docker.compose.project --format '{{.Names}}' | head -1)
```

Then verify and retry the build from the panel:

```bash
docker exec <api-container> ls /app/wordpress   # expect Dockerfile, entrypoint.sh, mu-plugins
```

## Security: sites are isolated from your other apps

Site containers run on a private `wpl-sites` network and are routed by a second
Traefik that WP Launcher owns. They cannot reach other applications on this
Dokploy instance, and cannot reach the provisioner at all.

The request path is: Dokploy's Traefik matches `*.BASE_DOMAIN` by SNI and
forwards the **encrypted** stream untouched to `wpl-traefik`, which terminates
TLS, obtains the certificate, and routes by hostname to the site. Dokploy's
Traefik never decrypts site traffic and holds no certificate for these domains.

Two consequences worth knowing:

- **Sites launched before this design are neither isolated nor reachable.**
  Docker labels are immutable, so an existing container permanently records the
  network it was created for and cannot be moved. They must be relaunched — see
  the upgrade section above.
- **A site can still reach ports published on the host** via the bridge
  gateway address. Closing that needs a `DOCKER-USER` iptables rule and is not
  done for you.

Unchanged from standalone: the provisioner reaches Docker only through
`docker-socket-proxy`, never the raw socket. Traefik gets a second, read-only
socket proxy with `EXEC`, `POST` and `BUILD` disabled.

Adminer at `db.wplauncher.xyz` requires the basic-auth credential in
`ADMINER_AUTH_USERS`. It sits on the site network, so it can still reach every
site database — do not disable that middleware.

### Custom domains are not supported on Dokploy yet

A custom domain needs a router at Dokploy's tier forwarding to `wpl-traefik`
plus a matching host router at ours, and its certificate cannot come from the
wildcard. That plumbing is not built. Sites on `*.BASE_DOMAIN` are unaffected.

## Verify the deployment

Run these on the host after the first deploy:

1. `https://wplauncher.xyz` serves the panel and `/api/settings` returns JSON.

2. Launch a **new** site. It answers at `https://{sub}.wplauncher.xyz` with a
   valid certificate and no redirect loop.

3. The certificate is real, not Traefik's fallback:

   ```bash
   echo | openssl s_client -connect 127.0.0.1:443 -servername {sub}.wplauncher.xyz 2>/dev/null      | openssl x509 -noout -subject -issuer
   ```

   Expected: a `Let's Encrypt` issuer. `CN = TRAEFIK DEFAULT CERT` means
   issuance failed — check `docker logs` on the `wpl-traefik` container.

4. **A neighbouring Dokploy app on its own domain still loads.** The SNI router
   matches only `*.BASE_DOMAIN`, but a rule that is too broad would silently
   hijack other applications' traffic. This is the check that protects
   everything else on the instance.

5. The new site is on the private network only:

   ```bash
   docker inspect wp-site-{sub} --format '{{json .NetworkSettings.Networks}}' | tr ',' '
' | grep -o '"[a-z-]*":'
   ```

   Expected: `wpl-sites`, and not `dokploy-network`.

6. The site cannot reach a neighbouring app:

   ```bash
   docker exec wp-site-{sub} curl -s -m 5 http://<other-service>:<port>
   ```

   Expected: failure.

7. **Certificates survive a redeploy.** Confirm they are not stored in the
   checkout:

   ```bash
   docker volume inspect $(docker volume ls -q | grep wpl-acme) --format '{{.Mountpoint}}'
   ```

   Expected: a path outside `/etc/dokploy/compose/*/code`. Certificates stored
   in the checkout are destroyed on every redeploy, and the resulting
   re-issuance exhausts the weekly limit with no obvious symptom until it does.

8. **Redeploy, then confirm the owner still logs in and existing sites are
   still listed.** Its failure mode is silent database loss, which is why
   `data/` is a named volume rather than a path in the checkout.

Items 4 and 7 are the ones that fail quietly.

## Differences from the standalone install

- No bundled Traefik — Dokploy's routes everything.
- No Mailpit — real SMTP is required.
- No published API port, and no `api.wplauncher.xyz`. Everything reaches the
  API through the panel origin at `/api/`.

## Troubleshooting

**The panel domain returns 404.**
The service is not on `dokploy-network`, or its `traefik.docker.network` label is
missing, so Traefik ignores its labels. Check the compose file declares
`dokploy-network` as `external: true` and that the service joins it.

**Sites launch but WordPress is missing files, or `wp-content` is empty.**
`SITES_HOST_PATH` or `PRODUCT_ASSETS_PATH` is not an absolute host path. The
daemon resolves these outside any container, so a relative or container-internal
path silently produces empty mounts.

**New sites have no HTTPS while older ones are fine.**
You have hit Let's Encrypt's 50-certificates-per-domain-per-week limit. Switch to
wildcard TLS (section 6); the limit resets weekly.
