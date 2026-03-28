# Security Fixes Implementation Report

Date: 2026-03-28
Based on: [security_best_practices_report.md](security_best_practices_report.md)

All 5 findings from the security best practices review have been remediated. TypeScript compilation verified clean after all changes.

---

## SBP-001: Command injection via selective sync contentIds

**Severity:** High
**Status:** Fixed

### Changes

**`packages/api/src/routes/sync.ts`** (push-selective and pull-selective routes)
- Added strict integer validation at the route boundary: rejects any `contentIds` array element that is not a positive integer.
- Coerces validated values to `parseInt()` before passing to the service layer.
- Applied identically to both `POST /push-selective` and `POST /pull-selective`.

**`packages/api/src/services/sync-incremental.service.ts`** (pushSelective)
- Added defense-in-depth integer coercion (`parseInt` + `isFinite` + `> 0` check) at the interpolation point, so even if the route-level guard is bypassed, non-numeric values never reach the shell command string.

### Why not provisioner-level filtering
The provisioner's `exec-wp` endpoint is an internal API used by multiple services. Some legitimate internal commands (e.g. `wp db import ... 2>/dev/null || true` in sync.service.ts) use shell operators. A blanket metacharacter filter at the provisioner would break those hardcoded paths. The correct boundary is where user input enters the system (route) and where it's interpolated (service).

---

## SBP-002: Path traversal in product/template lookup

**Severity:** High
**Status:** Fixed

### Changes

**`packages/api/src/services/product.service.ts`**
- Added exported `isSafeSlug()` function: validates IDs against `^[a-z0-9][a-z0-9._-]*$` and rejects `..` sequences.
- `getProductConfig()` returns `undefined` (treated as not-found by callers) if the ID fails slug validation.
- `getTemplateConfig()` returns `null` (treated as not-found by callers) if the ID fails slug validation.
- Validation happens before any cache lookup or filesystem operation.

**`packages/api/src/routes/products.ts`**
- Imported `isSafeSlug` and added validation in `DELETE /:id` before any `path.join` or `fs` operations.

**`packages/api/src/routes/templates.ts`**
- Imported `isSafeSlug` and added validation in `DELETE /:id` before `path.join` or `fs.unlinkSync`.

### Coverage
The slug check is applied to all code paths that join a user-provided ID into a filesystem path: read (via service), update (via service), and delete (via route + service).

---

## SBP-003: Productivity Monitor not scoped for multi-user use

**Severity:** High
**Status:** Fixed

### Changes

**`packages/api/src/routes/productivity.ts`**
- Added `requireLocalMode` middleware that returns 403 if `config.isLocalMode` is false.
- Applied to the `router.use()` that gates all authenticated productivity routes (stats, goals, cloud config, cloud sync, data management).
- The public endpoints (`/heartbeats`, `/cloud/status`) remain outside this gate since they already have their own controls (feature flag, cloud-linked check, CORS restriction).

### Rationale
Per project design, `productivityMonitor` is documented as a "local only" feature. The underlying tables are global (not user-scoped), so the correct fix is to enforce the local-mode boundary server-side rather than retrofitting user-scoping into the schema. If multi-user productivity tracking is needed in the future, it requires a schema migration to add `user_id` to heartbeats and all dependent queries.

---

## SBP-004: Heartbeat ingestion unauthenticated + open CORS

**Severity:** Medium
**Status:** Fixed

### Changes — Layer 1: CORS origin allowlist + rate limiting

**`packages/api/src/routes/productivity.ts`**
- Replaced reflected `Access-Control-Allow-Origin: <any origin>` with `isAllowedHeartbeatOrigin()` allowlist function.
- Allowed origins: `localhost`, `*.localhost`, `BASE_DOMAIN`, `*.BASE_DOMAIN`. All others receive no CORS header (browser blocks the request).
- Applied the same origin check to the `/cloud/status` CORS handler.
- Added `express-rate-limit` at 60 requests/minute per IP on the `/heartbeats` path.

### Changes — Layer 2: Per-install heartbeat secret

CORS and rate limiting only mitigate browser-based abuse. Non-browser clients (curl, scripts) bypass CORS entirely. To fully close the finding, a per-install shared secret authenticates all heartbeat submitters:

**`packages/api/src/routes/productivity.ts`**
- `PUT /cloud/config` now auto-generates a `heartbeat_secret` (32 bytes, base64url) and stores it in `productivity_cloud_config`. The secret is returned in the response so the dashboard can display it for extension configuration.
- `POST /heartbeats` now validates `req.body.secret` against the stored `heartbeat_secret`. Requests with a missing or invalid secret receive 401.
- `GET /cloud/config` (authenticated, local-mode-only) returns the `heartbeat_secret` so extensions can read it.

**`packages/api/src/services/site.service.ts`**
- When creating a new site container, reads `heartbeat_secret` from cloud config and passes it as `heartbeatSecret` in `CreateContainerOptions`.

**`packages/api/src/services/docker.service.ts`**
- Added `heartbeatSecret?: string` to `CreateContainerOptions` interface.

**`packages/provisioner/src/index.ts`**
- Added `heartbeatSecret?: string` to `CreateBody` interface.
- Passes `WP_HEARTBEAT_SECRET` env var to WordPress containers when a heartbeat secret is configured.

**`wordpress/mu-plugins/wp-launcher-productivity.php`**
- Reads `WP_HEARTBEAT_SECRET` from environment and includes it in the JS config object.
- The `flush()` function now includes `secret: cfg.secret` in the JSON body alongside `heartbeats`.

### Authentication flow
1. User links cloud account → API generates `heartbeat_secret` and stores it.
2. New WordPress containers receive the secret via `WP_HEARTBEAT_SECRET` env var.
3. MU-plugin reads the env var and includes it as `secret` in every heartbeat POST body.
4. Editor extensions read the secret from the authenticated `GET /cloud/config` endpoint.
5. API rejects any heartbeat request where `body.secret` does not match the stored value.

### Note on existing containers
Containers created before the cloud account was linked will not have `WP_HEARTBEAT_SECRET` set. Their heartbeats will be rejected until the container is recreated. This is acceptable because productivity tracking only activates after cloud is linked.

---

## SBP-005: Cloud sync SSRF via unvalidated cloud_url

**Severity:** Medium
**Status:** Fixed

### Changes

**`packages/api/src/routes/productivity.ts`**
- Imported `validateRemoteUrl` and `safeFetch` from `../utils/ssrf`.
- `PUT /cloud/config` now calls `validateRemoteUrl(cleanUrl)` before any outbound request. Returns 400 if the URL fails SSRF checks (private IP, blocked hostname, non-HTTPS in production).
- Replaced raw `fetch()` with `safeFetch()` for the test connection request, adding DNS rebinding defense and redirect blocking.

**`packages/api/src/services/productivity-sync.service.ts`**
- Imported `safeFetch` from `../utils/ssrf`.
- Replaced raw `fetch()` with `safeFetch()` for all cloud sync heartbeat pushes, providing the same SSRF protections on every scheduled or manual sync.

### Protections now active
- Protocol allowlist (HTTPS required in production, HTTP allowed in dev/local)
- Hostname blocklist (localhost, metadata.google.internal, *.local)
- DNS resolution check (rejects private/reserved IPs including RFC1918, loopback, link-local, cloud metadata 169.254.x.x)
- DNS rebinding defense (re-resolves before each request)
- Redirect blocking (`redirect: 'error'`)

---

## Files Modified

| File | Changes |
|------|---------|
| `packages/api/src/routes/sync.ts` | Integer validation on contentIds for push-selective and pull-selective |
| `packages/api/src/services/sync-incremental.service.ts` | Defense-in-depth integer coercion before shell interpolation |
| `packages/api/src/services/product.service.ts` | `isSafeSlug()` guard in getProductConfig and getTemplateConfig |
| `packages/api/src/routes/products.ts` | Slug validation in DELETE handler |
| `packages/api/src/routes/templates.ts` | Slug validation in DELETE handler |
| `packages/api/src/routes/productivity.ts` | Local-mode enforcement, CORS origin allowlist, rate limiting, SSRF validation, heartbeat secret auth |
| `packages/api/src/services/productivity-sync.service.ts` | safeFetch for cloud sync |
| `packages/api/src/services/docker.service.ts` | Added `heartbeatSecret` to CreateContainerOptions |
| `packages/api/src/services/site.service.ts` | Pass heartbeat secret to container creation |
| `packages/provisioner/src/index.ts` | Added `heartbeatSecret` to CreateBody, pass as WP_HEARTBEAT_SECRET env var |
| `wordpress/mu-plugins/wp-launcher-productivity.php` | Read WP_HEARTBEAT_SECRET, include secret in heartbeat body |
| `packages/dashboard/src/pages/ProductivityPage.tsx` | Removed localStorage usage for cloud API key (pre-existing fix) |

## Verification

- `npx tsc --noEmit -p packages/api/tsconfig.json` — clean
- `npx tsc --noEmit -p packages/provisioner/tsconfig.json` — clean

## Relationship to Existing Tests

`tests/test_security_fixes.py` covers an earlier set of 6 runtime security fixes (CSRF, tenant isolation, SSRF on sync connections, JWT leak prevention, SVG upload rejection, CSP headers). Those tests remain valid and unchanged. The SBP-001–005 fixes from this report address a different set of findings and are not yet covered by the runtime test suite. Adding SBP test coverage requires a running server with the productivity feature enabled and cloud linked, which is not part of the standard CI flow.
