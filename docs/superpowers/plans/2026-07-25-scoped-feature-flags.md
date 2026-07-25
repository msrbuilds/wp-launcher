# Scoped Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate what the panel operator can do from what a non-admin member who launches sites can do — enabled features become admin-only, with a second opt-in set granting a subset of per-site capabilities to members.

**Architecture:** One role-aware resolution path replaces four duplicated role-blind gates. Existing `feature.<key>` rows keep their meaning as the admin set; a new `feature.demo.<key>` namespace holds the member set and defaults off, so no migration runs and nothing leaks to members by accident.

**Tech Stack:** Express, better-sqlite3, TypeScript, vitest, React + Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-07-25-scoped-feature-flags-design.md`

## Global Constraints

- Node 22 on the host (`.nvmrc`); run tests with `cd packages/api && npx vitest run`.
- Settings keys: admin set is `feature.<key>` (**unchanged, no migration**); member set is `feature.demo.<key>`.
- Admin-only features (5) have **no** `feature.demo.*` counterpart: `projects`, `productivityMonitor`, `siteSync`, `webhooks`, `collaborativeSites`.
- Grantable features (12): `cloning`, `snapshots`, `templates`, `customDomains`, `phpConfig`, `siteExtend`, `sitePassword`, `exportZip`, `healthMonitoring`, `scheduledLaunch`, `adminer`, `publicSharing`.
- The two toggles per grantable feature are **independent** — a demo grant does not require the admin flag to be on.
- Anonymous callers (no token) resolve as a member: they see the demo set, never the admin set.
- A member denied a capability gets **403**, the same status a globally disabled feature returns today.
- Never write a hex value or inline `style` prop in a component; use theme tokens (see CLAUDE.md CSS Architecture).

---

## File structure

**API (`packages/api/src`)**
- `services/features.service.ts` (create) — the only source of truth: the two catalogs, the pure `resolveFeature`, and the DB-backed `isFeatureEnabled` / `effectiveFeatures`.
- `routes/sites.ts`, `routes/projects.ts`, `routes/sync.ts`, `routes/productivity.ts` (modify) — delete the four local `isFeatureEnabled` copies, use the shared role-aware one.
- `index.ts` (modify) — `/api/settings` becomes role-aware; `GET|PUT /api/admin/features` gain the demo set, catalog, and validation.

**Dashboard (`packages/dashboard/src`)**
- `pages/admin/shared.ts` (modify) — rewrite the 17 `FEATURE_META` descriptions to audience-neutral wording.
- `pages/admin/FeaturesTab.tsx` (modify) — two-column matrix for grantable features, admin-only block for the rest.

---

## Task 1: Feature catalogs and pure resolution

**Files:**
- Create: `packages/api/src/services/features.service.ts`
- Test: `packages/api/src/services/features.service.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ADMIN_ONLY_FEATURES`, `GRANTABLE_FEATURES`, `ALL_FEATURES` (all `readonly string[]`); `type FeatureRole = string | undefined`; `isAdminRole(role: FeatureRole): boolean`; `isAdminOnlyFeature(key: string): boolean`; `adminSettingKey(key: string): string`; `demoSettingKey(key: string): string`; `resolveFeature(input: { key: string; role: FeatureRole; adminOn: boolean; demoOn: boolean }): boolean`.

- [ ] **Step 1: Write the failing test.** Create `packages/api/src/services/features.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ADMIN_ONLY_FEATURES, GRANTABLE_FEATURES, ALL_FEATURES,
  isAdminRole, isAdminOnlyFeature, adminSettingKey, demoSettingKey, resolveFeature,
} from './features.service';

describe('catalogs', () => {
  it('classifies every feature exactly once and covers all 17', () => {
    expect(ADMIN_ONLY_FEATURES.length).toBe(5);
    expect(GRANTABLE_FEATURES.length).toBe(12);
    expect(ALL_FEATURES.length).toBe(17);
    const overlap = ADMIN_ONLY_FEATURES.filter((k) => GRANTABLE_FEATURES.includes(k));
    expect(overlap).toEqual([]);
    expect(new Set(ALL_FEATURES).size).toBe(17);
  });

  it('puts the five admin-only features out of members reach', () => {
    for (const k of ['projects', 'productivityMonitor', 'siteSync', 'webhooks', 'collaborativeSites']) {
      expect(isAdminOnlyFeature(k)).toBe(true);
    }
    expect(isAdminOnlyFeature('cloning')).toBe(false);
  });
});

describe('isAdminRole', () => {
  it('treats owner and admin as privileged', () => {
    expect(isAdminRole('owner')).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
  });
  it('treats member and anonymous as unprivileged', () => {
    expect(isAdminRole('member')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole('')).toBe(false);
  });
});

describe('setting keys', () => {
  it('keeps the admin namespace unchanged and namespaces the demo set', () => {
    expect(adminSettingKey('cloning')).toBe('feature.cloning');
    expect(demoSettingKey('cloning')).toBe('feature.demo.cloning');
  });
});

describe('resolveFeature', () => {
  const grantable = 'cloning';
  const adminOnly = 'projects';

  it('gives an admin the admin toggle, ignoring the demo one', () => {
    expect(resolveFeature({ key: grantable, role: 'admin', adminOn: true, demoOn: false })).toBe(true);
    expect(resolveFeature({ key: grantable, role: 'owner', adminOn: false, demoOn: true })).toBe(false);
  });

  it('gives a member the demo toggle, ignoring the admin one', () => {
    expect(resolveFeature({ key: grantable, role: 'member', adminOn: false, demoOn: true })).toBe(true);
    expect(resolveFeature({ key: grantable, role: 'member', adminOn: true, demoOn: false })).toBe(false);
  });

  it('never grants an admin-only feature to a member, even if a demo row exists', () => {
    expect(resolveFeature({ key: adminOnly, role: 'member', adminOn: true, demoOn: true })).toBe(false);
  });

  it('treats an anonymous caller as a member', () => {
    expect(resolveFeature({ key: grantable, role: undefined, adminOn: true, demoOn: false })).toBe(false);
    expect(resolveFeature({ key: grantable, role: undefined, adminOn: false, demoOn: true })).toBe(true);
  });

  it('denies unknown keys outright', () => {
    expect(resolveFeature({ key: 'notAFeature', role: 'owner', adminOn: true, demoOn: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `cd packages/api && npx vitest run src/services/features.service.test.ts`
Expected: FAIL — cannot resolve `./features.service`.

- [ ] **Step 3: Implement the catalogs and pure resolution.** Create `packages/api/src/services/features.service.ts`:

```ts
/**
 * Feature resolution. There are two audiences: the panel operator (owner/admin)
 * and members who launch their own sites. The operator's flags stay in the
 * original `feature.<key>` rows; members read a separate `feature.demo.<key>`
 * namespace that starts empty, so enabling something for yourself never grants
 * it to a self-service signup.
 */

/** Never available to a member — no `feature.demo.*` counterpart exists. */
export const ADMIN_ONLY_FEATURES: readonly string[] = [
  'projects',
  'productivityMonitor',
  'siteSync',
  'webhooks',
  // Invites other users by email: an access-granting and outbound-mail vector
  // that should not sit behind self-service signup.
  'collaborativeSites',
];

/** Per-site capabilities an admin may grant to members. */
export const GRANTABLE_FEATURES: readonly string[] = [
  'cloning',
  'snapshots',
  'templates',
  'customDomains',
  'phpConfig',
  'siteExtend',
  'sitePassword',
  'exportZip',
  'healthMonitoring',
  'scheduledLaunch',
  'adminer',
  'publicSharing',
];

export const ALL_FEATURES: readonly string[] = [...ADMIN_ONLY_FEATURES, ...GRANTABLE_FEATURES];

/** A role string from the request, or undefined for an anonymous caller. */
export type FeatureRole = string | undefined;

export function isAdminRole(role: FeatureRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function isAdminOnlyFeature(key: string): boolean {
  return ADMIN_ONLY_FEATURES.includes(key);
}

export function adminSettingKey(key: string): string {
  return `feature.${key}`;
}

export function demoSettingKey(key: string): string {
  return `feature.demo.${key}`;
}

/**
 * The two toggles are independent by design: an operator may run a capability
 * for themselves without offering it to members, or vice versa. Anonymous
 * callers resolve as members so a missing token can never widen access.
 */
export function resolveFeature(input: {
  key: string;
  role: FeatureRole;
  adminOn: boolean;
  demoOn: boolean;
}): boolean {
  if (!ALL_FEATURES.includes(input.key)) return false;
  if (isAdminRole(input.role)) return input.adminOn;
  if (isAdminOnlyFeature(input.key)) return false;
  return input.demoOn;
}
```

- [ ] **Step 4: Run it to confirm it passes.**

Run: `cd packages/api && npx vitest run src/services/features.service.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit.**

```bash
git add packages/api/src/services/features.service.ts packages/api/src/services/features.service.test.ts
git commit -m "feat(features): feature catalogs and role-aware resolution"
```

---

## Task 2: DB-backed lookups

**Files:**
- Modify: `packages/api/src/services/features.service.ts`
- Modify: `packages/api/src/services/features.service.test.ts`

**Interfaces:**
- Consumes: Task 1's `resolveFeature`, catalogs, `adminSettingKey`, `demoSettingKey`; `getDb` from `../utils/db`; `createTestDb` / `__setDbForTesting` for tests.
- Produces: `isFeatureEnabled(key: string, role: FeatureRole): boolean`; `effectiveFeatures(role: FeatureRole): Record<string, boolean>`.

- [ ] **Step 1: Write the failing test.** Append to `features.service.test.ts`, merging the new imports into the existing import block at the top of the file:

```ts
import { beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { isFeatureEnabled, effectiveFeatures } from './features.service';

describe('DB-backed lookups', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    __setDbForTesting(db);
    const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    set.run('feature.cloning', 'true');        // admin: on
    set.run('feature.demo.cloning', 'false');  // demo: off
    set.run('feature.adminer', 'false');       // admin: off
    set.run('feature.demo.adminer', 'true');   // demo: on
    set.run('feature.projects', 'true');       // admin-only, on
  });

  afterEach(() => { __setDbForTesting(null); db.close(); });

  it('reads the admin namespace for an admin', () => {
    expect(isFeatureEnabled('cloning', 'admin')).toBe(true);
    expect(isFeatureEnabled('adminer', 'owner')).toBe(false);
  });

  it('reads the demo namespace for a member', () => {
    expect(isFeatureEnabled('cloning', 'member')).toBe(false);
    expect(isFeatureEnabled('adminer', 'member')).toBe(true);
  });

  it('withholds admin-only features from members regardless of rows', () => {
    expect(isFeatureEnabled('projects', 'admin')).toBe(true);
    expect(isFeatureEnabled('projects', 'member')).toBe(false);
  });

  it('treats a missing row as off', () => {
    expect(isFeatureEnabled('snapshots', 'admin')).toBe(false);
    expect(isFeatureEnabled('snapshots', 'member')).toBe(false);
  });

  it('builds an effective map covering all features for an admin', () => {
    const map = effectiveFeatures('admin');
    expect(Object.keys(map).length).toBe(17);
    expect(map.cloning).toBe(true);
    expect(map.projects).toBe(true);
  });

  it('builds an effective map where members see no admin-only features', () => {
    const map = effectiveFeatures('member');
    expect(map.adminer).toBe(true);
    expect(map.cloning).toBe(false);
    expect(map.projects).toBe(false);
    expect(map.siteSync).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `cd packages/api && npx vitest run src/services/features.service.test.ts`
Expected: FAIL — `isFeatureEnabled` is not exported.

- [ ] **Step 3: Implement the lookups.** Add `import { getDb } from '../utils/db';` to the top of `features.service.ts`, then append:

```ts
function readFlag(settingKey: string): boolean {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(settingKey) as { value: string } | undefined;
  return row?.value === 'true';
}

/** Is `key` available to a caller with this role? */
export function isFeatureEnabled(key: string, role: FeatureRole): boolean {
  if (!ALL_FEATURES.includes(key)) return false;
  // Read only the namespace this role actually resolves against.
  if (isAdminRole(role)) {
    return resolveFeature({ key, role, adminOn: readFlag(adminSettingKey(key)), demoOn: false });
  }
  if (isAdminOnlyFeature(key)) return false;
  return resolveFeature({ key, role, adminOn: false, demoOn: readFlag(demoSettingKey(key)) });
}

/** Every feature resolved for this role — what the dashboard should render from. */
export function effectiveFeatures(role: FeatureRole): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of ALL_FEATURES) out[key] = isFeatureEnabled(key, role);
  return out;
}
```

- [ ] **Step 4: Run it to confirm it passes.**

Run: `cd packages/api && npx vitest run src/services/features.service.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit.**

```bash
git add packages/api/src/services/features.service.ts packages/api/src/services/features.service.test.ts
git commit -m "feat(features): role-aware DB lookups and effective feature map"
```

---

## Task 3: Consolidate the four duplicated route gates

**Files:**
- Modify: `packages/api/src/routes/sites.ts` (delete lines 20-23, update 11 call sites)
- Modify: `packages/api/src/routes/projects.ts` (delete lines 14-17)
- Modify: `packages/api/src/routes/sync.ts` (delete lines 26-29)
- Modify: `packages/api/src/routes/productivity.ts` (rewrite the local gate at lines 85-95)

**Interfaces:**
- Consumes: Task 2's `isFeatureEnabled(key, role)`.
- Produces: no new exports. Every gate now reads `req.userRole`.

- [ ] **Step 1: Replace the gate in `sites.ts`.** Delete this block (lines 20-23):

```ts
function isFeatureEnabled(key: string): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(`feature.${key}`) as { value: string } | undefined;
  return row?.value === 'true';
}
```

Add to the imports at the top:

```ts
import { isFeatureEnabled } from '../services/features.service';
```

Update all 11 call sites to pass the caller's role. They are at lines 142, 152, 158 (`scheduledLaunch`), 385 (`healthMonitoring`), 397, 407 (`sitePassword`), 423 (`exportZip`), 470 (`adminer`), 501, 520, 530 (`publicSharing`). Each becomes:

```ts
// before
if (!isFeatureEnabled('adminer')) { ... }
// after
if (!isFeatureEnabled('adminer', req.userRole)) { ... }
```

Verify none were missed with `grep -n "isFeatureEnabled(" packages/api/src/routes/sites.ts` — every line should pass a second argument, and no `function isFeatureEnabled` definition should remain.

- [ ] **Step 2: Replace the gate in `projects.ts` and `sync.ts`.** In each file delete the local `isFeatureEnabled` definition, add `import { isFeatureEnabled } from '../services/features.service';`, and pass `req.userRole` at each call site. Both routers are already admin-gated, so behaviour is unchanged — the point is that one definition now governs all of them.

Verify with `grep -rn "function isFeatureEnabled" packages/api/src/routes/` — expect no output.

- [ ] **Step 3: Rewrite the productivity gate.** In `packages/api/src/routes/productivity.ts`, delete the local `isFeatureEnabled()` (lines 85-88) and change `requireFeature` to take the role:

```ts
function requireFeature(req: AuthRequest, res: Response, next: () => void) {
  // productivityMonitor is admin-only, so this is false for members by
  // construction — see ADMIN_ONLY_FEATURES in features.service.
  if (!isFeatureEnabled('productivityMonitor', req.userRole)) {
    res.status(403).json({ error: 'Productivity Monitor feature is disabled' });
    return;
  }
  next();
}
```

Add `import { isFeatureEnabled } from '../services/features.service';`.

**Careful:** `requireFeature` also guards `POST /heartbeats` and `GET /cloud/status`, which are unauthenticated. Anonymous resolves as a member and `productivityMonitor` is admin-only, so those two would start returning 403 and break heartbeat ingestion. Add a second guard for them that asks whether the install has the feature on at all:

```ts
/**
 * Ingestion and status are machine endpoints with no session: the heartbeat
 * secret authenticates them, not a role. They ask whether the install has the
 * feature enabled, which is the admin flag.
 */
function requireFeatureForMachineClients(_req: AuthRequest, res: Response, next: () => void) {
  if (!isFeatureEnabled('productivityMonitor', 'admin')) {
    res.status(403).json({ error: 'Productivity Monitor feature is disabled' });
    return;
  }
  next();
}
```

Use `requireFeatureForMachineClients` on `POST /heartbeats` and `GET /cloud/status`; keep `requireFeature` everywhere else.

- [ ] **Step 4: Typecheck and run the whole suite.**

Run: `cd packages/api && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 5: Verify heartbeat ingestion still works.** Rebuild, then post a heartbeat with the install's secret and confirm the response is `200 {"received":1}` rather than `403`:

```
docker compose build api && docker compose up -d api
```

Then run a Node one-liner inside the api container that reads `heartbeat_secret` from `productivity_cloud_config` and POSTs one heartbeat to `http://localhost:3737/api/productivity/heartbeats` with `Content-Type: text/plain` and body `{"secret":"<secret>","heartbeats":[{"source":"editor","entity":"gate-check.ts","entity_type":"file","category":"coding","is_write":false}]}`.
Expected: HTTP 200 and `{"received":1}`. A 403 means the machine-client guard from Step 3 was not applied to `/heartbeats`.

- [ ] **Step 6: Commit.**

```bash
git add packages/api/src/routes/sites.ts packages/api/src/routes/projects.ts packages/api/src/routes/sync.ts packages/api/src/routes/productivity.ts
git commit -m "refactor(features): one role-aware gate replaces four duplicated copies"
```

---

## Task 4: Role-aware `GET /api/settings`

**Files:**
- Modify: `packages/api/src/index.ts` (the `/api/settings` handler, around lines 176-200)

**Interfaces:**
- Consumes: Task 2's `effectiveFeatures(role)`; `optionalUserAuth` and `AuthRequest` from `./middleware/userAuth`.
- Produces: `/api/settings` returns `features` resolved for the requester instead of the raw admin set.

- [ ] **Step 1: Make the handler role-aware.** This endpoint is public and currently returns every `feature.*` row to everyone, so a member's UI renders actions the API then refuses. Add `optionalUserAuth` so a signed-in caller is identified without locking anonymous callers out, and resolve features through the shared map. Replace the handler signature and the feature branch of the loop:

```ts
// before
app.get('/api/settings', (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const features: Record<string, boolean> = {};
  const branding: Record<string, string> = {};
  const colors: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith('feature.')) {
      features[row.key.replace('feature.', '')] = row.value === 'true';
    } else if (row.key.startsWith('branding.')) {
```

```ts
// after
app.get('/api/settings', optionalUserAuth, (req: AuthRequest, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  // Resolved for the caller, not the raw admin set: a member must not be shown
  // actions their role cannot use. Anonymous resolves as a member.
  const features = effectiveFeatures(req.userRole);
  const branding: Record<string, string> = {};
  const colors: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith('branding.')) {
```

Leave the rest of the loop and the response body untouched.

- [ ] **Step 2: Add the imports.** At the top of `index.ts`:

```ts
import { optionalUserAuth, AuthRequest } from './middleware/userAuth';
import { effectiveFeatures } from './services/features.service';
```

If either module is already imported there, merge rather than duplicate.

- [ ] **Step 3: Typecheck.**

Run: `cd packages/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify against the running API.** Rebuild and deploy, then fetch `/api/settings` with no credentials and confirm an admin-only feature reads `false` even when its admin flag is on:

```
docker compose build api && docker compose up -d api
```

Fetch `http://localhost:3737/api/settings` from inside the api container with no auth header and inspect `features.projects`.
Expected: `false` — an admin-only feature is never exposed to an unauthenticated caller.

- [ ] **Step 5: Commit.**

```bash
git add packages/api/src/index.ts
git commit -m "feat(features): serve per-role effective features from /api/settings"
```

---

## Task 5: Admin features API — demo set, catalog, validation

**Files:**
- Modify: `packages/api/src/index.ts` (`GET /api/admin/features` ~line 393, `PUT /api/admin/features` ~line 404)

**Interfaces:**
- Consumes: Task 1's `ADMIN_ONLY_FEATURES`, `GRANTABLE_FEATURES`, `ALL_FEATURES`, `adminSettingKey`, `demoSettingKey`, `isAdminOnlyFeature`; `policy` from `./policy`; the existing `ensureHeartbeatSecret`.
- Produces: `GET` returns `{ features, demoFeatures, catalog: { adminOnly, grantable }, demoColumnVisible }`; `PUT` accepts `{ features, demoFeatures }`.

- [ ] **Step 1: Rewrite `GET /api/admin/features`.** Replace the whole handler:

```ts
app.get('/api/admin/features', adminAuth, (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'feature.%'").all() as { key: string; value: string }[];
  const features: Record<string, boolean> = {};
  const demoFeatures: Record<string, boolean> = {};
  for (const row of rows) {
    // Test the demo prefix first, or a demo row is misread as an admin feature
    // literally named "demo.cloning".
    if (row.key.startsWith('feature.demo.')) {
      demoFeatures[row.key.replace('feature.demo.', '')] = row.value === 'true';
    } else {
      features[row.key.replace('feature.', '')] = row.value === 'true';
    }
  }
  // Absent rows read as off, so the UI gets a complete map either way.
  for (const key of ALL_FEATURES) features[key] = features[key] ?? false;
  for (const key of GRANTABLE_FEATURES) demoFeatures[key] = demoFeatures[key] ?? false;
  res.json({
    features,
    demoFeatures,
    // Served so the dashboard never keeps a second copy of the classification.
    catalog: { adminOnly: ADMIN_ONLY_FEATURES, grantable: GRANTABLE_FEATURES },
    // Only worth showing the members column once non-admin users can exist.
    demoColumnVisible: policy.allowsPublicRegistration() || policy.demoPortalEnabled(),
  });
});
```

- [ ] **Step 2: Rewrite `PUT /api/admin/features`.** Replace the whole handler:

```ts
app.put('/api/admin/features', adminAuth, (req, res) => {
  const db = getDb();
  const { features, demoFeatures } = req.body as {
    features?: Record<string, boolean>;
    demoFeatures?: Record<string, boolean>;
  };
  if (!features && !demoFeatures) {
    res.status(400).json({ error: 'features or demoFeatures object is required' });
    return;
  }
  // Granting an admin-only capability to members is not a silent no-op: it means
  // the caller misunderstands the model, so say so.
  const illegal = Object.keys(demoFeatures || {}).filter((k) => isAdminOnlyFeature(k));
  if (illegal.length) {
    res.status(400).json({ error: `These features cannot be granted to demo users: ${illegal.join(', ')}` });
    return;
  }
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [name, enabled] of Object.entries(features || {})) {
    if (ALL_FEATURES.includes(name)) update.run(adminSettingKey(name), String(enabled));
  }
  for (const [name, enabled] of Object.entries(demoFeatures || {})) {
    if (GRANTABLE_FEATURES.includes(name)) update.run(demoSettingKey(name), String(enabled));
  }
  // Tracking needs a heartbeat secret to authenticate its clients, independent
  // of any cloud account — mint it when the feature is switched on.
  if (features?.productivityMonitor === true) {
    try {
      ensureHeartbeatSecret();
    } catch (err: any) {
      console.error('[productivity] could not mint heartbeat secret:', err.message);
    }
  }
  res.json({ status: 'updated' });
});
```

- [ ] **Step 3: Add the imports.** In `index.ts`:

```ts
import {
  ALL_FEATURES, ADMIN_ONLY_FEATURES, GRANTABLE_FEATURES,
  adminSettingKey, demoSettingKey, isAdminOnlyFeature,
} from './services/features.service';
```

Merge with the `effectiveFeatures` import from Task 4. Confirm `policy` is imported; if not, add `import { policy } from './policy';`.

- [ ] **Step 4: Typecheck, then verify the contract live.** Run `cd packages/api && npx tsc --noEmit`, rebuild and deploy the api, then exercise three cases with the API key:

1. `GET /api/admin/features` — expect `catalog.adminOnly.length === 5`, `catalog.grantable.length === 12`, and a boolean `demoColumnVisible`.
2. `PUT /api/admin/features` with body `{"demoFeatures":{"projects":true}}` — expect **400** and an error naming `projects`.
3. `PUT /api/admin/features` with body `{"demoFeatures":{"cloning":false}}` — expect **200**.

- [ ] **Step 5: Commit.**

```bash
git add packages/api/src/index.ts
git commit -m "feat(features): admin API serves demo set, catalog, and rejects illegal grants"
```

---

## Task 6: Features page matrix and copy

**Files:**
- Modify: `packages/dashboard/src/pages/admin/shared.ts` (`FEATURE_META`, lines 62-85)
- Modify: `packages/dashboard/src/pages/admin/FeaturesTab.tsx`

**Interfaces:**
- Consumes: Task 5's `GET /api/admin/features` response (`features`, `demoFeatures`, `catalog`, `demoColumnVisible`) and `PUT` body `{ features, demoFeatures }`.
- Produces: no exports beyond the existing default component and `FEATURE_META`.

- [ ] **Step 1: Rewrite the `FEATURE_META` descriptions.** All 17 currently begin "Allow users to…", which reads as though the panel exists for demo visitors. Make them audience-neutral — the operator is the primary reader. Replace the array body in `shared.ts` with:

```ts
  { key: 'cloning', label: 'Site Cloning', description: 'Clone a running site into a new one' },
  { key: 'snapshots', label: 'Snapshots', description: 'Take and restore point-in-time site snapshots' },
  { key: 'templates', label: 'Save as Blueprint', description: 'Export a running site as a reusable blueprint' },
  { key: 'customDomains', label: 'Custom Domains', description: 'Point a custom domain at a site', requires: 'publicDomain' },
  { key: 'phpConfig', label: 'PHP Configuration', description: 'Change PHP settings on a running site' },
  { key: 'siteExtend', label: 'Site Extend', description: 'Push back a site expiry date' },
  { key: 'sitePassword', label: 'Site Password Protection', description: 'Put a password in front of a site' },
  { key: 'exportZip', label: 'Export Site as ZIP', description: 'Download a site as a portable ZIP archive' },
  { key: 'webhooks', label: 'Webhook Notifications', description: 'Fire HTTP webhooks on site events (created, expired, deleted)' },
  { key: 'healthMonitoring', label: 'Site Health Monitoring', description: 'Track container CPU and memory for running sites' },
  { key: 'scheduledLaunch', label: 'Scheduled Site Launch', description: 'Queue sites to be created at a future time' },
  { key: 'collaborativeSites', label: 'Collaborative Sites', description: 'Share a site with another user as viewer or admin', requires: 'smtp' },
  { key: 'adminer', label: 'Database Manager (Adminer)', description: 'Browse and edit site databases through Adminer' },
  { key: 'publicSharing', label: 'Public Sharing (Tunnels)', description: 'Expose a site publicly via LAN, Cloudflare Tunnel, or ngrok' },
  { key: 'siteSync', label: 'Site Sync', description: 'Push and pull site content between this panel and remote instances' },
  { key: 'projects', label: 'Projects & Invoices', description: 'Manage clients, projects, and generate invoices' },
  { key: 'productivityMonitor', label: 'Productivity Monitor', description: 'Track coding time and WordPress activity with daily goals and breakdowns' },
```

- [ ] **Step 2: Load the demo set and catalog.** In `FeaturesTab.tsx`, extend the state and the fetch:

```ts
const [features, setFeatures] = useState<Record<string, boolean>>({});
const [demoFeatures, setDemoFeatures] = useState<Record<string, boolean>>({});
const [catalog, setCatalog] = useState<{ adminOnly: string[]; grantable: string[] }>({ adminOnly: [], grantable: [] });
const [demoColumnVisible, setDemoColumnVisible] = useState(false);

useEffect(() => {
  apiFetch('/api/admin/features', { headers })
    .then((r) => r.json())
    .then((data) => {
      setFeatures(data.features || {});
      setDemoFeatures(data.demoFeatures || {});
      if (data.catalog) setCatalog(data.catalog);
      setDemoColumnVisible(!!data.demoColumnVisible);
    })
    .catch(() => {})
    .finally(() => setLoading(false));
}, []);
```

- [ ] **Step 3: Send both sets on save.** In `handleSave`, change the request body to `JSON.stringify({ features, demoFeatures })`, leaving the rest of the function as-is.

- [ ] **Step 4: Split the render into two groups.** Replace the single `FEATURE_META.map(...)` block with two sections, driven by the server's catalog so the classification is never duplicated client-side. Keep the existing `hint` logic and the row styling; add a second `Switch` per grantable row when `demoColumnVisible`:

```tsx
{/* Capabilities an admin may also grant to members. */}
<h3 className="text-sm font-semibold text-foreground">Site capabilities</h3>
<p className="mt-1 mb-3 text-sm text-muted-foreground">
  {demoColumnVisible
    ? 'The first switch applies to you and other admins. The second grants the capability to members who launch their own sites.'
    : 'Applies to you and other admins.'}
</p>
{FEATURE_META.filter((f) => catalog.grantable.includes(f.key)).map((f) => {
  const hint =
    f.requires === 'publicDomain' && (!baseDomain || baseDomain === 'localhost')
      ? 'Needs a public domain'
      : f.requires === 'smtp' && !smtpConfigured
        ? 'Needs email configured'
        : '';
  const enabled = !!features[f.key];
  return (
    <div
      key={f.key}
      className={cn(
        'flex items-center justify-between gap-4 rounded-lg border border-border p-4',
        enabled ? 'bg-accent' : 'bg-muted',
      )}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {f.label}
          {hint && <Badge variant="outline" title={hint}>{hint}</Badge>}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{f.description}</div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <Label htmlFor={`feature-${f.key}`} className="text-xs text-muted-foreground">Admin</Label>
          <Switch
            id={`feature-${f.key}`}
            checked={enabled}
            onCheckedChange={(v) => setFeatures((prev) => ({ ...prev, [f.key]: v }))}
          />
        </div>
        {demoColumnVisible && (
          <div className="flex flex-col items-center gap-1">
            <Label htmlFor={`demo-${f.key}`} className="text-xs text-muted-foreground">Members</Label>
            <Switch
              id={`demo-${f.key}`}
              checked={!!demoFeatures[f.key]}
              onCheckedChange={(v) => setDemoFeatures((prev) => ({ ...prev, [f.key]: v }))}
            />
          </div>
        )}
      </div>
    </div>
  );
})}

{/* No member equivalent: these govern the panel itself. */}
<h3 className="mt-6 text-sm font-semibold text-foreground">Admin-only features</h3>
<p className="mt-1 mb-3 text-sm text-muted-foreground">
  Panel-wide tools. These are never available to members.
</p>
{FEATURE_META.filter((f) => catalog.adminOnly.includes(f.key)).map((f) => {
  const hint =
    f.requires === 'publicDomain' && (!baseDomain || baseDomain === 'localhost')
      ? 'Needs a public domain'
      : f.requires === 'smtp' && !smtpConfigured
        ? 'Needs email configured'
        : '';
  const enabled = !!features[f.key];
  return (
    <div
      key={f.key}
      className={cn(
        'flex items-center justify-between gap-4 rounded-lg border border-border p-4',
        enabled ? 'bg-accent' : 'bg-muted',
      )}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {f.label}
          {hint && <Badge variant="outline" title={hint}>{hint}</Badge>}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{f.description}</div>
      </div>
      <Switch
        id={`feature-${f.key}`}
        checked={enabled}
        onCheckedChange={(v) => setFeatures((prev) => ({ ...prev, [f.key]: v }))}
      />
    </div>
  );
})}
```

Keep whatever wrapper element the current file uses around the list; only the grouping and the second switch are new.

- [ ] **Step 5: Typecheck.**

Run: `cd packages/dashboard && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add packages/dashboard/src/pages/admin/shared.ts packages/dashboard/src/pages/admin/FeaturesTab.tsx
git commit -m "feat(features): admin/member matrix on the Features page"
```

---

## Task 7: Deploy, verify end to end, document

**Files:**
- Modify: `CLAUDE.md` (Feature Flags section, ~line 282)

**Interfaces:**
- Consumes: everything from Tasks 1-6; no code changes beyond documentation.
- Produces: no exports. This task's deliverable is a verified deployment plus the updated CLAUDE.md reference.

- [ ] **Step 1: Build and deploy.**

```bash
docker compose build api dashboard && docker compose up -d api dashboard
```

- [ ] **Step 2a: Prove resolution is per-role.** Set `feature.cloning=true` and `feature.demo.cloning=false` directly in the settings table, then mint a short-lived JWT for a `member` user (sign `{userId, email, role, tv}` with `config.jwtSecret`, matching the user's `token_version`) and call `/api/settings` with `Cookie: wpl_token=<jwt>`. Compare against the same endpoint called with `x-api-key`.

Expected: the member sees `features.cloning === false` and `features.projects === false`; the admin sees `features.cloning === true`. If the install has no member account, create one first — this is the check the whole change exists for, so do not skip it.

- [ ] **Step 2b: Prove enforcement, not just resolution.** Step 2a shows the member is *told* they lack the capability; this confirms the API also *refuses* it. With the same member JWT and the same flag settings, launch one site as that member (or reassign an existing site's `user_id` to them in the `sites` table), then call a gated endpoint on it — e.g. `POST /api/sites/<id>/clone`.

Expected: **403** for the member, and the same call as admin (`x-api-key`) succeeds or fails for an unrelated reason (never 403-from-feature-gate). Without this step a bug where the UI hides a button but the endpoint still allows the action would pass unnoticed — which is exactly the class of problem this change is meant to close.

- [ ] **Step 3: Check the page in a browser.** Open **Settings → Features** as owner and confirm:
  - two groups render — "Site capabilities" and "Admin-only features";
  - the Members column appears only when public registration or the demo portal is on (toggle one in **Settings → General** and reload to see both states);
  - toggling a Members switch and saving persists after a reload.

- [ ] **Step 4: Update `CLAUDE.md`.** Replace the Feature Flags section body with:

```markdown
Stored in the `settings` table. Controlled via Admin > Features.

Two scopes. `feature.<key>` is the **admin/owner** set (the original rows —
unchanged). `feature.demo.<key>` is the **member** set, and absent means off, so
members start with nothing until granted.

**Admin-only (5)** — no member counterpart, never granted:
`projects`, `productivityMonitor`, `siteSync`, `webhooks`, `collaborativeSites`

**Grantable (12)** — one toggle per audience:
`cloning`, `snapshots`, `templates`, `customDomains`, `phpConfig`, `siteExtend`,
`sitePassword`, `exportZip`, `healthMonitoring`, `scheduledLaunch`, `adminer`,
`publicSharing`

Resolution lives in `services/features.service.ts`: `isFeatureEnabled(key, role)`
reads the admin namespace for owner/admin and the demo namespace for members,
with anonymous callers treated as members. The two toggles are independent. The
Members column in the UI appears only when `panel.publicRegistration` or
`panel.demoPortalEnabled` is on; enforcement is unconditional either way.
`GET /api/settings` returns the **effective** map for the caller, so member UI
cannot offer actions the API would refuse.
```

- [ ] **Step 5: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs: scoped feature flags"
```

---

## Notes for the implementer

- **The riskiest step is Task 3.** `sites.ts` has 11 call sites and every one must gain a role argument. Keep the `role` parameter **required** in `isFeatureEnabled` so the compiler finds any you miss — an optional parameter would let a missed call site compile and silently resolve as anonymous.
- **Anonymous callers resolve as members.** That is deliberate, but it means any endpoint gated on an admin-only feature *without* a session starts returning 403. The productivity heartbeat and status endpoints are the two known cases, handled in Task 3 Step 3. Before assuming there are no others, run `grep -rn "isFeatureEnabled" packages/api/src/routes/` and check each route's auth middleware.
- **Prefix ordering matters** when parsing settings rows: test `feature.demo.` before `feature.`, or demo rows are misread as admin features named `demo.*`.
- **No migration runs.** If a manual check shows a member unexpectedly retaining a capability, look for a stale `feature.demo.*` row rather than a migration bug.
- **The catalog test is load-bearing.** It asserts all 17 keys are classified exactly once, so a future feature cannot be added to `FEATURE_META` and silently default to member-accessible. If it fails after someone adds a flag, that is the test doing its job.
