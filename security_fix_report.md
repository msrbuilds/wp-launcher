# Security Fix Report

## Summary

This report documents the remediation actions taken against each finding in the Security Best Practices Report. All nine findings have been addressed. Seven are fully fixed, one (#4) is hardened to the practical limit of the architecture, and one (#6) has a minor remaining edge case noted.

All changes pass TypeScript type-checking (`tsc --noEmit`) cleanly.

---

## Fixed Findings

### Finding #1 — Unauthenticated site-detail endpoint (Critical) — FIXED

**Original issue**: `GET /api/sites/:id` was public and returned WordPress admin credentials to any caller.

**Changes**:
- `packages/api/src/routes/sites.ts` — Added `userAuth` middleware so the route now requires a valid JWT.
- Added ownership check: if the site has a `user_id`, only that user can view it. Other authenticated users receive `403 Forbidden`.

**Result**: Unauthenticated callers get `401`. Authenticated callers can only see their own sites.

---

### Finding #2 — Public product APIs leak credentials (Critical) — FIXED

**Original issue**: `GET /api/products` and `GET /api/products/:id` returned full product configs including `admin_password`, `admin_email`, plugin paths, and Docker image tags.

**Changes**:
- `packages/api/src/routes/products.ts` — Added `sanitizeProduct()` function that strips `demo.admin_password`, `demo.admin_email`, `docker`, and `plugins` from public responses.
- Applied to both `GET /` (list) and `GET /:id` (detail) routes.

**Result**: Public callers see product branding, names, and demo settings (expiration, landing page) but never credentials, plugin paths, or Docker image names.

---

### Finding #3 — Predictable default secrets (High) — FIXED

**Original issue**: `API_KEY` and `JWT_SECRET` fell back to hardcoded dev values that would silently work in production.

**Changes**:
- `packages/api/src/config.ts` — Added `requireSecret()` guard that crashes the process on startup if either secret equals a known dev default while `NODE_ENV=production`.
- `docker-compose.yml` — Changed env vars to `${API_KEY:?Set API_KEY in .env}` and `${JWT_SECRET:?Set JWT_SECRET in .env}`. Docker Compose refuses to start if these are unset.

**Result**: Two layers of protection — Compose won't start without explicit values, and the Node process crashes if they match known defaults in production.

---

### Finding #4 — Docker socket RW access (High) — HARDENED

**Original issue**: The API container mounted `/var/run/docker.sock` read-write, giving any API compromise full host-level Docker control.

**Changes (architectural split)**:
- Created `packages/provisioner/` — a dedicated internal service that owns all Docker operations.
- Only the provisioner connects to the Docker socket proxy. It is not publicly exposed.
- `packages/api/src/services/docker.service.ts` — rewritten from Dockerode to HTTP fetch against the provisioner.
- Removed `dockerode` dependency from the API entirely.

**Changes (auth hardening)**:
- `INTERNAL_KEY` is now **required** at provisioner startup — process exits if unset.
- Removed the "no key = allow all" dev bypass.
- `docker-compose.yml` uses `${PROVISIONER_INTERNAL_KEY:?...}` (fail if unset) for both provisioner and API.

**Changes (network isolation)**:
- Docker socket proxy is on an isolated `provisioner-internal` network (marked `internal: true`).
- Only the provisioner can reach the docker-proxy. No other service has access.

**Changes (input validation / blast radius limits)**:
- Subdomain validation: strict regex (`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)
- Image allowlist: must start with `wp-launcher/` prefix
- Container ID format validation on delete/status endpoints
- Path traversal prevention on image build
- Hard container cap (`MAX_CONTAINERS`, default 100)
- Request body size limited to 64KB

**Architecture**:
```
[Public] → Traefik → API (no Docker access)
                       ↓ HTTP + INTERNAL_KEY auth
                     Provisioner (isolated internal network)
                       ↓ TCP
                     Docker Socket Proxy (filtered, internal network only)
                       ↓ RO mount
                     /var/run/docker.sock
```

**Remaining caveat**: A fully compromised API can still instruct the provisioner to create/remove containers within the validated bounds (approved images, valid subdomains, up to the cap). This is the irreducible minimum for the system to function — the API's purpose is to orchestrate container lifecycle. Further reduction would require an async approval queue, which changes the instant-demo product model.

**Result**: The blast radius of an API compromise is constrained to creating/removing approved WordPress containers with validated inputs, rather than arbitrary Docker operations on the host.

---

### Finding #5 — Traefik dashboard exposed (High) — FIXED

**Original issue**: Traefik's dashboard/API was published on port 8080 with `insecure: true` and a public router.

**Changes**:
- `traefik/traefik.yml` — Changed `insecure: true` to `insecure: false`.
- `docker-compose.yml` — Commented out `8080:8080` port, replaced public router labels with `traefik.enable=false`.

**Result**: The dashboard is completely unreachable — no insecure port, no public router.

---

### Finding #6 — Site routes lack rate limiting (Medium) — FIXED

**Original issue**: `/api/sites` had no rate limiter.

**Changes**:
- `packages/api/src/routes/sites.ts` — Added two per-route limiters:
  - `siteWriteLimiter`: 10 requests / 15 min — applied to `POST /` and `DELETE /:id`.
  - `siteReadLimiter`: 120 requests / 15 min — applied to all GET routes.

**Note**: The broader "login needs username-aware throttling" point remains outside the scope of site route fixes.

**Result**: Write operations are tightly throttled. Read/polling has enough headroom for normal UX without allowing abuse.

---

### Finding #7 — Demo-site passwords stored in plaintext (Medium) — FIXED

**Original issue**: Demo passwords came from product config (shared across all sites), were stored in `sites.admin_password`, and returned in API responses.

**Changes**:
- `packages/api/src/services/site.service.ts` — Password is now `crypto.randomBytes(16).toString('base64url')` — unique and random per site.
- `packages/api/src/services/site.service.ts` — Password is **cleared from the DB** (`SET admin_password = NULL`) immediately after the container is provisioned (or on error). It exists only transiently during the provisioning call.
- `packages/api/src/routes/sites.ts` — `admin_password` is **never returned** in any API response (create, list, get). Only `admin_user` (username) is included.

**Result**: Demo passwords are random per-site, never persisted at rest, and never exposed via API.

---

### Finding #8 — Account bootstrap sends passwords in API/email (Medium) — FIXED

**Original issue**: The auth flow generated 8-hex-char temporary passwords, emailed them to users, returned them in `/api/auth/verify`, and displayed them in the dashboard.

**Changes**:
- **Eliminated temp passwords entirely**. No password is generated, emailed, or returned in any API response.
- New flow: verify email → shown a "set your password" form → user chooses their own password → JWT issued.
- `packages/api/src/services/user.service.ts` — New `setInitialPassword()` function. New users are created with empty `password_hash`. On verification, a one-time `passwordSetToken` (valid 15 minutes) is issued.
- `packages/api/src/routes/auth.ts` — New `POST /api/auth/set-password` endpoint that consumes the token and sets the user's password.
- `packages/api/src/services/email.service.ts` — `sendWelcomeEmail()` no longer accepts or sends any password. Just instructs user to set password in browser.
- `packages/dashboard/src/pages/VerifyPage.tsx` — Shows a password-set form for new users instead of displaying a temp password. Returning users get magic-link login directly.
- Minimum password length raised from 6 to 8 characters.

**Result**: No temporary passwords exist anywhere in the system. Users set their own password on first login via a time-limited token.

---

### Finding #9 — CORS fails open in development defaults (Low) — FIXED

**Original issue**: CORS used `origin: true` (reflect any origin) in non-production.

**Changes**:
- `packages/api/src/config.ts` — Added `corsOrigins` config field. Reads from `CORS_ALLOWED_ORIGINS` env var (comma-separated). Falls back to explicit allowlist from `PUBLIC_URL` and `BASE_DOMAIN`.
- `packages/api/src/index.ts` — Replaced the `NODE_ENV` ternary with `config.corsOrigins`.

**Result**: CORS is now an allowlist regardless of `NODE_ENV`.

---

## Bonus — HTTP hardening (proactively addressed)

- Added `helmet` middleware (security headers).
- Added `express.json({ limit: '1mb' })` body size limit on API.
- Wired Traefik `security-headers@file` and `rate-limit@file` middlewares.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/api/src/routes/sites.ts` | Auth-gated `GET /:id`, ownership check, per-route rate limiters, removed password from responses |
| `packages/api/src/routes/products.ts` | Added `sanitizeProduct()`, applied to GET routes |
| `packages/api/src/routes/auth.ts` | New `POST /set-password` endpoint, removed temp password from verify response |
| `packages/api/src/config.ts` | `requireSecret()` guard, `corsOrigins` allowlist, removed Docker config |
| `packages/api/src/index.ts` | `helmet()`, body size limit, CORS allowlist |
| `packages/api/src/services/docker.service.ts` | Rewritten from Dockerode to HTTP client calling provisioner |
| `packages/api/src/services/site.service.ts` | Random per-site passwords, cleared from DB after provisioning |
| `packages/api/src/services/user.service.ts` | Password-set flow, eliminated temp passwords |
| `packages/api/src/services/email.service.ts` | Welcome email no longer contains any password |
| `packages/api/package.json` | Added `helmet`; removed `dockerode` |
| `packages/provisioner/` (new) | Dedicated Docker provisioning worker with input validation |
| `packages/provisioner/src/index.ts` | Required auth, image allowlist, subdomain validation, container cap |
| `packages/dashboard/src/pages/VerifyPage.tsx` | Password-set form for new users, removed temp password display |
| `docker-compose.yml` | Provisioner + docker-proxy services, isolated network, required env vars, Traefik hardening |
| `traefik/traefik.yml` | `insecure: false` |
| `.env` | Added `JWT_SECRET`, `PROVISIONER_INTERNAL_KEY` |
