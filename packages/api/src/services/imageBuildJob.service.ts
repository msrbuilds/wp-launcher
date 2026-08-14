import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import tar from 'tar-fs';
import { getDb } from '../utils/db';
import { baseImageTag } from './imageBuild.service';
import { buildImageStream } from './docker.service';

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

// tar.pack() reads the directory lazily. If the build call settles without fully
// draining it (an early failure, or a mocked consumer in tests), the pack stream
// keeps scanning — an unhandled 'error' that would crash the process. So we
// always attach an error handler and destroy the stream once it settles.
async function packAndBuild(
  contextDir: string, tag: string, buildargs: Record<string, string>, onLine: (l: string) => void,
): Promise<void> {
  // Check the context before streaming it. The error handler below swallows
  // tar.pack failures, so an unreadable or empty directory would otherwise be
  // sent as an empty tar and surface as Docker's "Cannot locate specified
  // Dockerfile" — which points at a missing file rather than the real cause.
  //
  // That cause is usually a stale bind mount: Dokploy deletes and re-clones
  // code/ on every redeploy, and a container that keeps running stays attached
  // to the deleted inode, so it sees an empty directory forever.
  if (!fs.existsSync(path.join(contextDir, 'Dockerfile'))) {
    throw new Error(
      `build context ${contextDir} has no Dockerfile — the directory is empty or its mount is stale. ` +
      'Restart the API container so the bind mount re-resolves, then retry.',
    );
  }
  const stream = tar.pack(contextDir);
  stream.on('error', () => { /* pack aborted — non-fatal */ });
  try {
    await buildImageStream(stream, tag, buildargs, onLine);
  } finally {
    stream.destroy();
  }
}

/**
 * Execute a base-image build job. `wordpressContextDir` is the API's read-only
 * /app/wordpress mount, tarred and streamed to the provisioner with the chosen
 * PHP/WP as build-args. Plugins and themes are a blueprint concern, not baked in.
 */
export async function runBuildJob(id: string, wordpressContextDir: string): Promise<void> {
  const job = getBuildJob(id);
  if (!job) return;
  markBuilding(id);
  const onLine = (l: string) => appendLog(id, l.endsWith('\n') ? l : l + '\n');
  try {
    const spec = JSON.parse(job.spec || '{}');
    const php = spec.phpVersion;
    const wp = spec.wpVersion;
    onLine(`\n=== Building ${job.tag} (PHP ${php}, WordPress ${wp}) ===`);
    await packAndBuild(wordpressContextDir, job.tag, { PHP_VERSION: php, WP_VERSION: wp }, onLine);
    finishJob(id, 'success', null);
  } catch (err: any) {
    onLine(`\nERROR: ${err.message}`);
    finishJob(id, 'failed', err.message);
  }
}

// Serialize builds: chain each onto the previous so only one runs at a time.
let queue: Promise<void> = Promise.resolve();
export function enqueueBuild(id: string, wordpressContextDir: string): void {
  queue = queue.then(() => runBuildJob(id, wordpressContextDir)).catch(() => { /* logged on the row */ });
}
