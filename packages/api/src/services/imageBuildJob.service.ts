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
