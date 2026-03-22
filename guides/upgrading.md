# Upgrading WP Launcher

This guide covers upgrading an existing VPS installation to the latest version.

## Quick Upgrade (Recommended)

If you installed WP Launcher using the one-click installer, use the built-in update command:

```bash
cd /opt/wp-launcher   # or wherever you installed it
wpl update
```

This will:
1. Pull the latest code from GitHub
2. Generate a new `version.json`
3. Rebuild all Docker images
4. Restart services with zero downtime
5. Run a health check to verify the upgrade

## Manual Upgrade

If you prefer to upgrade step by step:

```bash
cd /opt/wp-launcher

# 1. Pull latest code
git pull --ff-only

# 2. Generate version info
bash scripts/generate-version.sh

# 3. Rebuild images
docker compose build api provisioner dashboard

# 4. Rebuild WordPress base image (if WordPress or MU-plugin changes)
bash scripts/build-wp-image.sh

# 5. Restart services
docker compose up -d

# 6. Verify
curl -sf http://localhost:3737/health
wpl version
```

## Upgrading to v2.0.0 (Security Hardening)

This is a major version bump focused on security. The upgrade is non-destructive — existing data, sites, and configurations are preserved. Database schema changes are auto-migrated on startup.

### What Changed

| Area | Before | After |
|------|--------|-------|
| CSRF | No protection | Origin + custom header validation on all state-changing requests |
| Sync connections | Global (all users see all) | Per-user scoped with `user_id` ownership |
| Sync remote URLs | Any URL accepted | SSRF protection: private IP blocking, protocol allowlist, DNS validation |
| Auth responses | JWT token in JSON body + cookie | Cookie only (JWT removed from response body) |
| Logo uploads | SVG allowed | SVG rejected (XSS risk) |
| Uploaded files | Served with default headers | Restrictive CSP: `default-src 'none'` |
| CSP header | Not configured | Full CSP on API, Traefik, and nginx |

### Migration Steps

#### 1. Update and rebuild

```bash
cd /opt/wp-launcher
wpl update
```

Or manually:

```bash
git pull --ff-only
bash scripts/generate-version.sh
docker compose build api dashboard
docker compose up -d
```

#### 2. Verify

```bash
# Check version
curl -sf http://localhost:3737/api/version

# Check CSP header is present
curl -sI http://localhost:3737/health | grep -i content-security

# Check CSRF blocks requests without custom header
curl -sf -X PUT http://localhost:3737/api/admin/features \
  -H "Content-Type: application/json" \
  -d '{"features":{}}' \
  --cookie "wpl_admin=your-api-key"
# Should return 403 CSRF validation failed
```

### Breaking Changes for API Consumers

1. **CSRF headers required** — Cookie-authenticated POST/PUT/PATCH/DELETE requests must include:
   - `Origin` header matching the dashboard domain
   - `X-Requested-With: XMLHttpRequest`
   - Requests using `X-Api-Key` header are exempt

2. **No `token` in auth responses** — If your scripts parse `data.token` from `/api/auth/login`, `/api/auth/verify`, or `/api/auth/set-password`, switch to cookie-based auth (`credentials: 'include'`).

3. **SVG logo uploads rejected** — Use PNG, JPEG, WebP, or GIF instead.

4. **Sync connections are user-scoped** — Existing connections are backfilled as admin-owned. Non-admin users will only see their own connections going forward.

---

## Upgrading to v1.1.0 (Role-Based Admin)

This version replaces the API key login with role-based admin accounts. The API key still works for machine-to-machine access (scripts, CI), but human admin login now uses email + password.

### Migration Steps

#### 1. Update the code

```bash
cd /opt/wp-launcher
git pull --ff-only
```

#### 2. Rebuild everything

```bash
# Rebuild all services
docker compose build

# Rebuild WordPress base image (security fixes in MU-plugins and entrypoint)
bash scripts/build-wp-image.sh
```

#### 3. Create your admin account

You need a registered, verified user account to be promoted to admin.

**Option A: Set ADMIN_EMAIL in .env (auto-promote on boot)**

```bash
# Add your email to .env
echo 'ADMIN_EMAIL=your@email.com' >> .env

# Restart to apply
docker compose up -d
```

The API will auto-promote this user on startup if they exist and are verified. If they don't exist yet, register first via the dashboard, then restart.

**Option B: Use the CLI**

```bash
# Register an account via the dashboard first, then:
wpl admin:promote your@email.com
```

**Option C: Use the API key directly**

```bash
# Use your existing API_KEY to promote via API
curl -X POST http://localhost:3737/api/admin/users/promote \
  -H "X-API-Key: $(grep API_KEY .env | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "role": "admin"}'
```

#### 4. Restart services

```bash
docker compose up -d
```

#### 5. Verify

- Open your dashboard and log in with your email + password
- The **Admin** link should appear in the header
- The admin dashboard should load with the sidebar navigation
- Check the **System** tab to verify the version

### What Changed

| Before | After |
|--------|-------|
| Admin login via API key in browser | Admin login via email + password |
| API key stored in sessionStorage | httpOnly cookies (not accessible to JS) |
| JWT stored in localStorage | httpOnly cookies |
| Shared admin credential | Individual admin accounts |
| Single admin | Multiple admins possible |
| Auto-login tokens permanent | Single-use, on-demand tokens |
| Same WordPress salts across containers | Unique salts per container |
| PHP config values unvalidated | Strict regex validation |

### Breaking Changes

- **Dashboard admin login flow changed**: The old "Enter API Key" prompt is gone. Admins now log in with email + password like regular users, then see the Admin link.
- **`autoLoginUrl` removed from API responses**: `POST /api/sites` and `GET /api/sites` no longer return `autoLoginUrl`. Use `POST /api/sites/:id/autologin` to generate a one-time login URL.
- **Some endpoints now require auth**: `GET /api/sites`, `GET /api/sites/:id/php-config`, `GET /api/sites/:id/snapshots`, and `GET /api/sites/:id/domain` now require a valid JWT.

### Non-Breaking

- **API key still works** for all admin endpoints via `X-API-Key` header. Scripts and CI integrations using the API key are unaffected.
- **Existing user accounts** are preserved. The `role` column defaults to `user`.
- **Existing sites** continue running. New security features (unique salts, single-use tokens) only apply to newly created containers.

## Rollback

If you need to rollback:

```bash
cd /opt/wp-launcher

# Check what version you're on
wpl version

# See available versions
git log --oneline -10

# Rollback to a specific commit
git checkout <commit-hash>
docker compose build
docker compose up -d
```

## Troubleshooting

### "Access Denied" after upgrade

Your account hasn't been promoted to admin yet. Follow step 3 above.

### Rate limit errors (429)

The rate limiter state resets on restart. If you hit limits during testing:

```bash
docker compose restart api
```

### WordPress containers don't have new security features

Existing containers keep their original configuration. Only newly created sites get unique salts and the updated MU-plugin. To update an existing site, delete and recreate it.

### Build fails

Ensure you have Node.js 20+ and Docker 24+:

```bash
node --version   # Should be 20+
docker --version # Should be 24+
```
