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

## 6. Wildcard TLS (required)

Site containers are not visible to Dokploy's Traefik individually — they sit on
a private network behind WP Launcher's own Traefik. Per-site HTTP-01 therefore
cannot work, because Traefik cannot derive ACME domains from a regexp rule. One
wildcard certificate covers every site:

**HTTP-01 cannot issue wildcards** — Let's Encrypt requires DNS-01 for them — so
this needs a DNS provider API token. These steps assume Cloudflare; adjust the
provider name for others.

1. Create a Cloudflare API token (*My Profile → API Tokens → Create Custom
   Token*) with `Zone → DNS → Edit`, scoped to your zone only. A scoped token
   needs just `CF_DNS_API_TOKEN`; avoid the global key, which can modify every
   zone on the account.

2. Add a `cloudflare` resolver alongside the existing one in
   `/etc/dokploy/traefik/traefik.yml`. Use a **separate** storage file —
   mixing challenge types in one `acme.json` fails confusingly:

   ```yaml
   certificatesResolvers:
     letsencrypt:            # leave this: your other apps use it
       acme:
         email: you@example.com
         storage: /etc/dokploy/traefik/dynamic/acme.json
         httpChallenge:
           entryPoint: web
     cloudflare:
       acme:
         email: you@example.com
         storage: /etc/dokploy/traefik/dynamic/acme-dns.json
         dnsChallenge:
           provider: cloudflare
           resolvers:
             - "1.1.1.1:53"
   ```

3. Put the token in **Traefik's own environment** — not `traefik.yml`, and not
   WP Launcher's Environment tab. Traefik's Cloudflare provider reads
   `CF_DNS_API_TOKEN` from its process environment. If Dokploy runs Traefik as
   a Swarm service, `docker service update --env-add CF_DNS_API_TOKEN=… <name>`
   does it. If it is a plain container (check with
   `docker inspect dokploy-traefik --format '{{index .Config.Labels "com.docker.swarm.service.name"}}'`),
   it must be recreated with `-e CF_DNS_API_TOKEN=…`, preserving its existing
   mounts, published ports and **all** network attachments. Capture them with
   `docker inspect` first — Traefik is the host's only ingress.

4. Redeploy WP Launcher.

If your resolver is not named `cloudflare`, set `WILDCARD_CERT_RESOLVER` to
match.

Note that a Dokploy upgrade may recreate its Traefik container from its own
definition and drop that environment variable, which would break wildcard
renewal roughly 60 days later, silently. Worth a calendar reminder.

This also sidesteps Let's Encrypt's limit of 50 certificates per registered
domain per week, which a busy launcher on per-site certificates would hit — and
it makes launches noticeably faster, since no ACME request happens at all.

Three variables must be set in the Environment tab alongside it:

| Variable | How to get it |
|---|---|
| `BASE_DOMAIN_REGEX` | Escape the dots in your domain: `^.+\.wplauncher\.xyz$` |
| `TRAEFIK_TRUSTED_IPS` | Leave at `10.0.0.0/8` unless `docker network inspect dokploy-network -f '{{(index .IPAM.Config 0).Subnet}}'` prints something outside it |
| `ADMINER_AUTH_USERS` | `htpasswd -nbB admin 'your-password'`, then **double every `$`** |

That last instruction is not optional. Compose interpolates environment values,
so a bcrypt hash entered verbatim is silently truncated at its first `$` and
Adminer rejects the correct password with nothing in any log to explain it.
Enter `admin:$$2y$$05$$Xk9...` where htpasswd printed `admin:$2y$05$Xk9...`.
`BASE_DOMAIN_REGEX` needs no escaping — its only `$` is the final character,
where there is no variable name for compose to read.

`ENABLE_TLS` and `CERT_RESOLVER` are no longer read; remove them if present.

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

## Security: sites are isolated from your other apps

Site containers run on a private `wpl-sites` network and are routed by a second
Traefik that WP Launcher owns. They cannot reach other applications on this
Dokploy instance, and cannot reach the provisioner at all.

The request path is: Dokploy's Traefik terminates TLS with the wildcard
certificate, matches one low-priority catch-all router for `*.BASE_DOMAIN`, and
forwards plain HTTP to `wpl-traefik`, which routes by hostname to the site.

Two consequences worth knowing:

- **Sites launched before this change are not isolated.** Docker labels are
  immutable, so an existing container permanently records the network it was
  created for and cannot be moved. Those sites keep working — their per-site
  routers outrank the catch-all — but they remain on `dokploy-network` until
  they expire or you relaunch them. Relaunch anything holding client data you
  care about.
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

1. `https://wplauncher.xyz` serves the panel, and
   `https://wplauncher.xyz/api/settings` returns JSON — confirming the
   dashboard's nginx still reaches the API now that the API is off
   `dokploy-network`.

2. Launch a **new** site. It answers at `https://{sub}.wplauncher.xyz` with a
   valid certificate and **no redirect loop**. A redirect loop here means
   `TRAEFIK_TRUSTED_IPS` does not match the real `dokploy-network` subnet, so
   WordPress is seeing `X-Forwarded-Proto: http`.

3. That new site is on the private network only:

   ```bash
   docker inspect wp-site-{sub} --format '{{json .NetworkSettings.Networks}}' | tr ',' '\n' | grep -o '"[a-z-]*":'
   ```

   Expected: `wpl-sites`, and **not** `dokploy-network`.

4. The new site cannot reach the provisioner:

   ```bash
   docker exec wp-site-{sub} curl -s -m 5 http://provisioner:4000/health
   ```

   Expected: failure to resolve the host. A JSON response means the
   provisioner is still on a network the site can see.

5. The new site cannot reach a neighbouring app. Pick another Dokploy service
   and try its internal port:

   ```bash
   docker exec wp-site-{sub} curl -s -m 5 http://<other-service>:<port>
   ```

   Expected: failure. Running the same command inside a site created *before*
   this change will succeed — that is the pre-existing exposure, and it is why
   old sites should be relaunched.

6. `https://db.wplauncher.xyz` returns `401 Unauthorized` before showing
   Adminer's form. If it shows the form, the middleware is not applied; if it
   rejects your correct password, the `$` characters in `ADMINER_AUTH_USERS`
   were not doubled.

7. A site created before this change still loads, confirming the two tiers
   coexist.

8. **Redeploy, then confirm the owner still logs in and existing sites are still
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
