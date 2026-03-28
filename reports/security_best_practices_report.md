# Security Best Practices Review

Reviewed on: 2026-03-28

Scope:
- Backend: TypeScript / Express API in `packages/api`
- Frontend: React / Vite dashboard in `packages/dashboard`
- Supporting internal service: provisioner in `packages/provisioner`

## Executive Summary

The codebase already has several solid baseline controls in place, including Helmet/CSP, CSRF origin and custom-header checks, auth cookies with `HttpOnly`, upload hardening for branding assets, and SSRF validation for sync connection creation.

This review found 5 actionable issues. All have been remediated — see `security_fixes_implementation_report.md` for implementation details.

1. ~~A selective-sync command-injection path that can execute arbitrary shell commands inside WordPress containers when site sync is enabled.~~ **Fixed:** Integer validation at route boundary + defense-in-depth coercion at interpolation point.
2. ~~A public path-traversal issue in product/template lookup that can disclose arbitrary `.json` files outside the intended directories.~~ **Fixed:** Strict slug validation (`isSafeSlug`) in all product/template read and delete paths.
3. ~~A Productivity Monitor backend that is not server-side scoped for multi-user use.~~ **Fixed:** Server-side `requireLocalMode` enforcement on all authenticated productivity routes, plus heartbeat secret authentication for ingestion.

## High Severity

### SBP-001: Selective sync accepts attacker-controlled IDs that reach `bash -c` — FIXED

- Rule ID: EXPRESS-CMD-001
- Severity: High
- Status: **Remediated** — see `security_fixes_implementation_report.md`
- Location:
  - `packages/api/src/routes/sync.ts:182-195`
  - `packages/api/src/services/sync-incremental.service.ts:286-290`
  - `packages/provisioner/src/index.ts:1049-1058`
- Evidence:
  - `POST /api/sync/push-selective` accepts `contentIds` directly from `req.body` with no numeric schema validation.
  - The service builds a shell command with string interpolation:
    - ``wp post get ${pid} --format=json ...``
  - The provisioner then executes each command with:
    - `Cmd: ['bash', '-c', `${cmd} --allow-root 2>&1`]`
- Impact:
  - When `feature.siteSync` is enabled, an authenticated user who owns a site and sync connection can inject shell metacharacters via `contentIds` and achieve arbitrary command execution inside the target WordPress container.
  - Because those containers sit on the internal Docker network, this increases blast radius beyond simple content sync and can expose container secrets or internal services.
- Fix:
  - Validate `contentIds` as integers at the route boundary with a strict schema.
  - Stop constructing shell strings for WP operations. Pass structured argv arrays or create narrowly-scoped provisioner endpoints for the exact WP actions needed.
  - Remove `bash -c` from the `exec-wp` path for any request-derived values.
- Mitigation:
  - Keep `feature.siteSync` disabled until this path is hardened.
  - Add server-side audit logging for selective sync requests.
- False positive notes:
  - This issue is feature-gated, but it is reachable in the intended product path once site sync is enabled.

### SBP-002: Public product/template reads allow encoded path traversal to arbitrary `.json` files — FIXED

- Rule ID: EXPRESS-INPUT-001
- Severity: High
- Status: **Remediated** — see `security_fixes_implementation_report.md`
- Location:
  - `packages/api/src/index.ts:521-546`
  - `packages/api/src/routes/products.ts:39-49`
  - `packages/api/src/routes/templates.ts:39-49`
  - `packages/api/src/services/product.service.ts:74-76`
  - `packages/api/src/services/product.service.ts:173-176`
- Evidence:
  - `GET /api/products/:id` and `GET /api/templates/:id` are intentionally left open to unauthenticated callers.
  - The lookup helpers join unsanitized route params into filesystem paths:
    - `path.join(config.productConfigsDir, `${productId}.json`)`
    - `path.join(config.templateConfigsDir, `${templateId}.json`)`
  - A local Express route-matching reproduction confirmed that `%2e%2e%2f%2e%2e%2fpackage` reaches the handler as `../../package`, so URL-encoded slashes are decoded before the file join.
- Impact:
  - An unauthenticated caller can traverse out of `products/` or `templates/` and read arbitrary `.json` files the API process can access, for example `package.json` and any other JSON config placed elsewhere in the app tree.
  - This is an information-disclosure primitive that depends on what JSON files exist at runtime.
- Fix:
  - Reject IDs that are not strict product/template slugs, for example `^[a-z0-9-]+$`.
  - Resolve the candidate path and verify it stays within the intended base directory before reading.
  - Apply the same guard to all file-backed read and delete paths, not only create/update paths.
- Mitigation:
  - Temporarily require auth for `full` config reads if the editor does not need to be public.
- False positive notes:
  - The disclosure is limited to `.json` files because the code appends `.json`, but that still includes many operational/config files.

### SBP-003: Productivity Monitor is not server-side scoped for multi-user use — FIXED

- Rule ID: EXPRESS-INPUT-001
- Severity: High
- Status: **Remediated** — see `security_fixes_implementation_report.md`
- Location:
  - `packages/api/src/index.ts:515-516`
  - `packages/api/src/routes/productivity.ts:110-111`
  - `packages/api/src/routes/productivity.ts:115-230`
  - `packages/api/src/routes/productivity.ts:262-323`
  - `packages/api/src/routes/productivity.ts:336-365`
  - `packages/api/src/services/productivity.service.ts:206-215`
  - `packages/api/src/services/productivity.service.ts:544-575`
- Evidence:
  - After the public heartbeat routes, the rest of the Productivity API is protected only by `conditionalAuth, requireFeature`; there is no admin-only or local-mode-only check.
  - The backing tables are global, not user-scoped:
    - stats queries read from `productivity_heartbeats` without `user_id`
    - `clearAllData()` deletes the entire dataset
    - `getCloudConfig()` / `setCloudConfig()` read and write a single global config table
- Impact:
  - If `feature.productivityMonitor` is enabled outside trusted single-user local mode, any authenticated user can read all collected heartbeats, clear all analytics data, trigger syncs, and replace the instance-wide cloud configuration.
  - This is a tenant-isolation and authorization failure, not just a UI issue.
- Fix:
  - Enforce either:
    - local-mode-only access on the server, or
    - explicit admin-only access for global views and configuration, plus per-user scoping for user-facing analytics.
  - Add `user_id` ownership to heartbeats and all dependent queries if this feature is meant to support agency mode.
  - Split global admin config routes from per-user analytics routes.
- Mitigation:
  - Do not enable `feature.productivityMonitor` in agency/multi-user deployments until server-side scoping exists.
- False positive notes:
  - The current dashboard UI appears to surface Productivity primarily in local mode, but the API itself does not enforce that boundary.

## Medium Severity

### SBP-004: Heartbeat ingestion is unauthenticated and writable from any origin — FIXED

- Rule ID: EXPRESS-CSRF-001 / EXPRESS-CORS-001
- Severity: Medium
- Status: **Remediated** — see `security_fixes_implementation_report.md`
- Location:
  - `packages/api/src/routes/productivity.ts:30-43`
  - `packages/api/src/routes/productivity.ts:80-104`
  - `packages/api/src/services/productivity.service.ts:152-187`
- Evidence:
  - `/api/productivity/heartbeats` explicitly sets `Access-Control-Allow-Origin` to `req.headers.origin || '*'`.
  - The route does not require auth and does not verify any shared secret, HMAC, extension token, or site-level proof.
  - Accepted heartbeats are inserted directly into `productivity_heartbeats`.
- Impact:
  - When the feature is enabled and a cloud account is linked, any web page, script, or bot can submit arbitrary heartbeat data, polluting analytics and consuming local storage plus cloud-sync bandwidth.
  - The current batch-size cap limits a single request, but there is no authentication or rate limit to prevent repeated abuse.
- Fix:
  - Require a per-install secret or signed token from the editor extensions and WordPress plugin.
  - Replace reflected-any-origin CORS with an explicit allowlist or remove browser CORS support entirely if not needed.
  - Add rate limiting and request logging for this endpoint.
- Mitigation:
  - Keep the feature disabled unless ingestion clients can authenticate.
- False positive notes:
  - This is primarily an integrity/availability issue, not a direct confidentiality issue.

### SBP-005: Cloud sync accepts arbitrary destinations with no SSRF validation — FIXED

- Rule ID: EXPRESS-SSRF-001
- Severity: Medium
- Status: **Remediated** — see `security_fixes_implementation_report.md`
- Location:
  - `packages/api/src/routes/productivity.ts:275-319`
  - `packages/api/src/services/productivity-sync.service.ts:12-54`
- Evidence:
  - `PUT /api/productivity/cloud/config` accepts `cloud_url`, normalizes it with `replace(/\/+$/, '')`, and immediately performs a server-side `fetch()` to `${cleanUrl}/api/v1/sync/heartbeats`.
  - Scheduled/manual sync later POSTs unsynced heartbeat data and the bearer API key to that stored destination.
  - Unlike the sync connection feature, this path does not use the existing SSRF guard (`validateRemoteUrl()` / `safeFetch()`).
- Impact:
  - A caller who can change this config can make the API server probe arbitrary URLs, including internal hosts, and can redirect collected productivity data plus the configured bearer key to attacker-controlled endpoints.
  - Combined with SBP-003, this becomes a much stronger multi-user risk.
- Fix:
  - Reuse the existing SSRF validation helpers for `cloud_url`.
  - Enforce an allowlist of expected cloud hosts if this feature only supports known backends.
  - Treat cloud configuration as an admin-only or local-only control.
- Mitigation:
  - Disable cloud sync until destination validation and access control are in place.
- False positive notes:
  - This route is authenticated, but the absence of destination validation still makes it an SSRF-capable sink.

## Positive Controls Observed

- `packages/api/src/middleware/csrf.ts` implements Origin/Referer validation plus a custom-header requirement for cookie-authenticated writes.
- `packages/api/src/utils/ssrf.ts` and `packages/api/src/services/sync.service.ts` already apply sensible SSRF protections for remote sync connections.
- `packages/api/src/index.ts` and `packages/dashboard/nginx.conf` set strong baseline CSP / `nosniff` / framing protections.
- Branding uploads reject SVG and serve uploaded content with restrictive headers.

## Recommended Order Of Remediation

1. Fix SBP-001 first. It is the strongest code-execution path.
2. Fix SBP-002 next. It is public and unauthenticated.
3. Decide whether Productivity Monitor is strictly local/admin-only or truly multi-user, then address SBP-003, SBP-004, and SBP-005 together as one coherent redesign.
