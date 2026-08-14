# Dokploy Self-Contained TLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move TLS termination from Dokploy's Traefik to WP Launcher's own, so every requirement is declared in our compose file and a fresh install needs no DNS credentials.

**Architecture:** Dokploy's Traefik stops decrypting site traffic. A TCP router with `tls.passthrough` selects `*.BASE_DOMAIN` by SNI and forwards the raw stream to `wpl-traefik:443`; a plain HTTP router forwards `:80` for ACME challenges. Both are labels on our own service, so nothing lives on the host. Our Traefik gains a `websecure` entrypoint and an ACME resolver named `wpl`, defaulting to per-site HTTP-01 and switching to wildcard DNS-01 when `ACME_DNS_PROVIDER` is set.

**Tech Stack:** Docker Compose, Traefik v3.6, Let's Encrypt (HTTP-01 and DNS-01).

**Spec:** `docs/superpowers/specs/2026-08-15-dokploy-self-contained-tls-design.md`

## Global Constraints

- All changes are in `docker-compose.dokploy.yml`, `.env.dokploy.example`, `guides/dokploy-deployment.md` and `CLAUDE.md`. **No TypeScript changes are needed** — `packages/provisioner/src/site-labels.ts` already emits the required labels for the standalone install, and this makes Dokploy use the same ones.
- **Never** modify `docker-compose.yml` (standalone). It is unaffected.
- Every shell `$` inside a compose `entrypoint` must be written `$$`. Compose interpolates single `$` and silently eats the variable.
- The ACME resolver is named `wpl` in both certificate modes.
- `acme.json` must live on a **named volume**, never under `code/`, which Dokploy deletes and re-clones on every redeploy.
- The HTTP router forwarding `:80` must carry **no** redirect-to-https middleware, or ACME challenges cannot complete.

## Verified before writing

Both mechanisms this plan depends on were tested against Traefik v3.6 locally:

1. **SNI passthrough coexists with the outer proxy's HTTP routers** on the same `:443` entrypoint — one host reached a backend behind an inner Traefik via `tls.passthrough=true` while another was served by the outer's own HTTP router, concurrently.
2. **The inner Traefik sets `X-Forwarded-Proto: https` itself**, with no `trustedIPs` configuration, because it terminates TLS and knows the scheme first-hand.
3. **The runtime mode switch works.** With `ACME_DNS_PROVIDER` unset Traefik loaded `"httpChallenge":{"entryPoint":"web"}` and no `domains`; with it set to `cloudflare` it loaded `"dnsChallenge":{"provider":"cloudflare"}` and `"domains":[{"main":"…","sans":["*.…"]}]`.

---

## File Structure

| File | Responsibility |
|---|---|
| `docker-compose.dokploy.yml` | **Modify.** `wpl-traefik` gains a `websecure` entrypoint, the `wpl` ACME resolver, a mode-selecting entrypoint script and an `acme` volume; its labels change from an HTTP catch-all to TCP passthrough plus an HTTP challenge router; the provisioner's TLS env returns to standalone semantics; `TRAEFIK_TRUSTED_IPS` disappears. |
| `.env.dokploy.example` | **Modify.** Remove `TRAEFIK_TRUSTED_IPS` and `WILDCARD_CERT_RESOLVER`; add `ACME_EMAIL` and the optional `ACME_DNS_PROVIDER`. |
| `guides/dokploy-deployment.md` | **Modify.** Replace section 6 (wildcard now optional, no host edits), add the upgrade/relaunch notice, rewrite the verification checklist. |
| `CLAUDE.md` | **Modify.** The Dokploy summary describes upstream TLS termination and is now wrong. |

**No test files change.** `packages/provisioner/src/site-labels.test.ts` already covers the configuration both modes use — its case *"leaves the certificate to a preloaded wildcard when the resolver is blank"* asserts exactly `entrypoints=websecure` + `tls=true` with no `certresolver`. Do not add a test for a per-site `certresolver` label; none is emitted any more.

---

### Task 1: Our Traefik terminates TLS

**Files:**
- Modify: `docker-compose.dokploy.yml` (the `wpl-traefik` service and the `volumes:` block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `wpl-traefik` listening on `:443` (TLS, certificates from the `wpl` resolver) and `:80`, reachable at those ports from `dokploy-network`. Task 2 points Dokploy's Traefik at them.

- [ ] **Step 1: Add the ACME storage volume**

In the `volumes:` block at the end of `docker-compose.dokploy.yml`, add alongside `wpl-data`:

```yaml
  # Certificates. A named volume rather than a path in the checkout: Dokploy
  # deletes code/ on every redeploy, which would discard every certificate and
  # exhaust Let's Encrypt's rate limit within days.
  wpl-acme:
```

- [ ] **Step 2: Replace the `wpl-traefik` command block**

Replace the service's entire `command:` list with the following. The `entrypoint` is new; it appends the challenge-specific flags at start-up because a compose `command` is a fixed list and the challenge type depends on configuration.

```yaml
    entrypoint:
      # Traefik's static config is a fixed flag list, but the ACME challenge
      # type depends on whether a DNS provider was configured. Append those
      # flags here rather than shipping two compose files.
      #
      # Every `$` below is written `$$`: compose interpolates a single `$` and
      # would replace these shell variables with empty strings.
      - /bin/sh
      - -c
      - |
        if [ -n "$${ACME_DNS_PROVIDER:-}" ]; then
          exec traefik "$$@" \
            --certificatesresolvers.wpl.acme.dnschallenge.provider="$$ACME_DNS_PROVIDER" \
            "--entrypoints.websecure.http.tls.domains[0].main=$$BASE_DOMAIN" \
            "--entrypoints.websecure.http.tls.domains[0].sans=*.$$BASE_DOMAIN"
        fi
        exec traefik "$$@" --certificatesresolvers.wpl.acme.httpchallenge.entrypoint=web
      - "--"
    command:
      - "--entrypoints.web.address=:80"
      # We terminate TLS now. Dokploy's Traefik forwards the raw stream to us.
      - "--entrypoints.websecure.address=:443"
      # Issuance is driven from the entrypoint, not per-router labels, so site
      # containers need no certresolver label and the certificate mode can be
      # changed without relaunching anything.
      - "--entrypoints.websecure.http.tls.certresolver=wpl"
      - "--certificatesresolvers.wpl.acme.email=${ACME_EMAIL:?Set ACME_EMAIL}"
      - "--certificatesresolvers.wpl.acme.storage=/acme/acme.json"
      - "--providers.docker=true"
      - "--providers.docker.endpoint=tcp://traefik-docker-proxy:2375"
      # Select by our own label rather than `traefik.enable`, which every
      # container on this host sets for Dokploy's Traefik.
      - "--providers.docker.exposedbydefault=true"
      - "--providers.docker.constraints=Label(`wp-launcher.routable`,`true`)"
      - "--providers.docker.network=wpl-sites"
      - "--api.dashboard=false"
      - "--log.level=INFO"
    environment:
      # Read by the entrypoint above. Empty means per-site HTTP-01.
      - ACME_DNS_PROVIDER=${ACME_DNS_PROVIDER:-}
      - BASE_DOMAIN=${BASE_DOMAIN:?Set BASE_DOMAIN}
```

Note what is **gone**: the `--entrypoints.web.forwardedheaders.trustedips=…` flag. Our Traefik now terminates TLS and sets `X-Forwarded-Proto` from first-hand knowledge, so there is nothing to trust and nothing to misconfigure.

- [ ] **Step 3: Mount the ACME volume**

Add to the `wpl-traefik` service:

```yaml
    volumes:
      - wpl-acme:/acme
```

- [ ] **Step 4: Pass DNS provider credentials through**

Still in `wpl-traefik`, extend the `environment:` list added in Step 2 with the common provider credentials, so no provider-specific code is needed:

```yaml
      # Credentials for ACME_DNS_PROVIDER, named exactly as Traefik's docs
      # require. Unset ones are harmless; add others as needed.
      - CF_DNS_API_TOKEN=${CF_DNS_API_TOKEN:-}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-}
      - AWS_REGION=${AWS_REGION:-}
      - DO_AUTH_TOKEN=${DO_AUTH_TOKEN:-}
```

- [ ] **Step 5: Validate the file parses**

```bash
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
cat > /tmp/tls-validate.env <<'ENVEOF'
BASE_DOMAIN=wplauncher.xyz
BASE_DOMAIN_REGEX=^.+\.wplauncher\.xyz$
PUBLIC_URL=https://wplauncher.xyz
ACME_EMAIL=admin@wplauncher.xyz
API_KEY=x
JWT_SECRET=x
PROVISIONER_INTERNAL_KEY=x
PRODUCT_ASSETS_PATH=/tmp/pa
SITES_HOST_PATH=/tmp/sites
ADMINER_AUTH_USERS=admin:$$2y$$12$$abcdefghijklmnopqrstuv
ENVEOF
docker compose -f docker-compose.dokploy.yml --env-file /tmp/tls-validate.env config > /dev/null && echo "compose OK"
```

Expected: `compose OK`, with no warning about an undefined variable.

- [ ] **Step 6: Verify both certificate modes load**

This is the step that proves the entrypoint script survived YAML and compose escaping.

```bash
docker compose -f docker-compose.dokploy.yml --env-file /tmp/tls-validate.env \
  run --rm --no-deps --entrypoint /bin/sh wpl-traefik -c 'echo "$ACME_DNS_PROVIDER" | head -c 20; echo "  <- empty means per-site"'
```

Expected: an empty value before the marker text.

Then confirm the flags Traefik actually loads, in both modes:

```bash
# per-site
docker run --rm -e ACME_DNS_PROVIDER= -e BASE_DOMAIN=probe.test traefik:v3.6 \
  --entrypoints.websecure.address=:443 \
  --entrypoints.websecure.http.tls.certresolver=wpl \
  --certificatesresolvers.wpl.acme.email=a@b.c \
  --certificatesresolvers.wpl.acme.storage=/tmp/acme.json \
  --certificatesresolvers.wpl.acme.httpchallenge.entrypoint=web \
  --log.level=DEBUG 2>&1 | grep -o '"httpChallenge":{[^}]*}' | head -1
```

Expected: `"httpChallenge":{"entryPoint":"web"}`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.dokploy.yml
git commit -m "feat(dokploy): our Traefik terminates TLS and owns ACME

Adds a websecure entrypoint, an ACME resolver named wpl storing certificates
on a named volume, and an entrypoint that selects HTTP-01 or DNS-01 depending
on whether ACME_DNS_PROVIDER is set.

Drops forwardedheaders.trustedips: terminating TLS here means X-Forwarded-Proto
is set from first-hand knowledge rather than trusted from upstream."
```

---

### Task 2: Dokploy's Traefik forwards instead of terminating

**Files:**
- Modify: `docker-compose.dokploy.yml` (the `wpl-traefik` `labels:` block, and the `provisioner` service's environment)

**Interfaces:**
- Consumes: `wpl-traefik` listening on `:443` and `:80` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the router labels**

Replace the entire `labels:` block on `wpl-traefik` with:

```yaml
    labels:
      # Read by DOKPLOY's Traefik, not ours.
      - "traefik.enable=true"
      - "traefik.docker.network=dokploy-network"

      # TLS: the raw stream, selected by SNI. Dokploy's Traefik never decrypts
      # it, so it needs no certificate for our domains and no configuration on
      # the host — which is the entire point of this design.
      - "traefik.tcp.routers.wpl-sites.rule=HostSNIRegexp(`${BASE_DOMAIN_REGEX:?Set BASE_DOMAIN_REGEX}`)"
      - "traefik.tcp.routers.wpl-sites.entrypoints=websecure"
      - "traefik.tcp.routers.wpl-sites.tls.passthrough=true"
      - "traefik.tcp.services.wpl-sites.loadbalancer.server.port=443"

      # Plain HTTP, carrying ACME HTTP-01 challenges to our Traefik, which
      # issues the redirect to HTTPS itself. Deliberately NO redirect-to-https
      # middleware here: it would bounce /.well-known/acme-challenge/ to a
      # certificate that does not exist yet, so issuance could never complete.
      - "traefik.http.routers.wpl-sites-http.rule=HostRegexp(`${BASE_DOMAIN_REGEX}`)"
      - "traefik.http.routers.wpl-sites-http.entrypoints=web"
      - "traefik.http.services.wpl-sites-http.loadbalancer.server.port=80"
```

The apex `BASE_DOMAIN` does not match `^.+\.domain$`, so the dashboard keeps its own router and its certificate from Dokploy's `letsencrypt` resolver. Leave the `dashboard` service untouched.

- [ ] **Step 2: Return the provisioner to standalone TLS semantics**

In the `provisioner` service, replace:

```yaml
      # The inner tier is plain HTTP; TLS terminates once, at Dokploy's
      # Traefik. Not an operator knob any more, so it is not read from env.
      - ENABLE_TLS=false
```

with:

```yaml
      # wpl-traefik terminates TLS, exactly as the bundled Traefik does in the
      # standalone install, so sites carry their normal TLS labels again.
      - ENABLE_TLS=true
      # Blank: the websecure entrypoint supplies the resolver, so no per-site
      # certresolver label is emitted and the certificate mode is a property
      # of the proxy rather than of each site.
      - CERT_RESOLVER=
```

`buildSiteLabels` already handles this exact combination — `enableTls: true` with a blank `certResolver` emits `entrypoints=websecure` and `tls=true` and no resolver. No code change.

- [ ] **Step 3: Confirm the label behaviour this depends on, rather than assuming it**

The claim in Step 2 is that `enableTls: true` with a blank `certResolver`
already produces the right labels. Verify it instead of trusting the comment:

```bash
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher/packages/provisioner"
npx vitest run src/site-labels.test.ts -t "preloaded wildcard"
```

Expected: PASS. That test asserts `tls=true` with `tls.certresolver` undefined —
exactly what the new configuration emits. If it fails, stop: the assumption that
no code change is needed is wrong, and the plan needs revising rather than
patching.

- [ ] **Step 4: Validate and inspect the rendered routers**

```bash
docker compose -f docker-compose.dokploy.yml --env-file /tmp/tls-validate.env config 2>/dev/null \
  | grep -E "wpl-sites\.(rule|entrypoints)|passthrough|wpl-sites-http|ENABLE_TLS|CERT_RESOLVER"
```

Expected: a `traefik.tcp.routers.wpl-sites.rule` using `HostSNIRegexp`, `tls.passthrough: "true"`, an HTTP router `wpl-sites-http` on the `web` entrypoint, `ENABLE_TLS=true` and an empty `CERT_RESOLVER`. There must be **no** `traefik.http.routers.wpl-sites.` entries left from the old design.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.dokploy.yml
git commit -m "feat(dokploy): forward TLS by SNI instead of terminating upstream

Dokploy's Traefik now passes the encrypted stream through to wpl-traefik and
forwards :80 for ACME challenges. Both routers are labels on our own service,
so a Dokploy upgrade cannot drop them — unlike the traefik.yml edit and the
container environment variable this replaces.

Sites get their normal TLS labels back, matching the standalone install."
```

---

### Task 3: Operator-facing configuration and documentation

**Files:**
- Modify: `.env.dokploy.example`
- Modify: `guides/dokploy-deployment.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `ACME_EMAIL` and `ACME_DNS_PROVIDER` from Task 1; the routing from Task 2.
- Produces: nothing.

- [ ] **Step 1: Update the environment template**

In `.env.dokploy.example`, replace the whole `# ─── Routing and TLS ───` block with:

```
# ─── Routing and TLS ─────────────────────────────────────────────────────────
# WP Launcher terminates TLS itself. Dokploy's Traefik forwards the encrypted
# stream to us by SNI, so nothing needs configuring on the host and a Dokploy
# upgrade cannot break certificate renewal.

# Where Let's Encrypt sends expiry warnings.
ACME_EMAIL=

# A Go regular expression matching every site hostname. It cannot be derived
# from BASE_DOMAIN automatically because the dots must be escaped. If your
# domain is example.com, use ^.+\.example\.com$
BASE_DOMAIN_REGEX=^.+\.wplauncher\.xyz$

# Optional. Leave EMPTY to get one certificate per site over HTTP-01, which
# needs no credentials and works immediately.
#
# Set it to a Traefik DNS provider name (cloudflare, route53, digitalocean, …)
# to switch to a single wildcard certificate over DNS-01, and add that
# provider's credentials below. Do this once you approach Let's Encrypt's limit
# of 50 certificates per registered domain per week — roughly 50 site launches
# on new subdomains in a week.
ACME_DNS_PROVIDER=

# Credentials for the provider above, if set. Only the matching ones are used.
CF_DNS_API_TOKEN=

# Basic-auth credential guarding Adminer at db.BASE_DOMAIN. Generate with:
#   docker run --rm httpd:alpine htpasswd -nbB -C 12 admin 'your-password' | sed 's/\$/$$/g'
#
# The sed doubles every `$`. That is required, not optional: compose
# interpolates env values, so a hash pasted verbatim is silently TRUNCATED at
# its first `$` and Adminer then rejects the correct password with no error
# anywhere explaining why.
ADMINER_AUTH_USERS=
```

`TRAEFIK_TRUSTED_IPS` and `WILDCARD_CERT_RESOLVER` are deleted — neither is read any more.

- [ ] **Step 2: Replace section 6 of the guide**

In `guides/dokploy-deployment.md`, replace the whole `## 6. Wildcard TLS (required)` section, up to but not including the next `##` heading, with:

```markdown
## 6. Certificates

WP Launcher terminates TLS itself. Dokploy's Traefik forwards the encrypted
stream to it by SNI, so **there is nothing to configure on the host** — no
edits to `/etc/dokploy/traefik/traefik.yml`, no environment variables on
Dokploy's Traefik container, and nothing a Dokploy upgrade can undo.

Set `ACME_EMAIL` and you are done. Each site gets its own Let's Encrypt
certificate over HTTP-01 as it launches.

### When to switch to a wildcard

Let's Encrypt issues at most **50 certificates per registered domain per week**.
Since each launch on a new subdomain is one certificate, a busy launcher reaches
that ceiling, after which new sites get no HTTPS until the window rolls over.

To switch, set `ACME_DNS_PROVIDER` to a
[Traefik DNS provider](https://doc.traefik.io/traefik/https/acme/#providers)
name and supply its credentials in the same Environment tab — for Cloudflare,
`ACME_DNS_PROVIDER=cloudflare` and `CF_DNS_API_TOKEN=…` from a token scoped to
`Zone → DNS → Edit` on your zone only. Redeploy, and one `*.BASE_DOMAIN`
certificate replaces the per-site ones.

The switch needs no relaunches: certificates are requested by the proxy's
entrypoint rather than by each site's router.

The panel itself, at the apex domain, is unaffected either way — it keeps its
certificate from Dokploy's own resolver.
```

- [ ] **Step 3: Add the upgrade notice**

Immediately after the section added in Step 2, add:

```markdown
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
```

- [ ] **Step 4: Replace the verification checklist**

Replace the numbered list under `## Verify the deployment` with:

```markdown
1. `https://wplauncher.xyz` serves the panel and `/api/settings` returns JSON.

2. Launch a **new** site. It answers at `https://{sub}.wplauncher.xyz` with a
   valid certificate and no redirect loop.

3. The certificate is real, not Traefik's fallback:

   ```bash
   echo | openssl s_client -connect 127.0.0.1:443 -servername {sub}.wplauncher.xyz 2>/dev/null \
     | openssl x509 -noout -subject -issuer
   ```

   Expected: a `Let's Encrypt` issuer. `CN = TRAEFIK DEFAULT CERT` means
   issuance failed — check `docker logs` on the `wpl-traefik` container.

4. **A neighbouring Dokploy app on its own domain still loads.** The SNI router
   matches only `*.BASE_DOMAIN`, but a rule that is too broad would silently
   hijack other applications' traffic. This is the check that protects everything
   else on the instance.

5. The new site is on the private network only:

   ```bash
   docker inspect wp-site-{sub} --format '{{json .NetworkSettings.Networks}}' | tr ',' '\n' | grep -o '"[a-z-]*":'
   ```

   Expected: `wpl-sites`, and not `dokploy-network`.

6. The site cannot reach a neighbouring app:

   ```bash
   docker exec wp-site-{sub} curl -s -m 5 http://<other-service>:<port>
   ```

   Expected: failure.

7. **Certificates survive a redeploy.** Redeploy from Dokploy, then confirm the
   site still loads without a new issuance in the logs:

   ```bash
   docker volume inspect $(docker volume ls -q | grep wpl-acme) --format '{{.Mountpoint}}'
   ```

   Expected: a path outside `/etc/dokploy/compose/*/code`. Certificates stored
   in the checkout are destroyed on every redeploy, and the resulting re-issuance
   exhausts the weekly limit without any obvious symptom until it does.
```

- [ ] **Step 5: Correct CLAUDE.md**

In `CLAUDE.md`, replace the Dokploy comment block under `## Commands`:

```
# Dokploy: create a Compose service pointing at docker-compose.dokploy.yml.
# Dokploy's Traefik terminates TLS with a (required) wildcard cert and forwards
# *.BASE_DOMAIN to our own `wpl-traefik`, which routes to site containers on the
# private `wpl-sites` network. Sites therefore cannot reach other apps on the
# instance. Requires BASE_DOMAIN_REGEX, TRAEFIK_TRUSTED_IPS, ADMINER_AUTH_USERS.
# See guides/dokploy-deployment.md.
```

with:

```
# Dokploy: create a Compose service pointing at docker-compose.dokploy.yml.
# Dokploy's Traefik forwards *.BASE_DOMAIN to our own `wpl-traefik` by SNI
# (tls.passthrough) without decrypting; ours terminates TLS, owns ACME, and
# routes to site containers on the private `wpl-sites` network. Sites therefore
# cannot reach other apps on the instance. Nothing is configured on the host, so
# a Dokploy upgrade cannot break renewal. Per-site HTTP-01 by default; set
# ACME_DNS_PROVIDER for a wildcard. Requires ACME_EMAIL, BASE_DOMAIN_REGEX,
# ADMINER_AUTH_USERS. See guides/dokploy-deployment.md.
```

- [ ] **Step 6: Check for stale references**

```bash
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
grep -rn "TRAEFIK_TRUSTED_IPS\|WILDCARD_CERT_RESOLVER" \
  guides/dokploy-deployment.md .env.dokploy.example CLAUDE.md docker-compose.dokploy.yml
```

Expected: matches **only** in the upgrade notice added in Step 3, which tells operators to delete them. Any other hit is a leftover instruction that now contradicts the design.

- [ ] **Step 7: Commit**

```bash
git add .env.dokploy.example guides/dokploy-deployment.md CLAUDE.md
git commit -m "docs(dokploy): certificates need no host configuration

ACME_EMAIL is now the only certificate setting for a fresh install; sites get
per-site HTTP-01 certificates with no DNS credentials. ACME_DNS_PROVIDER opts
into a wildcard when the weekly rate limit becomes a constraint.

TRAEFIK_TRUSTED_IPS and WILDCARD_CERT_RESOLVER are gone. Records that sites
created before this release must be relaunched."
```

---

## Done when

- `docker compose -f docker-compose.dokploy.yml --env-file <filled> config` succeeds.
- Both certificate modes load the expected static configuration (Task 1, Step 6).
- All seven verification items pass on the VPS.

Items 4 and 7 are the ones that fail quietly and matter most: a passthrough rule that is too broad breaks other people's applications, and certificate storage in the wrong place is invisible until the rate limit is hit. Do not report this work as complete on `compose config` alone — it cannot observe either.
