# Security Fixes Implementation Report

Date: 2026-03-23 (updated after gap review)

Based on findings from: `reports/security_best_practices_report.md` (2026-03-22)

## Summary

All 4 findings (3 High, 1 Medium) and 2 additional observations from the security report have been remediated.

| Fix | Finding | Severity | Status |
|-----|---------|----------|--------|
| 1 | SBP-001: Same-site CSRF | High | Implemented |
| 2 | SBP-002: Sync tenant isolation | High | Implemented |
| 3 | SBP-003: SSRF via sync | High | Implemented |
| 4 | SBP-004: JWT in response body | Medium | Implemented |
| 5 | SVG/upload XSS | Observation | Implemented |
| 6 | Missing CSP headers | Observation | Implemented |

---

## Fix 1: CSRF Protection (SBP-001)

**Problem:** Demo sites on sibling subdomains (`*.BASE_DOMAIN`) can submit same-site POST requests with the victim's cookies. `SameSite=Strict` does not block sibling subdomain requests. Bodyless admin POST endpoints are trivially exploitable via HTML form CSRF.

**Changes:**

### New files
- `packages/api/src/middleware/csrf.ts` — CSRF protection middleware with two defence layers:
  1. **Origin/Referer validation** — only the exact dashboard origin is trusted, NOT wildcard `*.baseDomain`
  2. **Custom header requirement** — requires `X-Requested-With: XMLHttpRequest` on all state-changing requests (plain HTML forms cannot set custom headers)
  - Skips safe methods (GET, HEAD, OPTIONS)
  - Skips M2M requests authenticated via `X-Api-Key` header

- `packages/dashboard/src/utils/api.ts` — `apiFetch()` wrapper that automatically adds `credentials: 'include'` and `X-Requested-With: XMLHttpRequest` to all requests

### Modified files
- `packages/api/src/index.ts` — Mounted `csrfProtection` middleware globally after `cookieParser()`
- **25 dashboard files** migrated from bare `fetch()` to `apiFetch()` (zero bare `fetch('/api/` calls remain):
  - `context/AuthContext.tsx`, `context/SettingsContext.tsx`
  - `App.tsx`
  - `pages/LoginPage.tsx`, `VerifyPage.tsx`, `LaunchPage.tsx`, `SitesListPage.tsx`, `SyncPage.tsx`, `AccountPage.tsx`, `CreateProductPage.tsx`, `CreateTemplatePage.tsx`, `LocalLaunchPage.tsx`, `LocalDashboard.tsx`
  - `pages/admin/SitesTab.tsx`, `MonitoringPage.tsx`, `FeaturesTab.tsx`, `ProductsTab.tsx`, `UsersTab.tsx`, `SystemTab.tsx`, `BulkTab.tsx`, `InvoicesPage.tsx`, `InvoicePrintPage.tsx`, `ProjectDetailPage.tsx`, `ProjectsPage.tsx`, `ClientsPage.tsx`, `BrandingTab.tsx`, `AnalyticsTab.tsx`, `LogsTab.tsx`, `OverviewTab.tsx`

---

## Fix 2: Tenant Isolation for Sync (SBP-002)

**Problem:** `remote_connections` table had no `user_id` column. All connections and sync history were globally visible to any authenticated user.

**Changes:**

### Database migration (`packages/api/src/utils/db.ts`)
- Added `user_id TEXT` column to `remote_connections` with index
- Added `user_id TEXT` column to `sync_history` with index
- Backfill: existing rows set to `'admin'` ownership

### Service layer (`packages/api/src/services/sync.service.ts`)
- `listConnections(userId, isAdmin)` — filters by `user_id` unless admin
- `addConnection(name, url, apiKey, userId)` — stores `user_id` on creation
- `testConnection(connectionId, userId, isAdmin)` — ownership check via `getOwnedConnection()`
- `removeConnection(connectionId, userId, isAdmin)` — ownership check
- `pushToRemote()` / `pullFromRemote()` — accept `isAdmin` param, verify connection ownership, store `user_id` in sync_history
- `getSyncHistory(siteId, userId, isAdmin)` — filters by `user_id` unless admin
- `getSyncStatus(syncId, userId, isAdmin)` — filters by `user_id` unless admin (closes sync-status-by-id gap)
- New helper: `getOwnedConnection()` — centralized ownership check, throws `ForbiddenError` if not owned

### Incremental sync (`packages/api/src/services/sync-incremental.service.ts`)
- `startPreview()`, `pushSelective()`, `pullSelective()` — accept `isAdmin` param, check connection ownership
- `getPreviewResult()` — accepts `userId, isAdmin`, returns null if not owned (closes preview-by-id gap)
- `pushSelective()` and `pullSelective()` — now write `user_id` to `sync_history` INSERT statements
- Preview cache entries now store `userId` for ownership checks on retrieval
- Updated `RemoteConnection` interface to include `user_id`

### Routes (`packages/api/src/routes/sync.ts`)
- All handlers now pass `req.userId` and `req.userRole === 'admin'` to service functions

---

## Fix 3: SSRF Protection (SBP-003)

**Problem:** `addConnection()` only validated URL syntax. No private IP blocking, protocol allowlist, or DNS rebinding defense.

**Changes:**

### New file (`packages/api/src/utils/ssrf.ts`)
- `validateRemoteUrl(url)` — validates before storing:
  - **Protocol allowlist**: only `https:` in production; `http:` allowed in dev/local mode
  - **DNS resolution + IP blocking**: resolves hostname and blocks loopback (`127.0.0.0/8`), RFC1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local/metadata (`169.254.0.0/16`), IPv6 equivalents
  - **Hostname blocklist**: `localhost`, `*.local`, `metadata.google.internal`
- `safeFetch(url, options)` — wraps `fetch()` with:
  - Re-resolves DNS before each request (DNS rebinding defense)
  - `redirect: 'error'` (blocks redirect-based SSRF bypass)
- `isPrivateIp(ip)` — checks IPv4 and IPv6 addresses against blocked ranges

### Integration
- `addConnection()` in `sync.service.ts` — calls `validateRemoteUrl()` before storing (function is now `async`)
- All outbound `fetch()` calls in `sync.service.ts` and `sync-incremental.service.ts` replaced with `safeFetch()`:
  - `testConnection()` — status endpoint
  - `doPush()` — import endpoint
  - `doPull()` — export + download endpoints
  - `fetchRemoteManifest()` — manifest endpoint
  - `pushSelective()` — import-content endpoint
  - `pullSelective()` — export-content endpoint

---

## Fix 4: Remove JWT from Auth Responses (SBP-004)

**Problem:** Auth endpoints returned JWT `token` in JSON response body alongside setting `HttpOnly` cookie. The dashboard never uses the token from the body — it relies on cookies via `credentials: 'include'`.

**Changes:**

### `packages/api/src/routes/auth.ts`
- Removed `token: jwtToken` from `/verify` response (returning user path)
- Removed `token: jwtToken` from `/set-password` response
- Removed `token` from `/login` response
- Cookie-based auth (`setAuthCookie()`) preserved — no behavioral change

### `packages/api/src/index.ts`
- Removed `token` from `/api/auth/local-token` response

---

## Fix 5: SVG/Upload XSS Protection

**Problem:** SVG uploads were allowed for branding logos. SVGs can contain `<script>` tags and event handlers. Uploaded files served from primary origin could execute scripts in the app's security context. Product/template image uploads trusted `file.originalname` for extension.

**Changes:**

### `packages/api/src/index.ts`
- **Rejected SVG uploads** for branding logo — removed `image/svg+xml` from allowed types
- **Added restrictive headers** to uploaded file serving:
  - `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` (neutralizes script execution)
  - `X-Content-Type-Options: nosniff`

### `packages/api/src/index.ts` (product assets)
- Added restrictive CSP + nosniff headers to `/api/assets` static serving (matching `/api/uploads` treatment)

### `packages/api/src/routes/products.ts`
- Image file extension validated against allowlist (`['.png', '.jpg', '.jpeg', '.webp', '.gif']`) instead of trusting `file.originalname`
- Plugin/theme filenames sanitized: non-alphanumeric characters stripped, extension validated against `['.zip', '.tar', '.gz', '.php']`

### `packages/api/src/routes/templates.ts`
- Same image extension validation and plugin/theme filename sanitization applied

---

## Fix 6: Content Security Policy Headers

**Problem:** No CSP header was configured in the application, Traefik, or nginx. XSS vulnerabilities would be unmitigated.

**Changes:**

### `packages/api/src/index.ts`
- Configured Helmet CSP directives:
  - `default-src 'self'`
  - `script-src 'self'`
  - `style-src 'self' 'unsafe-inline'` (required for dynamic theme color CSS variables)
  - `img-src 'self' data: blob:`
  - `connect-src 'self'`
  - `frame-ancestors 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`

### `traefik/dynamic/middleware.yml`
- Added `contentSecurityPolicy` to the `security-headers` middleware with matching directives

### `packages/dashboard/nginx.conf`
- Added CSP header via `add_header` directive
- Added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` headers

---

## Verification

- API TypeScript compilation: **passed** (`npx tsc --noEmit`)
- Dashboard TypeScript compilation: **passed** (`npx tsc --noEmit`)

## Files Changed

### New files (3)
- `packages/api/src/middleware/csrf.ts`
- `packages/api/src/utils/ssrf.ts`
- `packages/dashboard/src/utils/api.ts`

### Modified files (24)
- `packages/api/src/index.ts`
- `packages/api/src/routes/auth.ts`
- `packages/api/src/routes/sync.ts`
- `packages/api/src/routes/products.ts`
- `packages/api/src/routes/templates.ts`
- `packages/api/src/services/sync.service.ts`
- `packages/api/src/services/sync-incremental.service.ts`
- `packages/api/src/utils/db.ts`
- `packages/dashboard/nginx.conf`
- `traefik/dynamic/middleware.yml`
- `packages/dashboard/src/utils/api.ts`
- `packages/dashboard/src/context/AuthContext.tsx`
- `packages/dashboard/src/pages/LoginPage.tsx`
- `packages/dashboard/src/pages/VerifyPage.tsx`
- `packages/dashboard/src/pages/LaunchPage.tsx`
- `packages/dashboard/src/pages/SitesListPage.tsx`
- `packages/dashboard/src/pages/SyncPage.tsx`
- `packages/dashboard/src/pages/admin/SitesTab.tsx`
- `packages/dashboard/src/pages/admin/MonitoringPage.tsx`
- `packages/dashboard/src/pages/admin/FeaturesTab.tsx`
- `packages/dashboard/src/pages/admin/ProductsTab.tsx`
- `packages/dashboard/src/pages/admin/UsersTab.tsx`
- `packages/dashboard/src/pages/admin/SystemTab.tsx`
- `packages/dashboard/src/pages/admin/BulkTab.tsx`
- `packages/dashboard/src/pages/admin/InvoicesPage.tsx`
- `packages/dashboard/src/pages/admin/ProjectDetailPage.tsx`
- `packages/dashboard/src/pages/admin/ProjectsPage.tsx`
- `packages/dashboard/src/pages/admin/ClientsPage.tsx`
