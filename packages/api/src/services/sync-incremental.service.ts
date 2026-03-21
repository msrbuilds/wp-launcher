import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getDb } from '../utils/db';
import { config } from '../config';
import { execWpCommands } from './docker.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';

// ── Types ──

export interface ContentItem {
  id: number;
  title: string;
  type: string;
  status: string;
  modified_gmt: string;
  slug: string;
}

export interface FileItem {
  path: string;
  size: number;
  mtime: number;
  type: 'file' | 'directory';
}

export interface SyncManifest {
  generated_at: string;
  site_url: string;
  content: ContentItem[];
  files: FileItem[];
}

export interface SyncDiff {
  content: {
    local_only: ContentItem[];
    remote_only: ContentItem[];
    modified_local: ContentItem[];
    modified_remote: ContentItem[];
    conflicts: { local: ContentItem; remote: ContentItem }[];
  };
  files: {
    local_only: FileItem[];
    remote_only: FileItem[];
    modified: { local: FileItem; remote: FileItem }[];
  };
  stats: {
    contentChanges: number;
    fileChanges: number;
  };
}

interface RemoteConnection {
  id: string;
  url: string;
  api_key: string;
}

// ── Manifest Generation ──

export async function generateLocalManifest(containerId: string, siteUrl: string): Promise<SyncManifest> {
  // Use simple wp-cli commands (no wp eval — escaping breaks through multiple shell layers)
  const contentCmd = `wp post list --post_type=any --post_status=any --fields=ID,post_type,post_status,post_modified_gmt,post_name,post_title --format=json`;

  // For files, wp-cli doesn't have a built-in file listing, so use a PHP one-liner via a temp file
  const filesCmd = `wp eval-file /dev/stdin <<'WPEOF'
<?php
$wpc = WP_CONTENT_DIR;
$files = [];
$skip = ['cache','upgrade','mu-plugins','wflogs','database'];
foreach (['plugins','themes'] as $d) {
  $base = "$wpc/$d";
  if (!is_dir($base)) continue;
  foreach (scandir($base) as $e) {
    if ($e==='.'||$e==='..'||in_array($e,$skip)) continue;
    $full = "$base/$e";
    if (is_dir($full)) {
      $sz=0; $mt=0;
      $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($full,RecursiveDirectoryIterator::SKIP_DOTS));
      foreach ($it as $f) { if ($f->isFile()) { $sz+=$f->getSize(); $mt=max($mt,$f->getMTime()); } }
      $files[] = ['path'=>"$d/$e",'size'=>$sz,'mtime'=>$mt,'type'=>'directory'];
    } else {
      $files[] = ['path'=>"$d/$e",'size'=>filesize($full),'mtime'=>filemtime($full),'type'=>'file'];
    }
  }
}
echo json_encode($files);
WPEOF`;

  const results = await execWpCommands(containerId, [contentCmd, filesCmd]);

  let content: ContentItem[] = [];
  let files: FileItem[] = [];

  try {
    let contentOutput = results.results[0]?.output?.trim() || '[]';
    // Strip Docker stream header bytes that may prefix the JSON
    const jsonStart = contentOutput.indexOf('[');
    if (jsonStart > 0) contentOutput = contentOutput.slice(jsonStart);
    const raw = JSON.parse(contentOutput) as any[];
    // wp post list uses uppercase ID and different field names
    content = raw
      .filter((p: any) => p.post_type !== 'revision' && p.post_type !== 'auto-draft')
      .map((p: any) => ({
        id: p.ID,
        title: p.post_title,
        type: p.post_type,
        status: p.post_status,
        modified_gmt: p.post_modified_gmt,
        slug: p.post_name,
      }));
  } catch (err) {
    console.error('[sync-incremental] Failed to parse content manifest:', err, results.results[0]?.output?.slice(0, 200));
  }

  try {
    let filesOutput = results.results[1]?.output?.trim() || '[]';
    const fJsonStart = filesOutput.indexOf('[');
    if (fJsonStart > 0) filesOutput = filesOutput.slice(fJsonStart);
    files = JSON.parse(filesOutput);
  } catch (err) {
    console.error('[sync-incremental] Failed to parse files manifest:', err, results.results[1]?.output?.slice(0, 200));
  }

  return {
    generated_at: new Date().toISOString(),
    site_url: siteUrl,
    content,
    files,
  };
}

export async function fetchRemoteManifest(conn: RemoteConnection): Promise<SyncManifest> {
  const res = await fetch(`${conn.url}/wp-json/wpl-connector/v1/manifest`, {
    headers: { 'X-WPL-Key': conn.api_key },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Remote manifest failed: ${res.status}`);
  return await res.json() as SyncManifest;
}

// ── Diff Computation ──

export function computeDiff(local: SyncManifest, remote: SyncManifest): SyncDiff {
  // Content diff — match by slug + type (more reliable than ID across sites)
  const localByKey = new Map<string, ContentItem>();
  const remoteByKey = new Map<string, ContentItem>();

  for (const item of local.content) localByKey.set(`${item.type}:${item.slug}`, item);
  for (const item of remote.content) remoteByKey.set(`${item.type}:${item.slug}`, item);

  const local_only: ContentItem[] = [];
  const remote_only: ContentItem[] = [];
  const modified_local: ContentItem[] = [];
  const modified_remote: ContentItem[] = [];
  const conflicts: { local: ContentItem; remote: ContentItem }[] = [];

  for (const [key, lItem] of localByKey) {
    const rItem = remoteByKey.get(key);
    if (!rItem) {
      local_only.push(lItem);
    } else {
      const lTime = new Date(lItem.modified_gmt).getTime();
      const rTime = new Date(rItem.modified_gmt).getTime();
      if (Math.abs(lTime - rTime) > 2000) { // >2s difference = changed
        if (lTime > rTime) modified_local.push(lItem);
        else modified_remote.push(rItem);
      }
    }
  }
  for (const [key, rItem] of remoteByKey) {
    if (!localByKey.has(key)) remote_only.push(rItem);
  }

  // File diff — match by path
  const localFiles = new Map<string, FileItem>();
  const remoteFiles = new Map<string, FileItem>();

  for (const f of local.files) localFiles.set(f.path, f);
  for (const f of remote.files) remoteFiles.set(f.path, f);

  const files_local_only: FileItem[] = [];
  const files_remote_only: FileItem[] = [];
  const files_modified: { local: FileItem; remote: FileItem }[] = [];

  for (const [p, lf] of localFiles) {
    const rf = remoteFiles.get(p);
    if (!rf) files_local_only.push(lf);
    else if (lf.size !== rf.size) files_modified.push({ local: lf, remote: rf });
  }
  for (const [p, rf] of remoteFiles) {
    if (!localFiles.has(p)) files_remote_only.push(rf);
  }

  const contentChanges = local_only.length + remote_only.length + modified_local.length + modified_remote.length + conflicts.length;
  const fileChanges = files_local_only.length + files_remote_only.length + files_modified.length;

  return {
    content: { local_only, remote_only, modified_local, modified_remote, conflicts },
    files: { local_only: files_local_only, remote_only: files_remote_only, modified: files_modified },
    stats: { contentChanges, fileChanges },
  };
}

// ── Preview (async with caching) ──

const previewCache = new Map<string, { diff: SyncDiff; localManifest: SyncManifest; remoteManifest: SyncManifest; status: string }>();

export async function startPreview(siteId: string, connectionId: string, userId?: string): Promise<string> {
  const db = getDb();
  const conn = db.prepare('SELECT * FROM remote_connections WHERE id = ?').get(connectionId) as RemoteConnection | undefined;
  if (!conn) throw new NotFoundError('Connection not found');

  const site = db.prepare('SELECT * FROM sites WHERE id = ? AND status = ?').get(siteId, 'running') as any;
  if (!site) throw new NotFoundError('Site not found or not running');
  if (userId && userId !== 'admin' && site.user_id !== userId) throw new ForbiddenError('Not your site');
  if (!site.container_id) throw new ValidationError('No container');

  const previewId = uuidv4();
  previewCache.set(previewId, { diff: null as any, localManifest: null as any, remoteManifest: null as any, status: 'generating' });

  // Run async
  (async () => {
    try {
      const [localManifest, remoteManifest] = await Promise.all([
        generateLocalManifest(site.container_id, site.site_url || `http://${site.subdomain}.${config.baseDomain}`),
        fetchRemoteManifest(conn),
      ]);
      const diff = computeDiff(localManifest, remoteManifest);
      previewCache.set(previewId, { diff, localManifest, remoteManifest, status: 'ready' });
      // Auto-expire after 10 minutes
      setTimeout(() => previewCache.delete(previewId), 600000);
    } catch (err: any) {
      previewCache.set(previewId, { diff: null as any, localManifest: null as any, remoteManifest: null as any, status: `error: ${err.message}` });
    }
  })();

  return previewId;
}

export function getPreviewResult(previewId: string): { status: string; diff?: SyncDiff } | null {
  const cached = previewCache.get(previewId);
  if (!cached) return null;
  if (cached.status === 'ready') return { status: 'ready', diff: cached.diff };
  return { status: cached.status };
}

// ── Selective Push (local → remote) ──

export async function pushSelective(
  siteId: string,
  connectionId: string,
  contentIds?: number[],
  filePaths?: string[],
  userId?: string,
): Promise<{ syncId: string; status: string }> {
  const db = getDb();
  const conn = db.prepare('SELECT * FROM remote_connections WHERE id = ?').get(connectionId) as RemoteConnection | undefined;
  if (!conn) throw new NotFoundError('Connection not found');

  const site = db.prepare('SELECT * FROM sites WHERE id = ? AND status = ?').get(siteId, 'running') as any;
  if (!site) throw new NotFoundError('Site not found');
  if (userId && userId !== 'admin' && site.user_id !== userId) throw new ForbiddenError('Not your site');
  if (!site.container_id) throw new ValidationError('No container');

  const syncId = uuidv4();
  db.prepare(`INSERT INTO sync_history (id, site_id, remote_connection_id, direction, status) VALUES (?, ?, ?, 'push', 'syncing')`).run(syncId, siteId, connectionId);

  const localUrl = site.site_url || `http://${site.subdomain}.${config.baseDomain}`;

  (async () => {
    try {
      let itemsSynced = 0;

      // Push content (posts/pages)
      if (contentIds && contentIds.length > 0) {
        // Export each post individually using wp post get (reliable, no escaping issues)
        const posts: any[] = [];
        for (const pid of contentIds) {
          const cmds = [
            `wp post get ${pid} --format=json --fields=ID,post_title,post_content,post_excerpt,post_type,post_status,post_name,post_date,post_date_gmt,post_modified,post_modified_gmt,post_parent,menu_order,comment_status,ping_status`,
          ];
          const result = await execWpCommands(site.container_id, cmds);
          let output = result.results[0]?.output?.trim() || '';
          const jStart = output.indexOf('{');
          if (jStart >= 0) output = output.slice(jStart);
          try {
            const post = JSON.parse(output);
            posts.push(post);
          } catch { console.error(`[sync-incremental] Failed to export post ${pid}`); }
        }


        if (posts.length > 0) {
          const importRes = await fetch(`${conn.url}/wp-json/wpl-connector/v1/import-content`, {
            method: 'POST',
            headers: { 'X-WPL-Key': conn.api_key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ posts, source_url: localUrl }),
            signal: AbortSignal.timeout(60000),
          });
          if (!importRes.ok) throw new Error(`Content import failed: ${await importRes.text()}`);
          const result = await importRes.json() as { imported: number };
          itemsSynced += result.imported;
        }
      }

      // File push: use the provisioner's snapshot for selected paths
      // TODO: implement selective file push from Docker container
      if (filePaths && filePaths.length > 0) {
        if (itemsSynced === 0) {
          throw new Error('File sync is not yet supported in selective mode. Use full sync for files, or select content items (posts/pages).');
        }
      }

      db.prepare(`UPDATE sync_history SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).run(syncId);
      console.log(`[sync-incremental] Push ${syncId} done: ${itemsSynced} items synced`);
    } catch (err: any) {
      console.error(`[sync-incremental] Push ${syncId} failed:`, err.message);
      db.prepare(`UPDATE sync_history SET status = 'error', error = ?, completed_at = datetime('now') WHERE id = ?`).run(err.message, syncId);
    }
  })();

  return { syncId, status: 'syncing' };
}

// ── Selective Pull (remote → local) ──

export async function pullSelective(
  siteId: string,
  connectionId: string,
  contentIds?: number[],
  filePaths?: string[],
  userId?: string,
): Promise<{ syncId: string; status: string }> {
  const db = getDb();
  const conn = db.prepare('SELECT * FROM remote_connections WHERE id = ?').get(connectionId) as RemoteConnection | undefined;
  if (!conn) throw new NotFoundError('Connection not found');

  const site = db.prepare('SELECT * FROM sites WHERE id = ? AND status = ?').get(siteId, 'running') as any;
  if (!site) throw new NotFoundError('Site not found');
  if (userId && userId !== 'admin' && site.user_id !== userId) throw new ForbiddenError('Not your site');
  if (!site.container_id) throw new ValidationError('No container');

  const syncId = uuidv4();
  db.prepare(`INSERT INTO sync_history (id, site_id, remote_connection_id, direction, status) VALUES (?, ?, ?, 'pull', 'syncing')`).run(syncId, siteId, connectionId);

  const localUrl = site.site_url || `http://${site.subdomain}.${config.baseDomain}`;

  (async () => {
    try {
      let itemsSynced = 0;

      // Pull content — write post data as JSON file in shared volume, import via wp eval-file
      if (contentIds && contentIds.length > 0) {
        const exportRes = await fetch(`${conn.url}/wp-json/wpl-connector/v1/export-content`, {
          method: 'POST',
          headers: { 'X-WPL-Key': conn.api_key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ postIds: contentIds }),
          signal: AbortSignal.timeout(60000),
        });
        if (!exportRes.ok) throw new Error(`Content export failed: ${await exportRes.text()}`);
        const data = await exportRes.json() as { posts: any[]; site_url: string };

        if (data.posts.length > 0) {
          const remoteUrl = (data.site_url || conn.url).replace(/\/+$/, '');

          // URL replacement
          for (const post of data.posts) {
            if (remoteUrl && remoteUrl !== localUrl) {
              if (post.post_content) post.post_content = post.post_content.split(remoteUrl).join(localUrl);
              if (post.post_excerpt) post.post_excerpt = post.post_excerpt.split(remoteUrl).join(localUrl);
              if (post.guid) post.guid = post.guid.split(remoteUrl).join(localUrl);
            }
          }

          // Write posts JSON to shared data dir (mounted in container at /app/data)
          const tmpFile = path.join(config.dataDir, `sync-import-${syncId}.json`);
          fs.writeFileSync(tmpFile, JSON.stringify({ posts: data.posts, source_url: remoteUrl, target_url: localUrl }));

          // Create a PHP import script in the same dir
          const phpScript = path.join(config.dataDir, `sync-import-${syncId}.php`);
          fs.writeFileSync(phpScript, `<?php
$data = json_decode(file_get_contents('/app/data/sync-import-${syncId}.json'), true);
$imported = 0;
foreach ($data['posts'] as $post) {
  $existing = get_page_by_path($post['post_name'], OBJECT, $post['post_type']);
  $args = array(
    'post_title' => $post['post_title'],
    'post_content' => $post['post_content'] ?? '',
    'post_excerpt' => $post['post_excerpt'] ?? '',
    'post_type' => $post['post_type'],
    'post_status' => $post['post_status'],
    'post_name' => $post['post_name'],
    'post_parent' => (int)($post['post_parent'] ?? 0),
    'menu_order' => (int)($post['menu_order'] ?? 0),
    'comment_status' => $post['comment_status'] ?? 'closed',
    'ping_status' => $post['ping_status'] ?? 'closed',
  );
  if ($existing) { $args['ID'] = $existing->ID; $r = wp_update_post($args, true); }
  else { $r = wp_insert_post($args, true); }
  if (!is_wp_error($r)) {
    $pid = (int)$r;
    if (!empty($post['meta'])) {
      foreach ($post['meta'] as $k => $v) {
        if (strpos($k, '_transient') === 0) continue;
        update_post_meta($pid, $k, maybe_unserialize($v));
      }
    }
    if (!empty($post['taxonomies'])) {
      foreach ($post['taxonomies'] as $tax => $terms) {
        if (taxonomy_exists($tax)) wp_set_object_terms($pid, $terms, $tax);
      }
    }
    $imported++;
  }
}
echo json_encode(array('imported' => $imported, 'total' => count($data['posts'])));
`);

          // Run the import script via wp eval-file (reads from /app/data which is mounted)
          const importResult = await execWpCommands(site.container_id, [
            `wp eval-file /app/data/sync-import-${syncId}.php`,
          ]);
          let output = importResult.results[0]?.output?.trim() || '';
          const jIdx = output.indexOf('{');
          if (jIdx >= 0) output = output.slice(jIdx);
          try {
            const result = JSON.parse(output);
            itemsSynced += result.imported || 0;
            console.log(`[sync-incremental] Pull content: ${result.imported}/${result.total} imported`);
          } catch {
            console.error(`[sync-incremental] Pull content output:`, importResult.results[0]?.output?.slice(0, 300));
          }

          // Cleanup temp files
          try { fs.unlinkSync(tmpFile); } catch {}
          try { fs.unlinkSync(phpScript); } catch {}
        }
      }

      // File pull: not yet implemented for selective sync
      if (filePaths && filePaths.length > 0 && itemsSynced === 0) {
        throw new Error('File sync is not yet supported in selective mode. Use full sync for files, or select content items (posts/pages).');
      }

      db.prepare(`UPDATE sync_history SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).run(syncId);
      console.log(`[sync-incremental] Pull ${syncId} done: ${itemsSynced} items`);
    } catch (err: any) {
      console.error(`[sync-incremental] Pull ${syncId} failed:`, err.message);
      db.prepare(`UPDATE sync_history SET status = 'error', error = ?, completed_at = datetime('now') WHERE id = ?`).run(err.message, syncId);
    }
  })();

  return { syncId, status: 'syncing' };
}
