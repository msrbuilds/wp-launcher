# Dokploy Deployment Guide

WP Launcher runs on [Dokploy](https://dokploy.com) as a Docker Compose service,
using Dokploy's Traefik rather than bundling its own.

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

## 6. Wildcard TLS (recommended for production)

By default every site requests its own Let's Encrypt certificate over HTTP-01.
That works, but **Let's Encrypt allows only 50 certificates per registered domain
per week**. A busy launcher hits that ceiling, after which new sites get no
HTTPS — with no error in WP Launcher itself, because the failure happens inside
Traefik.

The fix is one wildcard certificate covering every site:

1. Add a DNS-01 resolver to Dokploy's Traefik static configuration
   (**Settings → Traefik** in the Dokploy UI, or
   `/etc/dokploy/traefik/traefik.yml`) using your DNS provider's API token, and
   obtain `*.wplauncher.xyz`.
2. Set `CERT_RESOLVER=` — **blank, but keep the line** — in the Environment tab.
3. Redeploy.

Sites are then served from the wildcard certificate with no per-site ACME
request, which also makes launches noticeably faster.

## What survives a redeploy

| Location | Survives | Contents |
|----------|----------|----------|
| `wpl-data` named volume | yes | SQLite database, secrets, snapshots, uploads |
| `files/product-assets` | yes | Plugin/theme zips used by blueprints |
| `files/sites` | yes | Per-site `wp-content` |
| `code/` | **no — replaced** | Application source, `blueprints/`, `wordpress/` |

Blueprints created in the panel are written to the database as well as to disk,
so they survive the `code/` wipe even though their JSON files do not.

Running site containers are **not** touched by a panel redeploy — they are
separate containers owned by the Docker daemon, not part of this compose project.

## Security: sites share Dokploy's network

Site containers join `dokploy-network`, which means **a demo WordPress site can
reach other applications hosted on the same Dokploy instance** over the internal
network. This is wider than the standalone install, where sites are confined to
`wp-launcher-network`. Since sites can run arbitrary plugins, treat it as real.

If that matters, host WP Launcher on a Dokploy instance of its own.

There is a hardening option — keep sites on their own network and attach
Dokploy's Traefik to it:

```bash
docker network connect wp-launcher-network dokploy-traefik
```

It is not the default because **Dokploy recreates its Traefik container on
update**, which drops the attachment and silently breaks routing for every site
until the command is run again. Only take this route if you will notice and
re-run it.

Unchanged from standalone: the provisioner reaches Docker only through
`docker-socket-proxy` on an internal network, never the raw socket.

## Verify the deployment

Run these on the host after the first deploy:

1. `https://wplauncher.xyz` serves the panel, and
   `https://wplauncher.xyz/api/settings` returns JSON — confirming nginx reaches
   the API with no published port.
2. Launch a site; it answers at `https://{sub}.wplauncher.xyz` with a valid
   certificate.
3. That site container carries the right network label:
   ```bash
   docker inspect $(docker ps --filter "label=wp-launcher.managed=true" --format "{{.Names}}" | head -1) \
     --format '{{index .Config.Labels "traefik.docker.network"}}'
   ```
   Expected: `dokploy-network`.
4. Setting a custom domain writes
   `/etc/dokploy/traefik/dynamic/custom-domains/{sub}.yml` and the domain routes.
   (Traefik's file provider does read that subdirectory — verified against v3.6.)
5. **Redeploy, then confirm the owner still logs in and existing sites are still
   listed.** This is the check that matters most: its failure mode is silent
   database loss, and it is why `data/` is a named volume rather than a path in
   the checkout.

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
