# Dokploy Self-Contained TLS — Design

**Date:** 2026-08-15
**Status:** Approved, ready for planning
**Supersedes the TLS arrangement in:** `2026-08-14-dokploy-network-isolation-design.md`

## Problem

The Dokploy deployment works, but two of its requirements live outside the
compose file, on the host:

1. `CF_DNS_API_TOKEN` set on the **`dokploy-traefik` container**, which Dokploy
   owns and recreates on upgrade.
2. A `dnsChallenge` resolver hand-edited into
   `/etc/dokploy/traefik/traefik.yml`, a file Dokploy owns.

Both are invisible to `docker-compose.dokploy.yml`, so a Dokploy upgrade can
drop them. Neither failure is immediate: certificates already issued keep
working, and the wildcard simply fails to renew roughly 60 days later. For a
self-hosted product shipped to other people, that is the worst failure shape —
it surfaces long after the change that caused it, to an operator who never knew
the setup existed.

A third problem is adoption. The current design **requires** a wildcard
certificate, which requires DNS-01, which requires a DNS provider API token.
Many self-hosters do not have one and will not get one to try a product.

## Goals

- Every requirement declared in `docker-compose.dokploy.yml`. No file edits, no
  container surgery, nothing a Dokploy upgrade can undo.
- A fresh install obtains certificates with **no DNS credentials**.
- Wildcard remains available for installs that outgrow per-site issuance.
- Fewer moving parts than today, not more.

## Non-goals

- Changing the standalone install. Its Traefik already owns ports 80 and 443
  and terminates TLS directly; nothing here applies.
- Custom domains, still unsupported on Dokploy (unchanged).
- Supporting both the old and new TLS topologies simultaneously. See Migration.

## Feasibility, verified

The design depends on an outer Traefik honouring a TCP passthrough router
alongside its own HTTP routers on the same `:443` entrypoint. This was tested
locally against Traefik v3.6 with a two-tier setup mirroring Dokploy, before
the design was written:

- `alpha.sites.probe.test` reached a backend behind the **inner** Traefik via
  `tls.passthrough=true`, while
- `neighbour.probe.test` was served by the **outer** Traefik's own HTTP router
  on that same entrypoint.

Both worked concurrently. The backend also received `X-Forwarded-Proto: https`,
`X-Forwarded-Port: 443` and `X-Forwarded-Host` **with no `trustedIPs`
configuration anywhere** — because the inner Traefik terminates TLS itself and
knows the scheme first-hand rather than being told.

## Approach

Move TLS termination from Dokploy's Traefik to ours. Dokploy's forwards the
encrypted stream untouched, selected by SNI.

Everything needed is expressed as labels on our own `wpl-traefik` service, so
Dokploy discovers it the way it discovers any application. There is nothing to
edit on the host and nothing for an upgrade to lose.

### Routing

Two routers, both declared as labels on `wpl-traefik`:

```yaml
# TLS: the raw stream. The outer proxy never decrypts it.
- "traefik.tcp.routers.wpl.rule=HostSNIRegexp(`${BASE_DOMAIN_REGEX}`)"
- "traefik.tcp.routers.wpl.entrypoints=websecure"
- "traefik.tcp.routers.wpl.tls.passthrough=true"
- "traefik.tcp.services.wpl.loadbalancer.server.port=443"

# Plain HTTP: carries ACME HTTP-01 challenges and the http->https redirect.
- "traefik.http.routers.wpl-http.rule=HostRegexp(`${BASE_DOMAIN_REGEX}`)"
- "traefik.http.routers.wpl-http.entrypoints=web"
- "traefik.http.services.wpl-http.loadbalancer.server.port=80"
```

`wpl-traefik` gains a `websecure` entrypoint on `:443` in addition to `web`.
Neither port is published to the host; Dokploy's Traefik reaches both over
`dokploy-network`.

**The panel is deliberately untouched.** `BASE_DOMAIN` itself does not match
`^.+\.BASE_DOMAIN$`, so the dashboard keeps its existing exact-host router at
Dokploy's tier and its certificate from Dokploy's own `letsencrypt` resolver.
A fresh install therefore has a working panel with no DNS credentials, no
passthrough, and no dependency on any of this.

**The `wpl-http` router must not carry a redirect-to-https middleware.** Dokploy
applies `redirect-to-https@file` to its own HTTP routers; ours must not, or
ACME challenges to `/.well-known/acme-challenge/` will be redirected to a
certificate that does not exist yet, and issuance can never complete.

### Certificates

Our Traefik owns ACME. Two modes, chosen by configuration:

| Mode | When | Trade-off |
|---|---|---|
| Per-site HTTP-01 | default | No credentials. Let's Encrypt allows 50 certificates per registered domain per week. |
| Wildcard DNS-01 | `ACME_DNS_PROVIDER` is set | One certificate, no ceiling. Needs a DNS provider API token. |

Per-site is the default because it works immediately: install, point DNS at the
host, launch a site. The ceiling only constrains high-volume users, who are also
the users equipped to configure DNS-01.

`ACME_DNS_PROVIDER` names any Traefik-supported provider (`cloudflare`,
`route53`, `digitalocean`, …). Its credentials are supplied as ordinary
environment variables on our service, exactly as Traefik's documentation
describes for that provider — so no provider-specific code is needed.

**Both modes use one resolver, named `wpl`,** and differ only in how it
challenges and what it is asked to cover. Issuance is driven from the
**entrypoint's default TLS configuration** rather than per-router labels, the
same mechanism Dokploy uses for its own `websecure` entrypoint:

```
# Per-site (default): each router's Host rule names the certificate to obtain.
--certificatesresolvers.wpl.acme.httpchallenge.entrypoint=web
--entrypoints.websecure.http.tls.certresolver=wpl

# Wildcard: the resolver challenges over DNS, and explicit domains are given
# because a certificate covering every subdomain cannot be inferred from any
# single router's Host rule.
--certificatesresolvers.wpl.acme.dnschallenge.provider=${ACME_DNS_PROVIDER}
--entrypoints.websecure.http.tls.certresolver=wpl
--entrypoints.websecure.http.tls.domains[0].main=${BASE_DOMAIN}
--entrypoints.websecure.http.tls.domains[0].sans=*.${BASE_DOMAIN}
```

Because the entrypoint supplies the resolver, **site containers need no
`certresolver` label in either mode** — `CERT_RESOLVER` stays blank on Dokploy
and `buildSiteLabels` emits `entrypoints=websecure` and `tls=true` only. The
mode is a property of the proxy, not of each site, so switching modes later
requires no relaunch.

**Storage:** `acme.json` lives on the `wpl-data` volume. Placing it anywhere
under `code/` would discard every certificate on each redeploy and exhaust the
rate limit within days. This is the single highest-consequence detail in the
design.

### Site labels

Because our Traefik now terminates TLS, site containers need their normal
`entrypoints` / `tls` / `certresolver` labels again — which is exactly what
`packages/provisioner/src/site-labels.ts` already emits for the standalone
install. No code change is required there.

| Variable | Was (upstream TLS) | Becomes |
|---|---|---|
| `ENABLE_TLS` | `false` | `true` |
| `CERT_RESOLVER` | dropped | blank, in both modes — the entrypoint supplies the resolver |

The Dokploy profile therefore converges on the standalone one, differing only in
that an outer proxy forwards to us. That is less divergence to maintain, not
more.

### What this removes

- `TRAEFIK_TRUSTED_IPS` — unnecessary, proven above. This variable caused a
  production outage during the previous deployment: `10.0.0.0/24` was entered
  where `/8` was meant, every site redirect-looped, and nothing in any log named
  the cause.
- The hand-edited `dnsChallenge` block in Dokploy's `traefik.yml`.
- `CF_DNS_API_TOKEN` on Dokploy's container.
- The requirement that a wildcard certificate exist before the first launch.

`BASE_DOMAIN_REGEX` is still required — `HostSNIRegexp` needs an escaped
expression and it cannot be derived from `BASE_DOMAIN` automatically.

## Migration

A clean switch. Both modes are not supported simultaneously.

The SNI router matches every `*.BASE_DOMAIN` hostname, including sites created
before the upgrade. Those sites are routed by per-site HTTP routers at Dokploy's
tier and are unknown to our Traefik — they lack the `wp-launcher.routable`
label its provider constraint selects on — so after the upgrade they are
captured by the passthrough router and have nowhere to go.

**Sites created before this upgrade must be relaunched.** The guide must state
this without hedging, in the upgrade section rather than a footnote.

The operator may also revert their `traefik.yml` edit and remove
`CF_DNS_API_TOKEN` from Dokploy's Traefik afterwards; neither is read any more.
This is optional and the guide should mark it so, since reverting is riskier
than leaving inert configuration in place.

## Testing

Unit, in CI:

- `buildSiteLabels` with `enableTls: true` and a blank resolver emits
  `entrypoints=websecure` and `tls=true` with **no** `certresolver` — the
  configuration both modes now use.

That case already exists in `packages/provisioner/src/site-labels.test.ts`
("leaves the certificate to a preloaded wildcard when the resolver is blank").
The plan must confirm it covers the new configuration rather than duplicate it,
and must not add tests for a per-site `certresolver` label that is no longer
emitted.

Post-deploy checklist on the VPS, added to the guide:

1. A newly launched site loads over HTTPS with a valid certificate and no
   redirect loop.
2. `openssl s_client -servername <sub>.<domain>` shows a Let's Encrypt issuer,
   not `TRAEFIK DEFAULT CERT`.
3. The panel at the apex still loads — confirming it was left on Dokploy's
   tier.
4. A neighbouring Dokploy app on its own hostname still loads, confirming the
   passthrough router did not capture traffic it should not.
5. `docker exec <site> curl -s -m 5 http://<neighbour>:<port>` still fails,
   confirming network isolation is unaffected by the TLS change.
6. `acme.json` is present on the `wpl-data` volume and survives a redeploy.

Items 4 and 6 are the ones that fail quietly. A passthrough rule that is too
broad breaks other people's applications, and certificate storage in the wrong
place is invisible until the rate limit is hit.

## Follow-up work

- **Rate-limit visibility.** In per-site mode the panel should warn as the
  weekly certificate count approaches Let's Encrypt's limit, and point at
  wildcard mode. Not built here; issuance is not currently tracked.
- **Custom domains.** Passthrough makes these easier than under the previous
  design, since our Traefik could obtain their certificates directly. Still out
  of scope.
