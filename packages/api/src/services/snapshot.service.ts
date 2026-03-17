import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { getDb } from '../utils/db';
import { config } from '../config';
import { createSnapshot as dockerCreateSnapshot, restoreSnapshot as dockerRestoreSnapshot } from './docker.service';
import { createSite, CreateSiteRequest } from './site.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';

const MAX_SNAPSHOTS_PER_SITE = 5;

export interface SnapshotRecord {
  id: string;
  site_id: string;
  name: string;
  db_engine: string;
  storage_path: string;
  size_bytes: number | null;
  created_at: string;
}

function getSiteForSnapshot(siteId: string, userId?: string) {
  const db = getDb();
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId) as any;
  if (!site) throw new NotFoundError('Site not found');
  if (userId && userId !== 'admin' && site.user_id !== userId) {
    throw new ForbiddenError('You do not own this site');
  }
  if (site.status !== 'running') {
    throw new ValidationError('Site must be running to take a snapshot');
  }
  if (!site.container_id) {
    throw new ValidationError('Site has no container');
  }
  return site;
}

export async function takeSnapshot(siteId: string, name?: string, userId?: string): Promise<SnapshotRecord> {
  const site = getSiteForSnapshot(siteId, userId);
  const db = getDb();

  // Enforce max snapshots per site
  const count = (db.prepare('SELECT COUNT(*) as count FROM snapshots WHERE site_id = ?').get(siteId) as { count: number }).count;
  if (count >= MAX_SNAPSHOTS_PER_SITE) {
    // Delete oldest
    const oldest = db.prepare('SELECT id, storage_path FROM snapshots WHERE site_id = ? ORDER BY created_at ASC LIMIT 1').get(siteId) as { id: string; storage_path: string } | undefined;
    if (oldest) {
      deleteSnapshotFiles(oldest.storage_path);
      db.prepare('DELETE FROM snapshots WHERE id = ?').run(oldest.id);
    }
  }

  const snapshotId = uuidv4();
  const storagePath = `data/snapshots/${snapshotId}`;

  const result = await dockerCreateSnapshot(site.container_id, snapshotId);

  db.prepare(`
    INSERT INTO snapshots (id, site_id, name, db_engine, storage_path, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(snapshotId, siteId, name || `Snapshot ${new Date().toLocaleString()}`, result.dbEngine, storagePath, result.sizeBytes);

  return db.prepare('SELECT * FROM snapshots WHERE id = ?').get(snapshotId) as SnapshotRecord;
}

export function listSnapshots(siteId: string, userId?: string): SnapshotRecord[] {
  if (!userId) throw new ForbiddenError('Authentication required');
  if (userId !== 'admin') {
    const db = getDb();
    const site = db.prepare('SELECT user_id FROM sites WHERE id = ?').get(siteId) as { user_id: string } | undefined;
    if (!site) throw new NotFoundError('Site not found');
    if (site.user_id !== userId) throw new ForbiddenError('You do not own this site');
  }

  const db = getDb();
  return db.prepare('SELECT * FROM snapshots WHERE site_id = ? ORDER BY created_at DESC').all(siteId) as SnapshotRecord[];
}

export async function restoreSnapshotToSite(siteId: string, snapshotId: string, userId?: string): Promise<void> {
  const site = getSiteForSnapshot(siteId, userId);
  const db = getDb();
  const snapshot = db.prepare('SELECT * FROM snapshots WHERE id = ? AND site_id = ?').get(snapshotId, siteId) as SnapshotRecord | undefined;
  if (!snapshot) throw new NotFoundError('Snapshot not found');

  await dockerRestoreSnapshot(site.container_id, snapshotId);
}

export async function deleteSnapshot(siteId: string, snapshotId: string, userId?: string): Promise<void> {
  if (userId && userId !== 'admin') {
    const db = getDb();
    const site = db.prepare('SELECT user_id FROM sites WHERE id = ?').get(siteId) as { user_id: string } | undefined;
    if (!site) throw new NotFoundError('Site not found');
    if (site.user_id !== userId) throw new ForbiddenError('You do not own this site');
  }

  const db = getDb();
  const snapshot = db.prepare('SELECT * FROM snapshots WHERE id = ? AND site_id = ?').get(snapshotId, siteId) as SnapshotRecord | undefined;
  if (!snapshot) throw new NotFoundError('Snapshot not found');

  deleteSnapshotFiles(snapshot.storage_path);
  db.prepare('DELETE FROM snapshots WHERE id = ?').run(snapshotId);
}

function deleteSnapshotFiles(storagePath: string): void {
  try {
    const fullPath = path.resolve(config.dataDir, '..', storagePath);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  } catch (err: any) {
    console.error(`[snapshot] Failed to delete files at ${storagePath}:`, err.message);
  }
}

export async function cloneSite(siteId: string, userId?: string, opts?: { subdomain?: string; expiresIn?: string }): Promise<any> {
  const site = getSiteForSnapshot(siteId, userId);

  // Take a snapshot of the source site
  const snapshot = await takeSnapshot(siteId, `Clone source`, userId);

  // Create a new site with the same product and matching DB engine
  const newSite = await createSite({
    productId: site.product_id,
    userId: userId || site.user_id,
    userEmail: userId === 'admin' ? 'admin@localhost' : undefined,
    expiresIn: opts?.expiresIn,
    subdomain: opts?.subdomain,
    dbEngine: (snapshot.db_engine as 'sqlite' | 'mysql' | 'mariadb') || undefined,
  });

  // Wait for the new site's entrypoint to finish before restoring
  if (newSite.container_id) {
    const subdomain = newSite.subdomain;
    const readyUrl = `http://wp-demo-${subdomain}/.wp-launcher-ready`;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(readyUrl, { signal: AbortSignal.timeout(2000) });
        if (res.ok) break;
      } catch { /* not ready yet */ }
      await new Promise(r => setTimeout(r, 2000));
    }

    // Restore the snapshot into the new site, with URL replacement for the clone
    await dockerRestoreSnapshot(newSite.container_id, snapshot.id, newSite.site_url || undefined);
  }

  // Mark clone relationship
  const db = getDb();
  db.prepare('UPDATE sites SET cloned_from = ? WHERE id = ?').run(siteId, newSite.id);

  return newSite;
}

// Cleanup snapshots when a site is deleted
export function cleanupSiteSnapshots(siteId: string): void {
  const db = getDb();
  const snapshots = db.prepare('SELECT id, storage_path FROM snapshots WHERE site_id = ?').all(siteId) as { id: string; storage_path: string }[];
  for (const s of snapshots) {
    deleteSnapshotFiles(s.storage_path);
  }
  db.prepare('DELETE FROM snapshots WHERE site_id = ?').run(siteId);
}
