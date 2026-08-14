# Dokploy Network Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop WordPress site containers from reaching other applications on the Dokploy instance, by putting a second Traefik between Dokploy's Traefik and a private site network.

**Architecture:** Our compose file gains a `wpl-traefik` service that joins both `dokploy-network` and a new private `wpl-sites` network. Dokploy's Traefik terminates TLS with the existing wildcard certificate and forwards every `*.BASE_DOMAIN` request to ours via one low-priority catch-all router; ours routes by host to site containers on `wpl-sites`. Existing sites keep working because their higher-priority per-site routers still win at the Dokploy tier.

**Tech Stack:** Docker Compose, Traefik v3.6, `tecnativa/docker-socket-proxy`, Node.js/TypeScript (provisioner), vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-dokploy-network-isolation-design.md`

## Global Constraints

- Target file for all compose changes is `docker-compose.dokploy.yml`. **Never** modify `docker-compose.yml` (the standalone install) — it is not affected by this work.
- Every new Docker network MUST declare an explicit `name:` matching its key. Compose otherwise prefixes networks with the project name, and the provisioner's `DOCKER_NETWORK` value would no longer match a real network.
- The inner tier is plain HTTP. TLS terminates once, at Dokploy's Traefik.
- Do not add Traefik `certresolver` labels to anything on the inner tier.
- Secrets must never be committed. Basic-auth credentials come from an env var referenced by a compose label, not from a checked-in dynamic config file.
- This plan changes deployment configuration that cannot be fully exercised locally. Where a step cannot be verified by a test, it is verified by `docker compose config` plus an explicit item on the VPS checklist in Task 4. Do not claim a compose change is "tested" on the strength of `config` alone.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/provisioner/src/db-password.ts` | **Create.** Single function generating a site database password. Extracted so it is unit-testable; the current expression is buried inside a 200-line container-creation function. |
| `packages/provisioner/src/db-password.test.ts` | **Create.** Tests for the above. |
| `packages/provisioner/src/index.ts` | **Modify.** Line 187 calls the new function instead of building a derived string. |
| `docker-compose.dokploy.yml` | **Modify.** New networks, new `wpl-traefik` and `traefik-docker-proxy` services, revised network membership for `api`/`provisioner`/`adminer`/`dashboard`, revised provisioner env. |
| `.env.dokploy.example` | **Modify.** Add `BASE_DOMAIN_REGEX`, `TRAEFIK_TRUSTED_IPS`, `ADMINER_AUTH_USERS`; remove `ENABLE_TLS`/`CERT_RESOLVER`, which are no longer operator knobs. |
| `guides/dokploy-deployment.md` | **Modify.** Replace the "sites share Dokploy's network" section, add setup steps for the new variables, the post-deploy verification checklist, the migration note for existing sites, and the documented follow-ups. |

**Not created:** a Traefik dynamic-config file for basic auth. The middleware is declared as labels on the `adminer` service so the credential comes from an environment variable and stays out of git.

**Not added:** new `buildSiteLabels` tests. `packages/provisioner/src/site-labels.test.ts` already covers every combination this change relies on — its `base` fixture is `enableTls: false` with `certResolver: 'letsencrypt'`, and the existing "omits all TLS labels when TLS is off" and "pins the Traefik network only when one is configured" cases assert exactly the behaviour the new deployment depends on. Adding more would duplicate coverage.

---

### Task 1: Unguessable database passwords

Site database passwords are currently `wp_${subdomain}_${Date.now().toString(36)}`. The subdomain is the site's public hostname, so the only secret is a millisecond timestamp — brute-forceable by any container that can reach port 3306.

**Files:**
- Create: `packages/provisioner/src/db-password.ts`
- Create: `packages/provisioner/src/db-password.test.ts`
- Modify: `packages/provisioner/src/index.ts:187`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `generateDbPassword(): string` exported from `packages/provisioner/src/db-password.ts`. No parameters. Returns a URL-safe string of at least 32 characters.

- [ ] **Step 1: Write the failing test**

Create `packages/provisioner/src/db-password.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateDbPassword } from './db-password';

describe('generateDbPassword', () => {
  it('returns a long, URL-safe string', () => {
    const pw = generateDbPassword();
    expect(pw.length).toBeGreaterThanOrEqual(32);
    expect(pw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('does not derive from the subdomain or a timestamp', () => {
    // The old scheme was `wp_${subdomain}_${Date.now().toString(36)}`, which
    // leaked the password to anyone who knew the site's public hostname.
    const pw = generateDbPassword();
    expect(pw).not.toContain('wp_');
    expect(pw).not.toContain(Date.now().toString(36).slice(0, 6));
  });

  it('differs between calls', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateDbPassword()));
    expect(seen.size).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/provisioner && npx vitest run src/db-password.test.ts`
Expected: FAIL — `Failed to resolve import "./db-password"`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/provisioner/src/db-password.ts`:

```ts
import crypto from 'crypto';

/**
 * A site's database password.
 *
 * Must not be derivable from anything an attacker can see. The previous scheme
 * combined the subdomain — which is the site's public hostname — with a
 * millisecond timestamp, leaving a search space small enough to brute-force
 * from any container that could reach the sidecar's port 3306.
 */
export function generateDbPassword(): string {
  return crypto.randomBytes(24).toString('base64url');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/provisioner && npx vitest run src/db-password.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Use it in the provisioner**

In `packages/provisioner/src/index.ts`, add to the imports at the top of the file:

```ts
import { generateDbPassword } from './db-password';
```

Then replace line 187:

```ts
    const dbPassword = `wp_${opts.subdomain}_${Date.now().toString(36)}`;
```

with:

```ts
    const dbPassword = generateDbPassword();
```

Change nothing else. `MYSQL_PASSWORD` (line 217) and `WORDPRESS_DB_PASSWORD` (line 251) already consume this variable, and the `/containers/:id/db-credentials` endpoint (line 504) reads the value back out of the container's environment rather than re-deriving it — so running sites are unaffected and no migration is needed.

- [ ] **Step 6: Verify the whole suite and the types**

Run: `cd packages/provisioner && npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no TypeScript output.

- [ ] **Step 7: Commit**

```bash
git add packages/provisioner/src/db-password.ts packages/provisioner/src/db-password.test.ts packages/provisioner/src/index.ts
git commit -m "fix(provisioner): generate random site database passwords

The password was wp_<subdomain>_<base36 timestamp>. The subdomain is the
site's public hostname, so the only secret was a millisecond value — weak
enough to brute-force from any container that could reach port 3306.

Credentials are read back from container env rather than re-derived, so
existing sites keep working."
```

---

### Task 2: Private site network behind our own Traefik

**Files:**
- Modify: `docker-compose.dokploy.yml`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: a Docker network literally named `wpl-sites`, and a `wpl-traefik` service reachable at `wpl-traefik:80` from `dokploy-network`. Task 3 attaches Adminer to both.

- [ ] **Step 1: Add the new networks**

Replace the `networks:` block at the bottom of `docker-compose.dokploy.yml`:

```yaml
networks:
  # Provided by Dokploy. Declared external so compose attaches rather than
  # creating its own — Traefik only watches this one.
  dokploy-network:
    external: true

  # Site containers and the things that must talk to them. NOT `internal`:
  # sites need outbound internet to install plugins from wordpress.org.
  #
  # `name:` is mandatory. Without it compose creates `<project>_wpl-sites`,
  # and the provisioner's DOCKER_NETWORK would name a network that does not
  # exist.
  wpl-sites:
    driver: bridge
    name: wpl-sites

  # Control plane. The API reaches the provisioner here; sites cannot.
  wpl-control:
    driver: bridge
    internal: true
    name: wpl-control

  provisioner-internal:
    driver: bridge
    internal: true

  # Isolates Traefik's read-only view of the Docker API from the
  # provisioner's read-write one.
  traefik-internal:
    driver: bridge
    internal: true
```

- [ ] **Step 2: Add Traefik's own read-only socket proxy**

Add as a new service. It must not reuse the existing `docker-proxy`, which has `EXEC`, `POST` and `BUILD` enabled — Traefik needs none of those.

```yaml
  traefik-docker-proxy:
    image: tecnativa/docker-socket-proxy:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      # Read-only. Traefik only needs to see containers and their labels.
      CONTAINERS: 1
      NETWORKS: 1
      INFO: 1
      POST: 0
      EXEC: 0
      BUILD: 0
      IMAGES: 0
      VOLUMES: 0
    networks:
      - traefik-internal
```

- [ ] **Step 3: Add our Traefik**

Add as a new service:

```yaml
  wpl-traefik:
    image: traefik:v3.6
    restart: unless-stopped
    command:
      - "--entrypoints.web.address=:80"
      # Dokploy's Traefik terminates TLS and sets X-Forwarded-Proto: https.
      # Traefik OVERWRITES that header for requests it does not trust, and
      # wordpress/wp-config-docker.php only turns HTTPS on when it reads
      # `https`. Get this wrong and every site redirect-loops.
      - "--entrypoints.web.forwardedheaders.trustedips=${TRAEFIK_TRUSTED_IPS:?Set TRAEFIK_TRUSTED_IPS to the dokploy-network subnet}"
      - "--providers.docker=true"
      - "--providers.docker.endpoint=tcp://traefik-docker-proxy:2375"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=wpl-sites"
      - "--api.dashboard=false"
      - "--log.level=INFO"
    labels:
      # Read by DOKPLOY's Traefik, not ours. One catch-all router for every
      # site subdomain, forwarded as plain HTTP.
      - "traefik.enable=true"
      - "traefik.docker.network=dokploy-network"
      - "traefik.http.routers.wpl-sites.rule=HostRegexp(`${BASE_DOMAIN_REGEX:?Set BASE_DOMAIN_REGEX}`)"
      # Lower than any default-priority router, so the per-site routers that
      # already-running sites carry keep winning. This is what makes the
      # rollout safe for existing sites.
      - "traefik.http.routers.wpl-sites.priority=1"
      - "traefik.http.routers.wpl-sites.entrypoints=websecure"
      - "traefik.http.routers.wpl-sites.tls=true"
      - "traefik.http.services.wpl-sites.loadbalancer.server.port=80"
    networks:
      - dokploy-network
      - wpl-sites
      - traefik-internal
    depends_on:
      - traefik-docker-proxy
```

Note there is no `tls.certresolver`: the wildcard certificate is already loaded in Dokploy's Traefik, and a resolver here would trigger per-site ACME requests against Let's Encrypt's 50-per-week limit.

- [ ] **Step 4: Move the provisioner off `dokploy-network`**

In the `provisioner` service, replace the three routing-related environment lines:

```yaml
      - DOCKER_NETWORK=dokploy-network
      - TRAEFIK_NETWORK=dokploy-network
```

with:

```yaml
      # Sites land on the private network, routed by wpl-traefik.
      - DOCKER_NETWORK=wpl-sites
      - TRAEFIK_NETWORK=wpl-sites
```

Replace the `ENABLE_TLS` and `CERT_RESOLVER` lines:

```yaml
      - ENABLE_TLS=${ENABLE_TLS:-true}
      # `-` not `:-`: an explicitly empty CERT_RESOLVER selects wildcard mode,
      # and `:-` would substitute the default for it.
      - CERT_RESOLVER=${CERT_RESOLVER-letsencrypt}
```

with:

```yaml
      # The inner tier is plain HTTP; TLS terminates once, at Dokploy's
      # Traefik. Not an operator knob any more, so it is not read from env.
      - ENABLE_TLS=false
```

Then replace the provisioner's `networks:` block:

```yaml
    networks:
      - provisioner-internal
      - dokploy-network
```

with:

```yaml
    networks:
      - provisioner-internal
      - wpl-control
```

The provisioner now sits only on `internal` networks and has no outbound internet. That is correct: it requests image pulls through the Docker API and the *daemon* performs them.

- [ ] **Step 5: Move the API onto the site and control networks**

In the `api` service, replace:

```yaml
    networks:
      - dokploy-network
```

with:

```yaml
    networks:
      # Reaches the provisioner, and is reached by the dashboard's nginx.
      - wpl-control
      # Needed to probe site containers for readiness, and for egress
      # (SMTP, wordpress.org).
      - wpl-sites
```

The API is now off `dokploy-network` entirely; its only public path is through the dashboard's nginx, which was always the intent.

- [ ] **Step 6: Give the dashboard a path to the API**

In the `dashboard` service, replace:

```yaml
    networks:
      - dokploy-network
```

with:

```yaml
    networks:
      # Routed by Dokploy's Traefik at the apex domain.
      - dokploy-network
      # Its nginx proxies /api/ to api:3737.
      - wpl-control
```

- [ ] **Step 7: Validate the compose file**

`docker compose config` fails on any `:?` variable that is unset *or empty*, so `.env.dokploy.example` cannot be used directly. Build a throwaway env file:

```bash
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
cat > /tmp/dokploy-validate.env <<'ENVEOF'
BASE_DOMAIN=wplauncher.xyz
BASE_DOMAIN_REGEX=^.+\.wplauncher\.xyz$
PUBLIC_URL=https://wplauncher.xyz
API_KEY=x
JWT_SECRET=x
PROVISIONER_INTERNAL_KEY=x
PRODUCT_ASSETS_PATH=/tmp/pa
SITES_HOST_PATH=/tmp/sites
TRAEFIK_TRUSTED_IPS=10.0.0.0/8
ADMINER_AUTH_USERS=admin:$2y$05$abcdefghijklmnopqrstuv
ENVEOF
docker compose -f docker-compose.dokploy.yml --env-file /tmp/dokploy-validate.env config > /dev/null && echo "compose OK"
```

Expected: `compose OK` and no warnings about undefined variables.

- [ ] **Step 8: Confirm the network names are not project-prefixed**

Run:

```bash
docker compose -f docker-compose.dokploy.yml --env-file /tmp/dokploy-validate.env config | grep -A3 -E "^  (wpl-sites|wpl-control):"
```

Expected: each block contains `name: wpl-sites` / `name: wpl-control`. If a `name:` is missing the provisioner will attach containers to a network that does not exist, and every launch will fail.

- [ ] **Step 9: Commit**

```bash
git add docker-compose.dokploy.yml
git commit -m "feat(dokploy): isolate site containers behind our own Traefik

Sites joined dokploy-network, so a compromised WordPress site could reach
every other app on the instance. Add a wpl-traefik service bridging
dokploy-network and a private wpl-sites network, and move sites, the API
and the provisioner off the shared network.

A low-priority catch-all router means existing sites' per-site routers
still win, so this needs no downtime and no migration."
```

---

### Task 3: Close the open Adminer console

`db.BASE_DOMAIN` currently serves Adminer with no authentication. Adminer's login form accepts an arbitrary server address, so anyone on the internet can use it as a console against any host reachable from the network it sits on.

**Files:**
- Modify: `docker-compose.dokploy.yml`

**Interfaces:**
- Consumes: the `wpl-traefik` service and `wpl-sites` network from Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Re-home and protect Adminer**

Replace the whole `adminer` service in `docker-compose.dokploy.yml` with:

```yaml
  adminer:
    image: adminer:latest
    restart: unless-stopped
    volumes:
      - ./adminer/adminer.css:/var/www/html/adminer.css:ro
    environment:
      - ADMINER_DEFAULT_SERVER=localhost
    labels:
      # Read by OUR Traefik. db.BASE_DOMAIN already matches the catch-all
      # router at the Dokploy tier, so nothing is configured there.
      - "traefik.enable=true"
      - "traefik.docker.network=wpl-sites"
      - "traefik.http.routers.wpl-adminer.rule=Host(`db.${BASE_DOMAIN}`)"
      - "traefik.http.routers.wpl-adminer.entrypoints=web"
      - "traefik.http.routers.wpl-adminer.middlewares=wpl-adminer-auth"
      # Adminer connects to any host you type into its form. Unauthenticated,
      # that makes it an open console against everything on this network.
      - "traefik.http.middlewares.wpl-adminer-auth.basicauth.users=${ADMINER_AUTH_USERS:?Set ADMINER_AUTH_USERS}"
      - "traefik.http.services.wpl-adminer.loadbalancer.server.port=8080"
    networks:
      # Where the site databases it exists to talk to now live.
      - wpl-sites
```

The service no longer carries `tls` or `certresolver` labels — TLS terminated at the Dokploy tier — and no longer joins `dokploy-network`.

- [ ] **Step 2: Validate the compose file**

Run (reusing the env file from Task 2, Step 7; recreate it if absent):

```bash
docker compose -f docker-compose.dokploy.yml --env-file /tmp/dokploy-validate.env config > /dev/null && echo "compose OK"
```

Expected: `compose OK`.

- [ ] **Step 3: Confirm Adminer is off the shared network and has auth**

```bash
docker compose -f docker-compose.dokploy.yml --env-file /tmp/dokploy-validate.env config \
  | sed -n '/^  adminer:/,/^  [a-z]/p' | grep -E "dokploy-network|basicauth"
```

Expected: a `basicauth.users` line, and **no** `dokploy-network` line. If `dokploy-network` appears, Adminer can still reach your other applications.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.dokploy.yml
git commit -m "fix(dokploy): require auth for Adminer and take it off the shared network

Adminer was routed publicly with no authentication. Its login form takes an
arbitrary server address, so anyone who found db.<domain> could use it as a
console against any host on dokploy-network.

It now sits on wpl-sites behind a basicauth middleware."
```

---

### Task 4: Operator-facing configuration and documentation

Three new environment variables are required for a deploy to succeed, and the guide currently tells operators the opposite of what is now true.

**Files:**
- Modify: `.env.dokploy.example`
- Modify: `guides/dokploy-deployment.md`

**Interfaces:**
- Consumes: variable names introduced in Tasks 2 and 3 — `BASE_DOMAIN_REGEX`, `TRAEFIK_TRUSTED_IPS`, `ADMINER_AUTH_USERS`.
- Produces: nothing.

- [ ] **Step 1: Update the environment template**

In `.env.dokploy.example`, replace the entire `# ─── TLS ───` block:

```
# ─── TLS ─────────────────────────────────────────────────────────────────────
ENABLE_TLS=true
# letsencrypt = one certificate per site via HTTP-01 (default; Let's Encrypt
#   allows 50 certificates per registered domain per week).
# empty       = a wildcard certificate is already loaded in Dokploy's Traefik;
#   sites are served from it with no per-site ACME request. Recommended in
#   production. Leave the value blank, do not delete the line.
CERT_RESOLVER=letsencrypt
```

with:

```
# ─── Routing and TLS ─────────────────────────────────────────────────────────
# TLS terminates once, at Dokploy's Traefik, using a wildcard certificate for
# *.BASE_DOMAIN. That wildcard is REQUIRED — see section 6. Sites sit behind a
# second Traefik on a private network and speak plain HTTP to it, so there is
# no per-site certificate and no ENABLE_TLS/CERT_RESOLVER knob any more.

# A Go regular expression matching every site hostname. It cannot be derived
# from BASE_DOMAIN automatically because the dots must be escaped. If your
# domain is example.com, use ^.+\.example\.com$
BASE_DOMAIN_REGEX=^.+\.wplauncher\.xyz$

# The dokploy-network subnet, so our Traefik trusts the X-Forwarded-Proto
# header Dokploy's Traefik sets. If this is wrong, WordPress believes requests
# are plain HTTP and every site redirect-loops. Find it with:
#   docker network inspect dokploy-network -f '{{(index .IPAM.Config 0).Subnet}}'
TRAEFIK_TRUSTED_IPS=10.0.0.0/8

# Basic-auth credential guarding Adminer at db.BASE_DOMAIN. Generate with:
#   htpasswd -nbB admin 'your-password'
ADMINER_AUTH_USERS=

# NOTE: BASE_DOMAIN_REGEX and ADMINER_AUTH_USERS both contain `$` characters
# (the regex anchor, and the `$2y$` bcrypt prefix). Enter them exactly as
# shown. If Adminer rejects a correct password, or the site router never
# matches, your platform ate the `$` — double each one (`$$`) and redeploy.
```

- [ ] **Step 2: Replace the security section of the guide**

In `guides/dokploy-deployment.md`, replace the section that begins `## Security: sites share Dokploy's network` and everything up to (but not including) the next `##` heading, with:

```markdown
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

Adminer at `db.BASE_DOMAIN` requires the basic-auth credential in
`ADMINER_AUTH_USERS`. It sits on the site network, so it can still reach every
site database — do not disable that middleware.

### Custom domains are not supported on Dokploy yet

A custom domain needs a router at Dokploy's tier forwarding to `wpl-traefik`
plus a matching host router at ours, and its certificate cannot come from the
wildcard. That plumbing is not built. Sites on `*.BASE_DOMAIN` are unaffected.
```

- [ ] **Step 3: Add the new variables to the setup steps**

In `guides/dokploy-deployment.md`, find section 6 (`## 6. Wildcard TLS`) and append to the end of it:

```markdown
The wildcard is now **required**, not merely recommended: site containers are
no longer visible to Dokploy's Traefik individually, so per-site HTTP-01 cannot
work. Traefik cannot derive ACME domains from a regexp rule.

Three variables must be set in the Environment tab alongside it:

| Variable | How to get it |
|---|---|
| `BASE_DOMAIN_REGEX` | Escape the dots in your domain: `^.+\.wplauncher\.xyz$` |
| `TRAEFIK_TRUSTED_IPS` | `docker network inspect dokploy-network -f '{{(index .IPAM.Config 0).Subnet}}'` |
| `ADMINER_AUTH_USERS` | `htpasswd -nbB admin 'your-password'` |

`ENABLE_TLS` and `CERT_RESOLVER` are no longer read; remove them if present.
```

- [ ] **Step 4: Replace the verification checklist**

In `guides/dokploy-deployment.md`, replace the numbered list under `## Verify the deployment` with:

```markdown
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
   Adminer's form.

7. A site created before this change still loads, confirming the two tiers
   coexist.
```

- [ ] **Step 5: Check the guide has no stale references**

Run:

```bash
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
grep -n "CERT_RESOLVER\|ENABLE_TLS\|docker network connect" guides/dokploy-deployment.md .env.dokploy.example
```

Expected: no output. Any hit is a leftover instruction that now contradicts the design — in particular the old `docker network connect wp-launcher-network dokploy-traefik` workaround, which this work replaces.

- [ ] **Step 6: Commit**

```bash
git add .env.dokploy.example guides/dokploy-deployment.md
git commit -m "docs(dokploy): document network isolation and its new variables

BASE_DOMAIN_REGEX, TRAEFIK_TRUSTED_IPS and ADMINER_AUTH_USERS are now
required. ENABLE_TLS and CERT_RESOLVER are gone: TLS terminates once at
Dokploy's Traefik and the wildcard certificate is mandatory.

Records that sites created before this change stay on the shared network
until relaunched, and that custom domains are unsupported for now."
```

---

## Done when

- `cd packages/provisioner && npx vitest run` passes.
- `docker compose -f docker-compose.dokploy.yml --env-file <filled> config` succeeds.
- All seven items on the verification checklist pass on the VPS.

Items 2, 4 and 5 of that checklist are the ones that actually prove the feature. Do not report this work as complete on the strength of the unit tests and `compose config` alone — neither can observe network reachability.
