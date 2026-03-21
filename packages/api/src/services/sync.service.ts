import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getDb } from '../utils/db';
import { config } from '../config';
import { createSnapshot as dockerCreateSnapshot, restoreSnapshot as dockerRestoreSnapshot } from './docker.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';

// ── Connection CRUD ──
// Each connection represents a remote WordPress site with the WP Launcher Connector plugin installed.

export interface RemoteConnection {
  id: string;
  name: string;
  url: string;       // WordPress site URL (e.g. https://example.com)
  api_key: string;    // Connector plugin API key
  instance_mode: string | null; // 'wordpress' — always a WP site
  last_tested_at: string | null;
  status: string;
  created_at: string;
}

export function listConnections(): RemoteConnection[] {
  const db = getDb();
  return db.prepare('SELECT * FROM remote_connections ORDER BY created_at DESC').all() as RemoteConnection[];
}

export function addConnection(name: string, url: string, apiKey: string): RemoteConnection {
  if (!name || !url || !apiKey) throw new ValidationError('Name, URL, and API key are required');
  const normalizedUrl = url.replace(/\/+$/, '');
  try { new URL(normalizedUrl); } catch { throw new ValidationError('Invalid URL'); }

  const id = uuidv4();
  const db = getDb();
  db.prepare(`
    INSERT INTO remote_connections (id, name, url, api_key)
    VALUES (?, ?, ?, ?)
  `).run(id, name.trim(), normalizedUrl, apiKey);

  return db.prepare('SELECT * FROM remote_connections WHERE id = ?').get(id) as RemoteConnection;
}

export async function testConnection(connectionId: string): Promise<{
  status: string;
  siteName?: string;
  wpVersion?: string;
  theme?: string;
  siteUrl?: string;
  error?: string;
}> {
  const db = getDb();
  const conn = db.prepare('SELECT * FROM remote_connections WHERE id = ?').get(connectionId) as RemoteConnection | undefined;
  if (!conn) throw new NotFoundError('Connection not found');

  try {
    // Call the connector plugin's status endpoint
    const res = await fetch(`${conn.url}/wp-json/wpl-connector/v1/status`, {
      headers: { 'X-WPL-Key': conn.api_key },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 401) throw new Error('Invalid API key');
    if (res.status === 404) throw new Error('WP Launcher Connector plugin not found — install and activate it on the remote site');
    if (!res.ok) throw new Error(`Remote returned ${res.status}`);

    const data = await res.json() as {
      status: string;
      wp_version: string;
      site_name: string;
      site_url: string;
      theme: string;
      db_engine: string;
      plugins: number;
      zip: boolean;
      phar: boolean;
    };

    // Update connection
    db.prepare(`
      UPDATE remote_connections SET status = 'connected', instance_mode = 'wordpress', last_tested_at = datetime('now')
      WHERE id = ?
    `).run(connectionId);

    return {
      status: 'connected',
      siteName: data.site_name,
      wpVersion: data.wp_version,
      theme: data.theme,
      siteUrl: data.site_url,
    };
  } catch (err: any) {
    db.prepare(`
      UPDATE remote_connections SET status = 'error', last_tested_at = datetime('now')
      WHERE id = ?
    `).run(connectionId);
    return { status: 'error', error: err.message };
  }
}

export function removeConnection(connectionId: string): void {
  const db = getDb();
  const conn = db.prepare('SELECT id FROM remote_connections WHERE id = ?').get(connectionId);
  if (!conn) throw new NotFoundError('Connection not found');
  db.prepare('DELETE FROM remote_connections WHERE id = ?').run(connectionId);
}

// ── Push: local WP Launcher site → remote WordPress site ──
// Takes a Docker snapshot (tar), uploads to remote connector plugin's import endpoint

export async function pushToRemote(
  localSiteId: string,
  connectionId: string,
  userId?: string,
): Promise<{ syncId: string; status: string }> {
  const db = getDb();
  const conn = db.prepare('SELECT * FROM remote_connections WHERE id = ?').get(connectionId) as RemoteConnection | undefined;
  if (!conn) throw new NotFoundError('Connection not found');

  const site = db.prepare('SELECT * FROM sites WHERE id = ? AND status = ?').get(localSiteId, 'running') as any;
  if (!site) throw new NotFoundError('Local site not found or not running');
  if (userId && userId !== 'admin' && site.user_id !== userId) throw new ForbiddenError('You do not own this site');
  if (!site.container_id) throw new ValidationError('Site has no container');

  const syncId = uuidv4();
  db.prepare(`
    INSERT INTO sync_history (id, site_id, remote_connection_id, direction, status)
    VALUES (?, ?, ?, 'push', 'snapshotting')
  `).run(syncId, localSiteId, connectionId);

  // Run push async
  doPush(syncId, site, conn).catch(err => {
    console.error(`[sync] Push ${syncId} failed:`, err.message);
    db.prepare(`UPDATE sync_history SET status = 'error', error = ?, completed_at = datetime('now') WHERE id = ?`)
      .run(err.message, syncId);
  });

  return { syncId, status: 'snapshotting' };
}

async function doPush(syncId: string, site: any, conn: RemoteConnection) {
  const db = getDb();

  // 1. Take Docker snapshot of local site (produces wp-content.tar with embedded db-snapshot.sql)
  const snapshotId = uuidv4();
  const result = await dockerCreateSnapshot(site.container_id, snapshotId);
  db.prepare(`UPDATE sync_history SET snapshot_id = ?, db_engine = ?, size_bytes = ?, status = 'uploading' WHERE id = ?`)
    .run(snapshotId, result.dbEngine, result.sizeBytes, syncId);

  const tarPath = path.resolve(config.dataDir, 'snapshots', snapshotId, 'wp-content.tar');
  if (!fs.existsSync(tarPath)) throw new Error('Snapshot tar not found');

  // 2. Upload tar to the remote WordPress connector plugin's import endpoint
  //    The plugin can handle tar format via PharData
  const fileBuffer = fs.readFileSync(tarPath);
  // Pass the local site URL as query param so the plugin knows exactly what to search-replace
  const sourceSiteUrl = site.site_url || `http://${site.subdomain}.${config.baseDomain}`;
  const importUrl = `${conn.url}/wp-json/wpl-connector/v1/import?source_url=${encodeURIComponent(sourceSiteUrl)}`;
  const uploadRes = await fetch(importUrl, {
    method: 'POST',
    headers: {
      'X-WPL-Key': conn.api_key,
      'Content-Type': 'application/octet-stream',
    },
    body: fileBuffer,
    signal: AbortSignal.timeout(300000),
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    throw new Error(`Remote import failed: ${errBody}`);
  }

  const remoteResult = await uploadRes.json() as { status: string; siteUrl?: string };

  // 3. Update sync history
  db.prepare(`
    UPDATE sync_history SET status = 'completed', remote_site_url = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(remoteResult.siteUrl || conn.url, syncId);

  // 4. Cleanup local snapshot
  try {
    fs.rmSync(path.resolve(config.dataDir, 'snapshots', snapshotId), { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ── Pull: remote WordPress site → local WP Launcher site ──
// Asks connector plugin to export, downloads zip, converts to tar, restores via provisioner

export async function pullFromRemote(
  localSiteId: string,
  connectionId: string,
  userId?: string,
): Promise<{ syncId: string; status: string }> {
  const db = getDb();
  const conn = db.prepare('SELECT * FROM remote_connections WHERE id = ?').get(connectionId) as RemoteConnection | undefined;
  if (!conn) throw new NotFoundError('Connection not found');

  const site = db.prepare('SELECT * FROM sites WHERE id = ? AND status = ?').get(localSiteId, 'running') as any;
  if (!site) throw new NotFoundError('Local site not found or not running');
  if (userId && userId !== 'admin' && site.user_id !== userId) throw new ForbiddenError('You do not own this site');
  if (!site.container_id) throw new ValidationError('Site has no container');

  const syncId = uuidv4();
  db.prepare(`
    INSERT INTO sync_history (id, site_id, remote_connection_id, direction, status)
    VALUES (?, ?, ?, 'pull', 'preparing')
  `).run(syncId, localSiteId, connectionId);

  // Run pull async
  doPull(syncId, site, conn).catch(err => {
    console.error(`[sync] Pull ${syncId} failed:`, err.message);
    db.prepare(`UPDATE sync_history SET status = 'error', error = ?, completed_at = datetime('now') WHERE id = ?`)
      .run(err.message, syncId);
  });

  return { syncId, status: 'preparing' };
}

async function doPull(syncId: string, site: any, conn: RemoteConnection) {
  const db = getDb();

  // 1. Ask remote connector plugin to create an export
  const exportRes = await fetch(`${conn.url}/wp-json/wpl-connector/v1/export`, {
    method: 'POST',
    headers: { 'X-WPL-Key': conn.api_key },
    signal: AbortSignal.timeout(120000),
  });
  if (!exportRes.ok) {
    const errBody = await exportRes.text();
    throw new Error(`Remote export failed: ${errBody}`);
  }
  const exportData = await exportRes.json() as { exportId: string; sizeBytes: number; format: string; siteUrl: string };

  db.prepare(`UPDATE sync_history SET size_bytes = ?, remote_site_url = ?, status = 'downloading' WHERE id = ?`)
    .run(exportData.sizeBytes, exportData.siteUrl, syncId);

  // 2. Download the ZIP from the remote
  const downloadRes = await fetch(`${conn.url}/wp-json/wpl-connector/v1/export/${exportData.exportId}`, {
    headers: { 'X-WPL-Key': conn.api_key },
    signal: AbortSignal.timeout(300000),
  });
  if (!downloadRes.ok) throw new Error(`Failed to download export: ${downloadRes.status}`);

  // Save zip to temp location
  const localSnapshotId = uuidv4();
  const workDir = path.resolve(config.dataDir, 'snapshots', localSnapshotId);
  fs.mkdirSync(workDir, { recursive: true });
  const zipPath = path.join(workDir, 'export.zip');

  const arrayBuffer = await downloadRes.arrayBuffer();
  fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));

  db.prepare(`UPDATE sync_history SET snapshot_id = ?, status = 'restoring' WHERE id = ?`)
    .run(localSnapshotId, syncId);

  // 3. Convert ZIP to tar format expected by provisioner
  //    Provisioner expects: data/snapshots/{id}/wp-content.tar containing wp-content/ at root
  const extractDir = path.join(workDir, 'extracted');
  fs.mkdirSync(extractDir, { recursive: true });

  // Extract zip
  execSync(`unzip -q -o "${zipPath}" -d "${extractDir}"`);
  fs.unlinkSync(zipPath);

  // Pre-process: replace remote URLs with local URLs in the SQL before import
  const dbSqlPath = path.join(extractDir, 'database.sql');
  const wpContentDir = path.join(extractDir, 'wp-content');
  const localSiteUrl = site.site_url || `http://${site.subdomain}.${config.baseDomain}`;

  if (fs.existsSync(dbSqlPath)) {
    let sqlContent = fs.readFileSync(dbSqlPath, 'utf-8');
    const remoteUrl = exportData.siteUrl ? exportData.siteUrl.replace(/\/+$/, '') : '';
    // Prepend SQL mode fix for MySQL strict mode compatibility
    // Remote dumps may have DEFAULT '0000-00-00 00:00:00' which strict mode rejects
    sqlContent = "SET SESSION sql_mode = '';\nSET FOREIGN_KEY_CHECKS = 0;\n" + sqlContent;

    if (remoteUrl && remoteUrl !== localSiteUrl) {
      console.log(`[sync] Pre-processing SQL: ${remoteUrl} -> ${localSiteUrl}`);
      sqlContent = sqlContent.split(remoteUrl).join(localSiteUrl);
      // Also handle http/https variants
      const remoteHttp = remoteUrl.replace(/^https:/, 'http:');
      const remoteHttps = remoteUrl.replace(/^http:/, 'https:');
      if (remoteHttp !== remoteUrl) sqlContent = sqlContent.split(remoteHttp).join(localSiteUrl);
      if (remoteHttps !== remoteUrl) sqlContent = sqlContent.split(remoteHttps).join(localSiteUrl);
    }
    // Move into wp-content as db-snapshot.sql (provisioner convention)
    if (fs.existsSync(wpContentDir)) {
      fs.writeFileSync(path.join(wpContentDir, 'db-snapshot.sql'), sqlContent);
    }
    fs.unlinkSync(dbSqlPath);
  }

  // Create tar from the extracted wp-content directory
  const tarPath = path.join(workDir, 'wp-content.tar');
  if (fs.existsSync(wpContentDir)) {
    execSync(`tar -cf "${tarPath}" -C "${extractDir}" wp-content`);
  } else {
    execSync(`tar -cf "${tarPath}" -C "${extractDir}" .`);
  }

  // Clean up extracted files
  fs.rmSync(extractDir, { recursive: true, force: true });

  // 4. Restore into local site
  await dockerRestoreSnapshot(site.container_id, localSnapshotId, localSiteUrl);

  // 5. For SQLite sites: the provisioner skips DB import, so we do it via wp-cli
  //    The db-snapshot.sql is now inside the container at /var/www/html/wp-content/db-snapshot.sql
  try {
    const { execWpCommands } = await import('./docker.service');
    const wpResult = await execWpCommands(site.container_id, [
      'wp db import /var/www/html/wp-content/db-snapshot.sql --allow-root --path=/var/www/html 2>/dev/null || true',
      'rm -f /var/www/html/wp-content/db-snapshot.sql',
      `wp search-replace --all-tables --allow-root --path=/var/www/html "$(wp option get siteurl --allow-root --path=/var/www/html 2>/dev/null)" "${localSiteUrl}" 2>/dev/null || true`,
    ]);
    console.log(`[sync] WP-CLI DB import results:`, wpResult.results?.map(r => `${r.command.slice(0,40)}... exit=${r.exitCode}`));
  } catch (err: any) {
    console.error(`[sync] WP-CLI DB import warning:`, err.message);
  }

  // 5. Done
  db.prepare(`UPDATE sync_history SET status = 'completed', completed_at = datetime('now') WHERE id = ?`)
    .run(syncId);

  // 6. Cleanup
  try {
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ── Sync history ──

export interface SyncHistoryRecord {
  id: string;
  site_id: string;
  remote_connection_id: string;
  direction: string;
  status: string;
  remote_site_id: string | null;
  remote_site_url: string | null;
  snapshot_id: string | null;
  db_engine: string | null;
  size_bytes: number | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export function getSyncHistory(siteId?: string): SyncHistoryRecord[] {
  const db = getDb();
  if (siteId) {
    return db.prepare('SELECT * FROM sync_history WHERE site_id = ? ORDER BY started_at DESC LIMIT 50').all(siteId) as SyncHistoryRecord[];
  }
  return db.prepare('SELECT * FROM sync_history ORDER BY started_at DESC LIMIT 50').all() as SyncHistoryRecord[];
}

export function getSyncStatus(syncId: string): SyncHistoryRecord | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM sync_history WHERE id = ?').get(syncId) as SyncHistoryRecord) || null;
}
