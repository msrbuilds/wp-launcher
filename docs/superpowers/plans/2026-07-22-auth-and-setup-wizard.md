# Auth and First-Run Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local/agency auth split with one model — an `owner` created by a first-run wizard, plus `admin` and `member` roles — so no request is authenticated by virtue of the install's mode.

**Architecture:** A `roles-v3` migration normalises `users.role` and elects an owner. A setup service creates the owner, generates missing secrets into `data/secrets.json`, and adopts the orphaned `local-user`'s sites. `requireRole` replaces every mode-conditional guard, and row scoping becomes role-based rather than filtered to a hardcoded user id. The dashboard loses its auto-login and gains a `/setup` page.

**Tech Stack:** Node.js, TypeScript, Express, better-sqlite3, bcryptjs, jsonwebtoken, Vitest, React.

**Spec:** `docs/superpowers/specs/2026-07-21-unified-hosting-panel-design.md`

**Scope:** Plan 2 of 4. Follows `2026-07-21-policy-foundation.md`. Later: (3) blueprints replacing products+templates; (4) dashboard IA merge and removal of `APP_MODE`.

---

## Corrections to earlier assumptions

Reading the code changed three things the spec and plan 1's closing report asserted:

1. **`admin.ts`'s three `isLocalMode` branches are not auth bypasses.** They are *row scoping* —
   filtering stats, sites and logs to `user_id = 'local-user'`. They become role-based scoping,
   not deletions.
2. **Role-based admin auth already exists.** `adminAuth` (`middleware/auth.ts:34`) already accepts
   an admin JWT. What must go is its *legacy `wpl_admin` cookie* path and the
   `POST /api/admin/login` endpoint that mints it from the API key. `API_KEY` survives for M2M.
3. **`local-user` cannot simply be deleted.** `sites.user_id` is a foreign key and on an upgraded
   local install every site points at it. Setup must reassign those rows to the new owner before
   the row is removed.
4. **There is no CSRF mode-skip.** The spec listed `index.ts:523` as a CSRF exemption; that line is
   the *templates* guard. `middleware/csrf.ts` contains no `isLocalMode` and exempts only the two
   productivity heartbeat endpoints. Nothing to do.
5. **`requireLocalMode` in `routes/productivity.ts` is a security control, not a mode gate.** The
   comment says so: the stats/config routes are global and not user-scoped, so exposing them
   multi-user would leak cross-user data. The feature flag is already enforced separately by
   `requireFeature`, so replacing this with the flag would *remove* the protection. It becomes a
   role check.
6. **`POST /api/auth/register` never consults `panel.publicRegistration`.** Plan 1 created the
   setting; this plan enforces it.

---

## Role model

| Role | Sees | Can |
|---|---|---|
| `owner` | everything | everything, including destructive install settings; exactly one, cannot be demoted or deleted |
| `admin` | everything | manage sites, users, blueprints, settings |
| `member` | own sites and sites shared with them | create and manage their own sites |

Migration mapping: `'user'` → `'member'`; `'admin'` stays `'admin'`; the earliest-created real
admin is promoted to `'owner'`. The synthetic `admin` row is kept — it anchors the M2M identity and
existing foreign keys — but is excluded from user listings. The synthetic `local-user` row is
removed by setup, after its sites are reassigned.

---

## File Structure

**Create:**
- `packages/api/src/utils/migrations/roles-v3.ts` — role normalisation + owner election
- `packages/api/src/utils/migrations/roles-v3.test.ts`
- `packages/api/src/utils/secrets.ts` — read-or-generate `data/secrets.json`
- `packages/api/src/utils/secrets.test.ts`
- `packages/api/src/services/setup.service.ts` — owner creation, local-user adoption
- `packages/api/src/services/setup.service.test.ts`
- `packages/api/src/routes/setup.ts` — `GET /api/setup/status`, `POST /api/setup`
- `packages/api/src/middleware/requireRole.ts` — role guard
- `packages/api/src/middleware/requireRole.test.ts`
- `packages/api/src/utils/scope.ts` — role-based row scoping helper
- `packages/api/src/utils/scope.test.ts`
- `packages/dashboard/src/pages/SetupPage.tsx` — first-run wizard

**Modify:**
- `packages/api/src/config.ts` — prefer env, fall back to generated secrets
- `packages/api/src/utils/db.ts` — run `roles-v3`; drop the `local-user` seed
- `packages/api/src/middleware/userAuth.ts` — delete `localModeAuth` and the conditional wrappers
- `packages/api/src/middleware/auth.ts` — drop the `wpl_admin` cookie path
- `packages/api/src/index.ts` — unify auth route mounting, mount setup routes, `requireRole` for branding, CSRF always on, templates guard
- `packages/api/src/routes/admin.ts` — role-based scoping
- `packages/api/src/routes/productivity.ts` — feature flag instead of mode
- `packages/api/src/services/user.service.ts` — role type widening, exclude synthetic rows
- `packages/dashboard/src/context/AuthContext.tsx` — remove auto-login
- `packages/dashboard/src/main.tsx` — `/setup` route and gating

---

## Task 1: Role migration

**Files:**
- Create: `packages/api/src/utils/migrations/roles-v3.ts`
- Test: `packages/api/src/utils/migrations/roles-v3.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/utils/migrations/roles-v3.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../test-helpers/db';
import { runRolesMigration } from './roles-v3';

function seedUser(db: Database.Database, id: string, role: string, createdAt: string) {
  db.prepare('INSERT INTO users (id, email, role, verified, created_at) VALUES (?, ?, ?, 1, ?)')
    .run(id, `${id}@example.com`, role, createdAt);
}

function roleOf(db: Database.Database, id: string): string | undefined {
  const row = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined;
  return row?.role;
}

describe('runRolesMigration', () => {
  it('renames the legacy user role to member', () => {
    const db = createTestDb();
    seedUser(db, 'u1', 'user', '2026-01-01 00:00:00');
    runRolesMigration(db);
    expect(roleOf(db, 'u1')).toBe('member');
    db.close();
  });

  it('promotes the earliest real admin to owner', () => {
    const db = createTestDb();
    seedUser(db, 'later', 'admin', '2026-03-01 00:00:00');
    seedUser(db, 'earlier', 'admin', '2026-02-01 00:00:00');
    runRolesMigration(db);
    expect(roleOf(db, 'earlier')).toBe('owner');
    expect(roleOf(db, 'later')).toBe('admin');
    db.close();
  });

  it('never promotes a synthetic row to owner', () => {
    const db = createTestDb();
    seedUser(db, 'admin', 'admin', '2020-01-01 00:00:00');
    seedUser(db, 'local-user', 'admin', '2020-01-01 00:00:00');
    seedUser(db, 'real', 'admin', '2026-05-01 00:00:00');
    runRolesMigration(db);
    expect(roleOf(db, 'real')).toBe('owner');
    expect(roleOf(db, 'admin')).toBe('admin');
    expect(roleOf(db, 'local-user')).toBe('admin');
    db.close();
  });

  it('leaves no owner when there is no real admin', () => {
    const db = createTestDb();
    seedUser(db, 'admin', 'admin', '2020-01-01 00:00:00');
    seedUser(db, 'local-user', 'admin', '2020-01-01 00:00:00');
    runRolesMigration(db);
    const owners = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'owner'").get() as { c: number };
    expect(owners.c).toBe(0);
    db.close();
  });

  it('is idempotent and keeps the existing owner', () => {
    const db = createTestDb();
    seedUser(db, 'first', 'admin', '2026-01-01 00:00:00');
    seedUser(db, 'second', 'admin', '2026-02-01 00:00:00');
    runRolesMigration(db);
    runRolesMigration(db);
    const owners = db.prepare("SELECT id FROM users WHERE role = 'owner'").all() as { id: string }[];
    expect(owners).toEqual([{ id: 'first' }]);
    db.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/api`
Expected: FAIL — `Failed to resolve import "./roles-v3"`.

- [ ] **Step 3: Implement**

Create `packages/api/src/utils/migrations/roles-v3.ts`:

```ts
import type Database from 'better-sqlite3';

/** Rows the old code created for itself; never eligible to become the owner. */
export const SYNTHETIC_USER_IDS = ['admin', 'local-user'];

export function runRolesMigration(db: Database.Database): void {
  const apply = db.transaction(() => {
    db.prepare("UPDATE users SET role = 'member' WHERE role = 'user'").run();

    const existingOwner = db.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").get();
    if (existingOwner) return;

    const placeholders = SYNTHETIC_USER_IDS.map(() => '?').join(', ');
    const candidate = db
      .prepare(
        `SELECT id FROM users
         WHERE role = 'admin' AND id NOT IN (${placeholders})
         ORDER BY created_at ASC, id ASC
         LIMIT 1`,
      )
      .get(...SYNTHETIC_USER_IDS) as { id: string } | undefined;

    if (candidate) {
      db.prepare("UPDATE users SET role = 'owner' WHERE id = ?").run(candidate.id);
    }
  });

  apply();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 37 tests total.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/migrations/roles-v3.ts packages/api/src/utils/migrations/roles-v3.test.ts
git commit -m "feat(api): add roles-v3 migration normalising roles and electing an owner"
```

---

## Task 2: Generated secrets

**Files:**
- Create: `packages/api/src/utils/secrets.ts`
- Test: `packages/api/src/utils/secrets.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/utils/secrets.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureSecrets, SECRETS_FILENAME } from './secrets';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-secrets-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('ensureSecrets', () => {
  it('creates a secrets file with three strong values', () => {
    const secrets = ensureSecrets(dir);
    expect(fs.existsSync(path.join(dir, SECRETS_FILENAME))).toBe(true);
    for (const key of ['jwtSecret', 'apiKey', 'provisionerKey'] as const) {
      expect(secrets[key].length, key).toBeGreaterThanOrEqual(32);
    }
  });

  it('returns the same values on a second call', () => {
    const first = ensureSecrets(dir);
    const second = ensureSecrets(dir);
    expect(second).toEqual(first);
  });

  it('generates distinct values for each secret', () => {
    const s = ensureSecrets(dir);
    expect(new Set([s.jwtSecret, s.apiKey, s.provisionerKey]).size).toBe(3);
  });

  it('backfills a single missing key without touching the others', () => {
    const first = ensureSecrets(dir);
    const file = path.join(dir, SECRETS_FILENAME);
    const partial = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete partial.apiKey;
    fs.writeFileSync(file, JSON.stringify(partial));

    const second = ensureSecrets(dir);
    expect(second.jwtSecret).toBe(first.jwtSecret);
    expect(second.provisionerKey).toBe(first.provisionerKey);
    expect(second.apiKey).not.toBe(first.apiKey);
    expect(second.apiKey.length).toBeGreaterThanOrEqual(32);
  });

  it('recovers from an unreadable secrets file by regenerating', () => {
    fs.writeFileSync(path.join(dir, SECRETS_FILENAME), 'not json at all');
    const secrets = ensureSecrets(dir);
    expect(secrets.jwtSecret.length).toBeGreaterThanOrEqual(32);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/api`
Expected: FAIL — `Failed to resolve import "./secrets"`.

- [ ] **Step 3: Implement**

Create `packages/api/src/utils/secrets.ts`:

```ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const SECRETS_FILENAME = 'secrets.json';

export interface Secrets {
  jwtSecret: string;
  apiKey: string;
  provisionerKey: string;
}

const KEYS: (keyof Secrets)[] = ['jwtSecret', 'apiKey', 'provisionerKey'];

function generate(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function readExisting(file: string): Partial<Secrets> {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    // Missing or corrupt — treat as empty and regenerate below.
    return {};
  }
}

/**
 * Read `data/secrets.json`, generating any missing value and persisting the
 * result. Environment variables still win at the config layer; this only
 * supplies defaults for installs that never set them.
 */
export function ensureSecrets(dataDir: string): Secrets {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, SECRETS_FILENAME);
  const existing = readExisting(file);

  const secrets = {} as Secrets;
  let changed = false;
  for (const key of KEYS) {
    const value = existing[key];
    if (typeof value === 'string' && value.length >= 32) {
      secrets[key] = value;
    } else {
      secrets[key] = generate();
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  }
  return secrets;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 42 tests total.

- [ ] **Step 5: Wire into config**

In `packages/api/src/config.ts`, replace lines 1-14:

```ts
const KNOWN_DEV_DEFAULTS = ['dev-api-key', 'dev-jwt-secret-change-me'];

const appMode = (process.env.APP_MODE || 'agency') as 'local' | 'agency';
const isLocalMode = appMode === 'local';

function requireSecret(envVar: string, fallback: string): string {
  if (isLocalMode) return process.env[envVar] || fallback;
  const value = process.env[envVar] || fallback;
  if (process.env.NODE_ENV === 'production' && KNOWN_DEV_DEFAULTS.includes(value)) {
    console.error(`[FATAL] ${envVar} is set to an insecure default. Set a strong secret before running in production.`);
    process.exit(1);
  }
  return value;
}
```

with:

```ts
import { ensureSecrets } from './utils/secrets';

const appMode = (process.env.APP_MODE || 'agency') as 'local' | 'agency';
const isLocalMode = appMode === 'local';

const dataDir = process.env.DATA_DIR || './data';

// Every install gets strong secrets whether or not the operator set any.
// Environment variables still take precedence.
const generated = ensureSecrets(dataDir);
```

Then in the exported object replace the two secret lines:

```ts
  apiKey: requireSecret('API_KEY', 'dev-api-key'),
```

with:

```ts
  apiKey: process.env.API_KEY || generated.apiKey,
```

and:

```ts
  jwtSecret: requireSecret('JWT_SECRET', 'dev-jwt-secret-change-me'),
```

with:

```ts
  jwtSecret: process.env.JWT_SECRET || generated.jwtSecret,
```

Also replace the `dataDir` line in the object with `dataDir,` so both uses agree.

- [ ] **Step 6: Verify no insecure default survives**

Run: `grep -rn "dev-jwt-secret-change-me\|dev-api-key\|requireSecret" packages/api/src`
Expected: no matches.

Run: `npx tsc --noEmit -p packages/api`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/utils/secrets.ts packages/api/src/utils/secrets.test.ts packages/api/src/config.ts
git commit -m "feat(api): generate strong secrets into data/secrets.json when env is unset"
```

---

## Task 3: Setup service

**Files:**
- Create: `packages/api/src/services/setup.service.ts`
- Test: `packages/api/src/services/setup.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/services/setup.service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { runPanelMigration } from '../utils/migrations/panel-v3';
import { getSetting } from './settings.service';
import { runSetup, isSetupComplete } from './setup.service';

let db: Database.Database;

const PERMANENT = '9999-12-31T23:59:59.999Z';

function seedLocalUserSite(id: string) {
  db.prepare("INSERT INTO users (id, email, role) VALUES ('local-user', 'local@localhost', 'admin')")
    .run();
  db.prepare('INSERT INTO sites (id, subdomain, product_id, user_id, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, `sub-${id}`, 'demo', 'local-user', PERMANENT);
}

beforeEach(() => {
  db = createTestDb();
  runPanelMigration(db, {});
  __setDbForTesting(db);
});

afterEach(() => {
  __setDbForTesting(null);
  db.close();
});

describe('runSetup', () => {
  it('creates a verified owner with a hashed password', async () => {
    const owner = await runSetup({ email: 'me@example.com', password: 'correct-horse-battery' });
    expect(owner.role).toBe('owner');
    expect(owner.verified).toBe(1);
    expect(owner.password_hash).not.toBe('correct-horse-battery');
    expect(await bcrypt.compare('correct-horse-battery', owner.password_hash)).toBe(true);
  });

  it('marks setup complete', async () => {
    expect(isSetupComplete()).toBe(false);
    await runSetup({ email: 'me@example.com', password: 'correct-horse-battery' });
    expect(isSetupComplete()).toBe(true);
    expect(getSetting('panel.setupComplete')).toBe('true');
  });

  it('adopts the local-user sites and removes the row', async () => {
    seedLocalUserSite('s1');
    const owner = await runSetup({ email: 'me@example.com', password: 'correct-horse-battery' });

    const site = db.prepare('SELECT user_id FROM sites WHERE id = ?').get('s1') as { user_id: string };
    expect(site.user_id).toBe(owner.id);
    const stale = db.prepare("SELECT id FROM users WHERE id = 'local-user'").get();
    expect(stale).toBeUndefined();
  });

  it('stores the panel name as the branding site title', async () => {
    await runSetup({ email: 'me@example.com', password: 'correct-horse-battery', panelName: 'MSR Panel' });
    expect(getSetting('branding.siteTitle')).toBe('MSR Panel');
  });

  it('refuses to run twice', async () => {
    await runSetup({ email: 'me@example.com', password: 'correct-horse-battery' });
    await expect(
      runSetup({ email: 'other@example.com', password: 'correct-horse-battery' }),
    ).rejects.toThrow(/already/i);
  });

  it('rejects a short password', async () => {
    await expect(runSetup({ email: 'me@example.com', password: 'short' })).rejects.toThrow(/12 characters/i);
  });

  it('rejects an invalid email', async () => {
    await expect(runSetup({ email: 'nope', password: 'correct-horse-battery' })).rejects.toThrow(/email/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/api`
Expected: FAIL — `Failed to resolve import "./setup.service"`.

- [ ] **Step 3: Implement**

Create `packages/api/src/services/setup.service.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { getDb } from '../utils/db';
import { getBool, setSetting } from './settings.service';
import { ValidationError, ConflictError } from '../utils/errors';

const MIN_PASSWORD_LENGTH = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SetupInput {
  email: string;
  password: string;
  panelName?: string;
}

export interface OwnerRecord {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  verified: number;
}

export function isSetupComplete(): boolean {
  return getBool('panel.setupComplete');
}

export async function runSetup(input: SetupInput): Promise<OwnerRecord> {
  if (isSetupComplete()) {
    throw new ConflictError('Setup has already been completed');
  }
  if (!EMAIL_PATTERN.test(input.email)) {
    throw new ValidationError('A valid email address is required');
  }
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  // Hash outside the transaction — bcrypt is async and better-sqlite3
  // transactions must stay synchronous.
  const passwordHash = await bcrypt.hash(input.password, 10);
  const id = uuidv4();
  const db = getDb();

  const apply = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, verified, role)
       VALUES (?, ?, ?, 1, 'owner')`,
    ).run(id, input.email, passwordHash);

    // An upgraded local install has every site pointing at the synthetic
    // local-user row. Hand them to the real owner before dropping it.
    db.prepare("UPDATE sites SET user_id = ? WHERE user_id = 'local-user'").run(id);
    db.prepare("DELETE FROM users WHERE id = 'local-user'").run();
  });

  apply();

  if (input.panelName) setSetting('branding.siteTitle', input.panelName);
  setSetting('panel.setupComplete', 'true');

  return db.prepare('SELECT id, email, password_hash, role, verified FROM users WHERE id = ?').get(id) as OwnerRecord;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 49 tests total.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/setup.service.ts packages/api/src/services/setup.service.test.ts
git commit -m "feat(api): add setup service creating the owner and adopting local-user sites"
```

---

## Task 4: Role guard middleware

**Files:**
- Create: `packages/api/src/middleware/requireRole.ts`
- Test: `packages/api/src/middleware/requireRole.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/middleware/requireRole.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import { requireRole, ROLE_RANK } from './requireRole';
import type { AuthRequest } from './userAuth';

function mockRes() {
  const res = {} as Response & { statusCode?: number; payload?: unknown };
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((body: unknown) => {
    res.payload = body;
    return res;
  });
  return res;
}

describe('requireRole', () => {
  it('ranks owner above admin above member', () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.member);
  });

  it('allows a role that meets the minimum', () => {
    const next = vi.fn();
    requireRole('admin')({ userRole: 'admin' } as AuthRequest, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows a role that exceeds the minimum', () => {
    const next = vi.fn();
    requireRole('admin')({ userRole: 'owner' } as AuthRequest, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a role below the minimum with 403', () => {
    const next = vi.fn();
    const res = mockRes();
    requireRole('admin')({ userRole: 'member' } as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('rejects an unauthenticated request with 401', () => {
    const next = vi.fn();
    const res = mockRes();
    requireRole('member')({} as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('treats an unknown role as the lowest rank', () => {
    const next = vi.fn();
    const res = mockRes();
    requireRole('member')({ userRole: 'wat' } as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/api`
Expected: FAIL — `Failed to resolve import "./requireRole"`.

- [ ] **Step 3: Implement**

Create `packages/api/src/middleware/requireRole.ts`:

```ts
import { Response, NextFunction } from 'express';
import type { AuthRequest } from './userAuth';

export const ROLE_RANK: Record<string, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export type MinimumRole = 'member' | 'admin' | 'owner';

/**
 * Guard a route on a minimum role. Assumes an auth middleware has already
 * populated `req.userRole`.
 */
export function requireRole(minimum: MinimumRole) {
  const threshold = ROLE_RANK[minimum];
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if ((ROLE_RANK[req.userRole] ?? 0) < threshold) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 55 tests total.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/middleware/requireRole.ts packages/api/src/middleware/requireRole.test.ts
git commit -m "feat(api): add requireRole middleware"
```

---

## Task 5: Role-based row scoping

**Files:**
- Create: `packages/api/src/utils/scope.ts`
- Test: `packages/api/src/utils/scope.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/utils/scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { seesAllRows, scopeClause } from './scope';

describe('scope', () => {
  it('lets owners and admins see every row', () => {
    expect(seesAllRows('owner')).toBe(true);
    expect(seesAllRows('admin')).toBe(true);
  });

  it('limits members to their own rows', () => {
    expect(seesAllRows('member')).toBe(false);
    expect(seesAllRows(undefined)).toBe(false);
  });

  it('produces an empty clause for privileged roles', () => {
    expect(scopeClause('owner', 'u1')).toEqual({ sql: '', params: [] });
  });

  it('produces a user filter for members', () => {
    expect(scopeClause('member', 'u1')).toEqual({ sql: 'user_id = ?', params: ['u1'] });
  });

  it('matches nothing when a member has no id', () => {
    const clause = scopeClause('member', undefined);
    expect(clause.sql).toBe('1 = 0');
    expect(clause.params).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/api`
Expected: FAIL — `Failed to resolve import "./scope"`.

- [ ] **Step 3: Implement**

Create `packages/api/src/utils/scope.ts`:

```ts
const PRIVILEGED_ROLES = new Set(['owner', 'admin']);

export interface ScopeClause {
  /** SQL fragment without WHERE/AND, or '' when no filtering is needed. */
  sql: string;
  params: string[];
}

export function seesAllRows(role: string | undefined): boolean {
  return !!role && PRIVILEGED_ROLES.has(role);
}

/**
 * Row visibility for list endpoints. Replaces the old
 * `user_id = 'local-user'` filters, which encoded the install's mode rather
 * than the caller's identity.
 */
export function scopeClause(role: string | undefined, userId: string | undefined): ScopeClause {
  if (seesAllRows(role)) return { sql: '', params: [] };
  if (!userId) return { sql: '1 = 0', params: [] };
  return { sql: 'user_id = ?', params: [userId] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 60 tests total.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/scope.ts packages/api/src/utils/scope.test.ts
git commit -m "feat(api): add role-based row scoping helper"
```

---

## Task 6: Setup routes

**Files:**
- Create: `packages/api/src/routes/setup.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Create the router**

Create `packages/api/src/routes/setup.ts`:

```ts
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { runSetup, isSetupComplete } from '../services/setup.service';
import { generateToken } from '../middleware/userAuth';
import { config } from '../config';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Setup is unauthenticated by necessity, so limit it hard.
const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/status', (_req: Request, res: Response) => {
  res.json({ setupComplete: isSetupComplete() });
});

router.post('/', setupLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password, panelName } = req.body;
  const owner = await runSetup({ email, password, panelName });

  const token = generateToken(owner.id, owner.email, owner.role);
  res.cookie('wpl_token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({ user: { id: owner.id, email: owner.email, role: owner.role } });
}));

export default router;
```

- [ ] **Step 2: Mount it**

In `packages/api/src/index.ts`, add the import alongside the other routers:

```ts
import setupRouter from './routes/setup';
```

and mount it above the auth routes:

```ts
app.use('/api/setup', setupRouter);
```

- [ ] **Step 3: Verify by hand**

```bash
npm run build -w packages/api && docker compose up -d --build api
curl -s http://localhost:3737/api/setup/status
```

Expected: `{"setupComplete":false}` on an install that has not run setup.

```bash
curl -s -X POST http://localhost:3737/api/setup \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost' -H 'X-Requested-With: XMLHttpRequest' \
  -d '{"email":"you@example.com","password":"correct-horse-battery","panelName":"WP Launcher"}'
```

Expected: `201` with the owner object, and `curl -s http://localhost:3737/api/setup/status` now
returns `{"setupComplete":true}`.

Then confirm the adoption worked:

```bash
docker compose exec -T api node -p "JSON.stringify(require('better-sqlite3')('/app/data/wp-launcher.db').prepare(\"SELECT id,email,role FROM users WHERE role='owner'\").all())"
docker compose exec -T api node -p "require('better-sqlite3')('/app/data/wp-launcher.db').prepare(\"SELECT COUNT(*) AS c FROM sites WHERE user_id='local-user'\").get().c"
```

Expected: one owner row, and `0` sites still pointing at `local-user`.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/setup.ts packages/api/src/index.ts
git commit -m "feat(api): add first-run setup endpoints"
```

---

## Task 7: Delete the auto-login

**Files:**
- Modify: `packages/api/src/middleware/userAuth.ts`
- Modify: `packages/api/src/index.ts`
- Modify: `packages/api/src/utils/db.ts`

- [ ] **Step 1: Remove the mode-conditional auth**

In `packages/api/src/middleware/userAuth.ts`, delete lines 42-61 entirely:

```ts
export function localModeAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  req.userId = 'local-user';
  req.userEmail = 'local@localhost';
  req.userRole = 'admin';
  next();
}

export function conditionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (config.isLocalMode) {
    return localModeAuth(req, res, next);
  }
  return userAuth(req, res, next);
}

export function conditionalOptionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (config.isLocalMode) {
    return localModeAuth(req, res, next);
  }
  return optionalUserAuth(req, res, next);
}
```

and add aliases so existing route imports keep working:

```ts
// Retained as names only — there is no longer anything conditional about them.
export const conditionalAuth = userAuth;
export const conditionalOptionalAuth = optionalUserAuth;
```

Place these *after* `userAuth` and `optionalUserAuth` are declared, since `const` aliases are not
hoisted.

- [ ] **Step 2: Remove the local-token endpoint**

In `packages/api/src/index.ts`, delete the `app.post('/api/auth/local-token', ...)` handler inside
the `if (config.isLocalMode) {` block (around lines 162-174).

- [ ] **Step 3: Unify auth route mounting**

Replace the whole `if (config.isLocalMode) { ... } else { ... }` block (around lines 167-237) with
its former agency branch, unconditionally:

```ts
// Auth routes with split rate limiting.
// Write ops (login, register, verify, set-password) get strict limits
app.post('/api/auth/register', authWriteLimiter);
app.post('/api/auth/verify', authWriteLimiter);
app.post('/api/auth/set-password', authWriteLimiter);
app.post('/api/auth/login', authWriteLimiter);
// Read ops (/me, logout, update-password) get relaxed limits
app.get('/api/auth/me', authReadLimiter);
app.post('/api/auth/logout', authReadLimiter);
app.post('/api/auth/update-password', authReadLimiter);
app.use('/api/auth', authRouter);

// Admin routes — admin JWT or M2M API key, rate limited
app.use('/api/admin', adminLimiter, adminRouter);
app.use('/api/admin/analytics', analyticsRouter);
app.use('/api/admin/monitoring', monitoringRouter);
app.use('/api/admin/bulk', bulkRouter);
```

Delete the `app.post('/api/admin/login', ...)` handler in the same block — the API-key login flow is
replaced by owner/admin JWT login.

- [ ] **Step 4: Remove the local-user seed**

In `packages/api/src/utils/db.ts`, delete the seed block kept by plan 1:

```ts
  // Auto-create local user in local mode
  if (config.isLocalMode) {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, verified, role)
      VALUES ('local-user', 'local@localhost', '', 1, 'admin')
    `).run();
    // Ensure existing local-user is admin
    db.prepare(`UPDATE users SET role = 'admin' WHERE id = 'local-user'`).run();
  }
```

and add the roles migration call next to the panel migration:

```ts
  runRolesMigration(db);
```

with the import:

```ts
import { runRolesMigration } from './migrations/roles-v3';
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p packages/api`
Expected: no errors.

Run: `grep -rn "localModeAuth\|local-token\|admin/login" packages/api/src`
Expected: no matches.

Run: `npm test -w packages/api`
Expected: PASS — 60 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/middleware/userAuth.ts packages/api/src/index.ts packages/api/src/utils/db.ts
git commit -m "refactor(api): remove local-mode auto-login and unify auth route mounting"
```

---

## Task 8: Role-based admin scoping

**Files:**
- Modify: `packages/api/src/routes/admin.ts`

- [ ] **Step 1: Scope the stats endpoint**

Add the import:

```ts
import { seesAllRows } from '../utils/scope';
```

Replace the `/stats` handler body (lines 26-38):

```ts
    if (config.isLocalMode) {
      const db = getDb();
      const totalSitesCreated = (db.prepare("SELECT COUNT(*) as count FROM site_logs WHERE action = 'created' AND user_id = 'local-user'").get() as { count: number }).count;
      const activeSites = (db.prepare("SELECT COUNT(*) as count FROM sites WHERE status = 'running' AND user_id = 'local-user'").get() as { count: number }).count;
      res.json({ totalSitesCreated, activeSites, totalUsers: 1, verifiedUsers: 1 });
    } else {
      const stats = getSiteStats();
      res.json(stats);
    }
```

with:

```ts
    if (seesAllRows(_req.userRole)) {
      res.json(getSiteStats());
    } else {
      const db = getDb();
      const userId = _req.userId ?? '';
      const totalSitesCreated = (db.prepare("SELECT COUNT(*) as count FROM site_logs WHERE action = 'created' AND user_id = ?").get(userId) as { count: number }).count;
      const activeSites = (db.prepare("SELECT COUNT(*) as count FROM sites WHERE status = 'running' AND user_id = ?").get(userId) as { count: number }).count;
      res.json({ totalSitesCreated, activeSites, totalUsers: 1, verifiedUsers: 1 });
    }
```

Rename the handler's `_req` parameter to `req` if the linter objects to reading from an
underscore-prefixed argument.

- [ ] **Step 2: Scope the sites endpoint**

Replace the `if (config.isLocalMode) { ... }` branch in the `/sites` handler (lines 89-97) with a
role check that reuses the same filter shape:

```ts
    if (!seesAllRows(req.userRole)) {
      const userId = req.userId ?? '';
      const where = statusFilter
        ? `WHERE user_id = ? AND status = ?`
        : `WHERE user_id = ?`;
      const params = statusFilter ? [userId, statusFilter, limit, offset] : [userId, limit, offset];
      const countParams = statusFilter ? [userId, statusFilter] : [userId];
      sites = db.prepare(`SELECT * FROM sites ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params) as any[];
      total = (db.prepare(`SELECT COUNT(*) as count FROM sites ${where}`).get(...countParams) as { count: number }).count;
    } else if (statusFilter) {
```

- [ ] **Step 3: Scope the logs endpoint**

Replace the `if (config.isLocalMode) { ... } else { ... }` branch in `/logs` (lines 142-150) with:

```ts
    if (!seesAllRows(req.userRole)) {
      const db = getDb();
      const userId = req.userId ?? '';
      logs = db.prepare("SELECT * FROM site_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").all(userId, limit, offset);
      total = (db.prepare("SELECT COUNT(*) as count FROM site_logs WHERE user_id = ?").get(userId) as { count: number }).count;
    } else {
      logs = getSiteLogs(limit, offset);
      total = getSiteLogsCount();
    }
```

- [ ] **Step 4: Verify**

Run: `grep -n "isLocalMode\|local-user" packages/api/src/routes/admin.ts`
Expected: no matches.

Run: `npx tsc --noEmit -p packages/api`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/admin.ts
git commit -m "refactor(api): scope admin stats, sites and logs by role instead of mode"
```

---

## Task 9: Remaining mode-gated guards

**Files:**
- Modify: `packages/api/src/index.ts`
- Modify: `packages/api/src/routes/productivity.ts`
- Modify: `packages/api/src/middleware/auth.ts`

- [ ] **Step 1: Branding requires admin**

In `packages/api/src/index.ts`, replace:

```ts
const brandingAuth = config.isLocalMode ? [] : [adminAuth];
```

with:

```ts
const brandingAuth = [adminAuth];
```

- [ ] **Step 2: Templates guard stops depending on mode**

Replace:

```ts
app.use('/api/templates', (req, res, next) => {
  if (req.method === 'GET' || config.isLocalMode) {
    return next();
  }
  return adminAuth(req as any, res, next);
}, templatesRouter);
```

with:

```ts
app.use('/api/templates', (req, res, next) => {
  if (req.method === 'GET') return next();
  return adminAuth(req as any, res, next);
}, templatesRouter);
```

- [ ] **Step 3: Productivity global routes gated by role, not mode**

These endpoints return install-wide, non-user-scoped data. Local mode was standing in for "there is
only one user here". The equivalent guarantee under roles is "the caller can already see every
row". The feature flag is *not* the right replacement — `requireFeature` already applies it, and
substituting it here would drop the cross-user protection entirely.

In `packages/api/src/routes/productivity.ts`, replace lines 142-151:

```ts
// SBP-003: Enforce local-mode-only access for stats/config/data routes.
// Productivity Monitor is a single-user local feature — in agency/multi-user mode,
// these global (non-user-scoped) endpoints would expose cross-user data.
function requireLocalMode(_req: AuthRequest, res: Response, next: () => void) {
  if (!config.isLocalMode) {
    res.status(403).json({ error: 'Productivity Monitor is only available in local mode' });
    return;
  }
  next();
}
```

with:

```ts
// SBP-003: these stats/config routes return install-wide, non-user-scoped data,
// so only callers who may already see every row can read them.
function requireGlobalReader(req: AuthRequest, res: Response, next: () => void) {
  if (!seesAllRows(req.userRole)) {
    res.status(403).json({ error: 'Productivity Monitor requires an admin or owner account' });
    return;
  }
  next();
}
```

Add the import:

```ts
import { seesAllRows } from '../utils/scope';
```

Then update the router line below it:

```ts
// All other routes require auth + feature enabled + global read access
router.use(conditionalAuth, requireFeature, requireGlobalReader);
```

- [ ] **Step 4: Enforce public registration**

In `packages/api/src/routes/auth.ts`, add the import:

```ts
import { policy } from '../policy';
```

and make it the first statement inside the `POST /register` handler (line 23):

```ts
  if (!policy.allowsPublicRegistration()) {
    res.status(403).json({ error: 'Public registration is disabled on this panel' });
    return;
  }
```

- [ ] **Step 5: Drop the legacy admin cookie path**

In `packages/api/src/middleware/auth.ts`, delete the `wpl_admin` cookie branch (lines 44-51):

```ts
  // Path 2: Legacy wpl_admin cookie
  const adminCookie = (req as any).cookies?.wpl_admin as string | undefined;
  if (adminCookie && safeEqual(adminCookie, config.apiKey)) {
    req.userId = 'admin';
    req.userEmail = 'admin@localhost';
    req.userRole = 'admin';
    return next();
  }
```

Renumber the remaining comments so `Path 2` is the JWT path.

(No CSRF change is needed — see correction 4 above.)

- [ ] **Step 6: Verify**

Run: `grep -rn "isLocalMode" packages/api/src`
Expected: only `config.ts` (definition) plus the two `appMode` reporting lines in `/api/settings`
and `/api/admin/system/info`.

Run: `npx tsc --noEmit -p packages/api && npm test -w packages/api`
Expected: no type errors, 60 tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/index.ts packages/api/src/routes/productivity.ts packages/api/src/routes/auth.ts packages/api/src/middleware/auth.ts
git commit -m "refactor(api): replace remaining mode-gated guards with role checks"
```

---

## Task 10: Dashboard setup page

**Files:**
- Create: `packages/dashboard/src/pages/SetupPage.tsx`
- Modify: `packages/dashboard/src/context/AuthContext.tsx`
- Modify: `packages/dashboard/src/main.tsx`
- Modify: `packages/dashboard/src/index.css`

- [ ] **Step 1: Remove the auto-login**

In `packages/dashboard/src/context/AuthContext.tsx`, delete the auto-login effect:

```tsx
  // Auto-login for local mode
  useEffect(() => {
    if (settingsLoading) return;
    if (appMode === 'local' && !user) {
      apiFetch('/api/auth/local-token', { method: 'POST' })
        .then((res) => res.json())
        .then((data) => setUser(data.user))
        .catch(() => {});
    }
  }, [appMode, settingsLoading]);
```

and remove the mode short-circuit from the session check:

```tsx
    if (appMode === 'local') return;
```

Then drop `appMode` from the `useSettings()` destructure, leaving `const { loading: settingsLoading } = useSettings();`, and update both dependency arrays to `[settingsLoading]`.

- [ ] **Step 2: Create the setup page**

Create `packages/dashboard/src/pages/SetupPage.tsx`:

```tsx
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function SetupPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [panelName, setPanelName] = useState('WP Launcher');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, panelName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');
      login(data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="su-wrap">
      <form className="su-card card" onSubmit={handleSubmit}>
        <h1 className="su-title">Set up your panel</h1>
        <p className="su-lead">This creates the owner account. It only happens once.</p>

        {error && <div className="alert-error">{error}</div>}

        <div className="form-group">
          <label className="form-label" htmlFor="su-panel">Panel name</label>
          <input id="su-panel" className="form-input" value={panelName}
                 onChange={(e) => setPanelName(e.target.value)} required />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="su-email">Your email</label>
          <input id="su-email" className="form-input" type="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="su-password">Password</label>
          <input id="su-password" className="form-input" type="password" value={password}
                 onChange={(e) => setPassword(e.target.value)} required minLength={12}
                 autoComplete="new-password" />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="su-confirm">Confirm password</label>
          <input id="su-confirm" className="form-input" type="password" value={confirm}
                 onChange={(e) => setConfirm(e.target.value)} required minLength={12}
                 autoComplete="new-password" />
        </div>

        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Creating owner…' : 'Create owner account'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Add the styles**

Append to `packages/dashboard/src/index.css`:

```css
/* Setup wizard */
.su-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: var(--bg-surface);
}

.su-card {
  width: 100%;
  max-width: 26rem;
  padding: 2rem;
}

.su-title {
  margin: 0 0 0.25rem;
  font-size: 1.375rem;
  color: var(--prussian-blue);
}

.su-lead {
  margin: 0 0 1.5rem;
  color: var(--text-muted);
  font-size: 0.875rem;
}
```

- [ ] **Step 4: Gate routing on setup**

In `packages/dashboard/src/main.tsx`, add the import:

```tsx
import SetupPage from './pages/SetupPage';
```

Expose `setupRequired` from `SettingsContext` (add it to the `Settings` interface, the default
context value, both initial-state objects, and the `setSettings` call as
`setupRequired: !!data.setupRequired`).

Then in `AppRoutes`, before the existing mode fork:

```tsx
function AppRoutes() {
  const { loading, setupRequired } = useSettings();
  const isLocal = useIsLocalMode();

  if (loading) return null;

  if (setupRequired) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return isLocal ? <LocalRoutes /> : <AgencyRoutes />;
}
```

The mode fork stays for now; plan 4 removes it.

- [ ] **Step 5: Verify by hand**

```bash
npm run build -w packages/dashboard
docker compose up -d --build dashboard
```

On an install where setup has not run, open the dashboard: every route should redirect to
`/setup`. Complete the form, then confirm you land on the panel authenticated as the owner, and
that a reload keeps you logged in (the `wpl_token` cookie survives).

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/pages/SetupPage.tsx packages/dashboard/src/context/AuthContext.tsx packages/dashboard/src/context/SettingsContext.tsx packages/dashboard/src/main.tsx packages/dashboard/src/index.css
git commit -m "feat(dashboard): add first-run setup page and drop local auto-login"
```

---

## Task 11: Full verification

- [ ] **Step 1: Automated checks**

```bash
npm test -w packages/api
npx tsc --noEmit -p packages/api
npx tsc --noEmit -p packages/provisioner
npm run build -w packages/dashboard
```

Expected: 60 tests pass, no type errors, dashboard builds.

- [ ] **Step 2: Fresh-install path**

```bash
docker compose down
mv data data.backup-manual
docker compose up -d --build
curl -s http://localhost:3737/api/setup/status
```

Expected: `{"setupComplete":false}`. Complete the wizard in the browser, launch a site, confirm it
appears in the sites list and that the owner sees it.

- [ ] **Step 3: Upgrade path**

```bash
docker compose down
rm -rf data && mv data.backup-manual data
docker compose up -d --build
```

Expected: the panel demands setup (the old install has no real user). After completing it, the
pre-existing sites appear and are owned by the new owner — verify with:

```bash
docker compose exec -T api node -p "require('better-sqlite3')('/app/data/wp-launcher.db').prepare(\"SELECT COUNT(*) AS c FROM sites WHERE user_id='local-user'\").get().c"
```

Expected: `0`.

- [ ] **Step 4: Negative checks**

- Logging out and hitting `/api/sites` returns 401 rather than silently succeeding.
- `POST /api/setup` a second time returns 409.
- A `member` calling `GET /api/admin/sites` sees only their own rows.
- A `member` calling `GET /api/productivity/stats/today` gets 403.
- `POST /api/auth/register` returns 403 while `panel.publicRegistration` is `false`, and succeeds
  after flipping it to `true`.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(api): address issues found in plan 2 verification"
```

---

## Done criteria

- 60 tests pass; API, provisioner and dashboard all build.
- `grep -rn "isLocalMode" packages/api/src` returns only `config.ts` and the two `appMode`
  reporting lines.
- `grep -rn "local-user\|localModeAuth\|local-token" packages/api/src packages/dashboard/src`
  returns only `roles-v3.ts`'s `SYNTHETIC_USER_IDS` and `setup.service.ts`'s adoption query.
- A fresh install cannot be used without completing the wizard.
- An upgraded local install keeps its sites, now owned by a real account.
- No request is authenticated because of the install's mode.
