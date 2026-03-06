# Security Fix Report

## Summary

This report tracks the remediation status of the nine findings from the security review.

- Fully fixed: Finding 1, Finding 2, Finding 3, Finding 5, Finding 7, Finding 8, Finding 9
- Partially fixed: Finding 4, Finding 6
- Fully open: None

Verification note: `npx tsc --noEmit -p packages/api/tsconfig.json` and `npx tsc --noEmit -p packages/dashboard/tsconfig.json` both passed during this update.

## Fixed Findings

### Finding #1 — Unauthenticated site-detail endpoint (Critical) — FIXED

- `packages/api/src/routes/sites.ts:96-121` now requires `userAuth` and enforces ownership checks.
- `packages/api/src/routes/sites.ts:44-50`, `packages/api/src/routes/sites.ts:82-84`, and `packages/api/src/routes/sites.ts:115-117` no longer return site passwords.
- Result: unauthenticated callers cannot retrieve site details, and authenticated users can only view their own user-bound sites.

### Finding #2 — Public product APIs leaked credentials (Critical) — FIXED

- `packages/api/src/routes/products.ts:6-29` now sanitizes public product responses.
- `sanitizeProduct()` removes `demo.admin_password`, `demo.admin_email`, `docker`, and `plugins` from public output.
- Result: public callers can no longer recover shared demo credentials or internal provisioning metadata.

### Finding #3 — Predictable default secrets (High) — FIXED

- `packages/api/src/config.ts:1-22` now rejects known dev defaults in production with `requireSecret()`.
- `docker-compose.yml:71-76` requires explicit `API_KEY`, `JWT_SECRET`, and related secrets at Compose startup.
- Result: the shipped deployment path no longer silently accepts repository-known credentials.

### Finding #5 — Traefik dashboard exposure (High) — FIXED

- `traefik/traefik.yml:1-3` disables insecure dashboard mode.
- `docker-compose.yml:5-17` removes the default `8080` exposure and sets `traefik.enable=false` on the Traefik service itself.
- Result: the dashboard is no longer publicly routed by default.

### Finding #7 — Demo-site passwords at rest and in API responses (Medium) — FIXED

- `packages/api/src/services/site.service.ts:88` now generates a unique per-site password.
- `packages/api/src/services/site.service.ts:127-131` clears `admin_password` from the database immediately after provisioning success or failure.
- `packages/api/src/routes/sites.ts:44-50`, `packages/api/src/routes/sites.ts:82-84`, and `packages/api/src/routes/sites.ts:115-117` omit passwords from create/list/get responses.
- Result: demo passwords are ephemeral and are not persisted at rest after provisioning.

### Finding #8 — Temp-password onboarding flow (Medium) — FIXED

- `packages/api/src/routes/auth.ts:38-65` now returns `needsPassword` and `passwordSetToken` for first-time users instead of a temporary password.
- `packages/api/src/routes/auth.ts:73-99` adds `/api/auth/set-password` for first-time password setup.
- `packages/api/src/services/user.service.ts:53-130` removes temp-password generation entirely and uses a one-time 15-minute password-set token.
- `packages/api/src/services/email.service.ts:48-67` sends a credential-free welcome email.
- `packages/dashboard/src/pages/VerifyPage.tsx:33-76` and `packages/dashboard/src/pages/VerifyPage.tsx:101-153` now drive an in-browser password-set flow.
- Result: no password is generated, emailed, or returned by the verification API.

### Finding #9 — CORS fail-open behavior (Low) — FIXED

- `packages/api/src/config.ts:38-45` now defines an explicit `corsOrigins` allowlist.
- `packages/api/src/index.ts:17-22` applies that allowlist regardless of `NODE_ENV`.
- Result: browser origins are restricted by configuration rather than reflected open-endedly in development mode.

## Partially Fixed Findings

### Finding #4 — Docker blast radius from the API path (High) — PARTIALLY FIXED

What changed:

- `packages/api/src/services/docker.service.ts:6-79` no longer talks to Docker directly; it calls the provisioner over internal HTTP.
- `packages/provisioner/src/index.ts:8-12` now requires `INTERNAL_KEY` at startup.
- `packages/provisioner/src/index.ts:27-37` removed the old no-key bypass and enforces the shared internal key on every request.
- `packages/provisioner/src/index.ts:36`, `packages/provisioner/src/index.ts:46-61`, `packages/provisioner/src/index.ts:80-145`, and `packages/provisioner/src/index.ts:148-235` add a `64kb` body limit, image-prefix allowlist, subdomain/container-ID validation, a `MAX_CONTAINERS` cap, and path-traversal rejection for image builds.
- `docker-compose.yml:19-49` and `docker-compose.yml:117-120` isolate `docker-proxy` on the internal `provisioner-internal` network so only the provisioner reaches it.

Why this is not fully closed:

- The API still has the legitimate `PROVISIONER_INTERNAL_KEY` via `docker-compose.yml:75-76`.
- A fully compromised API can still instruct the provisioner to create or remove approved managed containers within the allowed policy.

Result:

- The original host-level blast radius is materially reduced and constrained to a narrow provisioning surface, but it is not zero.

### Finding #6 — Abuse controls for auth and site lifecycle routes (Medium) — PARTIALLY FIXED

What changed:

- `packages/api/src/routes/sites.ts:8-25` adds separate `siteWriteLimiter` and `siteReadLimiter`.
- Those limiters are now applied directly to create, delete, list, detail, status, and readiness routes in `packages/api/src/routes/sites.ts:28-178`.
- `packages/api/src/index.ts:50-51` no longer wraps all site routes in the earlier blanket limiter, which avoids the prior polling regression.

Why this is not fully closed:

- `/api/auth/login` in `packages/api/src/routes/auth.ts:103-125` still depends on the coarse top-level `/api/auth` IP limiter from `packages/api/src/index.ts:24-31`.
- There is still no username-aware or account-aware throttling to slow credential stuffing against a single account from distributed IPs.

Result:

- Site lifecycle abuse resistance is improved and the frontend polling path is no longer self-throttled, but the broader auth-abuse finding is only partially remediated.

## No Remaining Fully Open Findings

All original findings now have either a verified fix or a partial mitigation in place. The remaining work is to close the residual gaps in Finding #4 and Finding #6.

## Verification Scope

- Static code review against the current workspace
- TypeScript type-checks for API and dashboard
- No live `docker compose` deployment or external probing was run for this update
