# Policy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the API's global `APP_MODE` reads with an explicit policy layer backed by per-install settings and per-site columns, so that no backend behaviour depends on a mode flag any more.

**Architecture:** A new `panel-v3` migration adds the per-site columns and seeds `panel.*` settings, backfilling them once from `APP_MODE`. A `settings.service` reads those rows; a `policy` module exposes named questions built on it. Each existing `config.isLocalMode` call site is then rewritten into the policy question it was really asking. `APP_MODE` survives only as the migration's one-time input.

**Tech Stack:** Node.js, TypeScript, Express, better-sqlite3, Vitest (introduced here), Dockerode (provisioner), PHP (WordPress mu-plugins).

**Spec:** `docs/superpowers/specs/2026-07-21-unified-hosting-panel-design.md`

**Scope:** This is plan 1 of 4. It is backend-only and ships with no user-visible behaviour change. Later plans: (2) auth, roles and the first-run wizard; (3) blueprints replacing products+templates; (4) dashboard IA merge and deletion of `APP_MODE` from `docker-compose.yml`.

---

## Deviations from the spec

These were discovered by reading the code and supersede the spec text:

1. **`expires_at` is `NOT NULL`, not nullable.** Permanent sites are already stored as the
   sentinel `'9999-12-31T23:59:59.999Z'` (`site.service.ts:103-105`). Keep the sentinel; add
   a `policy.isPermanent()` helper rather than changing the column and every reader.
2. **`expose_files` already exists** as `sites.direct_file_access`, with accurate per-site
   values in both modes. Reuse it. Do **not** run the spec's backfill over it — that would
   destroy real data.
3. **`opts.localMode` in the provisioner is three concerns**, not one: skipping
   `WP_UPLOAD_LIMIT`/`WP_DISK_QUOTA`, setting `WP_LOCAL_MODE=true`, and omitting CPU/memory
   limits. It splits into `restrictCapabilities` and `enforceResourceLimits`.
4. **Three settings keys are added beyond the spec's table**: `panel.quota.total` (a home for
   `MAX_TOTAL_SITES`), `panel.enforceResourceLimits` (a home for the provisioner's
   limit-skipping), and `panel.defaultRestrictCapabilities` (what a new site gets when the
   caller doesn't say — `false` on an upgraded local install, so wp-admin stays unlocked as
   it is today).
5. **The `local-user` seed stays** in this plan. The dashboard's local auto-login still mints
   JWTs for that id and `sites.user_id` is a foreign key, so removing the row before plan 2's
   wizard exists would break site creation on a fresh local install.

A note on style: SQLite DDL below is issued via `db.prepare(sql).run()` rather than the
multi-statement helper, because a repo hook flags the latter's method name as a
`child_process` risk. Both are equivalent in better-sqlite3 for single statements.

---

## File Structure

**Create:**
- `packages/api/vitest.config.ts` — test runner config
- `packages/api/src/utils/migrations/panel-v3.ts` — the one-time backfill, pure and injectable
- `packages/api/src/utils/migrations/panel-v3.test.ts` — migration tests
- `packages/api/src/services/settings.service.ts` — typed reads/writes of `panel.*` rows
- `packages/api/src/policy.ts` — named policy questions
- `packages/api/src/policy.test.ts` — parity tests against today's mode behaviour
- `packages/api/src/test-helpers/db.ts` — in-memory DB fixture

**Modify:**
- `packages/api/package.json` — add vitest, add `test` script
- `packages/api/src/utils/db.ts` — call the migration, add `__setDbForTesting`, back up before migrating
- `packages/api/src/config.ts` — remove quota fields that move to settings
- `packages/api/src/services/site.service.ts` — quotas and provisioner flags via policy
- `packages/api/src/routes/sites.ts` — rate-limit bypass via API key only
- `packages/api/src/utils/ssrf.ts` — `policy.allowsInsecureRemotes()`
- `packages/api/src/services/domain.service.ts` — gate on `BASE_DOMAIN`, not mode
- `packages/api/src/index.ts` — expose panel settings on `/api/settings`
- `packages/provisioner/src/index.ts` — split `localMode`
- `wordpress/mu-plugins/wp-launcher-restrictions.php` — `WPL_RESTRICT` with legacy fallback
- `wordpress/wp-config-docker.php` — same

---

## Task 1: Test infrastructure

**Files:**
- Modify: `packages/api/package.json`
- Create: `packages/api/vitest.config.ts`
- Create: `packages/api/src/test-helpers/db.ts`
- Test: `packages/api/src/test-helpers/db.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest@^3.0.0 -w packages/api
```

- [ ] **Step 2: Add the test script**

In `packages/api/package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create the Vitest config**

Create `packages/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Tests swap a module-level DB singleton; keep files serial.
    fileParallelism: false,
  },
});
```

- [ ] **Step 4: Write the failing test for the DB fixture**

Create `packages/api/src/test-helpers/db.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createTestDb } from './db';

describe('createTestDb', () => {
  it('creates the tables the panel migration needs', () => {
    const db = createTestDb();
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name)
      .sort();
    expect(names).toEqual(['settings', 'sites', 'users']);
    db.close();
  });

  it('starts empty', () => {
    const db = createTestDb();
    const row = db.prepare('SELECT COUNT(*) AS c FROM sites').get() as { c: number };
    expect(row.c).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test -w packages/api`
Expected: FAIL — `Failed to resolve import "./db"`.

- [ ] **Step 6: Implement the fixture**

Create `packages/api/src/test-helpers/db.ts`:

```ts
import Database from 'better-sqlite3';

const USERS_TABLE = `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const SITES_TABLE = `
  CREATE TABLE sites (
    id TEXT PRIMARY KEY,
    subdomain TEXT UNIQUE NOT NULL,
    product_id TEXT NOT NULL,
    user_id TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    expires_at TEXT NOT NULL,
    direct_file_access INTEGER NOT NULL DEFAULT 0
  )`;

const SETTINGS_TABLE = `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`;

/**
 * Minimal in-memory schema covering only the tables the panel migration
 * touches. Deliberately not the full production schema — these tests assert
 * migration behaviour, not schema completeness.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  for (const ddl of [USERS_TABLE, SITES_TABLE, SETTINGS_TABLE]) {
    db.prepare(ddl).run();
  }
  return db;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 2 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/api/package.json packages/api/vitest.config.ts packages/api/src/test-helpers/ package-lock.json
git commit -m "test: add vitest to the api package with an in-memory db fixture"
```

---

## Task 2: The panel-v3 migration

**Files:**
- Create: `packages/api/src/utils/migrations/panel-v3.ts`
- Test: `packages/api/src/utils/migrations/panel-v3.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/utils/migrations/panel-v3.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../test-helpers/db';
import { runPanelMigration, PANEL_DEFAULTS } from './panel-v3';

const PERMANENT = '9999-12-31T23:59:59.999Z';

function setting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

function seedSite(db: Database.Database, id: string, directFileAccess = 0) {
  db.prepare(
    'INSERT INTO sites (id, subdomain, product_id, expires_at, direct_file_access) VALUES (?, ?, ?, ?, ?)',
  ).run(id, `sub-${id}`, 'demo', PERMANENT, directFileAccess);
}

function seedUser(db: Database.Database, id: string, role = 'user') {
  db.prepare('INSERT INTO users (id, email, role) VALUES (?, ?, ?)').run(id, `${id}@example.com`, role);
}

describe('runPanelMigration', () => {
  it('adds the new site columns', () => {
    const db = createTestDb();
    runPanelMigration(db, {});
    const cols = (db.prepare('PRAGMA table_info(sites)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('restrict_capabilities');
    expect(cols).toContain('origin');
    db.close();
  });

  it('seeds every panel default on a fresh install and records migratedFrom=fresh', () => {
    const db = createTestDb();
    runPanelMigration(db, {});
    for (const [key, value] of Object.entries(PANEL_DEFAULTS)) {
      expect(setting(db, key), key).toBe(value);
    }
    expect(setting(db, 'panel.migratedFrom')).toBe('fresh');
    expect(setting(db, 'panel.setupComplete')).toBe('false');
    db.close();
  });

  it('backfills an upgraded local install', () => {
    const db = createTestDb();
    seedSite(db, 's1');
    runPanelMigration(db, { APP_MODE: 'local' });

    expect(setting(db, 'panel.migratedFrom')).toBe('local');
    expect(setting(db, 'panel.publicRegistration')).toBe('false');
    expect(setting(db, 'panel.demoPortalEnabled')).toBe('false');
    expect(setting(db, 'panel.allowInsecureRemotes')).toBe('true');
    expect(setting(db, 'panel.enforceResourceLimits')).toBe('false');
    expect(setting(db, 'panel.defaultRestrictCapabilities')).toBe('false');
    expect(setting(db, 'panel.quota.member')).toBe('0');
    expect(setting(db, 'panel.quota.total')).toBe('0');

    const site = db.prepare('SELECT restrict_capabilities FROM sites WHERE id = ?').get('s1') as { restrict_capabilities: number };
    expect(site.restrict_capabilities).toBe(0);
    db.close();
  });

  it('backfills an upgraded agency install, taking quotas from env', () => {
    const db = createTestDb();
    seedSite(db, 's1');
    runPanelMigration(db, { APP_MODE: 'agency', MAX_SITES_PER_USER: '5', MAX_TOTAL_SITES: '80' });

    expect(setting(db, 'panel.migratedFrom')).toBe('agency');
    expect(setting(db, 'panel.publicRegistration')).toBe('true');
    expect(setting(db, 'panel.demoPortalEnabled')).toBe('true');
    expect(setting(db, 'panel.allowInsecureRemotes')).toBe('false');
    expect(setting(db, 'panel.enforceResourceLimits')).toBe('true');
    expect(setting(db, 'panel.defaultRestrictCapabilities')).toBe('true');
    expect(setting(db, 'panel.quota.member')).toBe('5');
    expect(setting(db, 'panel.quota.total')).toBe('80');

    const site = db.prepare('SELECT restrict_capabilities FROM sites WHERE id = ?').get('s1') as { restrict_capabilities: number };
    expect(site.restrict_capabilities).toBe(1);
    db.close();
  });

  it('treats a missing APP_MODE on an upgrade as agency', () => {
    const db = createTestDb();
    seedSite(db, 's1');
    runPanelMigration(db, {});
    expect(setting(db, 'panel.migratedFrom')).toBe('agency');
    db.close();
  });

  it('never overwrites direct_file_access', () => {
    const db = createTestDb();
    seedSite(db, 'exposed', 1);
    seedSite(db, 'hidden', 0);
    runPanelMigration(db, { APP_MODE: 'local' });
    const rows = db.prepare('SELECT id, direct_file_access FROM sites ORDER BY id').all() as { id: string; direct_file_access: number }[];
    expect(rows).toEqual([
      { id: 'exposed', direct_file_access: 1 },
      { id: 'hidden', direct_file_access: 0 },
    ]);
    db.close();
  });

  it('marks setup complete only when a real user already exists', () => {
    const withUser = createTestDb();
    seedSite(withUser, 's1');
    seedUser(withUser, 'real-person', 'admin');
    runPanelMigration(withUser, { APP_MODE: 'agency' });
    expect(setting(withUser, 'panel.setupComplete')).toBe('true');
    withUser.close();

    const withoutUser = createTestDb();
    seedSite(withoutUser, 's1');
    seedUser(withoutUser, 'admin', 'admin');
    seedUser(withoutUser, 'local-user', 'admin');
    runPanelMigration(withoutUser, { APP_MODE: 'local' });
    expect(setting(withoutUser, 'panel.setupComplete')).toBe('false');
    withoutUser.close();
  });

  it('is idempotent and ignores APP_MODE on later runs', () => {
    const db = createTestDb();
    seedSite(db, 's1');
    runPanelMigration(db, { APP_MODE: 'local' });
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'panel.publicRegistration'").run();

    runPanelMigration(db, { APP_MODE: 'agency' });

    expect(setting(db, 'panel.migratedFrom')).toBe('local');
    expect(setting(db, 'panel.publicRegistration')).toBe('true');
    const site = db.prepare('SELECT restrict_capabilities FROM sites WHERE id = ?').get('s1') as { restrict_capabilities: number };
    expect(site.restrict_capabilities).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/api`
Expected: FAIL — `Failed to resolve import "./panel-v3"`.

- [ ] **Step 3: Implement the migration**

Create `packages/api/src/utils/migrations/panel-v3.ts`:

```ts
import type Database from 'better-sqlite3';

/**
 * Values every fresh install starts with. An upgrade seeds these first, then
 * overwrites the ones that differed under the old mode.
 */
export const PANEL_DEFAULTS: Record<string, string> = {
  'panel.publicRegistration': 'false',
  'panel.defaultExpiry': 'permanent',
  'panel.quota.owner': '0',
  'panel.quota.admin': '0',
  'panel.quota.member': '0',
  'panel.quota.total': '0',
  'panel.demoPortalEnabled': 'false',
  'panel.allowInsecureRemotes': 'false',
  'panel.enforceResourceLimits': 'true',
  'panel.defaultRestrictCapabilities': 'true',
  'panel.setupComplete': 'false',
};

/** The legacy environment. This migration is the last code that reads APP_MODE. */
export interface LegacyEnv {
  APP_MODE?: string;
  MAX_SITES_PER_USER?: string;
  MAX_TOTAL_SITES?: string;
}

function addColumn(db: Database.Database, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`).run();
}

export function runPanelMigration(db: Database.Database, env: LegacyEnv = {}): void {
  // Column adds are independently idempotent and safe to repeat.
  addColumn(db, 'sites', 'restrict_capabilities', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'sites', 'origin', "TEXT NOT NULL DEFAULT 'panel'");

  const already = db.prepare("SELECT value FROM settings WHERE key = 'panel.migratedFrom'").get() as
    | { value: string }
    | undefined;
  if (already) return;

  const siteCount = (db.prepare('SELECT COUNT(*) AS c FROM sites').get() as { c: number }).c;
  const priorMode = env.APP_MODE === 'local' ? 'local' : 'agency';
  const from = siteCount === 0 ? 'fresh' : priorMode;

  const apply = db.transaction(() => {
    const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(PANEL_DEFAULTS)) seed.run(key, value);

    const set = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );

    if (from === 'local') {
      db.prepare('UPDATE sites SET restrict_capabilities = 0').run();
      set.run('panel.publicRegistration', 'false');
      set.run('panel.demoPortalEnabled', 'false');
      set.run('panel.allowInsecureRemotes', 'true');
      set.run('panel.enforceResourceLimits', 'false');
      // Local sites always had an unlocked wp-admin; keep new ones that way
      // until the UI exposes a per-site toggle.
      set.run('panel.defaultRestrictCapabilities', 'false');
    } else if (from === 'agency') {
      db.prepare('UPDATE sites SET restrict_capabilities = 1').run();
      set.run('panel.publicRegistration', 'true');
      set.run('panel.demoPortalEnabled', 'true');
      set.run('panel.allowInsecureRemotes', 'false');
      set.run('panel.enforceResourceLimits', 'true');
      set.run('panel.defaultRestrictCapabilities', 'true');
      set.run('panel.quota.member', String(parseInt(env.MAX_SITES_PER_USER || '3', 10)));
      set.run('panel.quota.total', String(parseInt(env.MAX_TOTAL_SITES || '50', 10)));
    }

    if (from !== 'fresh') {
      // 'admin' and 'local-user' are synthetic rows the old code created; a real
      // human account means this install already has an owner and can skip setup.
      const realUsers = (
        db.prepare("SELECT COUNT(*) AS c FROM users WHERE id NOT IN ('admin', 'local-user')").get() as { c: number }
      ).c;
      set.run('panel.setupComplete', realUsers > 0 ? 'true' : 'false');
    }

    set.run('panel.migratedFrom', from);
  });

  apply();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 10 tests total.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/migrations/
git commit -m "feat(api): add panel-v3 migration backfilling panel settings from APP_MODE"
```

---

## Task 3: Settings service

**Files:**
- Create: `packages/api/src/services/settings.service.ts`
- Modify: `packages/api/src/utils/db.ts`
- Test: `packages/api/src/services/settings.service.test.ts`

- [ ] **Step 1: Add a test seam to the DB singleton**

In `packages/api/src/utils/db.ts`, add immediately after the `getDb` function (around line 32):

```ts
/**
 * Test-only: replace the module singleton with a caller-supplied database.
 * Pass `null` to restore normal lazy initialisation.
 */
export function __setDbForTesting(instance: Database.Database | null): void {
  db = instance as Database.Database;
}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/api/src/services/settings.service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { runPanelMigration } from '../utils/migrations/panel-v3';
import { getSetting, getBool, getInt, setSetting } from './settings.service';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  runPanelMigration(db, {});
  __setDbForTesting(db);
});

afterEach(() => {
  __setDbForTesting(null);
  db.close();
});

describe('settings.service', () => {
  it('reads a seeded value', () => {
    expect(getSetting('panel.defaultExpiry')).toBe('permanent');
  });

  it('falls back to the built-in default when the row is missing', () => {
    db.prepare("DELETE FROM settings WHERE key = 'panel.defaultExpiry'").run();
    expect(getSetting('panel.defaultExpiry')).toBe('permanent');
  });

  it('coerces booleans', () => {
    expect(getBool('panel.publicRegistration')).toBe(false);
    setSetting('panel.publicRegistration', 'true');
    expect(getBool('panel.publicRegistration')).toBe(true);
  });

  it('coerces integers', () => {
    setSetting('panel.quota.total', '42');
    expect(getInt('panel.quota.total')).toBe(42);
  });

  it('treats an unparseable integer as 0', () => {
    setSetting('panel.quota.total', 'not-a-number');
    expect(getInt('panel.quota.total')).toBe(0);
  });

  it('upserts rather than duplicating on write', () => {
    setSetting('panel.quota.total', '7');
    setSetting('panel.quota.total', '9');
    const rows = db.prepare("SELECT value FROM settings WHERE key = 'panel.quota.total'").all() as { value: string }[];
    expect(rows).toEqual([{ value: '9' }]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w packages/api`
Expected: FAIL — `Failed to resolve import "./settings.service"`.

- [ ] **Step 4: Implement the service**

Create `packages/api/src/services/settings.service.ts`:

```ts
import { getDb } from '../utils/db';
import { PANEL_DEFAULTS } from '../utils/migrations/panel-v3';

export type PanelSettingKey = string;

export function getSetting(key: PanelSettingKey): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? PANEL_DEFAULTS[key] ?? '';
}

export function getBool(key: PanelSettingKey): boolean {
  return getSetting(key) === 'true';
}

export function getInt(key: PanelSettingKey): number {
  const parsed = parseInt(getSetting(key), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function setSetting(key: PanelSettingKey, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

/** Every `panel.*` row, for the settings API and the admin UI. */
export function getPanelSettings(): Record<string, string> {
  const out: Record<string, string> = { ...PANEL_DEFAULTS };
  const rows = getDb().prepare("SELECT key, value FROM settings WHERE key LIKE 'panel.%'").all() as {
    key: string;
    value: string;
  }[];
  for (const row of rows) out[row.key] = row.value;
  return out;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 16 tests total.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/settings.service.ts packages/api/src/services/settings.service.test.ts packages/api/src/utils/db.ts
git commit -m "feat(api): add settings service for panel.* configuration rows"
```

---

## Task 4: The policy module

**Files:**
- Create: `packages/api/src/policy.ts`
- Test: `packages/api/src/policy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/policy.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './test-helpers/db';
import { __setDbForTesting } from './utils/db';
import { runPanelMigration } from './utils/migrations/panel-v3';
import { setSetting } from './services/settings.service';
import { policy, PERMANENT_EXPIRY, SiteFacts } from './policy';

let db: Database.Database;

function migrateAs(mode: 'local' | 'agency') {
  db.close();
  db = createTestDb();
  db.prepare('INSERT INTO sites (id, subdomain, product_id, expires_at) VALUES (?, ?, ?, ?)').run(
    'seed', 'seed', 'demo', PERMANENT_EXPIRY,
  );
  runPanelMigration(db, { APP_MODE: mode, MAX_SITES_PER_USER: '3', MAX_TOTAL_SITES: '50' });
  __setDbForTesting(db);
}

function site(overrides: Partial<SiteFacts> = {}): SiteFacts {
  return { expires_at: PERMANENT_EXPIRY, restrict_capabilities: 1, direct_file_access: 0, ...overrides };
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

describe('policy — parity with the old local mode', () => {
  beforeEach(() => migrateAs('local'));

  it('does not enforce per-user or total quotas', () => {
    expect(policy.quotaForRole('member')).toBe(0);
    expect(policy.totalSiteQuota()).toBe(0);
  });

  it('allows plain-http remotes', () => {
    expect(policy.allowsInsecureRemotes()).toBe(true);
  });

  it('does not apply container resource limits', () => {
    expect(policy.enforcesResourceLimits()).toBe(false);
  });

  it('leaves wp-admin unlocked on new sites by default', () => {
    expect(policy.defaultRestrictCapabilities()).toBe(false);
  });

  it('does not offer public registration or a demo portal', () => {
    expect(policy.allowsPublicRegistration()).toBe(false);
    expect(policy.demoPortalEnabled()).toBe(false);
  });
});

describe('policy — parity with the old agency mode', () => {
  beforeEach(() => migrateAs('agency'));

  it('enforces the quotas that came from env', () => {
    expect(policy.quotaForRole('member')).toBe(3);
    expect(policy.totalSiteQuota()).toBe(50);
  });

  it('rejects plain-http remotes', () => {
    expect(policy.allowsInsecureRemotes()).toBe(false);
  });

  it('applies container resource limits', () => {
    expect(policy.enforcesResourceLimits()).toBe(true);
  });

  it('locks wp-admin on new sites by default', () => {
    expect(policy.defaultRestrictCapabilities()).toBe(true);
  });

  it('offers public registration and a demo portal', () => {
    expect(policy.allowsPublicRegistration()).toBe(true);
    expect(policy.demoPortalEnabled()).toBe(true);
  });
});

describe('policy — per-site questions', () => {
  it('reads restrictions off the site row, not a global', () => {
    expect(policy.restrictsWpCapabilities(site({ restrict_capabilities: 1 }))).toBe(true);
    expect(policy.restrictsWpCapabilities(site({ restrict_capabilities: 0 }))).toBe(false);
  });

  it('reads file exposure off the site row', () => {
    expect(policy.exposesFiles(site({ direct_file_access: 1 }))).toBe(true);
    expect(policy.exposesFiles(site({ direct_file_access: 0 }))).toBe(false);
  });

  it('treats the sentinel expiry as permanent', () => {
    expect(policy.isPermanent(site({ expires_at: PERMANENT_EXPIRY }))).toBe(true);
    expect(policy.isPermanent(site({ expires_at: '2026-01-01T00:00:00.000Z' }))).toBe(false);
  });
});

describe('policy — quota roles', () => {
  it('maps the legacy "user" role onto the member quota', () => {
    setSetting('panel.quota.member', '4');
    expect(policy.quotaForRole('user')).toBe(4);
  });

  it('falls back to the member quota for an unknown role', () => {
    setSetting('panel.quota.member', '2');
    expect(policy.quotaForRole('something-else')).toBe(2);
  });

  it('gives owners and admins their own quota keys', () => {
    setSetting('panel.quota.owner', '11');
    setSetting('panel.quota.admin', '12');
    expect(policy.quotaForRole('owner')).toBe(11);
    expect(policy.quotaForRole('admin')).toBe(12);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/api`
Expected: FAIL — `Failed to resolve import "./policy"`.

- [ ] **Step 3: Implement the policy module**

Create `packages/api/src/policy.ts`:

```ts
import { getBool, getInt } from './services/settings.service';

/**
 * Sites that never expire are stored with this sentinel rather than NULL,
 * because `sites.expires_at` is NOT NULL and every reader assumes a date.
 */
export const PERMANENT_EXPIRY = '9999-12-31T23:59:59.999Z';

/** The subset of a site row the policy layer needs. */
export interface SiteFacts {
  expires_at: string;
  restrict_capabilities: number;
  direct_file_access: number;
}

const QUOTA_ROLES: readonly string[] = ['owner', 'admin', 'member'];

function quotaKeyFor(role: string): string {
  return QUOTA_ROLES.includes(role) ? `panel.quota.${role}` : 'panel.quota.member';
}

/**
 * The single reader of install settings and per-site facts. Nothing outside this
 * module should ask what "mode" the panel is in — there isn't one.
 */
export const policy = {
  allowsPublicRegistration: (): boolean => getBool('panel.publicRegistration'),
  demoPortalEnabled: (): boolean => getBool('panel.demoPortalEnabled'),
  allowsInsecureRemotes: (): boolean => getBool('panel.allowInsecureRemotes'),
  enforcesResourceLimits: (): boolean => getBool('panel.enforceResourceLimits'),
  setupComplete: (): boolean => getBool('panel.setupComplete'),
  /** What a new site gets when the caller doesn't say. */
  defaultRestrictCapabilities: (): boolean => getBool('panel.defaultRestrictCapabilities'),

  /** 0 means unlimited. */
  quotaForRole: (role: string): number => getInt(quotaKeyFor(role)),
  /** 0 means unlimited. */
  totalSiteQuota: (): number => getInt('panel.quota.total'),

  isPermanent: (site: SiteFacts): boolean => site.expires_at >= PERMANENT_EXPIRY,
  restrictsWpCapabilities: (site: SiteFacts): boolean => site.restrict_capabilities === 1,
  exposesFiles: (site: SiteFacts): boolean => site.direct_file_access === 1,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 32 tests total.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/policy.ts packages/api/src/policy.test.ts
git commit -m "feat(api): add policy module replacing global mode checks"
```

---

## Task 5: Wire the migration into startup with a backup

**Files:**
- Modify: `packages/api/src/utils/db.ts`

- [ ] **Step 1: Add the pre-migration backup**

In `packages/api/src/utils/db.ts`, inside `getDb()`, insert immediately after the stale-WAL
cleanup loop (after line 22) and before `db = new Database(dbPath)`:

```ts
    // One-time safety copy before the panel-v3 migration rewrites settings and
    // site columns. The marker is written only after the migration succeeds, so
    // a crashed upgrade retries the backup on next boot rather than skipping it.
    const migrationMarker = path.join(config.dataDir, '.panel-migration-v3');
    if (fs.existsSync(dbPath) && !fs.existsSync(migrationMarker)) {
      const backupDir = path.join(config.dataDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `pre-v3-${stamp}.db`);
      fs.copyFileSync(dbPath, backupPath);
      console.log(`[db] Pre-migration backup written to ${backupPath}`);
    }
```

- [ ] **Step 2: Call the migration and write the marker**

Add the import at the top of the same file:

```ts
import { runPanelMigration } from './migrations/panel-v3';
```

Then in `initSchema`, insert the following immediately **after** the local-user seed block
(after line 393). The seed itself stays for now: the dashboard's local auto-login still
mints JWTs for `local-user`, and `sites.user_id` has a foreign key to `users(id)`, so
removing the row before plan 2's wizard exists would break site creation on a fresh local
install. Plan 2 deletes it.

```ts
  // Panel settings + per-site columns. This is the only remaining reader of
  // APP_MODE, and only on the first run after upgrading.
  runPanelMigration(db, {
    APP_MODE: process.env.APP_MODE,
    MAX_SITES_PER_USER: process.env.MAX_SITES_PER_USER,
    MAX_TOTAL_SITES: process.env.MAX_TOTAL_SITES,
  });

  const migrationMarker = path.join(config.dataDir, '.panel-migration-v3');
  if (!fs.existsSync(migrationMarker)) {
    fs.writeFileSync(migrationMarker, new Date().toISOString());
  }
```

Note that `runPanelMigration` must run *after* the `settings` table is created, which it is —
`initSchema`'s big DDL block runs first.

- [ ] **Step 3: Verify the API still boots and migrates**

```bash
npm run build -w packages/api
docker compose up -d --build api
docker compose logs api --tail 30
```

Expected: a `Pre-migration backup written to` line on an existing install, and no stack
traces. Then confirm the backfill landed:

```bash
docker compose exec api node -p "Object.fromEntries(require('better-sqlite3')('/app/data/wp-launcher.db').prepare(\"SELECT key,value FROM settings WHERE key LIKE 'panel.%' ORDER BY key\").all().map(r=>[r.key,r.value]))"
```

Expected: every `panel.*` key printed, with `panel.migratedFrom` matching the install's
previous `APP_MODE`.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/utils/db.ts
git commit -m "feat(api): run panel-v3 migration at startup behind a backup"
```

---

## Task 6: Route quotas through policy

**Files:**
- Modify: `packages/api/src/config.ts`
- Modify: `packages/api/src/services/site.service.ts`

- [ ] **Step 1: Remove the mode-derived quota constants**

In `packages/api/src/config.ts`, replace lines 62-67:

```ts
  // Defaults for demo sites
  defaults: {
    expiration: '1h',
    maxConcurrentSites: 50,
    maxTotalSites: isLocalMode ? 0 : parseInt(process.env.MAX_TOTAL_SITES || '50', 10),
  },
```

with:

```ts
  // Defaults for new sites. Site quotas now live in the settings table and are
  // read through `policy` — see policy.quotaForRole / policy.totalSiteQuota.
  defaults: {
    expiration: '1h',
    maxConcurrentSites: 50,
  },
```

In `packages/api/src/services/site.service.ts`, delete line 19:

```ts
export const MAX_SITES_PER_USER = config.isLocalMode ? 0 : parseInt(process.env.MAX_SITES_PER_USER || '3', 10);
```

- [ ] **Step 2: Read quotas from policy at check time**

In `packages/api/src/services/site.service.ts`, add to the imports:

```ts
import { policy } from '../policy';
```

Replace the per-user limit check (lines 122-130):

```ts
    // Check per-user limit
    if (req.userId && req.userId !== 'admin' && MAX_SITES_PER_USER > 0) {
      const userCount = db
        .prepare("SELECT COUNT(*) as count FROM sites WHERE user_id = ? AND status = 'running'")
        .get(req.userId) as { count: number };
      if (userCount.count >= MAX_SITES_PER_USER) {
        throw new ConflictError(`You already have ${MAX_SITES_PER_USER} active demo sites. Please delete one before creating a new one.`);
      }
    }
```

with:

```ts
    // Check per-user limit (0 = unlimited)
    const userQuota = policy.quotaForRole(req.userRole || 'member');
    if (req.userId && req.userId !== 'admin' && userQuota > 0) {
      const userCount = db
        .prepare("SELECT COUNT(*) as count FROM sites WHERE user_id = ? AND status = 'running'")
        .get(req.userId) as { count: number };
      if (userCount.count >= userQuota) {
        throw new ConflictError(`You already have ${userQuota} active sites. Please delete one before creating a new one.`);
      }
    }
```

Replace the global limit check (lines 132-138):

```ts
    // Check global total site limit
    const totalActive = db
      .prepare("SELECT COUNT(*) as count FROM sites WHERE status = 'running'")
      .get() as { count: number };
    if (config.defaults.maxTotalSites > 0 && totalActive.count >= config.defaults.maxTotalSites) {
      throw new ConflictError('Our servers are currently at capacity. Please try again in a few minutes.');
    }
```

with:

```ts
    // Check global total site limit (0 = unlimited)
    const totalQuota = policy.totalSiteQuota();
    if (totalQuota > 0) {
      const totalActive = db
        .prepare("SELECT COUNT(*) as count FROM sites WHERE status = 'running'")
        .get() as { count: number };
      if (totalActive.count >= totalQuota) {
        throw new ConflictError('This server is currently at capacity. Please try again in a few minutes.');
      }
    }
```

- [ ] **Step 3: Add `userRole` to the create-site request type**

In `packages/api/src/services/site.service.ts`, add to `CreateSiteRequest` (line 21, which
already declares `userId`, `userEmail` and `directFileAccess`):

```ts
  userRole?: string;
```

- [ ] **Step 4: Find and fix remaining references**

Run: `npx tsc --noEmit -p packages/api`
Expected: errors only where `MAX_SITES_PER_USER` or `config.defaults.maxTotalSites` were read
elsewhere. Rewrite each to `policy.quotaForRole(...)` / `policy.totalSiteQuota()`. Re-run
until clean.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/config.ts packages/api/src/services/site.service.ts
git commit -m "refactor(api): read site quotas from policy instead of APP_MODE"
```

---

## Task 7: Route the remaining API mode checks through policy

**Files:**
- Modify: `packages/api/src/utils/ssrf.ts`
- Modify: `packages/api/src/services/domain.service.ts`
- Modify: `packages/api/src/routes/sites.ts`

- [ ] **Step 1: SSRF protocol allowance**

In `packages/api/src/utils/ssrf.ts`, add the import:

```ts
import { policy } from '../policy';
```

Replace line 70:

```ts
  const allowHttp = config.isLocalMode || config.nodeEnv === 'development';
```

with:

```ts
  const allowHttp = policy.allowsInsecureRemotes() || config.nodeEnv === 'development';
```

- [ ] **Step 2: Custom domains**

In `packages/api/src/services/domain.service.ts`, replace lines 58-61:

```ts
  // Block in local mode — no DNS/TLS available
  if (config.appMode === 'local') {
    throw new ValidationError('Custom domains are not available in local mode');
  }
```

with:

```ts
  // Custom domains need a real routable base domain; a localhost install has no
  // DNS or TLS to point at.
  if (!config.baseDomain || config.baseDomain === 'localhost') {
    throw new ValidationError('Custom domains require BASE_DOMAIN to be set to a real domain');
  }
```

- [ ] **Step 3: Rate-limit bypass**

In `packages/api/src/routes/sites.ts`, delete line 28 from `isAdminRequest`:

```ts
  if (config.isLocalMode) return true;
```

The function then bypasses rate limits only for a valid API key — the same rule on every
install.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p packages/api`
Expected: no errors.

Run: `npm test -w packages/api`
Expected: PASS — 32 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/ssrf.ts packages/api/src/services/domain.service.ts packages/api/src/routes/sites.ts
git commit -m "refactor(api): route ssrf, domains and rate limits through policy"
```

---

## Task 8: Split `localMode` in the provisioner

**Files:**
- Modify: `packages/provisioner/src/index.ts`
- Modify: `packages/api/src/services/site.service.ts`

- [ ] **Step 1: Replace the provisioner option**

In `packages/provisioner/src/index.ts`, find the options interface containing
`localMode?: boolean` and replace that field with:

```ts
  /** Lock down the WordPress admin (restrictions mu-plugin + DISALLOW_FILE_MODS). */
  restrictCapabilities?: boolean;
  /** Apply CPU/memory limits and upload/disk quotas to the container. */
  enforceResourceLimits?: boolean;
```

- [ ] **Step 2: Rewrite the three call sites**

Replace lines 243-247:

```ts
    if (!opts.localMode) {
      env.push(`WP_UPLOAD_LIMIT=${WP_UPLOAD_LIMIT}`);
      env.push(`WP_DISK_QUOTA=${WP_DISK_QUOTA}`);
    }
```

with:

```ts
    if (opts.enforceResourceLimits) {
      env.push(`WP_UPLOAD_LIMIT=${WP_UPLOAD_LIMIT}`);
      env.push(`WP_DISK_QUOTA=${WP_DISK_QUOTA}`);
    }
```

Replace line 258:

```ts
    if (opts.localMode) env.push('WP_LOCAL_MODE=true');
```

with:

```ts
    // Per-site lockdown. WP_LOCAL_MODE is still emitted for containers running a
    // pre-v3 WordPress image; remove after the next release.
    env.push(`WPL_RESTRICT=${opts.restrictCapabilities ? 'true' : 'false'}`);
    if (!opts.restrictCapabilities) env.push('WP_LOCAL_MODE=true');
```

Replace lines 289-290:

```ts
    // In local mode: no resource limits, mount persistent volume
    const useLocalMode = opts.localMode === true;
```

with:

```ts
    // Resource limits are an install-level policy, not a site property.
    const useLocalMode = opts.enforceResourceLimits !== true;
```

- [ ] **Step 3: Check the remaining `useLocalMode` readers**

Run: `grep -n "useLocalMode\|opts.localMode" packages/provisioner/src/index.ts`
Expected: the assignment from Step 2 plus its readers further down, and no remaining
`opts.localMode`. Each reader keeps working unchanged, because `useLocalMode` now means
exactly "skip resource limits" — which is all it ever controlled at those sites.

- [ ] **Step 4: Update the API caller**

In `packages/api/src/services/site.service.ts`, replace line 244:

```ts
      localMode: config.isLocalMode,
```

with:

```ts
      restrictCapabilities: req.restrictCapabilities ?? policy.defaultRestrictCapabilities(),
      enforceResourceLimits: policy.enforcesResourceLimits(),
```

The default comes from settings, not a literal, so an upgraded local install keeps launching
sites with an unlocked wp-admin exactly as it does today.

Add to `CreateSiteRequest` (line 21):

```ts
  restrictCapabilities?: boolean;
```

And persist it by extending the INSERT at lines 157-160:

```ts
    db.prepare(`
      INSERT INTO sites (id, subdomain, product_id, user_id, status, site_url, admin_url, admin_user, admin_password, auto_login_token, expires_at, direct_file_access, restrict_capabilities)
      VALUES (?, ?, ?, ?, 'creating', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, subdomain, req.productId, req.userId || null, siteUrl, adminUrl, adminUser, adminPassword, autoLoginToken, expiresAt, req.directFileAccess ? 1 : 0, req.restrictCapabilities === false ? 0 : 1);
```

- [ ] **Step 5: Verify both packages build**

Run: `npx tsc --noEmit -p packages/api && npx tsc --noEmit -p packages/provisioner`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/provisioner/src/index.ts packages/api/src/services/site.service.ts
git commit -m "refactor(provisioner): split localMode into per-site restrictions and install resource limits"
```

---

## Task 9: Per-site restrictions in WordPress

**Files:**
- Modify: `wordpress/mu-plugins/wp-launcher-restrictions.php`
- Modify: `wordpress/wp-config-docker.php`

- [ ] **Step 1: Read `WPL_RESTRICT` in the restrictions mu-plugin**

In `wordpress/mu-plugins/wp-launcher-restrictions.php`, replace line 13:

```php
if ( getenv( 'WP_LOCAL_MODE' ) === 'true' ) {
```

with:

```php
// Per-site lockdown. Containers created before v3 have no WPL_RESTRICT, so fall
// back to the inverted legacy flag. Remove the fallback after the next release.
$wpl_restrict = getenv( 'WPL_RESTRICT' );
if ( false === $wpl_restrict ) {
	$wpl_restrict = getenv( 'WP_LOCAL_MODE' ) === 'true' ? 'false' : 'true';
}
if ( 'true' !== $wpl_restrict ) {
```

- [ ] **Step 2: Gate `DISALLOW_FILE_MODS` the same way**

In `wordpress/wp-config-docker.php`, replace line 48:

```php
if ( getenv( 'WP_LOCAL_MODE' ) !== 'true' ) {
```

with:

```php
$wpl_restrict = getenv( 'WPL_RESTRICT' );
if ( false === $wpl_restrict ) {
	$wpl_restrict = getenv( 'WP_LOCAL_MODE' ) === 'true' ? 'false' : 'true';
}
if ( 'true' === $wpl_restrict ) {
```

- [ ] **Step 3: Verify both files parse**

```bash
docker run --rm -v "$PWD/wordpress:/w" php:8.3-cli php -l /w/mu-plugins/wp-launcher-restrictions.php
docker run --rm -v "$PWD/wordpress:/w" php:8.3-cli php -l /w/wp-config-docker.php
```

Expected: `No syntax errors detected` for both.

- [ ] **Step 4: Verify end to end**

```bash
bash scripts/build-wp-image.sh
docker compose up -d --build api provisioner
```

Launch one site with restrictions on and one with them off, then check each container:

```bash
docker exec wp-site-<subdomain> printenv WPL_RESTRICT
```

Expected: `true` for the restricted site, whose wp-admin hides Plugins and Themes, and
`false` for the unrestricted one, whose wp-admin shows them.

- [ ] **Step 5: Commit**

```bash
git add wordpress/mu-plugins/wp-launcher-restrictions.php wordpress/wp-config-docker.php
git commit -m "feat(wordpress): gate restrictions on per-site WPL_RESTRICT"
```

---

## Task 10: Expose panel settings on the API

**Files:**
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Add panel settings to the payload**

In `packages/api/src/index.ts`, add the imports:

```ts
import { getPanelSettings } from './services/settings.service';
import { policy } from './policy';
```

Replace the response block at lines 146-158:

```ts
  res.json({
    cardLayout: branding.cardLayout || config.ui.cardLayout,
    appMode: config.appMode,
    baseDomain: config.baseDomain,
    features,
    branding: {
      siteTitle: branding.siteTitle || 'WP Launcher',
      logoUrl: branding.logoUrl || '',
      cardLayout: branding.cardLayout || config.ui.cardLayout,
    },
    colors,
    sitesHostPath: config.isLocalMode ? config.sitesHostPath : '',
  });
```

with:

```ts
  res.json({
    cardLayout: branding.cardLayout || config.ui.cardLayout,
    // Retained until plan 4 removes the dashboard's mode fork. Nothing in the
    // API reads it any more.
    appMode: config.appMode,
    baseDomain: config.baseDomain,
    features,
    branding: {
      siteTitle: branding.siteTitle || 'WP Launcher',
      logoUrl: branding.logoUrl || '',
      cardLayout: branding.cardLayout || config.ui.cardLayout,
    },
    colors,
    sitesHostPath: config.sitesHostPath,
    panel: getPanelSettings(),
    setupRequired: !policy.setupComplete(),
  });
```

- [ ] **Step 2: Verify the payload**

```bash
npm run build -w packages/api
docker compose up -d --build api
curl -s http://localhost:3737/api/settings
```

Expected: JSON containing a `panel` object with all eleven `panel.*` keys at their migrated
values, and a `setupRequired` boolean mirroring `panel.setupComplete`.

- [ ] **Step 3: Verify the whole suite**

Run: `npm test -w packages/api && npx tsc --noEmit -p packages/api`
Expected: 32 tests PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/index.ts
git commit -m "feat(api): expose panel settings and setupRequired on /api/settings"
```

---

## Done criteria

- `npm test -w packages/api` passes with 32 tests.
- `grep -rn "isLocalMode" packages/api/src` returns only `config.ts` (the definition) plus
  the two `appMode` reporting lines in `/api/settings` and `/api/admin/system/info`.
- An upgraded install has a `data/backups/pre-v3-*.db` file and a full set of `panel.*`
  settings matching its previous mode.
- New sites launch with `WPL_RESTRICT` set, and WordPress restrictions follow the per-site
  value rather than an install-wide one.
- The dashboard is untouched and behaves exactly as before.
