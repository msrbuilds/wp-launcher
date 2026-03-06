# Security Best Practices Report

## Executive Summary

This report originally identified nine security findings. After reviewing the current codebase and comparing it against the claimed remediation work, four findings are now verified fixed, three are only partially addressed, and two remain open by design or deferral.

The most important remaining issues are operational rather than purely code-local: the Traefik dashboard is still reachable through a public router despite the `8080` port being removed, and the Docker socket risk is reduced but not eliminated because the API can still drive privileged container lifecycle actions through the socket proxy. The site-rate-limiting change also appears to throttle the application's own normal readiness polling flow.

## Remediation Status

- Verified fixed: Finding 1, Finding 2, Finding 3, Finding 9
- Partially fixed: Finding 4, Finding 5, Finding 6
- Open: Finding 7, Finding 8
- Verification note: `npx tsc --noEmit -p packages/api/tsconfig.json` and `npx tsc --noEmit -p packages/dashboard/tsconfig.json` both passed during this review.

## Critical Findings

### 1. Unauthenticated site-detail endpoint exposes live WordPress admin credentials

- Rule ID: EXPRESS-AUTHZ-001
- Severity: Critical
- Status: Verified fixed
- Location: `packages/api/src/routes/sites.ts:78-99`, `packages/api/src/routes/sites.ts:43-71`
- Evidence:

```ts
router.get('/:id', (req: AuthRequest, res: Response) => {
  const site = getSite(req.params.id);
  ...
  res.json({
    id: site.id,
    ...
    credentials: {
      username: site.admin_user,
      password: site.admin_password,
    },
  });
});
```

```ts
router.get('/', optionalUserAuth, (req: AuthRequest, res: Response) => {
  ...
  res.json(
    sites.map((s) => ({
      id: s.id,
      subdomain: s.subdomain,
      url: s.site_url,
      ...
    })),
  );
});
```

- Impact: Any unauthenticated caller can enumerate active site IDs from `GET /api/sites` and then call `GET /api/sites/:id` to retrieve the corresponding WordPress admin username and password, leading to full takeover of active demo sites.
- Fix: Require authenticated access on `GET /api/sites/:id`, enforce ownership checks for normal users, and never return stored admin passwords after initial provisioning.
- Remediation verification: `GET /api/sites/:id` now requires `userAuth`, and the route enforces ownership for user-bound sites in the current code.
- Mitigation: Rotate any demo-site credentials that may have been exposed before this fix was deployed.
- False positive notes: None. The route is public in code and returns credentials directly.

### 2. Public product APIs leak shared demo admin passwords and internal provisioning details

- Rule ID: EXPRESS-AUTHZ-001
- Severity: Critical
- Status: Verified fixed
- Location: `packages/api/src/routes/products.ts:7-20`, `products/5dp-backup-engine.json:22-30`, `products/elementor-mcp.json:32-40`, `products/_default.json:16-24`
- Evidence:

```ts
router.get('/', (_req: Request, res: Response) => {
  const products = listProducts();
  res.json(products);
});

router.get('/:id', (req: Request, res: Response) => {
  const product = getProductConfig(req.params.id);
  res.json(product);
});
```

```json
"demo": {
  "admin_user": "demo",
  "admin_password": "demo123",
  "admin_email": "demo@example.com"
}
```

- Impact: Anonymous users can fetch raw product configs and recover the shared WordPress admin credentials used for demo sites. Combined with `GET /api/sites`, this is enough to log into any exposed active site without owning an account.
- Fix: Return a sanitized public product model that excludes `demo.admin_password`, `demo.admin_email`, plugin paths, and Docker image details. Generate unique per-site admin passwords server-side instead of reusing static config values.
- Remediation verification: the public `GET /api/products` and `GET /api/products/:id` routes now call `sanitizeProduct()` and strip `demo.admin_password`, `demo.admin_email`, `docker`, and `plugins`.
- Mitigation: Rotate the shared demo credentials if they were ever used in a public deployment before this fix.
- False positive notes: None. Sensitive fields are present in shipped product JSON and are returned as-is by the public endpoints.

## High Findings

### 3. Predictable default admin and JWT secrets remain in the production code path

- Rule ID: EXPRESS-SESS-002
- Severity: High
- Status: Verified fixed
- Location: `packages/api/src/config.ts:4-12`, `docker-compose.yml:43-44`
- Evidence:

```ts
apiKey: process.env.API_KEY || 'dev-api-key',
...
jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
```

```yaml
- API_KEY=${API_KEY:-dev-api-key}
- JWT_SECRET=${JWT_SECRET:-dev-jwt-secret-change-me}
```

- Impact: If the app is deployed without explicitly overriding these values, anyone who knows the repository defaults can access the admin API or mint valid user JWTs.
- Fix: Fail fast on startup when `API_KEY` or `JWT_SECRET` are unset or still equal to known development defaults. Remove insecure fallbacks from `docker-compose.yml`.
- Remediation verification: `docker-compose.yml` now requires explicit `API_KEY` and `JWT_SECRET`, and `packages/api/src/config.ts` refuses known dev defaults in production mode.
- Mitigation: Audit live environments immediately and rotate both secrets anywhere defaults may have been used before this change.
- False positive notes: If every deployed environment overrides these values with strong secrets, the exploit path is closed. That protection is not enforced by the app today.

### 4. Read-write Docker socket access gives the API host-level blast radius

- Rule ID: EXPRESS-CMD-001
- Severity: High
- Status: Partially fixed
- Location: `docker-compose.yml:34-35`, `packages/api/src/services/docker.service.ts:19-25`, `packages/api/src/services/docker.service.ts:46-67`
- Evidence:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

```ts
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
...
const container = await docker.createContainer({
  Image: opts.image,
  name: containerName,
  ...
});
await container.start();
```

- Impact: Any API compromise, SSRF-to-local-socket class bug, or admin-key abuse that reaches this code can create, start, stop, or remove containers through the host Docker daemon. In practice, that is equivalent to host-level control.
- Fix: Move provisioning into a narrowly scoped privileged worker, use a remote API or rootless/runtime-isolated control plane with tighter permissions, and remove the Docker socket mount from the general-purpose API container.
- Remediation verification: the API no longer mounts `/var/run/docker.sock` directly and now talks to `docker-socket-proxy` over `DOCKER_HOST`. This reduces exposure to some Docker API families.
- Remaining gap: the proxy still allows container lifecycle operations (`CONTAINERS=1`, `POST=1`), and the API can still submit attacker-influenced container creation requests. That means host-level blast radius is reduced, not removed.
- Mitigation: Treat the API service as highly privileged infrastructure, reduce its public exposure, and monitor Docker daemon activity for unexpected container operations.
- False positive notes: The socket mount may be intentional for the product, but it still materially raises severity for every API-side weakness.

### 5. The default deployment exposes the Traefik dashboard/API without authentication

- Rule ID: EXPRESS-HEADERS-001
- Severity: High
- Status: Partially fixed
- Location: `traefik/traefik.yml:1-3`, `docker-compose.yml:5-8`, `docker-compose.yml:16-19`
- Evidence:

```yaml
api:
  dashboard: true
  insecure: true
```

```yaml
ports:
  - "80:80"
  - "443:443"
  - "8080:8080" # Traefik dashboard (dev only)
```

- Impact: A default deployment publishes the Traefik dashboard/API on port `8080` with `insecure: true`, which exposes routing and infrastructure metadata to unauthenticated clients and enlarges the operational attack surface.
- Fix: Disable `api.insecure`, stop publishing port `8080` by default, and if dashboard access is required, front it with strong authentication and an allowlist.
- Remediation verification: `insecure: true` has been changed to `insecure: false`, and the direct `8080:8080` port binding is commented out.
- Remaining gap: the `traefik-dashboard` router still publicly maps `Host(\`traefik.${BASE_DOMAIN}\`)` to `api@internal` with no authentication middleware, so the dashboard remains exposed through the normal web entrypoints.
- Mitigation: Remove the public dashboard router by default, or add explicit auth and source restrictions before exposing it.
- False positive notes: If production firewalls block port `8080`, exposure may be limited. The shipped compose file binds it publicly by default.

## Medium Findings

### 6. Public auth and site lifecycle routes lack targeted abuse controls

- Rule ID: EXPRESS-AUTH-001
- Severity: Medium
- Status: Partially fixed
- Location: `packages/api/src/index.ts:24-31`, `packages/api/src/index.ts:47-62`, `packages/api/src/routes/sites.ts:8-40`, `packages/api/src/routes/sites.ts:106-152`, `packages/api/src/services/site.service.ts:66-73`
- Evidence:

```ts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});
...
app.use('/api/auth', authLimiter, authRouter);
...
app.use('/api/sites', sitesRouter);
```

```ts
router.post('/', userAuth, async (req: AuthRequest, res: Response) => {
  ...
  const site = await createSite(...);
});
```

```ts
const maxConcurrent = productConfig?.demo?.max_concurrent_sites ?? config.defaults.maxConcurrentSites;
if (activeSiteCount.count >= maxConcurrent) {
  throw new Error(`Maximum concurrent sites (${maxConcurrent}) reached for this product.`);
}
```

- Impact: Auth endpoints only have a coarse IP-based limiter, with no per-account brute-force throttling on `/login`, and the site routes have no limiter at all. The per-product concurrency cap prevents truly unlimited container creation, but an attacker can still automate registrations, consume demo capacity, spam verification emails, or hammer site readiness/status endpoints.
- Fix: Add per-route rate limits for `/api/sites` creation and polling endpoints, add username+IP based throttling for `/api/auth/login`, and apply stricter controls to registration and verification flows.
- Remediation verification: a `sitesLimiter` is now attached to `/api/sites`.
- Remaining gap: `/api/auth/login` still lacks username-aware throttling, and the new `30 requests / 15 minutes` cap on `/api/sites` is low enough to collide with the frontend's normal `POST /api/sites` plus up to 30 `/api/sites/:id/ready` polling sequence.
- Mitigation: Split create/list/polling limits by route and apply per-account throttling to login attempts.
- False positive notes: There is some protection already: `/api/auth` and `/api/admin` are rate-limited, and per-product concurrency caps reduce worst-case container sprawl.

### 7. Demo-site passwords are stored and redistributed in plaintext

- Rule ID: EXPRESS-SESS-002
- Severity: Medium
- Status: Open
- Location: `packages/api/src/utils/db.ts:35-50`, `packages/api/src/services/site.service.ts:86-108`, `packages/dashboard/src/pages/SitesListPage.tsx:96-99`
- Evidence:

```sql
CREATE TABLE IF NOT EXISTS sites (
  ...
  admin_user TEXT,
  admin_password TEXT,
  ...
);
```

```ts
db.prepare(`
  INSERT INTO sites (id, subdomain, product_id, user_id, status, site_url, admin_url, admin_user, admin_password, expires_at)
  VALUES (?, ?, ?, ?, 'creating', ?, ?, ?, ?, ?)
`).run(id, subdomain, req.productId, req.userId || null, siteUrl, adminUrl, adminUser, adminPassword, expiresAt);
```

```tsx
{site.credentials && (
  <div className="meta">
    Login: <code>{site.credentials.username}</code> / <code>{site.credentials.password}</code>
  </div>
)}
```

- Impact: Any future read exposure of the database, site APIs, admin logs, or frontend state reveals reusable WordPress admin passwords in plaintext.
- Fix: Generate per-site passwords, show them once at creation time, and stop persisting them in the application database. If recovery is required, use a reset workflow instead of storage.
- Mitigation: Reduce the number of endpoints and UI surfaces that echo admin credentials while a full redesign is in progress.
- False positive notes: This may be partially intentional for demo UX, but it still materially increases the blast radius of any data leak.

### 8. Account bootstrap sends passwords over email and returns them in API responses

- Rule ID: EXPRESS-AUTH-001
- Severity: Medium
- Status: Open
- Location: `packages/api/src/routes/auth.ts:38-57`, `packages/api/src/services/user.service.ts:93-111`, `packages/api/src/services/email.service.ts:48-72`
- Evidence:

```ts
const { user, tempPassword } = await verifyUserEmail(token);
...
res.json({
  token: jwtToken,
  user: { id: user.id, email: user.email },
  isNewUser: !!tempPassword,
  tempPassword: tempPassword || undefined,
});
```

```ts
tempPassword = crypto.randomBytes(4).toString('hex');
```

```ts
subject: 'Welcome to WP Launcher - Your account is ready',
html,
```

- Impact: The onboarding flow spreads a usable password across email and browser-visible API responses, so compromise of a mailbox, leaked verification link, or frontend XSS yields durable account access.
- Fix: Replace temporary-password delivery with a one-time password set flow or magic-link-only onboarding. Do not return passwords in API responses or emails.
- Mitigation: Shorten token lifetimes further and force an immediate password set on first authenticated use.
- False positive notes: The verification token is intended to bootstrap the account, but the current design increases persistence and replay value beyond what is necessary.

## Low Findings

### 9. CORS fails open in development-mode defaults and depends on environment hygiene

- Rule ID: EXPRESS-CORS-001
- Severity: Low
- Status: Verified fixed
- Location: `packages/api/src/index.ts:18-20`, `packages/api/src/config.ts:39-46`
- Evidence:

```ts
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));
```

```ts
corsOrigins: process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : [
      process.env.PUBLIC_URL || 'http://localhost',
      `https://${process.env.BASE_DOMAIN || 'localhost'}`,
      `http://${process.env.BASE_DOMAIN || 'localhost'}`,
    ],
```

- Impact: If CORS were left environment-driven, a mis-set deployment could reflect arbitrary origins while allowing credentials. Because the app uses bearer tokens and API keys rather than cookie auth, this is not the primary cause of the critical leaks above, but it still matters for browser-based access control.
- Fix: Replace the environment-switch logic with an explicit allowlist variable such as `CORS_ALLOWED_ORIGINS`, and fail closed when it is unset in non-local environments.
- Remediation verification: the API now uses `config.corsOrigins` instead of `origin: true` for non-production mode, which closes the original fail-open behavior.
- Mitigation: Keep `CORS_ALLOWED_ORIGINS` explicit in production so operators do not rely on fallback host derivation.
- False positive notes: The fallback allowlist still depends on `PUBLIC_URL` and `BASE_DOMAIN`, so deployment hygiene still matters.

## Notes

- I did not find evidence of obvious SQL injection, DOM XSS sinks, or cookie-based CSRF in the current code paths.
- Expired-site cleanup is implemented and runs on startup, every minute via cron, and every five minutes via the orphan-container watchdog in `packages/api/src/services/cleanup.service.ts:11-27` and `packages/api/src/services/cleanup.service.ts:59-93`. I do not consider stale container persistence a primary finding unless cleanup failures are being observed in production.
- This report now reflects current remediation status, not just the original vulnerable state. Where a fix is marked partial, the original risk has been reduced but not eliminated.
