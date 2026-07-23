import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tar from 'tar-fs';
import { getDb } from '../utils/db';
import { generateDockerfile, baseImageTag, wpVersionForPhp, CustomBuildSpec } from './imageBuild.service';
import { buildImageStream, listWplImages } from './docker.service';

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

// --- Build runner ---

// wordpressContextDir is the API's read-only /app/wordpress mount (config.wordpressDir).
// tar.pack() reads the directory lazily. If the build call settles without
// fully draining it (an early failure, or a mocked consumer in tests), the pack
// stream keeps scanning and can hit the context dir after cleanup — an unhandled
// 'error' that would crash the process. So we always attach an error handler and
// destroy the stream once the build call settles, before the caller removes the dir.
async function packAndBuild(
  contextDir: string, tag: string, buildargs: Record<string, string>, onLine: (l: string) => void,
): Promise<void> {
  const stream = tar.pack(contextDir);
  stream.on('error', () => { /* pack aborted (e.g. context removed) — non-fatal */ });
  try {
    await buildImageStream(stream, tag, buildargs, onLine);
  } finally {
    stream.destroy();
  }
}

async function buildBaseImage(php: string, wordpressContextDir: string, onLine: (l: string) => void): Promise<void> {
  const tag = baseImageTag(php);
  const wp = wpVersionForPhp(php);
  onLine(`\n=== Building base image ${tag} (PHP ${php}, WP ${wp}) ===`);
  await packAndBuild(wordpressContextDir, tag, { PHP_VERSION: php, WP_VERSION: wp }, onLine);
}

async function buildCustomImage(spec: CustomBuildSpec, tag: string, contextDir: string, onLine: (l: string) => void): Promise<void> {
  fs.writeFileSync(path.join(contextDir, 'Dockerfile'), generateDockerfile(spec));
  onLine(`\n=== Building ${tag} ===`);
  await packAndBuild(contextDir, tag, {}, onLine);
}

/**
 * Execute a build job. `wordpressContextDir` is the API's /app/wordpress mount;
 * `contextDir` (custom only) is a temp dir the route pre-populated with uploaded
 * zips. Deletes that temp dir when done. A custom build whose base image is
 * missing builds the base first, in the same job.
 */
export async function runBuildJob(id: string, wordpressContextDir: string, contextDir?: string): Promise<void> {
  const job = getBuildJob(id);
  if (!job) return;
  markBuilding(id);
  const onLine = (l: string) => appendLog(id, l.endsWith('\n') ? l : l + '\n');
  // The route supplies a pre-populated context dir only when there are uploaded
  // zips to place; otherwise the runner makes its own. Either way it owns cleanup.
  let cleanupDir = contextDir;
  try {
    const spec = JSON.parse(job.spec || '{}');
    if (job.kind === 'base') {
      await buildBaseImage(spec.phpVersion, wordpressContextDir, onLine);
    } else {
      const images = await listWplImages();
      if (!images.some((i) => i.tag === baseImageTag(spec.phpVersion))) {
        await buildBaseImage(spec.phpVersion, wordpressContextDir, onLine);
      }
      if (!cleanupDir) cleanupDir = makeTempContextDir();
      await buildCustomImage(spec, job.tag, cleanupDir, onLine);
    }
    finishJob(id, 'success', null);
  } catch (err: any) {
    onLine(`\nERROR: ${err.message}`);
    finishJob(id, 'failed', err.message);
  } finally {
    if (cleanupDir) {
      try { fs.rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}

// Serialize builds: chain each onto the previous so only one runs at a time.
let queue: Promise<void> = Promise.resolve();
export function enqueueBuild(id: string, wordpressContextDir: string, contextDir?: string): void {
  queue = queue.then(() => runBuildJob(id, wordpressContextDir, contextDir)).catch(() => { /* logged on the row */ });
}

export function makeTempContextDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-build-'));
}
