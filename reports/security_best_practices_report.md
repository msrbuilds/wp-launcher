# Security Best Practices Report

Date: 2026-03-22

Scope reviewed:
- `packages/api`
- `packages/dashboard`
- `packages/provisioner`
- deployment/config files in `docker-compose.yml`, `packages/dashboard/nginx.conf`, and `traefik/dynamic/middleware.yml`

## Executive Summary

The highest-risk issues are in the auth and sync surfaces.

I found 4 prioritized findings:
- 3 High
- 1 Medium

The two most important problems are:
- cookie-authenticated POST endpoints are exposed to same-site CSRF because this product deliberately hosts untrusted demo sites on sibling subdomains of the same base domain
- the `siteSync` feature is not tenant-scoped and also accepts attacker-chosen remote URLs, which creates both authorization and SSRF risk when that feature is enabled

## High Severity

### SBP-001

- Rule ID: `EXPRESS-CSRF-001`
- Severity: High
- Title: Same-site CSRF is possible against cookie-authenticated POST endpoints
- Location:
  - `packages/api/src/routes/auth.ts:11`
  - `packages/api/src/index.ts:185`
  - `packages/api/src/index.ts:299`
  - `packages/api/src/routes/monitoring.ts:85`
  - `packages/api/src/services/site.service.ts:96`
  - `docker-compose.yml:147`
- Evidence:
  - Auth cookies are set with `SameSite: 'strict'` and no CSRF token or Origin/Referer validation is implemented in app code.
  - The app creates demo sites at `https://${subdomain}.${config.baseDomain}`.
  - The dashboard itself is served on `${BASE_DOMAIN}`.
  - There are bodyless state-changing POST endpoints such as:
    - `/api/admin/system/update`
    - `/api/admin/monitoring/containers/:id/force-remove`
    - `/api/admin/monitoring/cleanup/orphans`
    - `/api/admin/monitoring/prune/images`
- Impact:
  - `SameSite=Strict` blocks cross-site CSRF, but it does not block same-site requests from sibling subdomains.
  - Any attacker-controlled content running on a launched demo site under `*.BASE_DOMAIN` can submit same-site form POSTs to the dashboard/API origin with the victim's cookies attached.
  - In practice, that can trigger admin-side operational actions such as self-update, container removal, or cleanup/prune actions if an admin visits a malicious demo site.
- Fix:
  - Add CSRF protection for all cookie-authenticated state-changing routes.
  - At minimum, enforce strict `Origin` or `Referer` checks plus Fetch Metadata checks on cookie-authenticated POST/PUT/PATCH/DELETE routes.
  - For high-impact bodyless POST endpoints, require a nonce-bearing custom header or CSRF token so plain HTML form posts cannot succeed.
  - Treat sibling demo subdomains as untrusted origins.
- Mitigation:
  - Isolate demo sites onto a different registrable domain than the dashboard/API so browser same-site rules no longer help an attacker.

### SBP-002

- Rule ID: `APP-AUTHZ-001`
- Severity: High
- Title: `siteSync` remote connections and sync history are global, not user-scoped
- Location:
  - `packages/api/src/utils/db.ts:154`
  - `packages/api/src/utils/db.ts:165`
  - `packages/api/src/services/sync.service.ts:24`
  - `packages/api/src/services/sync.service.ts:29`
  - `packages/api/src/services/sync.service.ts:101`
  - `packages/api/src/services/sync.service.ts:351`
  - `packages/api/src/routes/sync.ts:41`
  - `packages/api/src/routes/sync.ts:54`
  - `packages/api/src/routes/sync.ts:75`
  - `packages/api/src/routes/sync.ts:121`
- Evidence:
  - `remote_connections` has no `user_id` column.
  - `sync_history` has no caller ownership filter in the route layer.
  - `listConnections()`, `removeConnection()`, and `getSyncHistory()` all operate on global tables.
  - The API routes expose those records to any authenticated caller when `siteSync` is enabled.
- Impact:
  - One authenticated user can enumerate other users' remote WordPress endpoints, test them, delete them, and reuse them when syncing the caller's own local site.
  - That creates cross-tenant data leakage and lets one tenant interfere with or overwrite another tenant's configured remote WordPress targets.
- Fix:
  - Add `user_id` ownership to `remote_connections` and `sync_history`.
  - Filter list/test/remove/history queries by the authenticated user unless the caller is a true admin.
  - Audit every `siteSync` handler to ensure both the local site and the remote connection belong to the same caller.
- Mitigation:
  - Keep `feature.siteSync` disabled in multi-user agency mode until per-user ownership is enforced.

### SBP-003

- Rule ID: `EXPRESS-SSRF-001`
- Severity: High
- Title: `siteSync` lets authenticated users trigger server-side requests to attacker-chosen hosts
- Location:
  - `packages/api/src/services/sync.service.ts:29`
  - `packages/api/src/services/sync.service.ts:58`
  - `packages/api/src/services/sync.service.ts:158`
  - `packages/api/src/services/sync.service.ts:225`
  - `packages/api/src/services/sync-incremental.service.ts:135`
  - `packages/api/src/services/sync-incremental.service.ts:296`
  - `packages/api/src/services/sync-incremental.service.ts:356`
- Evidence:
  - `addConnection()` only checks `new URL(normalizedUrl)`.
  - The server later performs `fetch(`${conn.url}/wp-json/wpl-connector/v1/...`)` from the API container's network context.
  - There is no visible protocol allowlist, private-IP denial, metadata-IP denial, DNS rebinding defense, or domain allowlist.
- Impact:
  - Any authenticated user with `siteSync` enabled can make the API server probe attacker-chosen hosts and return success or failure details.
  - The path suffix is fixed to the connector endpoints, so this is not a full arbitrary-path fetch primitive, but it is still an SSRF/network-oracle issue and can target internal or private WordPress-like services reachable from the server.
- Fix:
  - Restrict remote targets to `https:` by default, with narrowly scoped `http:` exceptions for explicit local development.
  - Resolve DNS before use and block loopback, RFC1918, link-local, and cloud metadata ranges.
  - Consider allowlisting approved domains or verified connector origins.
  - Disable redirects and keep strict request timeouts.
- Mitigation:
  - Apply network egress controls so the API container cannot freely reach sensitive internal services.

## Medium Severity

### SBP-004

- Rule ID: `APP-SESSION-001`
- Severity: Medium
- Title: Auth routes expose JWT bearer tokens to browser JavaScript even though the app already uses HttpOnly cookies
- Location:
  - `packages/api/src/routes/auth.ts:62`
  - `packages/api/src/routes/auth.ts:89`
  - `packages/api/src/routes/auth.ts:111`
  - `packages/dashboard/src/pages/LoginPage.tsx:26`
  - `packages/dashboard/src/pages/VerifyPage.tsx:34`
  - `packages/dashboard/src/pages/VerifyPage.tsx:69`
  - `packages/dashboard/src/context/AuthContext.tsx:41`
- Evidence:
  - The API sets `wpl_token` as an `HttpOnly` cookie.
  - The same endpoints also return `token` in the JSON response body.
  - The React client only uses `data.user` and relies on `/api/auth/me` plus cookie auth; it does not need the raw JWT to function.
- Impact:
  - Returning the bearer token to frontend JavaScript weakens the intended security boundary of `HttpOnly` cookies.
  - Any future same-origin script injection, malicious extension, or accidental frontend logging can exfiltrate a reusable bearer token that would otherwise stay inaccessible to JS.
- Fix:
  - Stop returning `token` in browser login/verify/set-password responses unless there is a separate documented non-cookie API-consumer use case.
  - If API consumers need bearer tokens, provide a separate auth flow or endpoint for them instead of exposing the browser session token.
- Mitigation:
  - Until removed, do not persist the token client-side and tighten frontend XSS defenses further.

## Additional Observations

These did not make the top finding list, but they are worth addressing:

- Product/template image uploads trust `file.originalname` for the stored extension (`packages/api/src/routes/products.ts:114`, `packages/api/src/routes/templates.ts:115`), and branding explicitly allows SVG upload (`packages/api/src/index.ts:443`). Those files are then served back from first-party routes (`packages/api/src/index.ts:105`, `packages/api/src/index.ts:504`). Serving uploaded active content from the primary origin is not a secure default.
- A CSP is not visible in the reviewed app/server config. Traefik currently sets frame deny, nosniff, and referrer policy (`traefik/dynamic/middleware.yml:3`), but no CSP was visible in repo-managed config. Verify whether CSP is added elsewhere at runtime.

## Recommended Fix Order

1. Fix same-site CSRF for cookie-authenticated POST endpoints, especially operational admin actions.
2. Add per-user ownership to `siteSync` connections and history, then re-check every sync route for authorization.
3. Add SSRF controls to remote sync target handling.
4. Remove unnecessary JWTs from browser-facing auth responses.
