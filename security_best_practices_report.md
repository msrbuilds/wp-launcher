# Security Best Practices Report

## Executive Summary

This report originally identified nine security findings. After re-reviewing the current codebase, seven findings are now verified fixed, two are partially fixed, and none remain fully open.

The remaining material risk is concentrated in two areas:

- Finding #4: the Docker blast radius is now tightly constrained behind the provisioner, but a fully compromised API can still invoke approved provisioning actions with the shared internal key.
- Finding #6: the site-route abuse controls are in much better shape, but `/api/auth/login` still relies on a coarse IP limiter rather than username-aware throttling.

Verification note: `npx tsc --noEmit -p packages/api/tsconfig.json` and `npx tsc --noEmit -p packages/dashboard/tsconfig.json` both passed during this review.

## Remediation Status

- Verified fixed: Finding 1, Finding 2, Finding 3, Finding 5, Finding 7, Finding 8, Finding 9
- Partially fixed: Finding 4, Finding 6
- Open: None

## Critical Findings

### 1. Unauthenticated site-detail endpoint exposed live WordPress admin credentials

- Rule ID: EXPRESS-AUTHZ-001
- Severity: Critical
- Status: Verified fixed
- Current location: `packages/api/src/routes/sites.ts:62-121`
- Original risk: unauthenticated callers could enumerate site IDs and retrieve site credentials.
- Remediation verification: `GET /api/sites/:id` now uses `userAuth`, enforces ownership checks, and no longer returns `admin_password`. `GET /api/sites` also omits passwords from list responses.
- Evidence: [packages/api/src/routes/sites.ts:62](/f:/Vibe%20Projects/wp-launcher/packages/api/src/routes/sites.ts#L62), [packages/api/src/routes/sites.ts:96](/f:/Vibe%20Projects/wp-launcher/packages/api/src/routes/sites.ts#L96)

### 2. Public product APIs leaked shared demo passwords and internal provisioning details

- Rule ID: EXPRESS-AUTHZ-001
- Severity: Critical
- Status: Verified fixed
- Current location: `packages/api/src/routes/products.ts:6-29`
- Original risk: anonymous callers could fetch raw product configs including demo credentials and Docker/plugin details.
- Remediation verification: public product routes now pass responses through `sanitizeProduct()`, which strips `demo.admin_password`, `demo.admin_email`, `docker`, and `plugins`.
- Evidence: [packages/api/src/routes/products.ts:6](/f:/Vibe%20Projects/wp-launcher/packages/api/src/routes/products.ts#L6)

## High Findings

### 3. Predictable default admin and JWT secrets remained in the production path

- Rule ID: EXPRESS-SESS-002
- Severity: High
- Status: Verified fixed
- Current location: `packages/api/src/config.ts:1-22`, `docker-compose.yml:68-76`
- Original risk: deployments could silently run with repo-known secrets.
- Remediation verification: the API rejects known dev defaults in production via `requireSecret()`, and Compose now requires explicit `API_KEY` and `JWT_SECRET`.
- Evidence: [packages/api/src/config.ts:1](/f:/Vibe%20Projects/wp-launcher/packages/api/src/config.ts#L1), [docker-compose.yml:71](/f:/Vibe%20Projects/wp-launcher/docker-compose.yml#L71)

### 4. Docker access gave the API host-level blast radius

- Rule ID: EXPRESS-CMD-001
- Severity: High
- Status: Partially fixed
- Current location: `packages/provisioner/src/index.ts:8-37`, `packages/provisioner/src/index.ts:46-61`, `packages/provisioner/src/index.ts:80-145`, `packages/provisioner/src/index.ts:148-235`, `packages/api/src/services/docker.service.ts:6-79`, `docker-compose.yml:19-49`, `docker-compose.yml:75-76`, `docker-compose.yml:117-120`
- Original risk: direct Docker control from the API container made API compromise effectively equivalent to Docker-daemon compromise.
- Remediation verification: the API no longer mounts the Docker socket and now calls a dedicated internal provisioner. The provisioner requires `INTERNAL_KEY` at startup, rejects requests without the header match, limits request bodies to `64kb`, restricts images to the `wp-launcher/` prefix, validates subdomains and container IDs, enforces a `MAX_CONTAINERS` cap, and rejects path traversal on image builds. The Docker proxy is isolated on the internal `provisioner-internal` network.
- Remaining gap: a compromised API still has the legitimate `PROVISIONER_INTERNAL_KEY` and can direct the provisioner to create, inspect, and remove approved managed containers. The blast radius is substantially reduced and constrained, but not eliminated.
- Evidence: [packages/provisioner/src/index.ts:8](/f:/Vibe%20Projects/wp-launcher/packages/provisioner/src/index.ts#L8), [packages/provisioner/src/index.ts:36](/f:/Vibe%20Projects/wp-launcher/packages/provisioner/src/index.ts#L36), [packages/provisioner/src/index.ts:46](/f:/Vibe%20Projects/wp-launcher/packages/provisioner/src/index.ts#L46), [packages/provisioner/src/index.ts:80](/f:/Vibe%20Projects/wp-launcher/packages/provisioner/src/index.ts#L80), [packages/api/src/services/docker.service.ts:6](/f:/Vibe%20Projects/wp-launcher/packages/api/src/services/docker.service.ts#L6), [docker-compose.yml:19](/f:/Vibe%20Projects/wp-launcher/docker-compose.yml#L19), [docker-compose.yml:117](/f:/Vibe%20Projects/wp-launcher/docker-compose.yml#L117)

### 5. The default deployment exposed the Traefik dashboard/API without authentication

- Rule ID: EXPRESS-HEADERS-001
- Severity: High
- Status: Verified fixed
- Current location: `traefik/traefik.yml:1-3`, `docker-compose.yml:5-17`
- Original risk: the dashboard was reachable through `8080` and through a public Traefik router.
- Remediation verification: `api.insecure` is disabled, `8080` is no longer published by default, and the Traefik container now has `traefik.enable=false`, so it no longer self-publishes a dashboard router.
- Evidence: [docker-compose.yml:5](/f:/Vibe%20Projects/wp-launcher/docker-compose.yml#L5), [docker-compose.yml:16](/f:/Vibe%20Projects/wp-launcher/docker-compose.yml#L16)

## Medium Findings

### 6. Public auth and site lifecycle routes lacked targeted abuse controls

- Rule ID: EXPRESS-AUTH-001
- Severity: Medium
- Status: Partially fixed
- Current location: `packages/api/src/index.ts:24-31`, `packages/api/src/index.ts:47-51`, `packages/api/src/routes/sites.ts:8-25`, `packages/api/src/routes/sites.ts:28-29`, `packages/api/src/routes/sites.ts:62`, `packages/api/src/routes/sites.ts:96`, `packages/api/src/routes/sites.ts:128`, `packages/api/src/routes/sites.ts:142`, `packages/api/src/routes/sites.ts:178`, `packages/api/src/routes/auth.ts:103-125`
- Original risk: site creation and polling could be abused, and auth endpoints only had coarse IP-based protection.
- Remediation verification: the site routes now use separate read and write rate limiters, which fixes the earlier self-throttling problem around readiness polling and materially improves abuse resistance for create/delete flows.
- Remaining gap: `/api/auth/login` is still protected only by the top-level `/api/auth` IP limiter. There is still no username-aware or account-aware throttling for credential stuffing against a single user.
- Evidence: [packages/api/src/routes/sites.ts:8](/f:/Vibe%20Projects/wp-launcher/packages/api/src/routes/sites.ts#L8), [packages/api/src/index.ts:24](/f:/Vibe%20Projects/wp-launcher/packages/api/src/index.ts#L24), [packages/api/src/routes/auth.ts:103](/f:/Vibe%20Projects/wp-launcher/packages/api/src/routes/auth.ts#L103)

### 7. Demo-site passwords were stored and redistributed in plaintext

- Rule ID: EXPRESS-SESS-002
- Severity: Medium
- Status: Verified fixed
- Current location: `packages/api/src/services/site.service.ts:87-131`, `packages/api/src/routes/sites.ts:44-50`, `packages/api/src/routes/sites.ts:82-84`, `packages/api/src/routes/sites.ts:115-117`
- Original risk: reusable site-admin credentials were stored at rest and echoed through API responses.
- Remediation verification: site passwords are now randomized per site, used only during provisioning, cleared from the database immediately after success or failure, and omitted from create/list/get responses.
- Evidence: [packages/api/src/services/site.service.ts:88](/f:/Vibe%20Projects/wp-launcher/packages/api/src/services/site.service.ts#L88), [packages/api/src/services/site.service.ts:127](/f:/Vibe%20Projects/wp-launcher/packages/api/src/services/site.service.ts#L127), [packages/api/src/routes/sites.ts:44](/f:/Vibe%20Projects/wp-launcher/packages/api/src/routes/sites.ts#L44)

### 8. Account bootstrap sent passwords over email and returned them in API responses

- Rule ID: EXPRESS-AUTH-001
- Severity: Medium
- Status: Verified fixed
- Current location: `packages/api/src/routes/auth.ts:29-99`, `packages/api/src/routes/auth.ts:137-148`, `packages/api/src/services/user.service.ts:53-130`, `packages/api/src/services/email.service.ts:48-67`, `packages/dashboard/src/pages/VerifyPage.tsx:33-76`, `packages/dashboard/src/pages/VerifyPage.tsx:101-153`
- Original risk: onboarding spread durable credentials across email and browser-visible API responses.
- Remediation verification: the temp-password flow is gone. New users now receive a one-time `passwordSetToken`, set their password in-browser, and only then receive a JWT. Returning users get magic-link login. Welcome emails contain no credentials, and the minimum password length is now 8 characters.
- Evidence: [packages/api/src/routes/auth.ts:38](/f:/Vibe%20Projects/wp-launcher/packages/api/src/routes/auth.ts#L38), [packages/api/src/routes/auth.ts:73](/f:/Vibe%20Projects/wp-launcher/packages/api/src/routes/auth.ts#L73), [packages/api/src/services/user.service.ts:68](/f:/Vibe%20Projects/wp-launcher/packages/api/src/services/user.service.ts#L68), [packages/api/src/services/email.service.ts:48](/f:/Vibe%20Projects/wp-launcher/packages/api/src/services/email.service.ts#L48), [packages/dashboard/src/pages/VerifyPage.tsx:101](/f:/Vibe%20Projects/wp-launcher/packages/dashboard/src/pages/VerifyPage.tsx#L101)

## Low Findings

### 9. CORS failed open in development-mode defaults

- Rule ID: EXPRESS-CORS-001
- Severity: Low
- Status: Verified fixed
- Current location: `packages/api/src/config.ts:38-45`, `packages/api/src/index.ts:17-22`
- Original risk: a mis-set environment could reflect arbitrary origins while allowing credentials.
- Remediation verification: the API now always uses an explicit allowlist from `config.corsOrigins` rather than a fail-open development branch.
- Evidence: [packages/api/src/config.ts:38](/f:/Vibe%20Projects/wp-launcher/packages/api/src/config.ts#L38), [packages/api/src/index.ts:17](/f:/Vibe%20Projects/wp-launcher/packages/api/src/index.ts#L17)

## Notes

- I did not find evidence of obvious SQL injection, DOM XSS sinks, or cookie-based CSRF in the reviewed paths.
- Expired-site cleanup remains implemented in the cleanup service and is not treated as a primary finding in the current code state.
- This is a static verification pass. I did not run a live `docker compose` deployment or external HTTP probing for this update.
