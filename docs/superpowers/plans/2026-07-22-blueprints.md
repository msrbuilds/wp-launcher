# Blueprints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse "products" and "templates" into one concept, **blueprints**, so there is one directory, one service, one router, one editor page, and one vocabulary in the schema.

**Architecture:** A migration merges `products/` and `templates/` into `blueprints/` on disk, renames the `products` table, and renames `product_id` columns to `blueprint_id`. `blueprint.service.ts` replaces `product.service.ts` with a single cache and lookup order. One `/api/blueprints` router replaces two near-duplicate route files, with the old paths kept as deprecated aliases. The dashboard keeps the richer of the two editor pages and deletes the other.

**Tech Stack:** Node.js, TypeScript, Express, better-sqlite3, Vitest, React.

**Spec:** `docs/superpowers/specs/2026-07-21-unified-hosting-panel-design.md`

**Scope:** Plan 3 of 4. Follows `2026-07-21-policy-foundation.md` and `2026-07-22-auth-and-setup-wizard.md`. Plan 4 then merges the dashboard route trees and deletes `APP_MODE`.

---

## What the code actually looks like

Findings that shape this plan:

1. **Resolution is already unified.** `getProductConfig` (`product.service.ts:73-125`) tries, in order: memory cache → `products/{id}.json` → the `products` DB table → `templates/{id}.json` → `products/_default.json` → a minimal stub. Templates are already resolvable as products; only *listing* and *writing* differ.
2. **The two routers are near-duplicates.** `routes/products.ts` (215 lines) and `routes/templates.ts` (186 lines) differ only in which directory they write to and that products also persist to the DB table.
3. **`CreateProductPage` is a strict superset of `CreateTemplatePage`.** The template editor has no field the product editor lacks; the product editor adds category, tags, locale, expiration, concurrency, admin user/email, landing page, restrictions, and banner text. So the editor merge is a rename plus a delete, not a rewrite.
4. **`_default.json` is special** — excluded from listings by the `!f.startsWith('_')` filter, but used as the fallback config. It must keep both properties after the merge.
5. **No id collisions exist on this install.** Products are `_default, demo-mariadb, demo-mysql, demo-persistent, demo-sqlite, test`; templates are `ecommerce, starter`. Collision handling still has to exist, but it will not fire here.
6. **`product_id` appears in four tables** — `sites`, `site_logs`, `scheduled_launches`, `bulk_jobs` — and across ~18 API source files.

---

## File Structure

**Create:**
- `packages/api/src/utils/migrations/blueprints-v3.ts` — directory merge, table rename, column renames
- `packages/api/src/utils/migrations/blueprints-v3.test.ts`
- `packages/api/src/services/blueprint.service.ts` — replaces `product.service.ts`
- `packages/api/src/services/blueprint.service.test.ts`
- `packages/api/src/routes/blueprints.ts` — replaces `products.ts` + `templates.ts`
- `packages/dashboard/src/pages/BlueprintEditorPage.tsx` — renamed from `CreateProductPage.tsx`
- `packages/dashboard/src/pages/admin/BlueprintsTab.tsx` — renamed from `ProductsTab.tsx`

**Delete:**
- `packages/api/src/services/product.service.ts`
- `packages/api/src/routes/products.ts`, `packages/api/src/routes/templates.ts`
- `packages/dashboard/src/pages/CreateProductPage.tsx`, `packages/dashboard/src/pages/CreateTemplatePage.tsx`
- `packages/dashboard/src/pages/admin/ProductsTab.tsx`

**Modify:**
- `packages/api/src/config.ts` — `blueprintConfigsDir` replaces the two dir settings
- `packages/api/src/utils/db.ts` — run the migration
- `packages/api/src/index.ts` — mount `/api/blueprints`, alias the old paths
- `packages/api/src/services/template-export.service.ts` → renamed `blueprint-export.service.ts`
- `packages/api/src/services/{site,bulk,schedule,analytics,share,snapshot}.service.ts` — import and column renames
- `packages/api/src/routes/{sites,admin,analytics,bulk}.ts` — same
- `packages/dashboard/src/pages/{LaunchPage,LocalLaunchPage}.tsx`, `admin/BulkTab.tsx` — one endpoint, no mode branch
- `packages/dashboard/src/main.tsx` — route renames
- `docker-compose.yml` — `BLUEPRINT_CONFIGS_DIR`, blueprints volume

---

## Task 1: Blueprint migration — files and table

**Files:**
- Create: `packages/api/src/utils/migrations/blueprints-v3.ts`
- Test: `packages/api/src/utils/migrations/blueprints-v3.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/utils/migrations/blueprints-v3.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../test-helpers/db';
import { mergeBlueprintDirectories, renameProductsTable } from './blueprints-v3';

let root: string;

function write(dir: string, id: string, body: Record<string, unknown>) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, ...body }));
}

function read(dir: string, id: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-bp-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('mergeBlueprintDirectories', () => {
  it('copies products and templates into one directory', () => {
    const products = path.join(root, 'products');
    const templates = path.join(root, 'templates');
    const blueprints = path.join(root, 'blueprints');
    write(products, 'demo-sqlite', { name: 'Demo' });
    write(templates, 'starter', { name: 'Starter' });

    mergeBlueprintDirectories({ products, templates, blueprints });

    expect(read(blueprints, 'demo-sqlite').name).toBe('Demo');
    expect(read(blueprints, 'starter').name).toBe('Starter');
  });

  it('copies rather than moves, so a failed upgrade leaves the originals', () => {
    const products = path.join(root, 'products');
    const blueprints = path.join(root, 'blueprints');
    write(products, 'demo-sqlite', { name: 'Demo' });

    mergeBlueprintDirectories({ products, templates: path.join(root, 'templates'), blueprints });

    expect(fs.existsSync(path.join(products, 'demo-sqlite.json'))).toBe(true);
  });

  it('carries _default across, since it is the fallback config', () => {
    const products = path.join(root, 'products');
    const blueprints = path.join(root, 'blueprints');
    write(products, '_default', { name: 'Default' });

    mergeBlueprintDirectories({ products, templates: path.join(root, 'templates'), blueprints });

    expect(fs.existsSync(path.join(blueprints, '_default.json'))).toBe(true);
  });

  it('on an id collision keeps the template and suffixes the product', () => {
    const products = path.join(root, 'products');
    const templates = path.join(root, 'templates');
    const blueprints = path.join(root, 'blueprints');
    write(products, 'starter', { name: 'Product Starter' });
    write(templates, 'starter', { name: 'Template Starter' });

    const result = mergeBlueprintDirectories({ products, templates, blueprints });

    expect(read(blueprints, 'starter').name).toBe('Template Starter');
    expect(read(blueprints, 'starter-product').name).toBe('Product Starter');
    expect(read(blueprints, 'starter-product').id).toBe('starter-product');
    expect(result.renamed).toEqual([{ from: 'starter', to: 'starter-product' }]);
  });

  it('is idempotent — a second run changes nothing', () => {
    const products = path.join(root, 'products');
    const blueprints = path.join(root, 'blueprints');
    write(products, 'demo-sqlite', { name: 'Demo' });

    mergeBlueprintDirectories({ products, templates: path.join(root, 'templates'), blueprints });
    fs.writeFileSync(path.join(blueprints, 'demo-sqlite.json'), JSON.stringify({ id: 'demo-sqlite', name: 'Edited' }));
    const second = mergeBlueprintDirectories({ products, templates: path.join(root, 'templates'), blueprints });

    expect(read(blueprints, 'demo-sqlite').name).toBe('Edited');
    expect(second.copied).toEqual([]);
  });

  it('tolerates missing source directories', () => {
    const blueprints = path.join(root, 'blueprints');
    expect(() =>
      mergeBlueprintDirectories({
        products: path.join(root, 'nope'),
        templates: path.join(root, 'also-nope'),
        blueprints,
      }),
    ).not.toThrow();
    expect(fs.existsSync(blueprints)).toBe(true);
  });
});

describe('renameProductsTable', () => {
  function seedProductsTable(db: Database.Database) {
    db.prepare(
      `CREATE TABLE products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config TEXT NOT NULL
      )`,
    ).run();
    db.prepare("INSERT INTO products (id, name, config) VALUES ('p1', 'One', '{}')").run();
  }

  function tableNames(db: Database.Database): string[] {
    return (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name);
  }

  it('renames products to blueprints, preserving rows', () => {
    const db = createTestDb();
    seedProductsTable(db);

    renameProductsTable(db);

    expect(tableNames(db)).toContain('blueprints');
    expect(tableNames(db)).not.toContain('products');
    const row = db.prepare("SELECT name FROM blueprints WHERE id = 'p1'").get() as { name: string };
    expect(row.name).toBe('One');
    db.close();
  });

  it('creates blueprints when no products table exists', () => {
    const db = createTestDb();
    renameProductsTable(db);
    expect(tableNames(db)).toContain('blueprints');
    db.close();
  });

  it('is idempotent', () => {
    const db = createTestDb();
    seedProductsTable(db);
    renameProductsTable(db);
    renameProductsTable(db);
    const row = db.prepare('SELECT COUNT(*) AS c FROM blueprints').get() as { c: number };
    expect(row.c).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/api`
Expected: FAIL — `Failed to resolve import "./blueprints-v3"`.

- [ ] **Step 3: Implement**

Create `packages/api/src/utils/migrations/blueprints-v3.ts`:

```ts
import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

export interface MergeDirs {
  products: string;
  templates: string;
  blueprints: string;
}

export interface MergeResult {
  copied: string[];
  renamed: { from: string; to: string }[];
}

function jsonFilesIn(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
}

/**
 * Copy products/ and templates/ into blueprints/. Templates win an id
 * collision because they are the newer concept; the colliding product is
 * suffixed and its `id` field rewritten to match its new filename.
 *
 * Files are copied, not moved, so a failed upgrade leaves the originals intact.
 * Existing blueprints are never overwritten, which is what makes this idempotent.
 */
export function mergeBlueprintDirectories(dirs: MergeDirs): MergeResult {
  fs.mkdirSync(dirs.blueprints, { recursive: true });
  const result: MergeResult = { copied: [], renamed: [] };

  // Templates first so they own their ids.
  for (const file of jsonFilesIn(dirs.templates)) {
    const target = path.join(dirs.blueprints, file);
    if (fs.existsSync(target)) continue;
    fs.copyFileSync(path.join(dirs.templates, file), target);
    result.copied.push(file);
  }

  for (const file of jsonFilesIn(dirs.products)) {
    const id = path.basename(file, '.json');
    const templateClaimedIt = fs.existsSync(path.join(dirs.templates, file));
    const target = path.join(dirs.blueprints, file);

    if (!templateClaimedIt) {
      if (fs.existsSync(target)) continue;
      fs.copyFileSync(path.join(dirs.products, file), target);
      result.copied.push(file);
      continue;
    }

    const newId = `${id}-product`;
    const renamedTarget = path.join(dirs.blueprints, `${newId}.json`);
    if (fs.existsSync(renamedTarget)) continue;

    const parsed = JSON.parse(fs.readFileSync(path.join(dirs.products, file), 'utf8'));
    parsed.id = newId;
    fs.writeFileSync(renamedTarget, JSON.stringify(parsed, null, 2));
    result.copied.push(`${newId}.json`);
    result.renamed.push({ from: id, to: newId });
    console.warn(`[blueprints] id collision on "${id}" — the product was saved as "${newId}"`);
  }

  return result;
}

const BLUEPRINTS_TABLE = `
  CREATE TABLE IF NOT EXISTS blueprints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

function hasTable(db: Database.Database, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
  return !!row;
}

export function renameProductsTable(db: Database.Database): void {
  if (hasTable(db, 'blueprints')) return;
  if (hasTable(db, 'products')) {
    db.prepare('ALTER TABLE products RENAME TO blueprints').run();
    return;
  }
  db.prepare(BLUEPRINTS_TABLE).run();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 70 tests total.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/migrations/blueprints-v3.ts packages/api/src/utils/migrations/blueprints-v3.test.ts
git commit -m "feat(api): add blueprints migration merging product and template configs"
```

---

## Task 2: Rename product_id columns

**Files:**
- Modify: `packages/api/src/utils/migrations/blueprints-v3.ts`
- Modify: `packages/api/src/utils/migrations/blueprints-v3.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/api/src/utils/migrations/blueprints-v3.test.ts`:

```ts
describe('renameProductIdColumns', () => {
  function columns(db: Database.Database, table: string): string[] {
    return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  }

  it('renames product_id to blueprint_id on every table that has it', () => {
    const db = createTestDb();
    renameProductIdColumns(db);
    expect(columns(db, 'sites')).toContain('blueprint_id');
    expect(columns(db, 'sites')).not.toContain('product_id');
    expect(columns(db, 'site_logs')).toContain('blueprint_id');
    db.close();
  });

  it('preserves the values', () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO sites (id, subdomain, product_id, expires_at) VALUES ('s1', 'sub', 'demo-sqlite', '9999-12-31T23:59:59.999Z')",
    ).run();

    renameProductIdColumns(db);

    const row = db.prepare("SELECT blueprint_id FROM sites WHERE id = 's1'").get() as { blueprint_id: string };
    expect(row.blueprint_id).toBe('demo-sqlite');
    db.close();
  });

  it('is idempotent', () => {
    const db = createTestDb();
    renameProductIdColumns(db);
    expect(() => renameProductIdColumns(db)).not.toThrow();
    expect(columns(db, 'sites')).toContain('blueprint_id');
    db.close();
  });

  it('skips tables that do not exist', () => {
    const db = createTestDb();
    db.prepare('DROP TABLE site_logs').run();
    expect(() => renameProductIdColumns(db)).not.toThrow();
    db.close();
  });
});

describe('repointRenamedBlueprints', () => {
  it('moves rows that referenced a renamed product onto its new id', () => {
    const db = createTestDb();
    renameProductIdColumns(db);
    db.prepare(
      "INSERT INTO sites (id, subdomain, blueprint_id, expires_at) VALUES ('s1', 'sub', 'starter', '9999-12-31T23:59:59.999Z')",
    ).run();

    repointRenamedBlueprints(db, [{ from: 'starter', to: 'starter-product' }]);

    const row = db.prepare("SELECT blueprint_id FROM sites WHERE id = 's1'").get() as { blueprint_id: string };
    expect(row.blueprint_id).toBe('starter-product');
    db.close();
  });

  it('leaves untouched ids alone', () => {
    const db = createTestDb();
    renameProductIdColumns(db);
    db.prepare(
      "INSERT INTO sites (id, subdomain, blueprint_id, expires_at) VALUES ('s1', 'sub', 'demo-sqlite', '9999-12-31T23:59:59.999Z')",
    ).run();

    repointRenamedBlueprints(db, [{ from: 'starter', to: 'starter-product' }]);

    const row = db.prepare("SELECT blueprint_id FROM sites WHERE id = 's1'").get() as { blueprint_id: string };
    expect(row.blueprint_id).toBe('demo-sqlite');
    db.close();
  });
});
```

Add the new functions to the import at the top of the file:

```ts
import {
  mergeBlueprintDirectories,
  renameProductsTable,
  renameProductIdColumns,
  repointRenamedBlueprints,
} from './blueprints-v3';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w packages/api`
Expected: FAIL — `renameProductIdColumns is not a function`.

- [ ] **Step 3: Implement**

Append to `packages/api/src/utils/migrations/blueprints-v3.ts`:

```ts
/** Every table that carries a blueprint reference. */
const BLUEPRINT_ID_TABLES = ['sites', 'site_logs', 'scheduled_launches', 'bulk_jobs'];

export function renameProductIdColumns(db: Database.Database): void {
  for (const table of BLUEPRINT_ID_TABLES) {
    if (!hasTable(db, table)) continue;
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (cols.includes('blueprint_id') || !cols.includes('product_id')) continue;
    db.prepare(`ALTER TABLE ${table} RENAME COLUMN product_id TO blueprint_id`).run();
  }
}

/**
 * When a collision forces a product to a new id, rows that referenced it must
 * follow. Before the merge a bare id resolved to the *product* (the old lookup
 * checked products/ before templates/), so those rows belong to the suffixed
 * copy, not to the template that kept the name.
 */
export function repointRenamedBlueprints(
  db: Database.Database,
  renamed: { from: string; to: string }[],
): void {
  if (renamed.length === 0) return;
  for (const table of BLUEPRINT_ID_TABLES) {
    if (!hasTable(db, table)) continue;
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes('blueprint_id')) continue;
    for (const { from, to } of renamed) {
      db.prepare(`UPDATE ${table} SET blueprint_id = ? WHERE blueprint_id = ?`).run(to, from);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 76 tests total.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/migrations/
git commit -m "feat(api): rename product_id columns to blueprint_id"
```

---

## Task 3: Blueprint service

**Files:**
- Create: `packages/api/src/services/blueprint.service.ts`
- Test: `packages/api/src/services/blueprint.service.test.ts`
- Modify: `packages/api/src/config.ts`

- [ ] **Step 1: Point config at one directory**

In `packages/api/src/config.ts`, replace these two lines:

```ts
  productConfigsDir: process.env.PRODUCT_CONFIGS_DIR || './products',
  templateConfigsDir: process.env.TEMPLATE_CONFIGS_DIR || './templates',
```

with:

```ts
  blueprintConfigsDir: process.env.BLUEPRINT_CONFIGS_DIR || './blueprints',
  // Legacy directories, read once by the blueprints migration then unused.
  legacyProductConfigsDir: process.env.PRODUCT_CONFIGS_DIR || './products',
  legacyTemplateConfigsDir: process.env.TEMPLATE_CONFIGS_DIR || './templates',
```

- [ ] **Step 2: Write the failing tests**

Create `packages/api/src/services/blueprint.service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';

let dir: string;
let db: Database.Database;

vi.mock('../config', async () => {
  const actual = await vi.importActual<typeof import('../config')>('../config');
  return {
    ...actual,
    config: { ...actual.config, get blueprintConfigsDir() { return process.env.__TEST_BP_DIR!; } },
  };
});

async function loadService() {
  const mod = await import('./blueprint.service');
  mod.clearBlueprintCache();
  return mod;
}

function write(id: string, body: Record<string, unknown>) {
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, ...body }));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-bpsvc-'));
  process.env.__TEST_BP_DIR = dir;
  db = createTestDb();
  db.prepare('CREATE TABLE blueprints (id TEXT PRIMARY KEY, name TEXT NOT NULL, config TEXT NOT NULL)').run();
  __setDbForTesting(db);
});

afterEach(() => {
  __setDbForTesting(null);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.__TEST_BP_DIR;
});

describe('blueprint.service', () => {
  it('lists file-based blueprints', async () => {
    write('demo', { name: 'Demo' });
    const { listBlueprints } = await loadService();
    expect(listBlueprints().map((b) => b.id)).toEqual(['demo']);
  });

  it('hides underscore-prefixed blueprints from listings', async () => {
    write('_default', { name: 'Default' });
    write('demo', { name: 'Demo' });
    const { listBlueprints } = await loadService();
    expect(listBlueprints().map((b) => b.id)).toEqual(['demo']);
  });

  it('still resolves _default by id', async () => {
    write('_default', { name: 'Default' });
    const { getBlueprint } = await loadService();
    expect(getBlueprint('_default').name).toBe('Default');
  });

  it('falls back to _default for an unknown id, keeping the requested id', async () => {
    write('_default', { name: 'Default', database: 'sqlite' });
    const { getBlueprint } = await loadService();
    const resolved = getBlueprint('never-heard-of-it');
    expect(resolved.id).toBe('never-heard-of-it');
    expect(resolved.database).toBe('sqlite');
  });

  it('returns a minimal stub when there is no _default', async () => {
    const { getBlueprint } = await loadService();
    expect(getBlueprint('anything')).toEqual({ id: 'anything', name: 'anything' });
  });

  it('rejects path traversal ids', async () => {
    const { getBlueprint } = await loadService();
    expect(getBlueprint('../../etc/passwd')).toBeUndefined();
  });

  it('reads DB-stored blueprints and lists them alongside files', async () => {
    write('from-file', { name: 'File' });
    db.prepare("INSERT INTO blueprints (id, name, config) VALUES ('from-db', 'Db', ?)")
      .run(JSON.stringify({ id: 'from-db', name: 'Db' }));
    const { listBlueprints, getBlueprint } = await loadService();
    expect(listBlueprints().map((b) => b.id).sort()).toEqual(['from-db', 'from-file']);
    expect(getBlueprint('from-db').name).toBe('Db');
  });

  it('saves to the DB and serves the saved copy', async () => {
    const { saveBlueprint, getBlueprint } = await loadService();
    saveBlueprint({ id: 'saved', name: 'Saved' });
    expect(getBlueprint('saved').name).toBe('Saved');
    const row = db.prepare("SELECT name FROM blueprints WHERE id = 'saved'").get() as { name: string };
    expect(row.name).toBe('Saved');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w packages/api`
Expected: FAIL — `Failed to resolve import "./blueprint.service"`.

- [ ] **Step 4: Implement**

Create `packages/api/src/services/blueprint.service.ts` by copying `product.service.ts` and applying these changes: keep `isSafeSlug`, the `ProductPluginConfig`/`ProductThemeConfig`/`ProductConfig` interfaces (renamed `BlueprintPluginConfig`, `BlueprintThemeConfig`, `BlueprintConfig`), and replace the lookup/list/save trio with:

```ts
const blueprintCache = new Map<string, BlueprintConfig>();

export function clearBlueprintCache(): void {
  blueprintCache.clear();
}

/**
 * Lookup order: cache, then the blueprints directory, then the blueprints
 * table, then `_default` as a template for unknown ids, then a bare stub.
 */
export function getBlueprint(id: string): BlueprintConfig {
  if (!isSafeSlug(id)) return undefined as any;
  if (blueprintCache.has(id)) return blueprintCache.get(id)!;

  const filePath = path.join(config.blueprintConfigsDir, `${id}.json`);
  if (fs.existsSync(filePath)) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as BlueprintConfig;
    blueprintCache.set(id, parsed);
    return parsed;
  }

  const row = getDb().prepare('SELECT config FROM blueprints WHERE id = ?').get(id) as
    | { config: string }
    | undefined;
  if (row) {
    const parsed = JSON.parse(row.config) as BlueprintConfig;
    blueprintCache.set(id, parsed);
    return parsed;
  }

  // Unknown id: shape it from _default but keep the id the caller asked for.
  const defaultPath = path.join(config.blueprintConfigsDir, '_default.json');
  if (fs.existsSync(defaultPath)) {
    const parsed = JSON.parse(fs.readFileSync(defaultPath, 'utf-8')) as BlueprintConfig;
    parsed.id = id;
    parsed.name = id;
    return parsed;
  }

  return { id, name: id };
}

export function listBlueprints(): BlueprintConfig[] {
  const blueprints: BlueprintConfig[] = [];

  if (fs.existsSync(config.blueprintConfigsDir)) {
    const files = fs
      .readdirSync(config.blueprintConfigsDir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('_'));
    for (const file of files) {
      blueprints.push(JSON.parse(fs.readFileSync(path.join(config.blueprintConfigsDir, file), 'utf-8')));
    }
  }

  const rows = getDb().prepare('SELECT config FROM blueprints').all() as { config: string }[];
  for (const row of rows) {
    const parsed = JSON.parse(row.config) as BlueprintConfig;
    if (!blueprints.find((b) => b.id === parsed.id)) blueprints.push(parsed);
  }

  return blueprints;
}

export function saveBlueprint(blueprint: BlueprintConfig): void {
  getDb()
    .prepare(
      `INSERT INTO blueprints (id, name, config, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, config = excluded.config, updated_at = datetime('now')`,
    )
    .run(blueprint.id, blueprint.name, JSON.stringify(blueprint));
  blueprintCache.set(blueprint.id, blueprint);
}
```

Then delete `packages/api/src/services/product.service.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w packages/api`
Expected: PASS — 84 tests total. TypeScript will still be broken; Task 5 fixes the callers.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/blueprint.service.ts packages/api/src/services/blueprint.service.test.ts packages/api/src/config.ts
git rm packages/api/src/services/product.service.ts
git commit -m "feat(api): add blueprint service replacing product service"
```

---

## Task 4: Blueprint router

**Files:**
- Create: `packages/api/src/routes/blueprints.ts`
- Delete: `packages/api/src/routes/products.ts`, `packages/api/src/routes/templates.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Create the router**

Create `packages/api/src/routes/blueprints.ts` by copying `packages/api/src/routes/products.ts` — it is the richer of the two files — and applying:

- imports become `import { listBlueprints, getBlueprint, saveBlueprint, BlueprintConfig, clearBlueprintCache, isSafeSlug } from '../services/blueprint.service';`
- `sanitizeProduct` → `sanitizeBlueprint`, `productConfig` locals → `blueprint`
- every `config.productConfigsDir` → `config.blueprintConfigsDir`
- `saveProductConfig` → `saveBlueprint`, `clearConfigCache` → `clearBlueprintCache`
- the `GET /:id` handler keeps the `?full=true` branch that `templates.ts` had, so the editor can load a complete config:

```ts
router.get('/:id', (req: Request, res: Response) => {
  const blueprint = getBlueprint(req.params.id);
  if (!blueprint) throw new NotFoundError('Blueprint not found');
  if (req.query.full === 'true') {
    res.json(blueprint);
    return;
  }
  res.json(sanitizeBlueprint(blueprint));
});
```

Then delete both old route files.

- [ ] **Step 2: Mount it with deprecated aliases**

In `packages/api/src/index.ts`, replace the imports of `productsRouter` and `templatesRouter` with:

```ts
import blueprintsRouter from './routes/blueprints';
```

Replace both mounts with:

```ts
// Blueprints (GET open, writes require an admin JWT or the M2M API key)
const blueprintGuard = (req: any, res: any, next: any) => {
  if (req.method === 'GET') return next();
  return adminAuth(req, res, next);
};
app.use('/api/blueprints', blueprintGuard, blueprintsRouter);
// Deprecated aliases kept so existing API callers and scripts keep working.
app.use('/api/products', blueprintGuard, blueprintsRouter);
app.use('/api/templates', blueprintGuard, blueprintsRouter);
```

- [ ] **Step 3: Verify it compiles once callers are updated**

This task leaves TypeScript broken until Task 5. Do not run `tsc` expecting success yet.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/blueprints.ts packages/api/src/index.ts
git rm packages/api/src/routes/products.ts packages/api/src/routes/templates.ts
git commit -m "feat(api): add blueprints router replacing products and templates routers"
```

---

## Task 5: Update API callers

**Files:**
- Modify: every file importing `product.service` or referencing `product_id`
- Rename: `packages/api/src/services/template-export.service.ts` → `blueprint-export.service.ts`

- [ ] **Step 1: Find every caller**

Run: `npx tsc --noEmit -p packages/api 2>&1 | head -40`
Expected: errors in `site.service.ts`, `bulk.service.ts`, `schedule.service.ts`, `analytics.service.ts`, `share.service.ts`, `snapshot.service.ts`, `template-export.service.ts`, and the `sites`/`admin`/`analytics`/`bulk` routers.

- [ ] **Step 2: Rename the import in each**

Apply mechanically across the API source:

```bash
cd "packages/api/src"
grep -rl "services/product.service" . | xargs sed -i "s#services/product.service#services/blueprint.service#g"
grep -rl "getProductConfig" . | xargs sed -i "s#getProductConfig#getBlueprint#g"
grep -rl "listProducts" . | xargs sed -i "s#listProducts#listBlueprints#g"
grep -rl "saveProductConfig" . | xargs sed -i "s#saveProductConfig#saveBlueprint#g"
grep -rl "clearConfigCache" . | xargs sed -i "s#clearConfigCache#clearBlueprintCache#g"
grep -rl "ProductConfig" . | xargs sed -i "s#ProductConfig#BlueprintConfig#g"
```

- [ ] **Step 3: Rename the DB column references**

```bash
cd "packages/api/src"
grep -rl "product_id" . | xargs sed -i "s#product_id#blueprint_id#g"
```

Then hand-check the two places where the identifier is API surface rather than a column, and keep the request/response field named `productId` **only** in the deprecated alias paths — everywhere else rename it:

```bash
grep -rn "productId" packages/api/src | head -20
```

Rename `productId` to `blueprintId` in `CreateSiteRequest` and its route handler, and accept both on input for compatibility:

```ts
  const blueprintId = req.body.blueprintId ?? req.body.productId;
```

- [ ] **Step 4: Rename the export service**

```bash
git mv packages/api/src/services/template-export.service.ts packages/api/src/services/blueprint-export.service.ts
```

In that file, replace the mode-dependent target directory (the last `isLocalMode` in the API):

```ts
  const targetDir = config.isLocalMode ? config.templateConfigsDir : config.productConfigsDir;
```

with:

```ts
  const targetDir = config.blueprintConfigsDir;
```

Update its importers: `grep -rl "template-export.service" packages/api/src | xargs sed -i "s#template-export.service#blueprint-export.service#g"`

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p packages/api`
Expected: no errors.

Run: `npm test -w packages/api`
Expected: PASS — 84 tests.

Run: `grep -rn "isLocalMode" packages/api/src`
Expected: only `config.ts` (the definition) and `index.ts`'s update-check heuristic and log line.

- [ ] **Step 6: Commit**

```bash
git add -A packages/api/src
git commit -m "refactor(api): rename product vocabulary to blueprint across callers"
```

---

## Task 6: Wire the migration into startup

**Files:**
- Modify: `packages/api/src/utils/db.ts`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Run the migration**

In `packages/api/src/utils/db.ts`, add the import:

```ts
import {
  mergeBlueprintDirectories,
  renameProductsTable,
  renameProductIdColumns,
  repointRenamedBlueprints,
} from './migrations/blueprints-v3';
```

and call it in `initSchema`, immediately after `runRolesMigration(db)`:

```ts
  // Blueprints: one directory, one table, one column name.
  renameProductsTable(db);
  renameProductIdColumns(db);
  const merge = mergeBlueprintDirectories({
    products: config.legacyProductConfigsDir,
    templates: config.legacyTemplateConfigsDir,
    blueprints: config.blueprintConfigsDir,
  });
  // Any product displaced by a name collision takes its sites with it.
  repointRenamedBlueprints(db, merge.renamed);
```

- [ ] **Step 2: Mount the blueprints directory**

In `docker-compose.yml`, under the `api` service `volumes:`, add alongside the existing `products` and `templates` mounts:

```yaml
      - ./blueprints:/app/blueprints
```

and under `environment:` replace the two config-dir variables with:

```yaml
      - BLUEPRINT_CONFIGS_DIR=/app/blueprints
      - PRODUCT_CONFIGS_DIR=/app/products
      - TEMPLATE_CONFIGS_DIR=/app/templates
```

The legacy two remain only so the migration can read them on first boot.

- [ ] **Step 3: Verify the migration runs**

```bash
npm run build -w packages/api
docker compose build --no-cache api
docker compose up -d api
docker compose logs api --tail 20
```

Expected: no stack traces. Then confirm the merge and rename:

```bash
ls blueprints/
docker compose exec -T api node -p "require('better-sqlite3')('/app/data/wp-launcher.db').prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('products','blueprints')\").all().map(r=>r.name)"
docker compose exec -T api node -p "require('better-sqlite3')('/app/data/wp-launcher.db').prepare('PRAGMA table_info(sites)').all().map(c=>c.name).filter(n=>n.includes('id'))"
```

Expected: `blueprints/` contains all eight configs including `_default.json`; the table list shows `blueprints` only; the sites columns include `blueprint_id` and not `product_id`.

- [ ] **Step 4: Confirm existing sites still resolve**

```bash
curl -s http://localhost:3737/api/blueprints | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).map(b=>b.id)))"
```

Expected: the seven non-underscore blueprint ids.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/utils/db.ts docker-compose.yml
git commit -m "feat(api): run the blueprints migration at startup"
```

---

## Task 7: Dashboard — one blueprints list and one editor

**Files:**
- Rename: `packages/dashboard/src/pages/CreateProductPage.tsx` → `BlueprintEditorPage.tsx`
- Rename: `packages/dashboard/src/pages/admin/ProductsTab.tsx` → `admin/BlueprintsTab.tsx`
- Delete: `packages/dashboard/src/pages/CreateTemplatePage.tsx`
- Modify: `packages/dashboard/src/main.tsx`

- [ ] **Step 1: Rename the two surviving pages**

```bash
git mv packages/dashboard/src/pages/CreateProductPage.tsx packages/dashboard/src/pages/BlueprintEditorPage.tsx
git mv packages/dashboard/src/pages/admin/ProductsTab.tsx packages/dashboard/src/pages/admin/BlueprintsTab.tsx
git rm packages/dashboard/src/pages/CreateTemplatePage.tsx
```

`CreateProductPage` is a strict superset of `CreateTemplatePage` — it has every field the template editor had plus category, tags, locale, expiration, concurrency, admin user and email, landing page, restrictions and banner text — so nothing is lost by deleting the template editor.

- [ ] **Step 2: Rename the components and point them at one endpoint**

In `BlueprintEditorPage.tsx`: rename the default export function to `BlueprintEditorPage`, and change the submit target:

```ts
      const res = await apiFetch('/api/blueprints', {
```

In `BlueprintsTab.tsx`: rename the component to `BlueprintsTab` and replace the mode-dependent base:

```ts
  const apiBase = isLocal ? '/api/templates' : '/api/products';
```

with:

```ts
  const apiBase = '/api/blueprints';
```

Then remove the now-unused `useIsLocalMode` import and its `isLocal` local if nothing else in the file uses them — check with `grep -n "isLocal" packages/dashboard/src/pages/admin/BlueprintsTab.tsx`.

- [ ] **Step 3: Update the routes**

In `packages/dashboard/src/main.tsx`, replace the imports:

```tsx
import CreateProductPage from './pages/CreateProductPage';
import CreateTemplatePage from './pages/CreateTemplatePage';
import ProductsTab from './pages/admin/ProductsTab';
```

with:

```tsx
import BlueprintEditorPage from './pages/BlueprintEditorPage';
import BlueprintsTab from './pages/admin/BlueprintsTab';
```

In `LocalRoutes`, replace these two routes:

```tsx
        <Route path="create-template" element={<CreateTemplatePage />} />
        <Route path="products" element={<ProductsTab />} />
```

with:

```tsx
        <Route path="blueprints" element={<BlueprintsTab />} />
        <Route path="blueprints/new" element={<BlueprintEditorPage />} />
        {/* Old paths kept so existing links and bookmarks resolve. */}
        <Route path="products" element={<Navigate to="/blueprints" replace />} />
        <Route path="create-template" element={<Navigate to="/blueprints/new" replace />} />
```

In `AgencyRoutes`, replace:

```tsx
        <Route path="create-product" element={<AdminRoute><CreateProductPage /></AdminRoute>} />
```

with:

```tsx
        <Route path="blueprints/new" element={<AdminRoute><BlueprintEditorPage /></AdminRoute>} />
        <Route path="create-product" element={<Navigate to="/blueprints/new" replace />} />
```

and inside its `admin` subtree replace `<Route path="products" element={<ProductsTab />} />` with:

```tsx
          <Route path="blueprints" element={<BlueprintsTab />} />
          <Route path="products" element={<Navigate to="/admin/blueprints" replace />} />
```

- [ ] **Step 4: Update the sidebar label**

In `packages/dashboard/src/pages/admin/AdminLayout.tsx`, find the nav entry pointing at `/products` and change both its `to` and `label`:

```tsx
  { to: '/blueprints', label: 'Blueprints' },
```

Confirm with `grep -n "products\|Products" packages/dashboard/src/pages/admin/AdminLayout.tsx` that no other reference remains.

- [ ] **Step 5: Verify**

Run: `npm run build -w packages/dashboard`
Expected: builds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add -A packages/dashboard/src
git commit -m "feat(dashboard): one blueprints list and editor replacing products and templates"
```

---

## Task 8: Dashboard — remaining endpoint callers

**Files:**
- Modify: `packages/dashboard/src/pages/LaunchPage.tsx`, `LocalLaunchPage.tsx`, `admin/BulkTab.tsx`

- [ ] **Step 1: Collapse the mode branches**

In `packages/dashboard/src/pages/LaunchPage.tsx` replace:

```ts
    apiFetch(isLocal ? '/api/templates' : '/api/products')
```

with:

```ts
    apiFetch('/api/blueprints')
```

In `packages/dashboard/src/pages/admin/BulkTab.tsx` replace:

```ts
    apiFetch(isLocal ? '/api/templates' : '/api/products').then((r) => r.json()).then((data) => {
```

with:

```ts
    apiFetch('/api/blueprints').then((r) => r.json()).then((data) => {
```

In `packages/dashboard/src/pages/LocalLaunchPage.tsx` replace:

```ts
    apiFetch('/api/templates')
```

with:

```ts
    apiFetch('/api/blueprints')
```

- [ ] **Step 2: Rename the request field**

The create-site call sends `productId`. Update each caller to send `blueprintId`:

```bash
grep -rn "productId" packages/dashboard/src | head -20
```

Rename every occurrence to `blueprintId`. The API accepts both, so this can be done file by file without breaking anything mid-way.

- [ ] **Step 3: Remove now-dead mode reads**

Run: `grep -rn "useIsLocalMode" packages/dashboard/src/pages/LaunchPage.tsx packages/dashboard/src/pages/admin/BulkTab.tsx`
If `isLocal` is no longer read in a file, delete the import and the local.

- [ ] **Step 4: Verify**

Run: `npm run build -w packages/dashboard`
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add -A packages/dashboard/src
git commit -m "refactor(dashboard): call /api/blueprints from every caller"
```

---

## Task 9: Full verification

- [ ] **Step 1: Automated checks**

```bash
npm test -w packages/api
npx tsc --noEmit -p packages/api
npx tsc --noEmit -p packages/provisioner
npm run build -w packages/dashboard
```

Expected: 84 tests pass, no type errors, dashboard builds.

- [ ] **Step 2: Deploy, and confirm the image is not stale**

```bash
docker compose build --no-cache api dashboard
docker compose up -d api dashboard
docker compose exec -T api sh -c "grep -c blueprints /app/dist/routes/blueprints.js"
docker compose exec -T dashboard sh -c "grep -c Blueprints /usr/share/nginx/html/assets/*.js"
```

Expected: non-zero counts from both. `docker compose up --build` has silently served stale images on this project; always assert a marker.

- [ ] **Step 3: Behavioural checks**

```bash
curl -s http://localhost:3737/api/blueprints | head -c 200
curl -s http://localhost:3737/api/products | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3737/api/blueprints
```

Expected: the first two return the same list (the alias works); the POST returns 401 without credentials.

- [ ] **Step 4: Manual UI checks**

- Sidebar shows **Blueprints**; the list renders every blueprint.
- Creating a blueprint from the editor saves and appears in the list.
- Launching a site from a blueprint works, and the new site's row carries the right `blueprint_id`.
- Visiting `/products` redirects to `/blueprints`.
- Existing sites still show their blueprint name rather than a blank.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found in blueprints verification"
```

---

## Done criteria

- 84 tests pass; API, provisioner and dashboard all build.
- `grep -rn "product" packages/api/src` returns only the deprecated alias mount and the legacy config dirs.
- `grep -rn "isLocalMode" packages/api/src` returns only `config.ts` and `index.ts`'s update-check and log line.
- `blueprints/` holds every former product and template, `_default.json` included.
- The `sites` table has `blueprint_id`, no `product_id`, and existing sites resolve their blueprint.
- `/api/products` and `/api/templates` still answer, serving blueprints.
