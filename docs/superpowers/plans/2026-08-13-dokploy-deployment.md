# Dokploy Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let WP Launcher run as a Docker Compose app on a Dokploy host, using Dokploy's Traefik instead of its own, without disturbing the existing standalone VPS install.

**Architecture:** A second, self-contained `docker-compose.dokploy.yml` drops the bundled Traefik and joins Dokploy's external `dokploy-network`, so Dokploy's Traefik routes both the panel and the site containers the provisioner creates at runtime. Persistent state moves off the redeploy-wiped `code/` directory. One provisioner change makes the per-site certificate resolver optional so a wildcard certificate can serve every site.

**Tech Stack:** Docker Compose, Traefik v3, Dokploy, TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-08-13-dokploy-deployment-design.md`

## Global Constraints

- The standalone path — `docker-compose.yml`, `install.sh`, `guides/vps-deployment.md` — must keep working **unchanged**. Every default in this plan preserves current behaviour.
- Dokploy's external network is named **`dokploy-network`**; any service Traefik must route joins it and sets `traefik.docker.network=dokploy-network`.
- Dokploy's Traefik reads dynamic config from **`/etc/dokploy/traefik/dynamic/`** and uses the **`web`/`websecure`** entrypoints with a resolver named **`letsencrypt`** — the same names the provisioner already emits.
- Dokploy **deletes `code/` on every redeploy**. Only `../files/` and named volumes survive.
- `PRODUCT_ASSETS_PATH` and `SITES_HOST_PATH` must be **absolute host paths**, because the host Docker daemon resolves them, not the API container.
- Node 22 on the host (`.nvmrc`).
- An **empty** `CERT_RESOLVER` means "a wildcard certificate is already loaded — emit `tls=true` with no resolver". It must survive both the shell/compose layer and the TypeScript layer; both currently coerce empty to `letsencrypt`.

---

## File structure

**Provisioner (`packages/provisioner`)**
- `src/site-labels.ts` (create) — one pure function building the Traefik/bookkeeping label map for a site container. Extracted so the resolver and network rules are unit-testable; the provisioner has no tests today and this is the piece worth pinning.
- `src/site-labels.test.ts` (create) — the label matrix.
- `src/index.ts` (modify) — use the builder; fix `CERT_RESOLVER` falsy coercion; add `TRAEFIK_NETWORK`.
- `package.json`, `vitest.config.ts` (modify/create) — vitest for this package.

**Repo root**
- `docker-compose.dokploy.yml` (create) — the Dokploy variant.
- `.env.dokploy.example` (create) — the variables a Dokploy operator sets.

**Docs**
- `guides/dokploy-deployment.md` (create) — the deployment guide.
- `CLAUDE.md` (modify) — point at the new file and guide.

---

## Task 1: Optional cert resolver and Traefik network label

**Files:**
- Create: `packages/provisioner/src/site-labels.ts`
- Create: `packages/provisioner/src/site-labels.test.ts`
- Create: `packages/provisioner/vitest.config.ts`
- Modify: `packages/provisioner/package.json`
- Modify: `packages/provisioner/src/index.ts:18-21` (env constants) and `:338-351` (label map)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `buildSiteLabels(input: SiteLabelInput): Record<string, string>` where
  `interface SiteLabelInput { subdomain: string; baseDomain: string; enableTls: boolean; certResolver: string; traefikNetwork: string; expiresAt: string; dbContainerId?: string }`.
  Task 2 relies on the env names `TRAEFIK_NETWORK` and `CERT_RESOLVER` behaving as described here.

- [ ] **Step 1: Add vitest to the provisioner.** This package has no tests today. It is not an npm workspace, so it needs its own dev dependency:

```bash
cd packages/provisioner && npm install -D vitest
```

Then add the script to `packages/provisioner/package.json` (keep the existing `dev`, `build`, `start` entries):

```json
    "test": "vitest run"
```

And create `packages/provisioner/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write the failing test.** Create `packages/provisioner/src/site-labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSiteLabels } from './site-labels';

const base = {
  subdomain: 'happy-fox-1234',
  baseDomain: 'demo.example.com',
  enableTls: false,
  certResolver: 'letsencrypt',
  traefikNetwork: '',
  expiresAt: '2026-12-31T00:00:00.000Z',
};

describe('buildSiteLabels', () => {
  it('always emits the router rule, service port and bookkeeping labels', () => {
    const l = buildSiteLabels(base);
    expect(l['traefik.enable']).toBe('true');
    expect(l['traefik.http.routers.happy-fox-1234.rule']).toBe('Host(`happy-fox-1234.demo.example.com`)');
    expect(l['traefik.http.services.happy-fox-1234.loadbalancer.server.port']).toBe('80');
    expect(l['wp-launcher.managed']).toBe('true');
    expect(l['wp-launcher.site-id']).toBe('happy-fox-1234');
    expect(l['wp-launcher.expires-at']).toBe('2026-12-31T00:00:00.000Z');
  });

  it('omits all TLS labels when TLS is off', () => {
    const l = buildSiteLabels(base);
    expect(l['traefik.http.routers.happy-fox-1234.entrypoints']).toBeUndefined();
    expect(l['traefik.http.routers.happy-fox-1234.tls']).toBeUndefined();
    expect(l['traefik.http.routers.happy-fox-1234.tls.certresolver']).toBeUndefined();
  });

  it('requests a per-site certificate when a resolver is named', () => {
    const l = buildSiteLabels({ ...base, enableTls: true, certResolver: 'letsencrypt' });
    expect(l['traefik.http.routers.happy-fox-1234.entrypoints']).toBe('websecure');
    expect(l['traefik.http.routers.happy-fox-1234.tls']).toBe('true');
    expect(l['traefik.http.routers.happy-fox-1234.tls.certresolver']).toBe('letsencrypt');
  });

  it('leaves the certificate to a preloaded wildcard when the resolver is blank', () => {
    const l = buildSiteLabels({ ...base, enableTls: true, certResolver: '' });
    expect(l['traefik.http.routers.happy-fox-1234.tls']).toBe('true');
    expect(l['traefik.http.routers.happy-fox-1234.tls.certresolver']).toBeUndefined();
  });

  it('pins the Traefik network only when one is configured', () => {
    expect(buildSiteLabels(base)['traefik.docker.network']).toBeUndefined();
    expect(buildSiteLabels({ ...base, traefikNetwork: 'dokploy-network' })['traefik.docker.network'])
      .toBe('dokploy-network');
  });

  it('records the database sidecar only when there is one', () => {
    expect(buildSiteLabels(base)['wp-launcher.db-container']).toBeUndefined();
    expect(buildSiteLabels({ ...base, dbContainerId: 'abc123' })['wp-launcher.db-container']).toBe('abc123');
  });
});
```

- [ ] **Step 3: Run it to confirm it fails.**

Run: `cd packages/provisioner && npx vitest run src/site-labels.test.ts`
Expected: FAIL — cannot resolve `./site-labels`.

- [ ] **Step 4: Implement the builder.** Create `packages/provisioner/src/site-labels.ts`:

```ts
export interface SiteLabelInput {
  subdomain: string;
  baseDomain: string;
  enableTls: boolean;
  /**
   * An ACME resolver name, or empty to mean "a wildcard certificate covering
   * this domain is already loaded in Traefik". Blank emits `tls=true` with no
   * resolver, so Traefik serves the existing certificate rather than requesting
   * one per site — which matters because Let's Encrypt allows only 50
   * certificates per registered domain per week.
   */
  certResolver: string;
  /**
   * The Docker network Traefik should reach this container on. Required when
   * Traefik's own configured network differs from the container's, as on
   * Dokploy. Empty omits the label, which is correct for the bundled Traefik.
   */
  traefikNetwork: string;
  expiresAt: string;
  dbContainerId?: string;
}

/** Every label a site container carries: Traefik routing plus our bookkeeping. */
export function buildSiteLabels(input: SiteLabelInput): Record<string, string> {
  const r = `traefik.http.routers.${input.subdomain}`;
  return {
    'traefik.enable': 'true',
    [`${r}.rule`]: `Host(\`${input.subdomain}.${input.baseDomain}\`)`,
    [`traefik.http.services.${input.subdomain}.loadbalancer.server.port`]: '80',
    ...(input.traefikNetwork ? { 'traefik.docker.network': input.traefikNetwork } : {}),
    ...(input.enableTls
      ? {
          [`${r}.entrypoints`]: 'websecure',
          [`${r}.tls`]: 'true',
          ...(input.certResolver ? { [`${r}.tls.certresolver`]: input.certResolver } : {}),
        }
      : {}),
    'wp-launcher.managed': 'true',
    'wp-launcher.site-id': input.subdomain,
    'wp-launcher.expires-at': input.expiresAt,
    ...(input.dbContainerId ? { 'wp-launcher.db-container': input.dbContainerId } : {}),
  };
}
```

- [ ] **Step 5: Run it to confirm it passes.**

Run: `cd packages/provisioner && npx vitest run src/site-labels.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Fix the env coercion.** In `packages/provisioner/src/index.ts`, replace the constants at lines 18-21:

```ts
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'localhost';
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'wp-launcher-network';
const ENABLE_TLS = process.env.ENABLE_TLS === 'true';
const CERT_RESOLVER = process.env.CERT_RESOLVER || 'letsencrypt';
```

with:

```ts
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'localhost';
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'wp-launcher-network';
const ENABLE_TLS = process.env.ENABLE_TLS === 'true';
// `??` not `||`: an explicitly empty CERT_RESOLVER is meaningful — it selects
// wildcard mode, where Traefik already holds a certificate for the domain.
// `||` would silently turn that into 'letsencrypt' and request a cert per site.
const CERT_RESOLVER = process.env.CERT_RESOLVER ?? 'letsencrypt';
// Which network Traefik reaches site containers on. Empty for the bundled
// Traefik, which is configured with the network globally; set on Dokploy.
const TRAEFIK_NETWORK = process.env.TRAEFIK_NETWORK || '';
```

- [ ] **Step 7: Use the builder.** Still in `index.ts`, replace the inline `Labels:` map (lines 338-351) inside `docker.createContainer`:

```ts
        Labels: {
          'traefik.enable': 'true',
          [`traefik.http.routers.${opts.subdomain}.rule`]: `Host(\`${opts.subdomain}.${BASE_DOMAIN}\`)`,
          [`traefik.http.services.${opts.subdomain}.loadbalancer.server.port`]: '80',
          ...(ENABLE_TLS ? {
            [`traefik.http.routers.${opts.subdomain}.entrypoints`]: 'websecure',
            [`traefik.http.routers.${opts.subdomain}.tls`]: 'true',
            [`traefik.http.routers.${opts.subdomain}.tls.certresolver`]: CERT_RESOLVER,
          } : {}),
          'wp-launcher.managed': 'true',
          'wp-launcher.site-id': opts.subdomain,
          'wp-launcher.expires-at': opts.expiresAt,
          ...(dbContainerId ? { 'wp-launcher.db-container': dbContainerId } : {}),
        },
```

with:

```ts
        Labels: buildSiteLabels({
          subdomain: opts.subdomain,
          baseDomain: BASE_DOMAIN,
          enableTls: ENABLE_TLS,
          certResolver: CERT_RESOLVER,
          traefikNetwork: TRAEFIK_NETWORK,
          expiresAt: opts.expiresAt,
          dbContainerId,
        }),
```

Add the import at the top of `index.ts`, alongside the other local imports:

```ts
import { buildSiteLabels } from './site-labels';
```

- [ ] **Step 8: Typecheck and run the package tests.**

Run: `cd packages/provisioner && npx tsc --noEmit && npx vitest run`
Expected: no type errors; 6 tests pass.

- [ ] **Step 9: Prove the standalone default is byte-identical.** This refactor sits in the site-creation path, so confirm the emitted labels did not change for the existing deployment. Rebuild and launch a throwaway site, then inspect its labels:

```bash
docker compose build provisioner && docker compose up -d provisioner
```

Launch one site through the panel (or the API), then:

```bash
docker inspect $(docker ps --filter "label=wp-launcher.managed=true" --format "{{.Names}}" | head -1) \
  --format '{{json .Config.Labels}}'
```

Expected: `traefik.enable`, the router rule, the loadbalancer port, and the three `wp-launcher.*` labels exactly as before; **no** `traefik.docker.network` key (standalone leaves `TRAEFIK_NETWORK` unset). Delete the throwaway site afterwards.

- [ ] **Step 10: Commit.**

```bash
git add packages/provisioner/src/site-labels.ts packages/provisioner/src/site-labels.test.ts \
        packages/provisioner/vitest.config.ts packages/provisioner/package.json \
        packages/provisioner/package-lock.json packages/provisioner/src/index.ts
git commit -m "feat(provisioner): optional cert resolver and Traefik network label"
```

---

## Task 2: The Dokploy compose file

**Files:**
- Create: `docker-compose.dokploy.yml`

**Interfaces:**
- Consumes: Task 1's `TRAEFIK_NETWORK` env var and the blank-`CERT_RESOLVER` behaviour.
- Produces: the compose file Dokploy points at. Task 3's guide documents the variables it reads; Task 4 verifies it.

- [ ] **Step 1: Create the file.** Write `docker-compose.dokploy.yml` at the repo root:

```yaml
# WP Launcher on Dokploy.
#
# Differs from docker-compose.yml in four ways, all forced by the platform:
#   1. No Traefik service — Dokploy's Traefik owns :80/:443 and routes us by label.
#   2. Services join the external `dokploy-network`, the only network that
#      Traefik watches, and pin `traefik.docker.network` so multi-network
#      containers resolve correctly.
#   3. Nothing stateful lives in the repo checkout: Dokploy deletes `code/` on
#      every redeploy. State is a named volume, or under `../files/`.
#   4. No published host ports. The dashboard's nginx proxies /api/ to the API
#      internally, so the API never needs to face the host.
#
# See guides/dokploy-deployment.md for setup, including the absolute paths that
# PRODUCT_ASSETS_PATH and SITES_HOST_PATH must be given.

services:
  docker-proxy:
    image: tecnativa/docker-socket-proxy:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      CONTAINERS: 1
      IMAGES: 1
      NETWORKS: 1
      VOLUMES: 1
      EXEC: 1
      POST: 1
      BUILD: 1
      INFO: 1
      SYSTEM: 1
    networks:
      - provisioner-internal

  provisioner:
    build: ./packages/provisioner
    restart: unless-stopped
    environment:
      - DOCKER_HOST=tcp://docker-proxy:2375
      - DOCKER_API_VERSION=1.44
      - PORT=4000
      - INTERNAL_KEY=${PROVISIONER_INTERNAL_KEY:?Set PROVISIONER_INTERNAL_KEY}
      - BASE_DOMAIN=${BASE_DOMAIN:?Set BASE_DOMAIN}
      # Site containers must land where Dokploy's Traefik can see them.
      - DOCKER_NETWORK=dokploy-network
      - TRAEFIK_NETWORK=dokploy-network
      - CONTAINER_MEMORY=${CONTAINER_MEMORY:-268435456}
      - CONTAINER_CPU=${CONTAINER_CPU:-0.5}
      - WP_UPLOAD_LIMIT=${WP_UPLOAD_LIMIT:-2097152}
      - WP_DISK_QUOTA=${WP_DISK_QUOTA:-104857600}
      - ENABLE_TLS=${ENABLE_TLS:-true}
      # `-` not `:-`: an explicitly empty CERT_RESOLVER selects wildcard mode,
      # and `:-` would substitute the default for it.
      - CERT_RESOLVER=${CERT_RESOLVER-letsencrypt}
      - PRODUCT_ASSETS_PATH=${PRODUCT_ASSETS_PATH:?Set PRODUCT_ASSETS_PATH to an absolute host path}
      - SITES_HOST_PATH=${SITES_HOST_PATH:?Set SITES_HOST_PATH to an absolute host path}
      # Custom-domain routers are written here for Traefik's file provider.
      - CUSTOM_DOMAINS_DIR=/etc/traefik/dynamic/custom-domains
    volumes:
      - ${PRODUCT_ASSETS_PATH}:/product-assets
      - wpl-data:/app/data
      - /etc/dokploy/traefik/dynamic:/etc/traefik/dynamic
      - /proc:/host/proc:ro
    networks:
      - provisioner-internal
      - dokploy-network
    depends_on:
      - docker-proxy

  api:
    build: ./packages/api
    restart: unless-stopped
    volumes:
      - wpl-data:/app/data
      - ./blueprints:/app/blueprints
      - ./products:/app/products
      - ./templates:/app/templates
      - ${PRODUCT_ASSETS_PATH}:/app/product-assets
      - ./wordpress:/app/wordpress:ro
      - ./version.json:/app/version.json:ro
      - ${SITES_HOST_PATH}:/app/sites
    environment:
      - SITES_HOST_PATH=${SITES_HOST_PATH:?Set SITES_HOST_PATH to an absolute host path}
      - SITES_DIR=/app/sites
      - NODE_ENV=production
      - PORT=3737
      - API_KEY=${API_KEY:?Set API_KEY}
      - JWT_SECRET=${JWT_SECRET:?Set JWT_SECRET}
      - JWT_EXPIRES_IN=${JWT_EXPIRES_IN:-7d}
      - PUBLIC_URL=${PUBLIC_URL:?Set PUBLIC_URL, e.g. https://demo.example.com}
      - PROVISIONER_URL=http://provisioner:4000
      - PROVISIONER_INTERNAL_KEY=${PROVISIONER_INTERNAL_KEY:?Set PROVISIONER_INTERNAL_KEY}
      - CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS:-}
      - EMAIL_PROVIDER=${EMAIL_PROVIDER:-smtp}
      # No mailpit here: real SMTP is required for verification and invites.
      - SMTP_HOST=${SMTP_HOST:-}
      - SMTP_PORT=${SMTP_PORT:-587}
      - SMTP_SECURE=${SMTP_SECURE:-false}
      - SMTP_USER=${SMTP_USER:-}
      - SMTP_PASS=${SMTP_PASS:-}
      - SMTP_FROM=${SMTP_FROM:-WP Launcher <noreply@localhost>}
      - BREVO_API_KEY=${BREVO_API_KEY:-}
      - BASE_DOMAIN=${BASE_DOMAIN:?Set BASE_DOMAIN}
      - WP_IMAGE=${WP_IMAGE:-wp-launcher/wordpress:latest}
      - MAX_SITES_PER_USER=${MAX_SITES_PER_USER:-3}
      - CARD_LAYOUT=${CARD_LAYOUT:-full}
      - DATA_DIR=/app/data
      - BLUEPRINT_CONFIGS_DIR=/app/blueprints
      - PRODUCT_CONFIGS_DIR=/app/products
      - TEMPLATE_CONFIGS_DIR=/app/templates
    networks:
      - dokploy-network
    depends_on:
      - provisioner

  dashboard:
    build: ./packages/dashboard
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=dokploy-network"
      - "traefik.http.routers.wpl-dashboard.rule=Host(`${BASE_DOMAIN}`)"
      - "traefik.http.routers.wpl-dashboard.entrypoints=websecure"
      - "traefik.http.routers.wpl-dashboard.tls=true"
      - "traefik.http.routers.wpl-dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.services.wpl-dashboard.loadbalancer.server.port=80"
    networks:
      - dokploy-network
    depends_on:
      - api

  adminer:
    image: adminer:latest
    restart: unless-stopped
    volumes:
      - ./adminer/adminer.css:/var/www/html/adminer.css:ro
    environment:
      - ADMINER_DEFAULT_SERVER=localhost
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=dokploy-network"
      - "traefik.http.routers.wpl-adminer.rule=Host(`db.${BASE_DOMAIN}`)"
      - "traefik.http.routers.wpl-adminer.entrypoints=websecure"
      - "traefik.http.routers.wpl-adminer.tls=true"
      - "traefik.http.routers.wpl-adminer.tls.certresolver=letsencrypt"
      - "traefik.http.services.wpl-adminer.loadbalancer.server.port=8080"
    networks:
      - dokploy-network

networks:
  # Provided by Dokploy. Declared external so compose attaches rather than
  # creating its own — Traefik only watches this one.
  dokploy-network:
    external: true
  provisioner-internal:
    driver: bridge
    internal: true

volumes:
  # Named rather than a bind mount so Dokploy's volume backup covers the
  # database. `code/` is wiped on redeploy, so this must not live there.
  wpl-data:
```

Router names are prefixed `wpl-` so they cannot collide with routers Dokploy generates for other apps on the same Traefik.

- [ ] **Step 2: Verify it parses and every variable resolves.** Compose fails loudly on a missing `:?` variable, which is the point — a misconfigured deploy should not start:

```bash
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
BASE_DOMAIN=demo.example.com \
PUBLIC_URL=https://demo.example.com \
API_KEY=x JWT_SECRET=y PROVISIONER_INTERNAL_KEY=z \
PRODUCT_ASSETS_PATH=/etc/dokploy/compose/wpl/files/product-assets \
SITES_HOST_PATH=/etc/dokploy/compose/wpl/files/sites \
docker compose -f docker-compose.dokploy.yml config > /dev/null && echo "parses"
```
Expected: `parses`.

- [ ] **Step 3: Confirm the wildcard escape hatch survives compose.** The `-` vs `:-` distinction is the subtle part; check the rendered value is genuinely empty rather than defaulted:

```bash
BASE_DOMAIN=demo.example.com PUBLIC_URL=https://demo.example.com \
API_KEY=x JWT_SECRET=y PROVISIONER_INTERNAL_KEY=z \
PRODUCT_ASSETS_PATH=/tmp/a SITES_HOST_PATH=/tmp/s CERT_RESOLVER= \
docker compose -f docker-compose.dokploy.yml config | grep -A1 "CERT_RESOLVER"
```
Expected: an empty value. If it shows `letsencrypt`, the `:-` form was used by mistake and wildcard mode is unreachable.

- [ ] **Step 4: Confirm the default still resolves.**

```bash
BASE_DOMAIN=demo.example.com PUBLIC_URL=https://demo.example.com \
API_KEY=x JWT_SECRET=y PROVISIONER_INTERNAL_KEY=z \
PRODUCT_ASSETS_PATH=/tmp/a SITES_HOST_PATH=/tmp/s \
docker compose -f docker-compose.dokploy.yml config | grep "CERT_RESOLVER"
```
Expected: `letsencrypt`.

- [ ] **Step 5: Confirm no host ports and no Traefik service.**

```bash
grep -nE "^\s+ports:|traefik:" docker-compose.dokploy.yml || echo "none — correct"
```
Expected: `none — correct`.

- [ ] **Step 6: Commit.**

```bash
git add docker-compose.dokploy.yml
git commit -m "feat(deploy): Dokploy compose variant using Dokploy's Traefik"
```

---

## Task 3: Operator inputs and the deployment guide

**Files:**
- Create: `.env.dokploy.example`
- Create: `guides/dokploy-deployment.md`
- Modify: `CLAUDE.md` (Project Structure and Commands sections)

**Interfaces:**
- Consumes: every variable referenced by Task 2's compose file.
- Produces: no code. Task 4 follows this guide to verify the deployment.

- [ ] **Step 1: Create `.env.dokploy.example`.** These are pasted into Dokploy's Environment tab, not committed as a real `.env`:

```bash
# WP Launcher on Dokploy — paste into the app's Environment tab.
# See guides/dokploy-deployment.md.

# ─── Domain ──────────────────────────────────────────────────────────────────
# Sites are created as {subdomain}.BASE_DOMAIN, so BASE_DOMAIN needs a wildcard
# DNS A record (*.demo.example.com) pointing at this host, plus a record for the
# apex used by the panel itself.
BASE_DOMAIN=demo.example.com
PUBLIC_URL=https://demo.example.com

# ─── Secrets (generate: openssl rand -hex 32) ────────────────────────────────
API_KEY=
JWT_SECRET=
PROVISIONER_INTERNAL_KEY=

# ─── Absolute host paths ─────────────────────────────────────────────────────
# These are bind-mounted into WordPress containers by the host Docker daemon,
# so they must be paths on the HOST, not inside a container. Replace <app-name>
# with the Dokploy application name. They live under files/ because Dokploy
# deletes code/ on every redeploy.
PRODUCT_ASSETS_PATH=/etc/dokploy/compose/<app-name>/files/product-assets
SITES_HOST_PATH=/etc/dokploy/compose/<app-name>/files/sites

# ─── TLS ─────────────────────────────────────────────────────────────────────
ENABLE_TLS=true
# letsencrypt = one certificate per site via HTTP-01 (default; Let's Encrypt
#   allows 50 certificates per registered domain per week).
# empty       = a wildcard certificate is already loaded in Dokploy's Traefik;
#   sites are served from it with no per-site ACME request. Recommended in
#   production. Leave the value blank, do not delete the line.
CERT_RESOLVER=letsencrypt

# ─── Email (required: no mailpit on Dokploy) ─────────────────────────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=WP Launcher <noreply@demo.example.com>

# ─── Limits ──────────────────────────────────────────────────────────────────
CONTAINER_MEMORY=268435456
CONTAINER_CPU=0.5
MAX_SITES_PER_USER=3
```

- [ ] **Step 2: Write `guides/dokploy-deployment.md`.** It must cover, in this order:

1. **Prerequisites** — a Dokploy host; DNS with an apex record for `BASE_DOMAIN` and a wildcard `*.BASE_DOMAIN` A record at the same IP; an SMTP account.
2. **Create the app** — Dokploy → Project → Create Service → **Compose**; point at this Git repo; set **Compose Path** to `docker-compose.dokploy.yml`.
3. **Create the persistent directories before the first deploy**, because the compose file bind-mounts them and Docker would otherwise create them root-owned:
   ```bash
   mkdir -p /etc/dokploy/compose/<app-name>/files/product-assets
   mkdir -p /etc/dokploy/compose/<app-name>/files/sites
   ```
4. **Environment** — paste `.env.dokploy.example`, filling the secrets and replacing `<app-name>` in both paths.
5. **Deploy**, then build the WordPress base image once on the host, since sites cannot launch without it:
   ```bash
   cd /etc/dokploy/compose/<app-name>/code && bash scripts/build-wp-image.sh
   ```
   Note that after the first deploy this can also be done from the panel under **Settings → Images**.
6. **First run** — visit `https://BASE_DOMAIN`, complete the setup wizard to create the owner account.
7. **Wildcard TLS (recommended)** — how to add a DNS-01 resolver to Dokploy's Traefik static configuration and obtain `*.BASE_DOMAIN`, then set `CERT_RESOLVER=` (blank) and redeploy. State plainly why: the default requests one certificate per site and Let's Encrypt caps 50 per registered domain per week, after which new sites get no HTTPS.
8. **What survives a redeploy** — a table: `wpl-data` volume (database, secrets, snapshots) survives; `files/product-assets` and `files/sites` survive; everything in `code/` is replaced. Note that panel-created blueprints are stored in the database as well as on disk, so they survive the `code/` wipe.
9. **Security note — shared network.** State directly that site containers join `dokploy-network`, so a demo WordPress site can reach other applications hosted on the same Dokploy instance over the internal network, and that this is wider than the standalone install where sites are confined to `wp-launcher-network`. Give the hardening option — keep sites on their own network and run
   `docker network connect wp-launcher-network dokploy-traefik` — and its cost: Dokploy recreates Traefik on updates, dropping the attachment and silently breaking all site routing until the command is re-run.
10. **Differences from the standalone install** — no bundled Traefik, no mailpit (real SMTP required), no published API port, and the API is not exposed on `api.BASE_DOMAIN`; everything reaches it through the panel origin at `/api/`.
11. **Verify the deployment** — the checklist an operator runs on the Dokploy host after the first deploy, since none of it can be checked from a development machine:
    1. `https://BASE_DOMAIN` serves the panel, and `https://BASE_DOMAIN/api/settings` returns JSON — proving nginx reaches the API with no published port.
    2. A launched site answers at `https://{sub}.BASE_DOMAIN` with a valid certificate.
    3. `docker inspect` on that site container shows `traefik.docker.network=dokploy-network`.
    4. Setting a custom domain writes `/etc/dokploy/traefik/dynamic/custom-domains/{sub}.yml` and the domain routes. (Traefik's file provider does read that subdirectory — verified against v3.6.)
    5. **Redeploy the app, then confirm the owner account still logs in and existing sites are still listed.** This is the check that matters most: its failure mode is silent database loss, and it is the reason `data/` is a named volume rather than a path in the checkout.
12. **Troubleshooting** — three entries with a symptom, cause and fix: domain 404s (service not on `dokploy-network`, or `traefik.docker.network` missing); sites launch with empty `wp-content` (`SITES_HOST_PATH` is not an absolute host path); new sites have no HTTPS (Let's Encrypt weekly cap — switch to wildcard).

- [ ] **Step 3: Update `CLAUDE.md`.** In the Project Structure section, add the two new files beside the existing entries:

```
docker-compose.dokploy.yml  # Dokploy variant: no bundled Traefik, uses dokploy-network
.env.dokploy.example        # Environment template for Dokploy
```

And in the Commands section, add a deployment note:

```bash
# Deployment
bash install.sh                              # One-click VPS installer (standalone, bundles Traefik)
# Dokploy: create a Compose service pointing at docker-compose.dokploy.yml
# (uses Dokploy's Traefik; see guides/dokploy-deployment.md)
```

- [ ] **Step 4: Check the guide against the compose file.** Every variable the compose file requires must appear in the example, or a deploy fails at startup with a `:?` error:

```bash
grep -oE '\$\{[A-Z_]+' docker-compose.dokploy.yml | tr -d '${' | sort -u > /tmp/wpl-required.txt
grep -oE '^[A-Z_]+=' .env.dokploy.example | tr -d '=' | sort -u > /tmp/wpl-provided.txt
comm -23 /tmp/wpl-required.txt /tmp/wpl-provided.txt
```
Expected: only variables that have safe compose defaults (`WP_UPLOAD_LIMIT`, `WP_DISK_QUOTA`, `JWT_EXPIRES_IN`, `CORS_ALLOWED_ORIGINS`, `EMAIL_PROVIDER`, `BREVO_API_KEY`, `WP_IMAGE`, `CARD_LAYOUT`). Any variable marked `:?` in the compose file appearing here is a bug — add it to the example.

- [ ] **Step 5: Commit.**

```bash
git add .env.dokploy.example guides/dokploy-deployment.md CLAUDE.md
git commit -m "docs: Dokploy deployment guide and environment template"
```

---

## Task 4: Verify no regression to the standalone install

**Files:** none modified — this task is verification only.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: confidence that the standalone deployment still behaves exactly as before. The Dokploy path itself can only be fully verified on a real Dokploy host, which is out of scope here; this task covers everything verifiable locally.

- [ ] **Step 1: Full build of every service.**

```bash
docker compose build api provisioner dashboard
```
Expected: all three build with no TypeScript errors.

- [ ] **Step 2: Bring the standalone stack up and confirm it is healthy.**

```bash
docker compose up -d
docker compose ps --format "table {{.Service}}\t{{.State}}"
```
Expected: every service `running`, Traefik included — the standalone file is untouched.

- [ ] **Step 3: Launch a site and confirm routing still works end to end.** Create one site through the panel, then check it answers through Traefik:

```bash
SUB=$(docker ps --filter "label=wp-launcher.managed=true" --format "{{.Label \"wp-launcher.site-id\"}}" | head -1)
echo "site: $SUB"
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: ${SUB}.localhost" http://localhost/
```
Expected: `200` (or `302`). A `404` means Traefik did not pick up the router — the label refactor broke something.

- [ ] **Step 4: Confirm the emitted labels are unchanged for standalone.**

```bash
docker inspect "wp-site-${SUB}" --format '{{json .Config.Labels}}' | tr ',' '\n' | grep -E "traefik|wp-launcher"
```
Expected: `traefik.enable`, the router rule, the loadbalancer port, and the three `wp-launcher.*` labels. There must be **no** `traefik.docker.network` key and — with `ENABLE_TLS` unset locally — no `tls` keys.

- [ ] **Step 5: Delete the test site** through the panel, and confirm the container is gone:

```bash
docker ps --filter "label=wp-launcher.managed=true" --format "{{.Names}}"
```
Expected: the throwaway site is absent (the cleanup cron removes it within ~60s).

- [ ] **Step 6: Run the full API suite one more time**, since Task 1 rebuilt the provisioner image the API talks to:

```bash
cd packages/api && npx vitest run
```
Expected: all tests pass.

- [ ] **Step 7: Commit nothing, report.** This task produces no diff. Report the outcome of steps 1-6; if step 3 or 4 failed, the label refactor from Task 1 regressed the standalone deployment and must be fixed before this work is considered done.

---

## Notes for the implementer

- **The riskiest change is Task 1's label extraction**, because it sits in the site-creation path that every deployment depends on. The default-case assertions in Task 1 Step 9 and Task 4 Step 4 exist specifically to prove the standalone output did not shift. Do not skip them.
- **Two layers swallow an empty `CERT_RESOLVER`.** TypeScript's `||` (fixed with `??` in Task 1) and compose's `${VAR:-default}` (fixed with `${VAR-default}` in Task 2). Fixing one without the other leaves wildcard mode silently unreachable, and the symptom — sites still requesting individual certificates — looks like a Traefik problem rather than a config-parsing one.
- **The Dokploy path cannot be fully verified from this machine.** Task 4 covers regression to the standalone install and static validation of the compose file. Routing, persistence across redeploy, and TLS on Dokploy need a real Dokploy host, and the guide's checklist is what an operator follows there.
- **`code/` being wiped on redeploy is the failure mode with the worst consequences** — silent database loss. If anything about the volume layout is changed, re-check that `wpl-data` is still a named volume and that no stateful path resolves inside the checkout.
