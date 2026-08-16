# Shared Database Servers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-site MySQL/MariaDB sidecar (~500 MB each) with one shared, tuned server per engine, started on demand, so total database memory stops scaling with site count.

**Architecture:** Two provisioner-owned containers, `wpl-db-mariadb` and `wpl-db-mysql`, created like site containers so their lifecycle is ours. Each site gets a database and user on the shared server instead of its own container. Pure logic (identifiers, prune selection) lives in a testable module; Docker glue stays thin.

**Tech Stack:** Node.js/TypeScript, Dockerode, MariaDB 11, MySQL 8.4, vitest.

**Spec:** `docs/superpowers/specs/2026-08-15-shared-database-servers-design.md`

## Global Constraints

- The ACME resolver, TLS and networking work from earlier releases is untouched. This change is confined to database provisioning.
- **Legacy sidecar sites must keep working.** `WORDPRESS_DB_HOST` is baked into each existing container, so they continue to use their own sidecar. Never remove the legacy teardown branch.
- Site containers gain `wp-launcher.db-engine`; they stop emitting `wp-launcher.db-container`. Both must be read on deletion.
- Engine containers are **stopped, never removed**, when idle — their volume and tuning must survive.
- Only `wp_`-prefixed databases are ever eligible for dropping. `mysql`, `information_schema`, `performance_schema` and `sys` must be unreachable by any code path here.
- An empty `keep` list selects **nothing** to drop, never everything.
- Engine readiness timeout is **60 seconds**, polled every second.
- Per-site grants are scoped to that site's database only, with `MAX_USER_CONNECTIONS 10`.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/provisioner/src/shared-db.ts` | **Create.** Pure functions only: engine→host/image/volume names, the per-site identifier, tuning flags, and prune selection. No Docker, no I/O, fully unit-testable. |
| `packages/provisioner/src/shared-db.test.ts` | **Create.** Tests for the above. |
| `packages/provisioner/src/db-engine.ts` | **Create.** The Docker/SQL glue: ensure an engine is running, provision and drop a site's database, list databases, stop an idle engine. Kept thin because it cannot be unit-tested without a daemon. |
| `packages/provisioner/src/index.ts` | **Modify.** Replace the sidecar block (194-240), add the `wp-launcher.db-engine` label, add the dual-path teardown, add `POST /databases/prune`. |
| `packages/provisioner/src/site-labels.ts` | **Modify.** Emit `wp-launcher.db-engine`. |
| `packages/api/src/services/cleanup.service.ts` | **Modify.** Drive the database sweep from the watchdog, which is the only place that knows which sites should exist. |
| `packages/api/src/services/docker.service.ts` | **Modify.** Client for `POST /databases/prune`. |
| `docker-compose.dokploy.yml`, `docker-compose.yml`, `.env.dokploy.example`, `guides/*`, `CLAUDE.md` | **Modify.** `SHARED_DB_ROOT_PASSWORD` and documentation. |

`index.ts` is already ~2,200 lines; the new logic goes in its own modules rather than growing it further.

---

### Task 1: Identifiers, engine metadata and prune selection

Pure logic first, with no Docker involved, so the rules that protect customer data are provable in CI.

**Files:**
- Create: `packages/provisioner/src/shared-db.ts`
- Create: `packages/provisioner/src/shared-db.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all exported from `shared-db.ts`:
  - `type SharedDbEngine = 'mysql' | 'mariadb'`
  - `engineHost(engine: SharedDbEngine): string` — also the container name
  - `engineImage(engine: SharedDbEngine): string`
  - `engineVolume(engine: SharedDbEngine): string`
  - `siteDbIdentifier(subdomain: string): string` — used for **both** the database name and the user name
  - `ENGINE_FLAGS: readonly string[]`
  - `selectDatabasesToDrop(all: string[], keep: string[]): string[]`

- [ ] **Step 1: Write the failing tests**

Create `packages/provisioner/src/shared-db.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  engineHost, engineImage, engineVolume, siteDbIdentifier,
  selectDatabasesToDrop, ENGINE_FLAGS,
} from './shared-db';

describe('engine metadata', () => {
  it('names a container, image and volume per engine', () => {
    expect(engineHost('mariadb')).toBe('wpl-db-mariadb');
    expect(engineHost('mysql')).toBe('wpl-db-mysql');
    expect(engineImage('mariadb')).toBe('mariadb:11');
    expect(engineImage('mysql')).toBe('mysql:8.4');
    expect(engineVolume('mariadb')).toBe('wpl-db-mariadb-data');
  });

  it('turns off the single largest memory consumer', () => {
    // performance_schema alone accounts for 200-400MB on MySQL 8.4.
    expect(ENGINE_FLAGS).toContain('--performance-schema=OFF');
  });
});

describe('siteDbIdentifier', () => {
  it('fits MySQL’s 32-character username limit even for the longest subdomain', () => {
    const longest = 'a'.repeat(63);
    expect(siteDbIdentifier(longest).length).toBeLessThanOrEqual(32);
  });

  it('keeps the subdomain readable at the front', () => {
    expect(siteDbIdentifier('golden-star-579af1')).toMatch(/^wp_golden_star_579af1_[0-9a-f]{4}$/);
  });

  it('distinguishes subdomains that share their first 20 characters', () => {
    const a = siteDbIdentifier('aaaaaaaaaaaaaaaaaaaaaa-one');
    const b = siteDbIdentifier('aaaaaaaaaaaaaaaaaaaaaa-two');
    expect(a).not.toBe(b);
  });

  it('emits only characters legal in an unquoted identifier', () => {
    expect(siteDbIdentifier('Has.Dots-And_Mixed')).toMatch(/^[a-z0-9_]+$/);
  });

  it('is stable for the same subdomain', () => {
    expect(siteDbIdentifier('warm-vale-214873')).toBe(siteDbIdentifier('warm-vale-214873'));
  });
});

describe('selectDatabasesToDrop', () => {
  const system = ['mysql', 'information_schema', 'performance_schema', 'sys'];

  it('drops wp_ databases that no live site claims', () => {
    const all = [...system, 'wp_alpha_1111', 'wp_beta_2222'];
    expect(selectDatabasesToDrop(all, ['wp_alpha_1111'])).toEqual(['wp_beta_2222']);
  });

  it('never touches system databases', () => {
    expect(selectDatabasesToDrop(system, ['wp_alpha_1111'])).toEqual([]);
  });

  it('never touches databases outside our prefix', () => {
    const all = ['customer_crm', 'analytics', 'wp_beta_2222'];
    expect(selectDatabasesToDrop(all, [])).not.toContain('customer_crm');
  });

  it('selects nothing when the keep list is empty', () => {
    // A caller that failed to enumerate sites must not be able to wipe them.
    expect(selectDatabasesToDrop(['wp_alpha_1111', 'wp_beta_2222'], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/provisioner && npx vitest run src/shared-db.test.ts`
Expected: FAIL — `Failed to resolve import "./shared-db"`.

- [ ] **Step 3: Write the implementation**

Create `packages/provisioner/src/shared-db.ts`:

```ts
import crypto from 'crypto';

export type SharedDbEngine = 'mysql' | 'mariadb';

/** Container name and DNS name are the same thing on a Docker network. */
export function engineHost(engine: SharedDbEngine): string {
  return `wpl-db-${engine}`;
}

export function engineImage(engine: SharedDbEngine): string {
  return engine === 'mysql' ? 'mysql:8.4' : 'mariadb:11';
}

export function engineVolume(engine: SharedDbEngine): string {
  return `wpl-db-${engine}-data`;
}

/**
 * Server flags sized for many small databases rather than one large one.
 *
 * Stock MySQL 8.4 costs ~500MB per instance, which is what made a sidecar per
 * site untenable. `performance_schema` is the largest single item; the rest
 * trims buffers that a demo site never fills.
 */
export const ENGINE_FLAGS: readonly string[] = [
  '--performance-schema=OFF',
  '--innodb-buffer-pool-size=64M',
  '--innodb-log-buffer-size=8M',
  '--max-connections=100',
  '--table-open-cache=128',
  '--table-definition-cache=128',
  '--tmp-table-size=8M',
  '--max-heap-table-size=8M',
];

const PREFIX = 'wp_';

/**
 * The database name AND user name for a site — deliberately the same string.
 *
 * MySQL caps user names at 32 characters while a subdomain may be 63, so the
 * subdomain cannot simply be embedded. The readable prefix keeps it
 * recognisable in Adminer; the hash suffix keeps subdomains that share their
 * first 20 characters distinct.
 */
export function siteDbIdentifier(subdomain: string): string {
  const safe = subdomain.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
  const hash = crypto.createHash('sha1').update(subdomain).digest('hex').slice(0, 4);
  return `${PREFIX}${safe}_${hash}`;
}

/**
 * Which databases the sweep may drop.
 *
 * Two guards, both load-bearing: only our own prefix is ever eligible, so an
 * operator's own databases and the server's system schemas cannot be selected;
 * and an empty `keep` list selects nothing, so a caller that failed to
 * enumerate its sites destroys nothing.
 */
export function selectDatabasesToDrop(all: string[], keep: string[]): string[] {
  if (keep.length === 0) return [];
  const kept = new Set(keep);
  return all.filter((name) => name.startsWith(PREFIX) && !kept.has(name));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/provisioner && npx vitest run src/shared-db.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd packages/provisioner && npx tsc --noEmit
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
git add packages/provisioner/src/shared-db.ts packages/provisioner/src/shared-db.test.ts
git commit -m "feat(provisioner): identifiers and prune selection for shared databases

Pure logic, no Docker: engine metadata, the per-site identifier that fits
MySQL's 32-character username limit, and the selection rules that decide which
databases a sweep may drop. Those rules protect customer data, so they are
proven in CI rather than inline."
```

---

### Task 2: Engine lifecycle and per-site provisioning

**Files:**
- Create: `packages/provisioner/src/db-engine.ts`
- Modify: `packages/provisioner/src/index.ts:194-240` (the sidecar block) and `:250-262` (the env block)
- Modify: `packages/provisioner/src/site-labels.ts`

**Interfaces:**
- Consumes: `engineHost`, `engineImage`, `engineVolume`, `ENGINE_FLAGS`, `siteDbIdentifier`, `SharedDbEngine` from `./shared-db`.
- Produces, from `db-engine.ts`:
  - `ensureEngineRunning(docker, engine, rootPassword, network): Promise<void>`
  - `provisionSiteDatabase(docker, engine, rootPassword, identifier, password): Promise<void>`
  - `dropSiteDatabase(docker, engine, rootPassword, identifier): Promise<void>`
  - `listSiteDatabases(docker, engine, rootPassword): Promise<string[]>`
  - `stopEngineIfUnused(docker, engine): Promise<void>`
- Produces from `site-labels.ts`: the `wp-launcher.db-engine` label when `dbEngine` is set.

- [ ] **Step 1: Write the failing label test**

Add to `packages/provisioner/src/site-labels.test.ts`, inside the existing `describe('buildSiteLabels', …)`:

```ts
  it('records which shared engine the site uses, so teardown can find it', () => {
    expect(buildSiteLabels(base)['wp-launcher.db-engine']).toBeUndefined();
    expect(buildSiteLabels({ ...base, dbEngine: 'mariadb' })['wp-launcher.db-engine']).toBe('mariadb');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/provisioner && npx vitest run src/site-labels.test.ts -t "shared engine"`
Expected: FAIL — received `undefined` instead of `'mariadb'`.

- [ ] **Step 3: Add the label**

In `packages/provisioner/src/site-labels.ts`, add to `SiteLabelInput`:

```ts
  /**
   * Which shared database engine this site uses, if any. Teardown reads this
   * to know it must drop a database rather than remove a sidecar container.
   */
  dbEngine?: string;
```

and to the returned object, next to `dbContainerId`:

```ts
    ...(input.dbEngine ? { 'wp-launcher.db-engine': input.dbEngine } : {}),
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd packages/provisioner && npx vitest run src/site-labels.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Write the engine module**

Create `packages/provisioner/src/db-engine.ts`:

```ts
import type Docker from 'dockerode';
import {
  SharedDbEngine, engineHost, engineImage, engineVolume, ENGINE_FLAGS,
} from './shared-db';

const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 1_000;

/** Run a command inside the engine container and return its stdout. */
async function execInEngine(
  docker: Docker, engine: SharedDbEngine, cmd: string[],
): Promise<string> {
  const container = docker.getContainer(engineHost(engine));
  const exec = await container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true });
  const stream = await exec.start({});
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  const info = await exec.inspect();
  // Docker multiplexes exec output with an 8-byte header per frame; strip any
  // leading non-printable bytes rather than parsing the framing.
  const out = Buffer.concat(chunks).toString('utf-8').replace(/^[\x00-\x08]+/gm, '');
  if (info.ExitCode !== 0) {
    throw new Error(`${cmd[0]} failed in ${engineHost(engine)} (exit ${info.ExitCode}): ${out.trim()}`);
  }
  return out;
}

async function sql(
  docker: Docker, engine: SharedDbEngine, rootPassword: string, statement: string,
): Promise<string> {
  return await execInEngine(docker, engine, [
    'mysql', '--skip-ssl', '-u', 'root', `-p${rootPassword}`, '--batch', '--skip-column-names',
    '-e', statement,
  ]);
}

/**
 * Start the shared engine if it is not already running, and prove we can
 * authenticate against it.
 *
 * The engine is stopped rather than removed when idle, so an existing
 * container is normal and is simply started again.
 */
export async function ensureEngineRunning(
  docker: Docker, engine: SharedDbEngine, rootPassword: string, network: string,
): Promise<void> {
  const name = engineHost(engine);
  let container = docker.getContainer(name);
  let exists = true;
  try {
    const info = await container.inspect();
    if (!info.State.Running) await container.start();
  } catch (err: any) {
    if (err.statusCode !== 404) throw err;
    exists = false;
  }

  if (!exists) {
    const image = engineImage(engine);
    try {
      await docker.getImage(image).inspect();
    } catch {
      const stream = await docker.pull(image);
      await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(stream, (e: Error | null) => (e ? reject(e) : resolve()));
      });
    }
    const created = await docker.createContainer({
      Image: image,
      name,
      Cmd: [...ENGINE_FLAGS],
      Env: [
        `MARIADB_ROOT_PASSWORD=${rootPassword}`,
        `MYSQL_ROOT_PASSWORD=${rootPassword}`,
      ],
      Labels: { 'wp-launcher.managed': 'true', 'wp-launcher.role': 'shared-db', 'wp-launcher.db-engine': engine },
      HostConfig: {
        NetworkMode: network,
        Binds: [`${engineVolume(engine)}:/var/lib/mysql`],
        RestartPolicy: { Name: 'unless-stopped' },
      },
    });
    await created.start();
    container = created;
  }

  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      await sql(docker, engine, rootPassword, 'SELECT 1');
      return;
    } catch (err: any) {
      lastError = err.message || String(err);
      // An access-denied failure will never resolve by waiting: the password
      // was written into the volume when it was first initialised and editing
      // the environment variable does not change it.
      if (/access denied/i.test(lastError)) {
        throw new Error(
          `SHARED_DB_ROOT_PASSWORD does not match the running ${engine} server. The password was ` +
          `set when the ${engineVolume(engine)} volume was initialised and cannot be changed by ` +
          `editing this variable. Either restore the previous value, or remove that volume — ` +
          `which destroys every site database on this engine.`,
        );
      }
      await new Promise((r) => setTimeout(r, READY_POLL_MS));
    }
  }
  throw new Error(`database engine ${engine} did not become ready within 60s: ${lastError}`);
}

// Backtick-quoting an identifier inside a TS template literal needs escaping
// that is easy to get wrong and silently produces invalid SQL. Build it by
// concatenation instead, where what you read is what MySQL receives.
const BT = String.fromCharCode(96);
const quoted = (identifier: string) => BT + identifier + BT;

export async function provisionSiteDatabase(
  docker: Docker, engine: SharedDbEngine, rootPassword: string,
  identifier: string, password: string,
): Promise<void> {
  await sql(docker, engine, rootPassword, [
    'CREATE DATABASE IF NOT EXISTS ' + quoted(identifier) + ';',
    `CREATE USER IF NOT EXISTS '${identifier}'@'%' IDENTIFIED BY '${password}';`,
    `ALTER USER '${identifier}'@'%' IDENTIFIED BY '${password}';`,
    'GRANT ALL PRIVILEGES ON ' + quoted(identifier) + `.* TO '${identifier}'@'%';`,
    `ALTER USER '${identifier}'@'%' WITH MAX_USER_CONNECTIONS 10;`,
    'FLUSH PRIVILEGES;',
  ].join(' '));
}

export async function dropSiteDatabase(
  docker: Docker, engine: SharedDbEngine, rootPassword: string, identifier: string,
): Promise<void> {
  await sql(docker, engine, rootPassword, [
    'DROP DATABASE IF EXISTS ' + quoted(identifier) + ';',
    `DROP USER IF EXISTS '${identifier}'@'%';`,
  ].join(' '));
}

export async function listSiteDatabases(
  docker: Docker, engine: SharedDbEngine, rootPassword: string,
): Promise<string[]> {
  const out = await sql(docker, engine, rootPassword, 'SHOW DATABASES;');
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * Stop the engine when no site container references it. Stopped, not removed:
 * the volume and tuning survive, and the next start is fast.
 */
export async function stopEngineIfUnused(docker: Docker, engine: SharedDbEngine): Promise<void> {
  const sites = await docker.listContainers({
    all: true,
    filters: { label: [`wp-launcher.db-engine=${engine}`, 'wp-launcher.managed=true'] },
  });
  const stillUsed = sites.some((c) => c.Labels?.['wp-launcher.role'] !== 'shared-db');
  if (stillUsed) return;
  try {
    await docker.getContainer(engineHost(engine)).stop({ t: 10 });
    console.log(`[provisioner] Stopped idle shared engine ${engineHost(engine)}`);
  } catch (err: any) {
    if (err.statusCode !== 304 && err.statusCode !== 404) throw err;
  }
}
```

- [ ] **Step 6: Replace the sidecar block in `index.ts`**

Add near the other imports:

```ts
import { SharedDbEngine, engineHost, siteDbIdentifier } from './shared-db';
import { ensureEngineRunning, provisionSiteDatabase } from './db-engine';

const SHARED_DB_ROOT_PASSWORD = process.env.SHARED_DB_ROOT_PASSWORD || '';
```

Replace everything from `// If MySQL or MariaDB mode, create a database sidecar container first` through `dbContainerId = dbSidecar.id;` and its closing brace (currently lines 194-240) with:

```ts
    // One shared, tuned server per engine instead of a container per site. A
    // stock MySQL sidecar cost ~500MB; the shared server costs that once.
    const dbIdentifier = siteDbIdentifier(opts.subdomain);
    if (useExternalDb) {
      if (!SHARED_DB_ROOT_PASSWORD) {
        throw new Error('SHARED_DB_ROOT_PASSWORD is required to provision MySQL/MariaDB sites');
      }
      const engine = opts.dbEngine as SharedDbEngine;
      await ensureEngineRunning(docker, engine, SHARED_DB_ROOT_PASSWORD, DOCKER_NETWORK);
      await provisionSiteDatabase(docker, engine, SHARED_DB_ROOT_PASSWORD, dbIdentifier, dbPassword);
    }
```

Then replace the `if (useExternalDb) { env.push(...) }` block (currently lines 250-262) with:

```ts
    if (useExternalDb) {
      env.push(
        `DB_ENGINE=${opts.dbEngine}`,
        `WORDPRESS_DB_HOST=${engineHost(opts.dbEngine as SharedDbEngine)}`,
        `WORDPRESS_DB_USER=${dbIdentifier}`,
        `WORDPRESS_DB_PASSWORD=${dbPassword}`,
        `WORDPRESS_DB_NAME=${dbIdentifier}`,
      );
    } else {
      env.push('DB_ENGINE=sqlite');
    }
```

Delete the now-unused `dbContainerName` declaration and the rollback block that removes `dbContainerId` on failure (currently ~382-390); leave `dbContainerId` itself declared and always `undefined`, so the existing label call keeps compiling.

In the `buildSiteLabels({...})` call, add:

```ts
          dbEngine: useExternalDb ? opts.dbEngine : undefined,
```

- [ ] **Step 7: Verify the suite and types**

Run: `cd packages/provisioner && npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no TypeScript output.

- [ ] **Step 8: Commit**

```bash
git add packages/provisioner/src/db-engine.ts packages/provisioner/src/site-labels.ts packages/provisioner/src/index.ts packages/provisioner/src/site-labels.test.ts
git commit -m "feat(provisioner): provision sites on a shared database server

Replaces the per-site sidecar with a database and user on one shared, tuned
engine per flavour, started on demand. Sites carry wp-launcher.db-engine so
teardown knows to drop a database rather than remove a container.

A root-password mismatch is reported as a configuration error naming the
volume, because it cannot resolve by waiting and the raw access-denied error
reads like a code bug."
```

---

### Task 3: Teardown for both kinds of site

**Files:**
- Modify: `packages/provisioner/src/index.ts:427-444` (the sidecar removal branch)

**Interfaces:**
- Consumes: `dropSiteDatabase`, `stopEngineIfUnused` from `./db-engine`; `siteDbIdentifier` from `./shared-db`.
- Produces: nothing consumed later.

- [ ] **Step 1: Add the shared-database branch**

In `packages/provisioner/src/index.ts`, immediately **after** the existing `if (dbId) { … }` block that removes a sidecar, add:

```ts
      // Sites created before shared servers carry wp-launcher.db-container and
      // are handled above. Newer ones carry wp-launcher.db-engine and own a
      // database instead. Both must be supported: removing the legacy branch
      // would strand every existing site's sidecar as an orphan.
      const dbEngineLabel = info.Config?.Labels?.['wp-launcher.db-engine'] as SharedDbEngine | undefined;
      const siteSubdomain = info.Config?.Labels?.['wp-launcher.site-id'];
      if (dbEngineLabel && siteSubdomain && SHARED_DB_ROOT_PASSWORD) {
        try {
          await dropSiteDatabase(
            docker, dbEngineLabel, SHARED_DB_ROOT_PASSWORD, siteDbIdentifier(siteSubdomain),
          );
          console.log(`[provisioner] Dropped database for ${siteSubdomain}`);
        } catch (err: any) {
          // Never block teardown. A leaked database wastes disk but breaks
          // nothing, and the sweep in cleanup.service reclaims it.
          console.error(`[provisioner] Database drop failed for ${siteSubdomain}:`, err.message);
        }
      }
```

Import the two new symbols at the top of the file alongside the existing ones:

```ts
import { dropSiteDatabase, stopEngineIfUnused } from './db-engine';
```

- [ ] **Step 2: Stop the engine once the container is gone**

Find where the delete handler responds with success (after `container.remove(...)`), and immediately before the response add:

```ts
      // Reclaim the engine's memory when its last site goes. Deliberately
      // after the container is removed, so it is no longer counted as a user.
      if (dbEngineLabel) {
        await stopEngineIfUnused(docker, dbEngineLabel).catch((err: any) =>
          console.error('[provisioner] Engine stop check failed:', err.message));
      }
```

- [ ] **Step 3: Verify the suite and types**

Run: `cd packages/provisioner && npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no TypeScript output.

- [ ] **Step 4: Commit**

```bash
git add packages/provisioner/src/index.ts
git commit -m "feat(provisioner): drop the database and stop idle engines on teardown

Handles both kinds of site: legacy ones remove their sidecar, shared ones drop
their database and user. The legacy branch stays because pre-existing sites
keep running after the upgrade.

A failed drop logs and continues rather than blocking deletion; the sweep
reclaims it."
```

---

### Task 4: Reclaiming orphaned databases

A failed drop must not leak permanently. The sweep is driven from the API because **only the API knows which sites should exist**, including those in `creating` whose database exists before their container.

**Files:**
- Modify: `packages/provisioner/src/index.ts` (add `POST /databases/prune`)
- Modify: `packages/api/src/services/docker.service.ts` (client)
- Modify: `packages/api/src/services/cleanup.service.ts` (call it from the watchdog)
- Create: `packages/api/src/services/db-sweep.test.ts`

**Interfaces:**
- Consumes: `selectDatabasesToDrop` from `shared-db`; `listSiteDatabases`, `dropSiteDatabase` from `db-engine`.
- Produces: `pruneDatabases(engine: string, keep: string[]): Promise<{ dropped: string[] }>` in `packages/api/src/services/docker.service.ts`, and `expectedDbIdentifiers(): string[] | null` in `cleanup.service.ts` — `null` meaning "enumeration failed, skip the sweep".

- [ ] **Step 1: Add the provisioner endpoint**

In `packages/provisioner/src/index.ts`, alongside the other routes:

```ts
app.post('/databases/prune', async (req: Request, res: Response) => {
  try {
    const engine = req.body?.engine as SharedDbEngine;
    const keep = req.body?.keep;
    if (engine !== 'mysql' && engine !== 'mariadb') {
      res.status(400).json({ error: 'engine must be mysql or mariadb' });
      return;
    }
    if (!Array.isArray(keep)) {
      res.status(400).json({ error: 'keep must be an array' });
      return;
    }
    if (!SHARED_DB_ROOT_PASSWORD) {
      res.json({ dropped: [] });
      return;
    }
    // Only sweep an engine that is already up. Starting one just to prune it
    // would defeat the point of stopping it.
    const running = await docker.listContainers({
      filters: { name: [engineHost(engine)] },
    });
    if (running.length === 0) {
      res.json({ dropped: [] });
      return;
    }

    const all = await listSiteDatabases(docker, engine, SHARED_DB_ROOT_PASSWORD);
    const doomed = selectDatabasesToDrop(all, keep);
    for (const name of doomed) {
      await dropSiteDatabase(docker, engine, SHARED_DB_ROOT_PASSWORD, name);
      console.log(`[provisioner] Reclaimed orphaned database ${name}`);
    }
    res.json({ dropped: doomed });
  } catch (err: any) {
    console.error('[provisioner] Database prune error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

Add `listSiteDatabases` and `selectDatabasesToDrop` to the existing imports.

- [ ] **Step 2: Add the API client**

In `packages/api/src/services/docker.service.ts`, next to `pruneImages`:

```ts
export async function pruneDatabases(engine: string, keep: string[]): Promise<{ dropped: string[] }> {
  const res = await provisionerFetch('/databases/prune', {
    method: 'POST',
    body: JSON.stringify({ engine, keep }),
  });
  return await parseJson<{ dropped: string[] }>(res);
}
```

- [ ] **Step 3: Write the failing test for the keep list**

Create `packages/api/src/services/db-sweep.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { expectedDbIdentifiers } from './cleanup.service';
// Compare against the real derivation rather than a hardcoded hash, so the
// test cannot drift from the implementation.
import { siteDbIdentifier } from '../../../provisioner/src/shared-db';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'a@b.c')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

function seed(id: string, subdomain: string, status: string) {
  db.prepare(
    `INSERT INTO sites (id, subdomain, product_id, user_id, status, expires_at)
     VALUES (?, ?, 'demo', 'u1', ?, '2099-01-01T00:00:00.000Z')`,
  ).run(id, subdomain, status);
}

describe('expectedDbIdentifiers', () => {
  it('keeps running sites', () => {
    seed('a', 'alpha-site', 'running');
    expect(expectedDbIdentifiers()).toContain(siteDbIdentifier('alpha-site'));
  });

  it('keeps sites that are still being created', () => {
    // Their database exists before their container does; a sweep driven from
    // containers would delete it mid-launch.
    seed('b', 'beta-site', 'creating');
    expect(expectedDbIdentifiers()).toContain(siteDbIdentifier('beta-site'));
  });

  it('does not keep deleted sites', () => {
    seed('c', 'gone--deleted-1', 'expired');
    expect(expectedDbIdentifiers()).not.toContain(siteDbIdentifier('gone--deleted-1'));
  });

  it('reports failure rather than returning a partial list', () => {
    // The caller must be able to tell "no sites" from "could not ask".
    db.prepare('DROP TABLE sites').run();
    expect(expectedDbIdentifiers()).toBeNull();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd packages/api && npx vitest run src/services/db-sweep.test.ts`
Expected: FAIL — `expectedDbIdentifiers` is not exported.

- [ ] **Step 5: Implement the sweep**

In `packages/api/src/services/cleanup.service.ts`, add:

```ts
import { siteDbIdentifier } from '../../../provisioner/src/shared-db';
import { pruneDatabases } from './docker.service';

/**
 * Database identifiers every live site expects to keep.
 *
 * Includes `creating` deliberately: a site's database is provisioned before its
 * container exists, so a list derived from containers would lose that race and
 * drop a database out from under a launch in progress.
 *
 * Returns null if the query fails — the caller must then skip the sweep rather
 * than act on a partial list.
 */
export function expectedDbIdentifiers(): string[] | null {
  try {
    const rows = getDb()
      .prepare("SELECT subdomain FROM sites WHERE status IN ('running', 'creating')")
      .all() as { subdomain: string }[];
    return rows.map((r) => siteDbIdentifier(r.subdomain));
  } catch (err) {
    console.error('[watchdog] Could not enumerate sites; skipping database sweep:', err);
    return null;
  }
}

/** Reclaim databases whose site is gone. Never runs on a partial keep list. */
export async function sweepOrphanedDatabases(): Promise<void> {
  const keep = expectedDbIdentifiers();
  // A missed sweep costs disk. A sweep with a wrong list destroys customer
  // data, so an empty or failed enumeration must do nothing at all.
  if (keep === null || keep.length === 0) return;

  for (const engine of ['mariadb', 'mysql']) {
    try {
      const { dropped } = await pruneDatabases(engine, keep);
      if (dropped.length) console.log(`[watchdog] Reclaimed ${dropped.length} orphaned ${engine} database(s)`);
    } catch (err: any) {
      console.error(`[watchdog] Database sweep failed for ${engine}:`, err.message);
    }
  }
}
```

Then call it at the end of `cleanupOrphanedContainers`, after the image prune:

```ts
  try {
    await sweepOrphanedDatabases();
  } catch (err) {
    console.error('[watchdog] Database sweep error:', err);
  }
```

- [ ] **Step 6: Run the suites to verify they pass**

Run: `cd packages/api && npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no TypeScript output.

If the cross-package import of `siteDbIdentifier` fails to typecheck, copy the
function into `packages/api/src/utils/dbIdentifier.ts` with a comment pointing
at `packages/provisioner/src/shared-db.ts` as the source of truth, and add a
test asserting both produce the same value for `golden-star-579af1`. Do not
leave the two able to drift silently.

- [ ] **Step 7: Commit**

```bash
git add packages/provisioner/src/index.ts packages/api/src/services/docker.service.ts packages/api/src/services/cleanup.service.ts packages/api/src/services/db-sweep.test.ts
git commit -m "feat: reclaim orphaned databases from the watchdog

A failed drop would otherwise leak a database permanently. The sweep runs from
the API because only it knows which sites should exist, including those in
`creating` whose database predates their container.

Guarded twice: only wp_-prefixed names are eligible, and a failed or empty
enumeration sweeps nothing rather than sending a list that would drop live
data."
```

---

### Task 5: Configuration and documentation

**Files:**
- Modify: `docker-compose.dokploy.yml`, `docker-compose.yml`
- Modify: `.env.dokploy.example`
- Modify: `guides/dokploy-deployment.md`, `guides/vps-deployment.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `SHARED_DB_ROOT_PASSWORD` read by the provisioner in Task 2.
- Produces: nothing.

- [ ] **Step 1: Add the variable to both compose files**

In the `provisioner` service of **both** `docker-compose.dokploy.yml` and `docker-compose.yml`, alongside `INTERNAL_KEY`:

```yaml
      # Root credentials for the shared database engines. Baked into each
      # engine's data volume the first time it starts — changing this later
      # does not change the running server's password.
      - SHARED_DB_ROOT_PASSWORD=${SHARED_DB_ROOT_PASSWORD:?Set SHARED_DB_ROOT_PASSWORD}
```

- [ ] **Step 2: Add it to the environment template**

In `.env.dokploy.example`, in the secrets block next to `PROVISIONER_INTERNAL_KEY`:

```
# Root password for the shared MySQL/MariaDB servers. Generate with
# `openssl rand -hex 32`.
#
# It is written into each engine's data volume when that engine first starts.
# Changing it afterwards does NOT change the running server's password — the
# panel will report the mismatch and name the volume to remove if you ever
# need to reset it.
SHARED_DB_ROOT_PASSWORD=
```

- [ ] **Step 3: Document the architecture in the Dokploy guide**

In `guides/dokploy-deployment.md`, add before `## Security: sites are isolated from your other apps`:

```markdown
## Databases

MySQL and MariaDB sites share one server per engine rather than each running
their own. A stock MySQL sidecar costs roughly 500 MB, so a site used to cost
~600 MB; it now costs ~100 MB plus one shared engine.

The engines (`wpl-db-mariadb`, `wpl-db-mysql`) start when a site first needs
them and stop when their last site is deleted, so an install that only uses
SQLite runs neither. The first launch of a given engine takes a few seconds
longer while it boots.

Each site gets its own database and user, with privileges scoped to that
database and connections capped. That is the same model as shared hosting: a
compromised site can reach its own data and no other site's, but it does hold
an account on a server storing other sites' databases — a deliberate trade
against running a 500 MB server per site.

Databases whose site no longer exists are reclaimed by the watchdog every five
minutes.
```

- [ ] **Step 4: Note the same in the standalone guide**

In `guides/vps-deployment.md`, add a short paragraph in whichever section covers site databases:

```markdown
MySQL and MariaDB sites share one server per engine, started on demand and
stopped when idle. Set `SHARED_DB_ROOT_PASSWORD` in `.env`; it is written into
the engine's data volume on first start and cannot be changed by editing the
variable afterwards.
```

- [ ] **Step 5: Update CLAUDE.md**

Replace the `Docker Container Setup` bullet reading `Optional MySQL/MariaDB sidecar container (wp-db-{subdomain})` with:

```
- MySQL/MariaDB sites get a database and user on a **shared** engine
  (`wpl-db-mysql` / `wpl-db-mariadb`), started on demand and stopped when their
  last site goes. Identifiers come from `provisioner/src/shared-db.ts`
  (`siteDbIdentifier`), which fits MySQL's 32-char username limit. Sites created
  before this carry `wp-launcher.db-container` and still own a sidecar; teardown
  handles both. Requires `SHARED_DB_ROOT_PASSWORD`
```

- [ ] **Step 6: Check for stale references**

```bash
cd "e:/MSR Builds/Products/WP Launcher/App/wp-launcher"
grep -rn "wp-db-{subdomain}\|sidecar" CLAUDE.md guides/ .env.dokploy.example
```

Expected: only descriptions of the legacy behaviour that explicitly say it applies to sites created before this change. Any text presenting a per-site sidecar as current is now wrong.

- [ ] **Step 7: Validate and commit**

```bash
docker compose -f docker-compose.yml config > /dev/null && echo "standalone OK"
git add -A
git commit -m "docs: shared database servers and SHARED_DB_ROOT_PASSWORD

Records that MySQL/MariaDB sites now share one engine each, what that costs in
isolation, and that the root password is fixed in the volume at first start."
```

---

## Done when

- `cd packages/provisioner && npx vitest run` and `cd packages/api && npx vitest run` both pass.
- Both compose files validate.
- The verification checklist in the spec passes on a real host — in particular items 4, 5 and 8: Adminer shows a site **only** its own database, deleting one site leaves the others working, and a planted `wp_orphan_test` database is reclaimed while live ones survive.

Nothing in CI can observe memory or cross-site data exposure. Do not report this complete on unit tests alone; the numbers that justify the change (`docker stats` showing one engine instead of N sidecars) only exist on a real deployment.
