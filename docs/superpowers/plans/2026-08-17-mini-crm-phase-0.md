# Mini CRM Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Projects & Invoices feature to Mini CRM, and let owner/admin see and manage every CRM record instead of only the ones they created.

**Architecture:** CRM services currently take a bare `userId` and hard-code `user_id = ?` into every query. They will instead take a `CrmActor` (`{ userId, role }`) and build their owner filter from the existing `scopeClause` helper, which already returns an empty clause for privileged roles. The rename is display-only: the stored feature key `feature.projects` and the `/api/projects/*` route prefix are unchanged.

**Tech Stack:** Node.js, Express, TypeScript, better-sqlite3, React, vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-mini-crm-design.md`

## Global Constraints

- **The feature flag keeps its stored key `feature.projects`.** Only its display label changes. Renaming the key would orphan the settings row on every existing install.
- **Route prefix stays `/api/projects/*`.** "Mini CRM" is a product name, not a route change.
- **Keep the non-privileged branch.** Members cannot reach the CRM today (`projects` is in `ADMIN_ONLY_FEATURES`, so `isFeatureEnabled('projects','member')` is false and every route answers 403). Do **not** simplify by deleting the `user_id = ?` filter — scoping must remain a privileged *override*, so granting `projects` more widely later does not silently expose every record.
- **No schema changes in this phase.** This is a query-and-labels change only.
- Existing behaviour for a single-admin install must be identical; only a second admin's rows become visible.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/api/src/utils/crmScope.ts` | **Create.** `CrmActor` type and `ownerFilter()`, the single place that decides whether a CRM query is filtered by owner. Pure, no DB. |
| `packages/api/src/utils/crmScope.test.ts` | **Create.** Tests for the above. |
| `packages/api/src/services/project.service.ts` | **Modify.** Every exported function takes `CrmActor` instead of `userId: string`, and builds its WHERE clause through `ownerFilter`. |
| `packages/api/src/routes/projects.ts` | **Modify.** Pass `{ userId: req.userId!, role: req.userRole }` instead of `req.userId!`. |
| `packages/api/src/services/crm-visibility.test.ts` | **Create.** Behavioural tests: an admin sees another admin's rows; a non-privileged actor does not. |
| `packages/dashboard/src/pages/admin/shared.ts:83` | **Modify.** Feature label → `Mini CRM`. |
| `packages/dashboard/src/components/shell/nav-items.ts` | **Modify.** Nav group label `Clients` → `Mini CRM`. |
| `packages/dashboard/src/components/shell/nav-items.test.ts` | **Modify.** Update the group-label expectation. |
| `CLAUDE.md`, `guides/getting-started.md` | **Modify.** Record the rename and the visibility change. |

`project.service.ts` is ~420 lines and stays one file: it is cohesive (clients, projects, invoices for one feature) and splitting it is not what this phase is for.

---

### Task 1: The owner filter

Pure logic first, so the rule that decides who sees what is provable without a database.

**Files:**
- Create: `packages/api/src/utils/crmScope.ts`
- Create: `packages/api/src/utils/crmScope.test.ts`

**Interfaces:**
- Consumes: `seesAllRows` from `./scope`.
- Produces:
  - `interface CrmActor { userId: string; role?: string }`
  - `ownerFilter(actor: CrmActor, column?: string): { sql: string; params: string[] }` — `column` defaults to `'user_id'`; callers pass e.g. `'c.user_id'` when the query is aliased. `sql` is `''` for privileged actors, otherwise `'<column> = ?'`.

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/utils/crmScope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ownerFilter, CrmActor } from './crmScope';

const owner: CrmActor = { userId: 'u-owner', role: 'owner' };
const admin: CrmActor = { userId: 'u-admin', role: 'admin' };
const member: CrmActor = { userId: 'u-member', role: 'member' };

describe('ownerFilter', () => {
  it('does not filter for owner or admin', () => {
    expect(ownerFilter(owner)).toEqual({ sql: '', params: [] });
    expect(ownerFilter(admin)).toEqual({ sql: '', params: [] });
  });

  it('filters to their own rows for anyone else', () => {
    expect(ownerFilter(member)).toEqual({ sql: 'user_id = ?', params: ['u-member'] });
  });

  it('honours an aliased column', () => {
    expect(ownerFilter(member, 'c.user_id')).toEqual({ sql: 'c.user_id = ?', params: ['u-member'] });
    expect(ownerFilter(admin, 'c.user_id')).toEqual({ sql: '', params: [] });
  });

  it('treats a missing role as unprivileged', () => {
    // A caller that forgot to pass the role must be confined, not exempted.
    expect(ownerFilter({ userId: 'u-x' })).toEqual({ sql: 'user_id = ?', params: ['u-x'] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/api && npx vitest run src/utils/crmScope.test.ts`
Expected: FAIL — `Cannot find module './crmScope'`.

- [ ] **Step 3: Write the implementation**

Create `packages/api/src/utils/crmScope.ts`:

```ts
import { seesAllRows } from './scope';

/** Who is asking. `role` is absent for callers that never resolved one. */
export interface CrmActor {
  userId: string;
  role?: string;
}

/**
 * The owner clause for a CRM query.
 *
 * Owner and admin see every record; anyone else sees only their own. The
 * unprivileged branch is deliberately retained even though `projects` is an
 * admin-only feature and no member can currently reach these queries: deleting
 * it would bake that assumption into every statement, so granting the feature
 * more widely later would expose every record with no code change to notice.
 *
 * An actor with no role is treated as unprivileged, so a caller that forgets to
 * pass one is confined rather than exempted.
 */
export function ownerFilter(
  actor: CrmActor,
  column = 'user_id',
): { sql: string; params: string[] } {
  if (seesAllRows(actor.role)) return { sql: '', params: [] };
  return { sql: `${column} = ?`, params: [actor.userId] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/api && npx vitest run src/utils/crmScope.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd packages/api && npx tsc --noEmit
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
git add packages/api/src/utils/crmScope.ts packages/api/src/utils/crmScope.test.ts
git commit -m "feat(crm): owner filter for CRM queries

One place decides whether a CRM query is scoped to its creator. Privileged
roles see everything; everyone else, including an actor whose role failed to
resolve, stays confined to their own rows."
```

---

### Task 2: Clients read through the actor

**Files:**
- Modify: `packages/api/src/services/project.service.ts` (the `// ── Clients ──` section)
- Modify: `packages/api/src/routes/projects.ts` (client routes)
- Create: `packages/api/src/services/crm-visibility.test.ts`

**Interfaces:**
- Consumes: `CrmActor`, `ownerFilter` from `../utils/crmScope`.
- Produces, replacing the `userId: string` first parameter on each:
  - `createClient(actor: CrmActor, data): ClientRecord` — always writes `actor.userId` as owner
  - `updateClient(id: string, actor: CrmActor, data): ClientRecord`
  - `deleteClient(id: string, actor: CrmActor): void`
  - `getClient(id: string, actor: CrmActor): ClientRecord | undefined`
  - `listClients(actor: CrmActor, opts): (ClientRecord & { projectCount: number })[]`
  - `getClientsCount(actor: CrmActor, search?: string): number`
  - `listAllClients(actor: CrmActor): { id: string; name: string; company: string | null }[]`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/services/crm-visibility.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { createClient, getClient, listClients, getClientsCount } from './project.service';

let db: Database.Database;

const alice = { userId: 'u-alice', role: 'admin' };
const bob = { userId: 'u-bob', role: 'admin' };
const member = { userId: 'u-member', role: 'member' };

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  for (const id of ['u-alice', 'u-bob', 'u-member']) {
    db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(id, `${id}@example.com`);
  }
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('CRM visibility', () => {
  it('lets one admin see a client created by another', () => {
    // The actual complaint: two admins in one install could not see each
    // other's records, so nobody could cover for anybody.
    const created = createClient(alice, { name: 'Acme' });
    expect(getClient(created.id, bob)).toBeDefined();
    expect(listClients(bob, {}).map((c) => c.name)).toContain('Acme');
    expect(getClientsCount(bob)).toBe(1);
  });

  it('records the creator as the owner regardless of who can see it', () => {
    const created = createClient(alice, { name: 'Acme' });
    const row = db.prepare('SELECT user_id FROM clients WHERE id = ?').get(created.id) as { user_id: string };
    expect(row.user_id).toBe('u-alice');
  });

  it('confines an unprivileged actor to their own rows', () => {
    // No member can reach these services today. The branch is tested anyway,
    // because it is the thing standing between a future permission grant and
    // every record being exposed.
    createClient(alice, { name: 'Acme' });
    const own = createClient(member, { name: 'Own Co' });
    expect(listClients(member, {}).map((c) => c.name)).toEqual(['Own Co']);
    expect(getClientsCount(member)).toBe(1);
    expect(getClient(own.id, member)).toBeDefined();
  });

  it('hides another user’s client from an unprivileged actor', () => {
    const created = createClient(alice, { name: 'Acme' });
    expect(getClient(created.id, member)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/api && npx vitest run src/services/crm-visibility.test.ts`
Expected: FAIL — the services still take a string, so `createClient(alice, …)` writes `[object Object]` as `user_id` and the visibility assertions fail.

- [ ] **Step 3: Convert the client functions**

In `packages/api/src/services/project.service.ts`, add the import at the top:

```ts
import { CrmActor, ownerFilter } from '../utils/crmScope';
```

Replace each client function's signature and query. `createClient` keeps writing the caller's own id:

```ts
export function createClient(actor: CrmActor, data: { name: string; email?: string; phone?: string; company?: string; notes?: string }): ClientRecord {
```

Inside it, wherever `userId` was written into the INSERT, use `actor.userId`.

For the readers, build the clause from `ownerFilter`:

```ts
export function getClient(id: string, actor: CrmActor): ClientRecord | undefined {
  const own = ownerFilter(actor);
  const sql = `SELECT * FROM clients WHERE id = ?${own.sql ? ` AND ${own.sql}` : ''}`;
  return getDb().prepare(sql).get(id, ...own.params) as ClientRecord | undefined;
}

export function listClients(actor: CrmActor, opts: { search?: string; limit?: number; offset?: number } = {}): (ClientRecord & { projectCount: number })[] {
  const db = getDb();
  const limit = opts.limit || 20;
  const offset = opts.offset || 0;
  const own = ownerFilter(actor, 'c.user_id');
  let sql = `SELECT c.*, (SELECT COUNT(*) FROM projects WHERE client_id = c.id) as projectCount FROM clients c WHERE 1 = 1`;
  const params: any[] = [];
  if (own.sql) { sql += ` AND ${own.sql}`; params.push(...own.params); }
  if (opts.search) {
    sql += ` AND (c.name LIKE ? OR c.email LIKE ? OR c.company LIKE ?)`;
    const s = `%${opts.search}%`;
    params.push(s, s, s);
  }
  sql += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params) as (ClientRecord & { projectCount: number })[];
}

export function getClientsCount(actor: CrmActor, search?: string): number {
  const db = getDb();
  const own = ownerFilter(actor);
  let sql = `SELECT COUNT(*) as count FROM clients WHERE 1 = 1`;
  const params: any[] = [];
  if (own.sql) { sql += ` AND ${own.sql}`; params.push(...own.params); }
  if (search) {
    sql += ` AND (name LIKE ? OR email LIKE ? OR company LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  return (db.prepare(sql).get(...params) as { count: number }).count;
}
```

`WHERE 1 = 1` is deliberate: it makes every following clause an unconditional `AND`, so the privileged case (no owner clause) and the unprivileged case build the same way.

Apply the same treatment to `updateClient`, `deleteClient` and `listAllClients`. In `deleteClient`, the two guard counts (`projects`, `invoices` for this client) must **drop their `user_id` filter entirely** — the check is "does this client still have linked records", which is true regardless of who created them. Leaving the owner filter there would let an admin delete a client that another admin still has invoices against:

```ts
export function deleteClient(id: string, actor: CrmActor): void {
  const db = getDb();
  const own = ownerFilter(actor);
  const existing = db.prepare(
    `SELECT * FROM clients WHERE id = ?${own.sql ? ` AND ${own.sql}` : ''}`,
  ).get(id, ...own.params) as ClientRecord | undefined;
  if (!existing) throw new NotFoundError('Client not found');
  const projectCount = (db.prepare('SELECT COUNT(*) as count FROM projects WHERE client_id = ?').get(id) as { count: number }).count;
  if (projectCount > 0) throw new ConflictError('Cannot delete client with linked projects. Delete or unlink the projects first.');
  const invoiceCount = (db.prepare('SELECT COUNT(*) as count FROM invoices WHERE client_id = ?').get(id) as { count: number }).count;
  if (invoiceCount > 0) throw new ConflictError('Cannot delete client with invoices. Delete the invoices first.');
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
}
```

- [ ] **Step 4: Update the client routes**

In `packages/api/src/routes/projects.ts`, add near the other imports:

```ts
import { CrmActor } from '../utils/crmScope';

const actorOf = (req: AuthRequest): CrmActor => ({ userId: req.userId!, role: req.userRole });
```

Then replace `req.userId!` with `actorOf(req)` in every client route — `/dropdown/clients`, `GET /clients`, `POST /clients`, `GET|PUT|DELETE /clients/:id`. For example:

```ts
router.get('/clients', (req: AuthRequest, res: Response) => {
  const data = listClients(actorOf(req), { search, limit, offset });
  const total = getClientsCount(actorOf(req), search);
  ...
});
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd packages/api && npx vitest run src/services/crm-visibility.test.ts && npx tsc --noEmit`
Expected: 4 tests PASS. TypeScript will still error on the *project* and *invoice* functions if any route already passes an actor — that is Task 3 and 4; at this point only the client routes are converted, so it should be clean.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/project.service.ts packages/api/src/routes/projects.ts packages/api/src/services/crm-visibility.test.ts
git commit -m "feat(crm): admins see every client, not only their own

Clients now resolve through CrmActor and the shared owner filter. Two admins in
one install could previously not see each other's records, so neither could
cover for the other.

deleteClient's linked-record guards drop the owner filter: whether a client
still has projects or invoices is true regardless of who created them, and
filtering there would let one admin delete a client another still bills."
```

---

### Task 3: Projects read through the actor

**Files:**
- Modify: `packages/api/src/services/project.service.ts` (the `// ── Projects ──` section)
- Modify: `packages/api/src/routes/projects.ts` (project routes)
- Modify: `packages/api/src/services/crm-visibility.test.ts`

**Interfaces:**
- Consumes: `CrmActor`, `ownerFilter`, and `actorOf` from Task 2.
- Produces:
  - `createProject(actor: CrmActor, data): ProjectRecord`
  - `updateProject(id: string, actor: CrmActor, data): ProjectRecord`
  - `deleteProject(id: string, actor: CrmActor): void`
  - `getProject(id: string, actor: CrmActor): (ProjectRecord & { clientName: string | null; siteCount: number }) | undefined`
  - `listProjects(actor: CrmActor, opts): any[]`
  - `getProjectsCount(actor: CrmActor, opts): number`
  - `linkSiteToProject(projectId: string, siteId: string, actor: CrmActor): void`
  - `unlinkSiteFromProject(projectId: string, siteId: string, actor: CrmActor): void`
  - `getProjectSites(projectId: string, actor: CrmActor): any[]`
  - `listAllProjects(actor: CrmActor): { id: string; name: string; client_id: string | null }[]`

- [ ] **Step 1: Write the failing test**

Extend the existing `./project.service` import at the top of `packages/api/src/services/crm-visibility.test.ts` with `createProject, getProject, listProjects, getProjectsCount`, then append:

```ts

describe('project visibility', () => {
  it('lets one admin see a project created by another', () => {
    const p = createProject(alice, { name: 'Redesign' });
    expect(getProject(p.id, bob)).toBeDefined();
    expect(listProjects(bob, {}).map((x: any) => x.name)).toContain('Redesign');
    expect(getProjectsCount(bob, {})).toBe(1);
  });

  it('confines an unprivileged actor to their own projects', () => {
    createProject(alice, { name: 'Redesign' });
    createProject(member, { name: 'Mine' });
    expect(listProjects(member, {}).map((x: any) => x.name)).toEqual(['Mine']);
    expect(getProjectsCount(member, {})).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/api && npx vitest run src/services/crm-visibility.test.ts -t "project visibility"`
Expected: FAIL — `getProject` still filters on a stringified actor.

- [ ] **Step 3: Convert the project functions**

The recipe, stated in full so this task stands alone:

1. First parameter becomes `actor: CrmActor` (after `id` where there is one).
2. `const own = ownerFilter(actor)` — or `ownerFilter(actor, 'p.user_id')` when the query aliases the table.
3. Filtered queries start at `WHERE 1 = 1`, so every later clause is an unconditional `AND` and the privileged and unprivileged cases build identically.
4. Append `AND ${own.sql}` and spread `own.params` only when `own.sql` is non-empty.
5. `createProject` still writes `actor.userId` as the owner.

The two readers in full:

```ts
export function getProject(id: string, actor: CrmActor): (ProjectRecord & { clientName: string | null; siteCount: number }) | undefined {
  const own = ownerFilter(actor, 'p.user_id');
  const sql = `
    SELECT p.*, c.name as clientName,
           (SELECT COUNT(*) FROM project_sites WHERE project_id = p.id) as siteCount
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.id = ?${own.sql ? ` AND ${own.sql}` : ''}
  `;
  return getDb().prepare(sql).get(id, ...own.params) as (ProjectRecord & { clientName: string | null; siteCount: number }) | undefined;
}

export function listProjects(actor: CrmActor, opts: { status?: string; clientId?: string; search?: string; limit?: number; offset?: number } = {}): any[] {
  const db = getDb();
  const limit = opts.limit || 20;
  const offset = opts.offset || 0;
  const own = ownerFilter(actor, 'p.user_id');
  let sql = `
    SELECT p.*, c.name as clientName,
           (SELECT COUNT(*) FROM project_sites WHERE project_id = p.id) as siteCount
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE 1 = 1
  `;
  const params: any[] = [];
  if (own.sql) { sql += ` AND ${own.sql}`; params.push(...own.params); }
  if (opts.status) { sql += ` AND p.status = ?`; params.push(opts.status); }
  if (opts.clientId) { sql += ` AND p.client_id = ?`; params.push(opts.clientId); }
  if (opts.search) { sql += ` AND p.name LIKE ?`; params.push(`%${opts.search}%`); }
  sql += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}
```

Keep each existing query's own SELECT list and joins — the version above mirrors what is there today; only the owner clause changes. `getProjectsCount` takes the same filters minus limit/offset, `updateProject` and `deleteProject` guard their lookup with `own`, and `listAllProjects` filters the same way.

For `linkSiteToProject`, `unlinkSiteFromProject` and `getProjectSites`, the owner filter applies to the **project** lookup that authorises the call, not to the `project_sites` rows themselves:

```ts
export function getProjectSites(projectId: string, actor: CrmActor): any[] {
  const db = getDb();
  const own = ownerFilter(actor);
  const project = db.prepare(
    `SELECT id FROM projects WHERE id = ?${own.sql ? ` AND ${own.sql}` : ''}`,
  ).get(projectId, ...own.params);
  if (!project) throw new NotFoundError('Project not found');
  return db.prepare(`
    SELECT s.* FROM sites s
    JOIN project_sites ps ON ps.site_id = s.id
    WHERE ps.project_id = ?
  `).all(projectId);
}
```

- [ ] **Step 4: Update the project routes**

In `packages/api/src/routes/projects.ts`, replace `req.userId!` with `actorOf(req)` in every project route: `/dropdown/projects`, `GET|POST /list`, `GET|PUT|DELETE /list/:id`, `POST /list/:id/sites`, `DELETE /list/:id/sites/:siteId`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd packages/api && npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no TypeScript output.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/project.service.ts packages/api/src/routes/projects.ts packages/api/src/services/crm-visibility.test.ts
git commit -m "feat(crm): admins see every project, not only their own

Site link and unlink authorise on the project lookup rather than filtering
project_sites, so the owner rule lives in exactly one place per call."
```

---

### Task 4: Invoices read through the actor

**Files:**
- Modify: `packages/api/src/services/project.service.ts` (the invoices section)
- Modify: `packages/api/src/routes/projects.ts` (invoice routes)
- Modify: `packages/api/src/services/crm-visibility.test.ts`

**Interfaces:**
- Consumes: `CrmActor`, `ownerFilter`, `actorOf`.
- Produces:
  - `createInvoice(actor: CrmActor, data): InvoiceRecord`
  - `updateInvoice(id: string, actor: CrmActor, data): InvoiceRecord`
  - `deleteInvoice(id: string, actor: CrmActor): void`
  - `getInvoice(id: string, actor: CrmActor): (InvoiceRecord & { clientName: string | null; projectName: string | null }) | undefined`
  - `listInvoices(actor: CrmActor, opts): any[]`
  - `getInvoicesCount(actor: CrmActor, opts): number`
  - `updateInvoiceStatus(id: string, actor: CrmActor, newStatus: string): InvoiceRecord`

- [ ] **Step 1: Write the failing test**

Extend the existing `./project.service` import at the top of `packages/api/src/services/crm-visibility.test.ts` with `createInvoice, getInvoice, listInvoices, updateInvoiceStatus`, then append:

```ts

describe('invoice visibility', () => {
  function seedInvoice(actor: { userId: string; role: string }) {
    const client = createClient(actor, { name: 'Acme' });
    return createInvoice(actor, {
      client_id: client.id,
      items: [{ description: 'Work', quantity: 1, rate: 100 }],
      tax_rate: 0,
      currency: 'USD',
    } as any);
  }

  it('lets one admin see and act on another admin’s invoice', () => {
    const inv = seedInvoice(alice);
    expect(getInvoice(inv.id, bob)).toBeDefined();
    expect(listInvoices(bob, {}).map((i: any) => i.id)).toContain(inv.id);
    // Acting on it matters as much as seeing it: covering for a colleague means
    // being able to mark their invoice sent.
    expect(updateInvoiceStatus(inv.id, bob, 'sent').status).toBe('sent');
  });

  it('hides an invoice from an unprivileged actor', () => {
    const inv = seedInvoice(alice);
    expect(getInvoice(inv.id, member)).toBeUndefined();
    expect(listInvoices(member, {})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/api && npx vitest run src/services/crm-visibility.test.ts -t "invoice visibility"`
Expected: FAIL — invoices still filter on the stringified actor.

- [ ] **Step 3: Convert the invoice functions**

The recipe again in full, so this task stands alone:

1. First parameter becomes `actor: CrmActor` (after `id` where there is one).
2. `const own = ownerFilter(actor)`, or `ownerFilter(actor, 'i.user_id')` where the query aliases the invoices table.
3. Filtered queries start at `WHERE 1 = 1`; append `AND ${own.sql}` and spread `own.params` only when `own.sql` is non-empty.
4. `createInvoice` still writes `actor.userId` as the owner.

```ts
export function listInvoices(actor: CrmActor, opts: { status?: string; clientId?: string; limit?: number; offset?: number } = {}): any[] {
  const db = getDb();
  const limit = opts.limit || 20;
  const offset = opts.offset || 0;
  const own = ownerFilter(actor, 'i.user_id');
  let sql = `
    SELECT i.*, c.name as clientName, p.name as projectName
    FROM invoices i
    LEFT JOIN clients c ON c.id = i.client_id
    LEFT JOIN projects p ON p.id = i.project_id
    WHERE 1 = 1
  `;
  const params: any[] = [];
  if (own.sql) { sql += ` AND ${own.sql}`; params.push(...own.params); }
  if (opts.status) { sql += ` AND i.status = ?`; params.push(opts.status); }
  if (opts.clientId) { sql += ` AND i.client_id = ?`; params.push(opts.clientId); }
  sql += ` ORDER BY i.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}
```

`updateInvoiceStatus` loads the invoice through the owner filter **before** applying its transition rules, so an unprivileged actor gets `NotFoundError` rather than a transition error that would confirm the invoice exists:

```ts
export function updateInvoiceStatus(id: string, actor: CrmActor, newStatus: string): InvoiceRecord {
  const db = getDb();
  const own = ownerFilter(actor);
  const invoice = db.prepare(
    `SELECT * FROM invoices WHERE id = ?${own.sql ? ` AND ${own.sql}` : ''}`,
  ).get(id, ...own.params) as InvoiceRecord | undefined;
  if (!invoice) throw new NotFoundError('Invoice not found');
  // Leave the existing transition validation and UPDATE below exactly as they
  // are — only the lookup above changes.
  ...
}
```

Keep each query's existing SELECT list and joins; only the owner clause changes.

- [ ] **Step 4: Update the invoice routes**

Replace `req.userId!` with `actorOf(req)` in `GET|POST /invoices`, `GET|PUT|DELETE /invoices/:id`, and `PATCH /invoices/:id/status`.

- [ ] **Step 5: Verify no bare userId remains**

```bash
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
grep -n "req.userId!" packages/api/src/routes/projects.ts
```

Expected: no output. Every CRM route now passes an actor. If any line remains, it is a route that would still scope to its caller and must be converted.

- [ ] **Step 6: Run everything**

Run: `cd packages/api && npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no TypeScript output.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/services/project.service.ts packages/api/src/routes/projects.ts packages/api/src/services/crm-visibility.test.ts
git commit -m "feat(crm): admins see and act on every invoice

updateInvoiceStatus loads through the owner filter before checking the
transition, so an unprivileged caller gets a not-found rather than an error
that confirms the invoice exists."
```

---

### Task 5: Rename to Mini CRM

**Files:**
- Modify: `packages/dashboard/src/pages/admin/shared.ts:83`
- Modify: `packages/dashboard/src/components/shell/nav-items.ts`
- Modify: `packages/dashboard/src/components/shell/nav-items.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed later. Display strings only.

- [ ] **Step 1: Write the failing test**

In `packages/dashboard/src/components/shell/nav-items.test.ts`, add inside `describe('buildNavGroups', …)`:

```ts
  it('labels the CRM group Mini CRM', () => {
    const groups = buildNavGroups(allFeatures, 'admin');
    expect(groups.map((g) => g.label)).toContain('Mini CRM');
    expect(groups.map((g) => g.label)).not.toContain('Clients');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/dashboard && npx vitest run src/components/shell/nav-items.test.ts -t "Mini CRM"`
Expected: FAIL — the group is still labelled `Clients`.

- [ ] **Step 3: Rename the nav group**

In `packages/dashboard/src/components/shell/nav-items.ts`, change the group label from `'Clients'` to `'Mini CRM'`. Leave the three items (`Clients`, `Projects`, `Invoices`) and their routes unchanged — they are the sections within it.

- [ ] **Step 4: Rename the feature label**

In `packages/dashboard/src/pages/admin/shared.ts`, line 83:

```ts
  { key: 'projects', label: 'Mini CRM', description: 'Clients, projects, invoices and the client portal' },
```

The `key` stays `projects`. Changing it would orphan the `feature.projects` settings row on every existing install.

- [ ] **Step 5: Check for other user-visible occurrences**

```bash
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
grep -rn "Projects & Invoices" packages/dashboard/src packages/api/src guides/ CLAUDE.md
```

Expected: no output once the label is changed. Any remaining hit is user-visible copy that must be updated too.

- [ ] **Step 6: Run the dashboard tests**

Run: `cd packages/dashboard && npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no TypeScript output.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/components/shell/nav-items.ts packages/dashboard/src/components/shell/nav-items.test.ts packages/dashboard/src/pages/admin/shared.ts
git commit -m "feat(crm): rename Projects & Invoices to Mini CRM

Display only. The stored flag key stays feature.projects, because renaming it
would orphan the settings row on every existing install."
```

---

### Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `guides/getting-started.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Update CLAUDE.md**

In the Feature Flags section, change the `projects` entry so it reads:

```
`projects` — **Mini CRM** (clients, projects, invoices). The stored key stays
`projects`; only the label is "Mini CRM". Admin-only: `isFeatureEnabled('projects','member')`
is false by construction, so every CRM route answers 403 for members.
```

In the Projects API section, add after the endpoint list:

```
CRM rows are visible to **all** owner/admin users, not only their creator —
`ownerFilter` in `utils/crmScope.ts` returns an empty clause for privileged
roles. The unprivileged branch is retained deliberately: no member can reach
these routes today, and it is what prevents a future permission grant from
exposing every record silently.
```

- [ ] **Step 2: Add the upgrade note**

In `guides/getting-started.md`, add a short section near the Projects/CRM material:

```markdown
### Mini CRM visibility

Owner and admin users see and manage **every** client, project and invoice,
including those created by another admin. Before this release each staff user
saw only their own records, so an install with two admins will now show more
than it did. Members are unaffected — Mini CRM has always been admin-only.
```

- [ ] **Step 3: Verify no stale references**

```bash
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
grep -rn "Projects & Invoices" CLAUDE.md guides/
```

Expected: no output.

- [ ] **Step 4: Run the whole suite**

```bash
cd packages/api && npx vitest run && npx tsc --noEmit
cd ../dashboard && npx vitest run && npx tsc --noEmit
```

Expected: all PASS, no TypeScript output.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md guides/getting-started.md
git commit -m "docs: Mini CRM rename and the widened CRM visibility

Records that owner/admin now see every CRM record, that the stored flag key is
unchanged, and why the unprivileged scoping branch is kept."
```

---

## Done when

- `cd packages/api && npx vitest run` and `cd packages/dashboard && npx vitest run` both pass.
- `grep -n "req.userId!" packages/api/src/routes/projects.ts` returns nothing.
- `grep -rn "Projects & Invoices"` across the repo returns nothing.

## Verify on a running panel

Unit tests cover the query rules but not the wiring, so check on the local install after `docker compose up -d --build api dashboard`:

1. The sidebar group reads **Mini CRM**, and Settings → Features lists **Mini CRM**.
2. Toggling that feature off still hides the group — proving the flag key was not changed, since the stored row is still `feature.projects`.
3. With two admin accounts, a client created by one appears for the other, and the second can open, edit and mark its invoices.
4. Existing clients, projects and invoices are all still listed — a mistake in the `WHERE 1 = 1` rewrite would silently return everything or nothing, and both look plausible until counted.

Item 4 is the one that fails quietly: an owner filter dropped by accident looks identical to the intended behaviour on a single-admin install.
