# Panel Docker Image Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins build and manage WordPress Docker images from the panel — base PHP variants and custom images with plugins/themes baked in — as background jobs with live logs, and let blueprints select a built image.

**Architecture:** The API assembles each build context (a generated Dockerfile plus any uploaded `.zip` files) into a temp directory, packs it into a tar with `tar-fs`, and streams it to a new provisioner endpoint that pipes it to Dockerode's `buildImage` and streams the build output back. The API runs builds as serialized background jobs, appending output to an `image_builds` SQLite row; the dashboard polls that row for a live log. No shared volumes and no docker-compose changes.

**Tech Stack:** Node/Express, Dockerode (provisioner only), `tar-fs` (new API dep), better-sqlite3, React + Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-07-24-panel-image-management-design.md`

---

## File structure

**API (`packages/api/src`)**
- `services/imageBuild.service.ts` (create) — pure functions: tag/name sanitization, PHP→WP base pairing, and Dockerfile generation from a build spec. No I/O, fully unit-tested. Port of `scripts/build-wp-image.sh` logic.
- `services/imageBuildJob.service.ts` (create) — `image_builds` DB CRUD + state machine, the serial build queue, and the async build runner (assemble context dir, pack tar, call provisioner stream, append log, set status). Plus a startup reconciler.
- `services/docker.service.ts` (modify) — add `buildImageStream()`, `removeImage()`, `listWplImages()`.
- `routes/images.ts` (create) — `/api/admin/images` routes.
- `utils/db.ts` (modify) — add `image_builds` table DDL + startup reconciler call.
- `index.ts` (modify) — mount the images router.
- `test-helpers/db.ts` (modify) — add `image_builds` to the in-memory schema.

**Provisioner (`packages/provisioner/src/index.ts`, modify)**
- `POST /images/build-stream` — tar body -> `docker.buildImage` -> pipe output.
- `POST /images/remove` — `{ tag }` -> remove image.
- `GET /images` — list `wp-launcher/*` images.

**Dashboard (`packages/dashboard/src`)**
- `pages/admin/ImagesPage.tsx` (create) — Base / Custom / Builds sections.
- `pages/admin/images/BuildImageDialog.tsx` (create) — build form (reuses `PluginRepeater`/`ThemeRepeater`).
- `pages/admin/images/BuildLogPanel.tsx` (create) — polling log viewer.
- `main.tsx` (modify) — add `/images` route under `RequireAdmin`.
- `components/shell/nav-items.ts` (modify) — add Images to the Settings group.
- `pages/BlueprintEditorPage.tsx` (modify) — `docker.image` becomes a dropdown.

---

## Task 1: `image_builds` table

**Files:**
- Modify: `packages/api/src/utils/db.ts` (DDL block + a `reconcileStuckImageBuilds` call in `initDb`)
- Modify: `packages/api/src/test-helpers/db.ts` (add table to in-memory schema)

- [ ] **Step 1: Add the table to the production schema.** In `packages/api/src/utils/db.ts`, inside the schema string (near the other `CREATE TABLE IF NOT EXISTS` statements), add:

```sql
    CREATE TABLE IF NOT EXISTS image_builds (
      id TEXT PRIMARY KEY,
      tag TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      log TEXT NOT NULL DEFAULT '',
      error TEXT,
      spec TEXT,
      created_by TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

- [ ] **Step 2: Add the same table to the test helper.** In `packages/api/src/test-helpers/db.ts`, add an `IMAGE_BUILDS_TABLE` DDL string (same columns, minus `IF NOT EXISTS`) and include it in the `for (const ddl of [ ... ])` array in `createTestDb()`.

- [ ] **Step 3: Run the existing db test.**

Run: `cd packages/api && npx vitest run src/test-helpers/db.test.ts`
Expected: PASS. If `db.test.ts` asserts table names, add `'image_builds'` to its expected array in sorted position.

- [ ] **Step 4: Commit.**

```bash
git add packages/api/src/utils/db.ts packages/api/src/test-helpers/db.ts packages/api/src/test-helpers/db.test.ts
git commit -m "feat(images): add image_builds table"
```

---

## Task 2: Tag sanitization + PHP/WP pairing (pure)

**Files:**
- Create: `packages/api/src/services/imageBuild.service.ts`
- Test: `packages/api/src/services/imageBuild.service.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeImageTag, wpVersionForPhp, IMAGE_PREFIX } from './imageBuild.service';

describe('sanitizeImageTag', () => {
  it('builds a prefixed, slugged tag with a default :latest', () => {
    expect(sanitizeImageTag('My Shop!')).toBe('wp-launcher/my-shop:latest');
  });
  it('honours an explicit tag and slugs it', () => {
    expect(sanitizeImageTag('Shop', 'v2 RC')).toBe('wp-launcher/shop:v2-rc');
  });
  it('rejects an empty slug', () => {
    expect(() => sanitizeImageTag('!!!')).toThrow();
  });
  it('never allows path traversal', () => {
    expect(sanitizeImageTag('../evil')).toBe('wp-launcher/evil:latest');
  });
});

describe('wpVersionForPhp', () => {
  it('pairs 7.4 with WP 6.1', () => { expect(wpVersionForPhp('7.4')).toBe('6.1'); });
  it('pairs 8.x with the default WP', () => { expect(wpVersionForPhp('8.3')).toBe('6.9'); });
  it('rejects unknown php versions', () => { expect(() => wpVersionForPhp('9.9')).toThrow(); });
});

it('exposes the namespace prefix', () => { expect(IMAGE_PREFIX).toBe('wp-launcher/'); });
```

- [ ] **Step 2: Run to confirm it fails** (`function not defined`).

Run: `cd packages/api && npx vitest run src/services/imageBuild.service.test.ts`

- [ ] **Step 3: Implement.** Create `packages/api/src/services/imageBuild.service.ts`:

```ts
import { ValidationError } from '../utils/errors';

export const IMAGE_PREFIX = 'wp-launcher/';
export const DEFAULT_PHP = '8.3';
export const DEFAULT_WP = '6.9';
export const ALL_PHP_VERSIONS = ['8.3', '8.2', '8.1', '7.4'] as const;
export type PhpVersion = typeof ALL_PHP_VERSIONS[number];

/** WP 6.9 only ships PHP 8.x base images; 7.4 must use WP 6.1's last 7.4 tag. */
export function wpVersionForPhp(php: string): string {
  if (!ALL_PHP_VERSIONS.includes(php as PhpVersion)) {
    throw new ValidationError(`Unsupported PHP version: ${php}`);
  }
  return php === '7.4' ? '6.1' : DEFAULT_WP;
}

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** Returns a safe `wp-launcher/<slug>:<tag>` image reference. */
export function sanitizeImageTag(name: string, tag = 'latest'): string {
  const s = slug(name);
  if (!s) throw new ValidationError('Image name must contain letters or numbers');
  const t = slug(tag) || 'latest';
  return `${IMAGE_PREFIX}${s}:${t}`;
}

/** The tag for a base image of a given PHP version. */
export function baseImageTag(php: string): string {
  wpVersionForPhp(php); // validates
  return `${IMAGE_PREFIX}wordpress:php${php}`;
}
```

> Confirm `ValidationError` exists in `packages/api/src/utils/errors.ts`; if the codebase uses a different error pattern, match it (grep `class ValidationError`).

- [ ] **Step 4: Run tests -> PASS.**

- [ ] **Step 5: Commit.**

```bash
git add packages/api/src/services/imageBuild.service.ts packages/api/src/services/imageBuild.service.test.ts
git commit -m "feat(images): tag sanitization and php/wp pairing"
```

---

## Task 3: Dockerfile generation from a spec (the porting hotspot)

**Files:**
- Modify: `packages/api/src/services/imageBuild.service.ts`
- Modify: `packages/api/src/services/imageBuild.service.test.ts`

- [ ] **Step 1: Write the failing test.** Append to `imageBuild.service.test.ts`:

```ts
import { generateDockerfile } from './imageBuild.service';

describe('generateDockerfile', () => {
  const base = { kind: 'custom' as const, name: 'shop', phpVersion: '8.3', plugins: [], themes: [] };

  it('starts FROM the correct base image', () => {
    expect(generateDockerfile(base)).toMatch(/^FROM wp-launcher\/wordpress:php8\.3\n/);
  });
  it('adds a wordpress.org plugin via curl', () => {
    const df = generateDockerfile({ ...base, plugins: [{ source: 'wordpress.org', slug: 'woocommerce' }] });
    expect(df).toContain('downloads.wordpress.org/plugin/woocommerce.latest-stable.zip');
    expect(df).toContain('/usr/src/wordpress/wp-content/plugins/');
  });
  it('copies a local plugin zip placed in the context', () => {
    const df = generateDockerfile({ ...base, plugins: [{ source: 'local', filename: 'my-plugin.zip' }] });
    expect(df).toContain('COPY my-plugin.zip /tmp/my-plugin.zip');
    expect(df).toContain('unzip /tmp/my-plugin.zip -d /usr/src/wordpress/wp-content/plugins/');
  });
  it('adds a theme URL install', () => {
    const df = generateDockerfile({ ...base, themes: [{ source: 'url', url: 'https://ex.com/t.zip' }] });
    expect(df).toContain('curl -L "https://ex.com/t.zip"');
    expect(df).toContain('/usr/src/wordpress/wp-content/themes/');
  });
  it('ignores sources with missing fields', () => {
    const df = generateDockerfile({ ...base, plugins: [{ source: 'wordpress.org' }] });
    expect(df.trim()).toBe('FROM wp-launcher/wordpress:php8.3');
  });
});
```

- [ ] **Step 2: Run -> FAIL.**

- [ ] **Step 3: Implement `generateDockerfile`** in `imageBuild.service.ts`. Port the plugin/theme steps from `scripts/build-wp-image.sh`. Local files are referenced by `filename` only (the caller placed the zip in the context). **Verify the install path `/usr/src/wordpress/wp-content/...` against `wordpress/Dockerfile` before finalizing** (the upstream `wordpress` image stages content at `/usr/src/wordpress`):

```ts
export interface BuildSource {
  source: 'wordpress.org' | 'url' | 'local';
  slug?: string;
  url?: string;
  filename?: string;
}
export interface CustomBuildSpec {
  kind: 'custom';
  name: string;
  tag?: string;
  phpVersion: string;
  plugins: BuildSource[];
  themes: BuildSource[];
}

function installBlock(kind: 'plugins' | 'themes', sources: BuildSource[]): string {
  const dest = `/usr/src/wordpress/wp-content/${kind}/`;
  const wpType = kind === 'plugins' ? 'plugin' : 'theme';
  const lines: string[] = [];
  for (const s of sources) {
    if (s.source === 'wordpress.org' && s.slug) {
      const slug = s.slug.replace(/[^a-z0-9-]/gi, '');
      lines.push(
        `RUN curl -L "https://downloads.wordpress.org/${wpType}/${slug}.latest-stable.zip" -o /tmp/${slug}.zip \\n` +
        `    && unzip /tmp/${slug}.zip -d ${dest} && rm /tmp/${slug}.zip`,
      );
    } else if (s.source === 'url' && s.url) {
      const file = (s.url.split('/').pop() || 'download.zip').replace(/[^a-z0-9._-]/gi, '_');
      lines.push(
        `RUN curl -L "${s.url}" -o /tmp/${file} \\n` +
        `    && unzip /tmp/${file} -d ${dest} && rm /tmp/${file}`,
      );
    } else if (s.source === 'local' && s.filename) {
      const file = s.filename.replace(/[^a-z0-9._-]/gi, '_');
      lines.push(`COPY ${file} /tmp/${file}\nRUN unzip /tmp/${file} -d ${dest} && rm /tmp/${file}`);
    }
  }
  return lines.join('\n');
}

export function generateDockerfile(spec: CustomBuildSpec): string {
  const parts = [`FROM ${baseImageTag(spec.phpVersion)}`];
  const plugins = installBlock('plugins', spec.plugins);
  const themes = installBlock('themes', spec.themes);
  if (plugins) parts.push(plugins);
  if (themes) parts.push(themes);
  return parts.join('\n') + '\n';
}
```

- [ ] **Step 4: Run -> PASS.**

- [ ] **Step 5: Commit.**

```bash
git add packages/api/src/services/imageBuild.service.ts packages/api/src/services/imageBuild.service.test.ts
git commit -m "feat(images): generate Dockerfile from a build spec"
```

---

## Task 4: API docker.service helpers (stream build, remove, list)

**Files:**
- Modify: `packages/api/src/services/docker.service.ts`

These bypass `provisionerFetch`'s JSON assumptions (the build streams a body up and a body down). `PROVISIONER_URL`, `INTERNAL_KEY`, `provisionerFetch`, and `parseJson` already exist in this file.

- [ ] **Step 1: Add `buildImageStream`, `removeImage`, `listWplImages`.** Append to `docker.service.ts`:

```ts
import { Readable } from 'node:stream';

export interface WplImage { tag: string; id: string; size: number; created: number; }

/**
 * Stream a tar build context to the provisioner and relay the build output.
 * `onLine` receives each decoded output line. Resolves on success; rejects on a build error.
 */
export async function buildImageStream(
  tar: Readable,
  tag: string,
  buildargs: Record<string, string>,
  onLine: (line: string) => void,
): Promise<void> {
  const url = `${PROVISIONER_URL}/images/build-stream?tag=${encodeURIComponent(tag)}` +
    `&buildargs=${encodeURIComponent(JSON.stringify(buildargs))}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-tar',
      ...(INTERNAL_KEY ? { 'x-internal-key': INTERNAL_KEY } : {}),
    },
    body: Readable.toWeb(tar) as any,
    // @ts-expect-error Node fetch requires duplex for a streamed body
    duplex: 'half',
  });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Build failed to start: ${msg}`);
  }
  // Provisioner relays docker build output as newline-delimited JSON.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let buildError: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const raw = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw);
        if (obj.stream) onLine(obj.stream.replace(/\n$/, ''));
        else if (obj.error) buildError = obj.error;
      } catch {
        onLine(raw);
      }
    }
  }
  if (buildError) throw new Error(buildError);
}

export async function removeImage(tag: string): Promise<void> {
  await provisionerFetch('/images/remove', { method: 'POST', body: JSON.stringify({ tag }) });
}

export async function listWplImages(): Promise<WplImage[]> {
  const res = await provisionerFetch('/images');
  return await parseJson<WplImage[]>(res);
}
```

> If `node:stream` is already imported at the top, merge the import. If `provisionerFetch` returns an already-parsed body (not a `Response`), adapt `listWplImages` to its real signature — read the existing function first.

- [ ] **Step 2: Typecheck.**

Run: `cd packages/api && npx tsc --noEmit`
Expected: no errors. (Exercised via the job-runner test in Task 7 with a mocked provisioner.)

- [ ] **Step 3: Commit.**

```bash
git add packages/api/src/services/docker.service.ts
git commit -m "feat(images): provisioner client helpers for build/remove/list"
```

---

## Task 5: Provisioner endpoints (build-stream, remove, list)

**Files:**
- Modify: `packages/provisioner/src/index.ts`

`express.json()` only parses `application/json`, so an `application/x-tar` body reaches the handler as an untouched readable stream. Dockerode's `buildImage` accepts that stream directly. `validateImage`, `ALLOWED_IMAGE_PREFIX`, and `docker` (the Dockerode instance) already exist in this file.

- [ ] **Step 1: Add the three endpoints** near the existing `POST /images/build` (~line 794):

```ts
// Build from a streamed tar context, relaying docker's output back to the caller.
app.post('/images/build-stream', async (req: Request, res: Response) => {
  try {
    const tag = String(req.query.tag || '');
    if (!validateImage(tag)) {
      res.status(400).json({ error: `Image tag must start with "${ALLOWED_IMAGE_PREFIX}"` });
      return;
    }
    let buildargs: Record<string, string> = {};
    try { buildargs = JSON.parse(String(req.query.buildargs || '{}')); } catch { /* ignore */ }

    const stream = await docker.buildImage(req as any, { t: tag, buildargs });
    res.setHeader('Content-Type', 'application/x-ndjson');
    stream.pipe(res); // docker emits newline-delimited JSON; the API parses it
    stream.on('error', () => { try { res.end(); } catch { /* already closed */ } });
  } catch (err: any) {
    console.error('[provisioner] build-stream error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

app.post('/images/remove', async (req: Request, res: Response) => {
  try {
    const { tag } = req.body;
    if (!validateImage(tag)) {
      res.status(400).json({ error: `Image must start with "${ALLOWED_IMAGE_PREFIX}"` });
      return;
    }
    await docker.getImage(tag).remove({ force: false });
    res.json({ status: 'removed', tag });
  } catch (err: any) {
    if (err.statusCode === 404) { res.status(404).json({ error: 'Image not found' }); return; }
    if (err.statusCode === 409) { res.status(409).json({ error: 'Image is in use by a container' }); return; }
    console.error('[provisioner] image remove error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/images', async (_req: Request, res: Response) => {
  try {
    const list = await docker.listImages();
    const out: { tag: string; id: string; size: number; created: number }[] = [];
    for (const img of list || []) {
      for (const tag of img.RepoTags || []) {
        if (tag.startsWith(ALLOWED_IMAGE_PREFIX)) {
          out.push({
            tag,
            id: (img.Id || '').replace('sha256:', '').substring(0, 12),
            size: img.Size || 0,
            created: img.Created || 0,
          });
        }
      }
    }
    res.json(out);
  } catch (err: any) {
    console.error('[provisioner] images list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Typecheck the provisioner.**

Run: `cd packages/provisioner && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add packages/provisioner/src/index.ts
git commit -m "feat(images): provisioner build-stream, remove, and list endpoints"
```

---

## Task 6: Job service — CRUD + state machine

**Files:**
- Create: `packages/api/src/services/imageBuildJob.service.ts`
- Test: `packages/api/src/services/imageBuildJob.service.test.ts`

Uses the DB test helper + `__setDbForTesting`, mirroring `settings.service.test.ts`. `getDb()` is exported from `utils/db.ts`.

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import {
  createBuildJob, getBuildJob, listBuildJobs, appendLog, finishJob, reconcileStuckImageBuilds,
} from './imageBuildJob.service';

let db: Database.Database;
beforeEach(() => { db = createTestDb(); __setDbForTesting(db); });
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('imageBuildJob.service', () => {
  it('creates a queued job and reads it back', () => {
    const job = createBuildJob({ tag: 'wp-launcher/x:latest', kind: 'custom', spec: {}, createdBy: 'u1' });
    expect(job.status).toBe('queued');
    expect(getBuildJob(job.id)?.tag).toBe('wp-launcher/x:latest');
  });
  it('appends log lines and finishes success', () => {
    const job = createBuildJob({ tag: 'wp-launcher/x:latest', kind: 'custom', spec: {}, createdBy: 'u1' });
    appendLog(job.id, 'Step 1/2\n');
    appendLog(job.id, 'Step 2/2\n');
    finishJob(job.id, 'success', null);
    const done = getBuildJob(job.id)!;
    expect(done.status).toBe('success');
    expect(done.log).toContain('Step 1/2');
    expect(done.completed_at).toBeTruthy();
  });
  it('records a failure message', () => {
    const job = createBuildJob({ tag: 'wp-launcher/x:latest', kind: 'base', spec: {}, createdBy: 'u1' });
    finishJob(job.id, 'failed', 'boom');
    expect(getBuildJob(job.id)!.error).toBe('boom');
  });
  it('reconciles stuck jobs on startup', () => {
    const a = createBuildJob({ tag: 'wp-launcher/a:latest', kind: 'base', spec: {}, createdBy: 'u1' });
    db.prepare("UPDATE image_builds SET status='building' WHERE id=?").run(a.id);
    reconcileStuckImageBuilds();
    expect(getBuildJob(a.id)!.status).toBe('failed');
  });
  it('lists newest first', () => {
    createBuildJob({ tag: 'wp-launcher/a:latest', kind: 'base', spec: {}, createdBy: 'u1' });
    createBuildJob({ tag: 'wp-launcher/b:latest', kind: 'base', spec: {}, createdBy: 'u1' });
    expect(listBuildJobs(10).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run -> FAIL.**

- [ ] **Step 3: Implement CRUD + state machine** in `imageBuildJob.service.ts` (leave the runner for Task 7):

```ts
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';

export type BuildStatus = 'queued' | 'building' | 'success' | 'failed';
export interface ImageBuildRow {
  id: string; tag: string; kind: 'base' | 'custom'; status: BuildStatus;
  log: string; error: string | null; spec: string | null; created_by: string | null;
  started_at: string | null; completed_at: string | null; created_at: string;
}

export function createBuildJob(input: {
  tag: string; kind: 'base' | 'custom'; spec: unknown; createdBy: string;
}): ImageBuildRow {
  const db = getDb();
  const id = uuidv4();
  db.prepare(`INSERT INTO image_builds (id, tag, kind, status, spec, created_by)
              VALUES (?, ?, ?, 'queued', ?, ?)`)
    .run(id, input.tag, input.kind, JSON.stringify(input.spec ?? {}), input.createdBy);
  return getBuildJob(id)!;
}

export function getBuildJob(id: string): ImageBuildRow | undefined {
  return getDb().prepare('SELECT * FROM image_builds WHERE id = ?').get(id) as ImageBuildRow | undefined;
}

export function listBuildJobs(limit = 20): ImageBuildRow[] {
  return getDb().prepare('SELECT * FROM image_builds ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit) as ImageBuildRow[];
}

export function markBuilding(id: string): void {
  getDb().prepare("UPDATE image_builds SET status='building', started_at=datetime('now') WHERE id=?").run(id);
}

export function appendLog(id: string, chunk: string): void {
  getDb().prepare('UPDATE image_builds SET log = log || ? WHERE id = ?').run(chunk, id);
}

export function finishJob(id: string, status: 'success' | 'failed', error: string | null): void {
  getDb().prepare("UPDATE image_builds SET status=?, error=?, completed_at=datetime('now') WHERE id=?")
    .run(status, error, id);
}

/** On startup any 'queued'/'building' job is orphaned (the runner is in-process). */
export function reconcileStuckImageBuilds(): void {
  getDb().prepare(
    "UPDATE image_builds SET status='failed', error='Interrupted by a server restart', " +
    "completed_at=datetime('now') WHERE status IN ('queued','building')",
  ).run();
}
```

> Confirm the uuid import style matches other services (`import { v4 as uuidv4 } from 'uuid'` vs `randomUUID`).

- [ ] **Step 4: Run -> PASS.**

- [ ] **Step 5: Wire the reconciler into startup.** In `packages/api/src/utils/db.ts`, at the end of `initDb()` (after schema/migrations), import lazily to avoid a cycle:

```ts
  // Any build job left mid-flight by a restart can never resume; fail it.
  try { require('../services/imageBuildJob.service').reconcileStuckImageBuilds(); } catch { /* older DBs may lack the table */ }
```

- [ ] **Step 6: Commit.**

```bash
git add packages/api/src/services/imageBuildJob.service.ts packages/api/src/services/imageBuildJob.service.test.ts packages/api/src/utils/db.ts
git commit -m "feat(images): build-job persistence and state machine"
```

---

## Task 7: Job service — the async build runner (serialized)

**Files:**
- Modify: `packages/api/src/services/imageBuildJob.service.ts`
- Modify: `packages/api/src/services/imageBuildJob.service.test.ts`
- Add dep: `tar-fs`

- [ ] **Step 1: Add the tar dependency.**

Run: `cd packages/api && npm install tar-fs && npm install -D @types/tar-fs`

- [ ] **Step 2: Write the failing test** with a mocked docker.service (no real Docker). Put `vi.mock` at the top of the file, above the other imports:

```ts
import { vi } from 'vitest';

vi.mock('./docker.service', () => ({
  listWplImages: vi.fn(async () => [{ tag: 'wp-launcher/wordpress:php8.3', id: 'x', size: 1, created: 1 }]),
  buildImageStream: vi.fn(async (_tar, _tag, _args, onLine) => { onLine('Step 1/1 : FROM base'); }),
}));

import { runBuildJob } from './imageBuildJob.service';

it('runs a custom build to success and logs output', async () => {
  const job = createBuildJob({
    tag: 'wp-launcher/shop:latest', kind: 'custom', createdBy: 'u1',
    spec: { kind: 'custom', name: 'shop', phpVersion: '8.3', plugins: [], themes: [] },
  });
  await runBuildJob(job.id, '/app/wordpress');
  const done = getBuildJob(job.id)!;
  expect(done.status).toBe('success');
  expect(done.log).toContain('Step 1/1');
});

it('marks failure when the build stream throws', async () => {
  const mod = await import('./docker.service');
  (mod.buildImageStream as any).mockRejectedValueOnce(new Error('unzip failed'));
  const job = createBuildJob({
    tag: 'wp-launcher/shop2:latest', kind: 'custom', createdBy: 'u1',
    spec: { kind: 'custom', name: 'shop2', phpVersion: '8.3', plugins: [], themes: [] },
  });
  await runBuildJob(job.id, '/app/wordpress');
  const done = getBuildJob(job.id)!;
  expect(done.status).toBe('failed');
  expect(done.error).toContain('unzip failed');
});
```

> The custom path calls `makeTempContextDir()` (real fs) and `fs.rmSync` in `finally` — fine in a test. No zips are placed, so `tar.pack` just tars a Dockerfile.

- [ ] **Step 3: Implement `runBuildJob` + `enqueueBuild` + `makeTempContextDir`** in `imageBuildJob.service.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tar from 'tar-fs';
import { generateDockerfile, baseImageTag, wpVersionForPhp, CustomBuildSpec } from './imageBuild.service';
import { buildImageStream, listWplImages } from './docker.service';

// wordpressContextDir is the API's read-only /app/wordpress mount (config.wordpressDir).
async function buildBaseImage(php: string, wordpressContextDir: string, onLine: (l: string) => void): Promise<void> {
  const tag = baseImageTag(php);
  const wp = wpVersionForPhp(php);
  onLine(`\n=== Building base image ${tag} (PHP ${php}, WP ${wp}) ===`);
  const stream = tar.pack(wordpressContextDir);
  await buildImageStream(stream, tag, { PHP_VERSION: php, WP_VERSION: wp }, onLine);
}

async function buildCustomImage(spec: CustomBuildSpec, tag: string, contextDir: string, onLine: (l: string) => void): Promise<void> {
  fs.writeFileSync(path.join(contextDir, 'Dockerfile'), generateDockerfile(spec));
  onLine(`\n=== Building ${tag} ===`);
  const stream = tar.pack(contextDir);
  await buildImageStream(stream, tag, {}, onLine);
}

/**
 * Execute a build job. `wordpressContextDir` is the API's /app/wordpress mount;
 * `contextDir` (custom only) is a temp dir the route pre-populated with uploaded
 * zips. Deletes that temp dir when done.
 */
export async function runBuildJob(id: string, wordpressContextDir: string, contextDir?: string): Promise<void> {
  const job = getBuildJob(id);
  if (!job) return;
  markBuilding(id);
  const onLine = (l: string) => appendLog(id, l.endsWith('\n') ? l : l + '\n');
  try {
    const spec = JSON.parse(job.spec || '{}');
    if (job.kind === 'base') {
      await buildBaseImage(spec.phpVersion, wordpressContextDir, onLine);
    } else {
      const images = await listWplImages();
      if (!images.some((i) => i.tag === baseImageTag(spec.phpVersion))) {
        await buildBaseImage(spec.phpVersion, wordpressContextDir, onLine);
      }
      await buildCustomImage(spec, job.tag, contextDir!, onLine);
    }
    finishJob(id, 'success', null);
  } catch (err: any) {
    onLine(`\nERROR: ${err.message}`);
    finishJob(id, 'failed', err.message);
  } finally {
    if (contextDir) { try { fs.rmSync(contextDir, { recursive: true, force: true }); } catch { /* ignore */ } }
  }
}

// Serialize builds: chain each onto the previous so only one runs at a time.
let queue: Promise<void> = Promise.resolve();
export function enqueueBuild(id: string, wordpressContextDir: string, contextDir?: string): void {
  queue = queue.then(() => runBuildJob(id, wordpressContextDir, contextDir)).catch(() => {});
}

export function makeTempContextDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-build-'));
}
```

- [ ] **Step 4: Run -> PASS.**

Run: `cd packages/api && npx vitest run src/services/imageBuildJob.service.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add packages/api/src/services/imageBuildJob.service.ts packages/api/src/services/imageBuildJob.service.test.ts packages/api/package.json packages/api/package-lock.json
git commit -m "feat(images): serialized async build runner"
```

---

## Task 8: API routes (`/api/admin/images`)

**Files:**
- Create: `packages/api/src/routes/images.ts`
- Modify: `packages/api/src/index.ts` (mount under adminLimiter)
- Modify: `packages/api/src/config.ts` (add `wordpressDir`)

- [ ] **Step 1: Add config.** The api service mounts `./wordpress:/app/wordpress:ro` (confirm in `docker-compose.yml`). Add to the exported config object in `config.ts`: `wordpressDir: process.env.WORDPRESS_DIR || '/app/wordpress',`. Confirm `dataDir` exists on config (used for the multer temp dir); if named differently, use the real name.

- [ ] **Step 2: Confirm the blueprint list helper.** Grep `blueprint.service` for a function returning all blueprints (e.g. `listBlueprints()`) and the shape of `docker.image`. Adjust the import/usage below to the real export name.

- [ ] **Step 3: Implement the router.** Create `packages/api/src/routes/images.ts`:

```ts
import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { adminAuth } from '../middleware/auth';
import { AuthRequest } from '../middleware/userAuth';
import { config } from '../config';
import { sanitizeImageTag, baseImageTag, ALL_PHP_VERSIONS, BuildSource } from '../services/imageBuild.service';
import {
  createBuildJob, getBuildJob, listBuildJobs, enqueueBuild, makeTempContextDir,
} from '../services/imageBuildJob.service';
import { listWplImages, removeImage } from '../services/docker.service';
import { listBlueprints } from '../services/blueprint.service';

const router = Router();
router.use(adminAuth);

const uploadDir = path.join(config.dataDir, 'uploads-tmp');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 100 * 1024 * 1024 } });

// GET / — built images + which blueprints use each
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const images = await listWplImages();
    const blueprints = listBlueprints();
    const usage = (tag: string) =>
      blueprints.filter((b: any) => b.docker?.image === tag).map((b: any) => b.id);
    res.json(images.map((i) => ({ ...i, usedByBlueprints: usage(i.tag) })));
  } catch {
    res.status(500).json({ error: 'Failed to list images' });
  }
});

router.get('/builds', (_req: AuthRequest, res: Response) => {
  res.json(listBuildJobs(30).map(({ log, spec, ...meta }) => meta)); // metadata only
});

router.get('/builds/:id', (req: AuthRequest, res: Response) => {
  const job = getBuildJob(req.params.id);
  if (!job) { res.status(404).json({ error: 'Build not found' }); return; }
  const { spec, ...rest } = job;
  res.json(rest); // includes log
});

// POST /builds — start a build (multipart: spec + optional plugin_files/theme_files)
router.post('/builds', upload.fields([
  { name: 'plugin_files', maxCount: 20 },
  { name: 'theme_files', maxCount: 20 },
]), (req: AuthRequest, res: Response) => {
  let spec: any;
  try { spec = JSON.parse(req.body.spec); } catch { res.status(400).json({ error: 'Invalid spec JSON' }); return; }

  if (spec.kind === 'base') {
    if (!ALL_PHP_VERSIONS.includes(spec.phpVersion)) { res.status(400).json({ error: 'Unsupported PHP version' }); return; }
    const job = createBuildJob({ tag: baseImageTag(spec.phpVersion), kind: 'base', spec, createdBy: req.userId || 'admin' });
    enqueueBuild(job.id, config.wordpressDir);
    res.json({ jobId: job.id, tag: job.tag });
    return;
  }

  // custom
  let tag: string;
  try { tag = sanitizeImageTag(spec.name, spec.tag); } catch (e: any) { res.status(400).json({ error: e.message }); return; }
  if (!ALL_PHP_VERSIONS.includes(spec.phpVersion)) { res.status(400).json({ error: 'Unsupported PHP version' }); return; }

  const ctx = makeTempContextDir();
  const files = req.files as { [f: string]: Express.Multer.File[] } | undefined;
  const place = (list: BuildSource[], uploaded?: Express.Multer.File[]) => {
    let u = 0;
    return list.map((s) => {
      if (s.source !== 'local') return s;
      const f = uploaded?.[u++];
      if (!f) return { source: 'local' as const };
      const name = path.basename(f.originalname).replace(/[^a-z0-9._-]/gi, '_');
      fs.copyFileSync(f.path, path.join(ctx, name));
      fs.unlinkSync(f.path);
      return { source: 'local' as const, filename: name };
    });
  };
  const finalSpec = {
    kind: 'custom', name: spec.name, tag: spec.tag, phpVersion: spec.phpVersion,
    plugins: place(spec.plugins || [], files?.plugin_files),
    themes: place(spec.themes || [], files?.theme_files),
  };
  const job = createBuildJob({ tag, kind: 'custom', spec: finalSpec, createdBy: req.userId || 'admin' });
  enqueueBuild(job.id, config.wordpressDir, ctx);
  res.json({ jobId: job.id, tag });
});

// DELETE /:tag — remove an image (guard against in-use)
router.delete('/:tag(*)', async (req: AuthRequest, res: Response) => {
  const tag = req.params.tag;
  const force = req.query.force === 'true';
  if (!force) {
    const used = listBlueprints().filter((b: any) => b.docker?.image === tag).map((b: any) => b.id);
    if (used.length) { res.status(409).json({ error: `In use by blueprint(s): ${used.join(', ')}` }); return; }
  }
  try {
    await removeImage(tag);
    res.json({ status: 'removed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

> Match the real `AuthRequest`/`req.userId` shape used by other JWT routes (grep `routes/projects.ts`). `adminAuth` accepts API key OR admin JWT; `req.userId || 'admin'` covers the API-key case.

- [ ] **Step 4: Mount it.** In `packages/api/src/index.ts`, near the other admin routers, add the import and:

```ts
import imagesRouter from './routes/images';
// ...
app.use('/api/admin/images', adminLimiter, imagesRouter);
```

Confirm `adminLimiter` is the actual limiter variable used for `/api/admin/*`.

- [ ] **Step 5: Typecheck + run full API suite.**

Run: `cd packages/api && npx tsc --noEmit && npx vitest run`
Expected: all green.

- [ ] **Step 6: Commit.**

```bash
git add packages/api/src/routes/images.ts packages/api/src/index.ts packages/api/src/config.ts
git commit -m "feat(images): /api/admin/images routes"
```

---

## Task 9: Dashboard — Images page, build dialog, log panel

**Files:**
- Create: `packages/dashboard/src/pages/admin/ImagesPage.tsx`
- Create: `packages/dashboard/src/pages/admin/images/BuildImageDialog.tsx`
- Create: `packages/dashboard/src/pages/admin/images/BuildLogPanel.tsx`
- Modify: `packages/dashboard/src/main.tsx`
- Modify: `packages/dashboard/src/components/shell/nav-items.ts`

Follow existing admin-page conventions: `apiFetch`, `Card`/`Button`/`Badge`/`Table` from `components/ui`, `useToast`, `useConfirm`. Reuse `PluginRepeater`/`ThemeRepeater` and their entry types exactly as `BlueprintEditorPage` does. Read `BlueprintEditorPage.tsx` first to copy the repeater wiring verbatim.

- [ ] **Step 1: `BuildLogPanel.tsx`** — props `{ jobId: string; onDone?: (status: string) => void }`. Poll `GET /api/admin/images/builds/:id` every 1500ms with `apiFetch`; render `data.log` in `<pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">` plus a status `Badge`. Stop the interval when status is `success`/`failed`; on stop call `onDone(status)` and fire `toast.success`/`toast.error` once. Clear the interval in the effect cleanup.

- [ ] **Step 2: `BuildImageDialog.tsx`** — props `{ open, onOpenChange, onStarted(jobId, tag) }`. A `Dialog` with: Name `Input`; PHP `Select` over the four versions; optional tag `Input`; `PluginRepeater` + `ThemeRepeater` bound to local `plugins`/`themes` state (same types as the blueprint editor). On submit build `FormData` (see snippet below), do NOT set `Content-Type` (browser sets the multipart boundary), POST to `/api/admin/images/builds`, read `{ jobId, tag }`, call `onStarted`, close.

```ts
const fd = new FormData();
const toSource = (e) => e.source === 'local'
  ? { source: 'local' }
  : e.source === 'url'
    ? { source: 'url', url: e.url }
    : { source: 'wordpress.org', slug: e.slug };
fd.append('spec', JSON.stringify({
  kind: 'custom', name, tag: tag || undefined, phpVersion,
  plugins: plugins.map(toSource), themes: themes.map(toSource),
}));
// append each local File IN THE SAME ORDER the 'local' entries appear
plugins.filter((e) => e.source === 'local' && e.file).forEach((e) => fd.append('plugin_files', e.file));
themes.filter((e) => e.source === 'local' && e.file).forEach((e) => fd.append('theme_files', e.file));
const res = await apiFetch('/api/admin/images/builds', { method: 'POST', body: fd });
```

Confirm the repeater stores the uploaded `File` under `file` — read `PluginRepeater.tsx`; use the real key.

- [ ] **Step 3: `ImagesPage.tsx`** — `useState` for `images`, `builds`, `activeJob`, dialog open. `load()` fetches `GET /api/admin/images` and `GET /api/admin/images/builds`. Three `Card` sections:
  - **Base Images:** map the four PHP versions; each row shows built? (is `wp-launcher/wordpress:php{v}` in `images`) + size; a Build/Rebuild `Button` POSTing `FormData` with only `spec = JSON({kind:'base', phpVersion})`, then `setActiveJob(jobId)`.
  - **Custom Images:** table of `images` whose tag is not `wp-launcher/wordpress:` prefixed (tag, size via a `formatBytes` helper, `usedByBlueprints`), a Delete `Button` guarded by `useConfirm`; on a 409, re-confirm and retry with `?force=true`. A **Build image** button opens `BuildImageDialog`.
  - **Builds:** list `builds` with status `Badge`; clicking one `setActiveJob(id)`.
  - When `activeJob` is set, render `<BuildLogPanel jobId={activeJob} onDone={() => load()} />`.

- [ ] **Step 4: Route + nav.**
  - `main.tsx`: import `ImagesPage`; inside the `<RequireAdmin>` route group add `<Route path="images" element={<ImagesPage />} />`.
  - `nav-items.ts`: import `Boxes` from `lucide-react`; in the Settings group items add `{ to: '/images', label: 'Images', icon: Boxes }`, gated like the other privileged settings items.

- [ ] **Step 5: Typecheck.** Run: `cd packages/dashboard && npx tsc --noEmit` — expect no errors.

- [ ] **Step 6: Commit.**

```bash
git add packages/dashboard/src/pages/admin/ImagesPage.tsx packages/dashboard/src/pages/admin/images/ packages/dashboard/src/main.tsx packages/dashboard/src/components/shell/nav-items.ts
git commit -m "feat(images): Images page, build dialog, and live log"
```

---

## Task 10: Blueprint editor image dropdown

**Files:**
- Modify: `packages/dashboard/src/pages/BlueprintEditorPage.tsx`

- [ ] **Step 1: Fetch built images.** On mount, `apiFetch('/api/admin/images')` -> `setImages(data)` (on failure keep `[]`). The editor is already admin-only, so the endpoint is reachable.

- [ ] **Step 2: Replace the `docker.image` text input** with a `Select`:
  - First option `value=""` labelled `Default (wp-launcher/wordpress:latest)` -> maps to an empty `docker.image` (unchanged launch behaviour).
  - One option per fetched image `tag`.
  - If the current saved value isn't in the list (legacy free-typed tag), include it as an extra option so save preserves it.
  - Preserve the existing save shape exactly — read how `docker` is written in the save handler and keep it.

- [ ] **Step 3: Typecheck.** Run: `cd packages/dashboard && npx tsc --noEmit`

- [ ] **Step 4: Commit.**

```bash
git add packages/dashboard/src/pages/BlueprintEditorPage.tsx
git commit -m "feat(images): blueprint image field is a dropdown of built images"
```

---

## Task 11: Build, deploy, end-to-end verification

- [ ] **Step 1: Build + deploy the three services.**

```bash
docker compose build api provisioner dashboard
docker compose up -d api provisioner dashboard
```

- [ ] **Step 2: Verify the new code is in the built images.**

```bash
docker compose exec -T api sh -c "grep -rl build-stream /app/dist | head"
docker compose exec -T provisioner sh -c "grep -rl images/build-stream /app/dist | head"
```
Expected: both print a path.

- [ ] **Step 3: Browser pass (owner session).**
  1. Go to Settings -> Images.
  2. Base Images: click Build on PHP 8.3; watch the log stream to `success`.
  3. Custom Images -> Build image: name `panel-test`, PHP 8.3, add a wordpress.org plugin (e.g. `hello-dolly`); build; watch the log; confirm `wp-launcher/panel-test:latest` appears.
  4. Blueprints -> New: the image dropdown lists `wp-launcher/panel-test:latest`; select it; save.
  5. Launch a site on that blueprint; confirm it starts.
  6. On Images, delete an unused custom image; confirm an in-use one is guarded (409 -> force prompt).
- [ ] **Step 4: Confirm restart-reconcile.** Start a build, immediately `docker compose restart api`; the job flips to `failed: Interrupted by a server restart`.

- [ ] **Step 5: Docs.** In `CLAUDE.md`, note images can now be built from the panel (Settings -> Images) and that `scripts/build-wp-image.sh` is now optional. Commit.

```bash
git add CLAUDE.md
git commit -m "docs: panel image management"
```

---

## Notes for the implementer

- **Streaming body caveat:** Node's `fetch` needs `duplex: 'half'` for a streamed request body (Task 4). If the runtime rejects the `Readable.toWeb` body, fall back to buffering the tar into a `Buffer` and sending that — the tars here are small.
- **`express.json()` and the tar body:** the provisioner's global `express.json()` ignores non-JSON content types, so the `application/x-tar` request reaches `/images/build-stream` unparsed. Do NOT add a body parser to that route.
- **Base image context:** `tar.pack(config.wordpressDir)` tars the read-only `/app/wordpress` mount. Confirm the base `wordpress/Dockerfile` accepts `PHP_VERSION`/`WP_VERSION` build-args (it does — that's what `build-wp-image.sh` passes).
- **One build at a time** (spec O1): the module-level `queue` chain in Task 7 serializes builds; a second POST returns its `jobId` immediately and the job sits `queued` until the previous finishes.
- **Verify-before-code:** several tasks say "grep/confirm the real name" — the plan's imports assume names (`listBlueprints`, `getDb`, `config.dataDir`, `adminLimiter`, `AuthRequest.userId`, `ValidationError`). Confirm each against the codebase in its task rather than trusting the plan blindly.
