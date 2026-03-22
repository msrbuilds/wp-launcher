import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { conditionalAuth, AuthRequest } from '../middleware/userAuth';
import {
  listConnections,
  addConnection,
  testConnection,
  removeConnection,
  pushToRemote,
  pullFromRemote,
  getSyncHistory,
  getSyncStatus,
} from '../services/sync.service';
import {
  startPreview,
  getPreviewResult,
  pushSelective,
  pullSelective,
} from '../services/sync-incremental.service';
import { getDb } from '../utils/db';

const router = Router();

function isFeatureEnabled(key: string): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(`feature.${key}`) as { value: string } | undefined;
  return row?.value === 'true';
}

function requireSync(_req: Request, res: Response, next: () => void) {
  if (!isFeatureEnabled('siteSync')) {
    res.status(403).json({ error: 'Site sync feature is disabled' });
    return;
  }
  next();
}

// ── Connection management ──

router.get('/connections', conditionalAuth, requireSync, (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const connections = listConnections(req.userId!, isAdmin);
    // Strip API keys from response
    res.json(connections.map(c => ({
      ...c,
      api_key: c.api_key ? '••••' + c.api_key.slice(-4) : '',
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/connections', conditionalAuth, requireSync, async (req: AuthRequest, res: Response) => {
  try {
    const { name, url, apiKey } = req.body;
    const conn = await addConnection(name, url, apiKey, req.userId!);
    res.status(201).json({ ...conn, api_key: '••••' + conn.api_key.slice(-4) });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message });
  }
});

router.post('/connections/:id/test', conditionalAuth, requireSync, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const result = await testConnection(req.params.id, req.userId!, isAdmin);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

router.delete('/connections/:id', conditionalAuth, requireSync, (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    removeConnection(req.params.id, req.userId!, isAdmin);
    res.json({ message: 'Connection removed' });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

// ── Push / Pull ──
// Each connection IS the remote site (a WordPress site with the connector plugin).
// No remoteSiteId needed — the connection URL is the target.

router.post('/push', conditionalAuth, requireSync, async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, connectionId } = req.body;
    if (!siteId || !connectionId) {
      res.status(400).json({ error: 'siteId and connectionId are required' });
      return;
    }
    const isAdmin = req.userRole === 'admin';
    const result = await pushToRemote(siteId, connectionId, req.userId, isAdmin);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/pull', conditionalAuth, requireSync, async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, connectionId } = req.body;
    if (!siteId || !connectionId) {
      res.status(400).json({ error: 'siteId and connectionId are required' });
      return;
    }
    const isAdmin = req.userRole === 'admin';
    const result = await pullFromRemote(siteId, connectionId, req.userId, isAdmin);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

// ── Sync history & status polling ──

router.get('/history', conditionalAuth, requireSync, (req: AuthRequest, res: Response) => {
  try {
    const siteId = req.query.siteId as string | undefined;
    const isAdmin = req.userRole === 'admin';
    res.json(getSyncHistory(siteId, req.userId!, isAdmin));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status/:syncId', conditionalAuth, requireSync, (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const status = getSyncStatus(req.params.syncId, req.userId!, isAdmin);
    if (!status) {
      res.status(404).json({ error: 'Sync operation not found' });
      return;
    }
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Incremental sync: preview + selective push/pull ──

router.post('/preview', conditionalAuth, requireSync, async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, connectionId } = req.body;
    if (!siteId || !connectionId) {
      res.status(400).json({ error: 'siteId and connectionId are required' });
      return;
    }
    const isAdmin = req.userRole === 'admin';
    const previewId = await startPreview(siteId, connectionId, req.userId, isAdmin);
    res.json({ previewId, status: 'generating' });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/preview/:previewId', conditionalAuth, requireSync, (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === 'admin';
    const result = getPreviewResult(req.params.previewId, req.userId!, isAdmin);
    if (!result) {
      res.status(404).json({ error: 'Preview not found or expired' });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/push-selective', conditionalAuth, requireSync, async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, connectionId, contentIds, filePaths } = req.body;
    if (!siteId || !connectionId) {
      res.status(400).json({ error: 'siteId and connectionId are required' });
      return;
    }
    if ((!contentIds || contentIds.length === 0) && (!filePaths || filePaths.length === 0)) {
      res.status(400).json({ error: 'Select at least one item to push' });
      return;
    }
    const isAdmin = req.userRole === 'admin';
    const result = await pushSelective(siteId, connectionId, contentIds, filePaths, req.userId, isAdmin);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/pull-selective', conditionalAuth, requireSync, async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, connectionId, contentIds, filePaths } = req.body;
    if (!siteId || !connectionId) {
      res.status(400).json({ error: 'siteId and connectionId are required' });
      return;
    }
    if ((!contentIds || contentIds.length === 0) && (!filePaths || filePaths.length === 0)) {
      res.status(400).json({ error: 'Select at least one item to pull' });
      return;
    }
    const isAdmin = req.userRole === 'admin';
    const result = await pullSelective(siteId, connectionId, contentIds, filePaths, req.userId, isAdmin);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

// ── Connector plugin download ──
// Builds a zip of the wp-launcher-connector plugin in pure Node.js and serves it.
// No auth required — it's a public WordPress plugin.

function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const compressed = zlib.deflateRawSync(file.data);

    // Local file header
    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);  // signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(8, 8);            // compression: deflate
    local.writeUInt16LE(0, 10);           // mod time
    local.writeUInt16LE(0, 12);           // mod date
    local.writeUInt32LE(crc, 14);         // crc32
    local.writeUInt32LE(compressed.length, 18); // compressed size
    local.writeUInt32LE(file.data.length, 22);  // uncompressed size
    local.writeUInt16LE(nameBuffer.length, 26); // filename length
    local.writeUInt16LE(0, 28);           // extra field length
    nameBuffer.copy(local, 30);

    parts.push(local, compressed);

    // Central directory entry
    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);  // signature
    central.writeUInt16LE(20, 4);           // version made by
    central.writeUInt16LE(20, 6);           // version needed
    central.writeUInt16LE(0, 8);            // flags
    central.writeUInt16LE(8, 10);           // compression
    central.writeUInt16LE(0, 12);           // mod time
    central.writeUInt16LE(0, 14);           // mod date
    central.writeUInt32LE(crc, 16);         // crc32
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);           // extra length
    central.writeUInt16LE(0, 32);           // comment length
    central.writeUInt16LE(0, 34);           // disk start
    central.writeUInt16LE(0, 36);           // internal attrs
    central.writeUInt32LE(0, 38);           // external attrs
    central.writeUInt32LE(offset, 42);      // local header offset
    nameBuffer.copy(central, 46);
    centralDir.push(central);

    offset += local.length + compressed.length;
  }

  const centralDirBuf = Buffer.concat(centralDir);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralDirBuf, eocd]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

router.get('/connector-plugin', (_req: Request, res: Response) => {
  try {
    const pluginDir = path.resolve(__dirname, '..', '..', 'wordpress', 'plugins', 'wp-launcher-connector');
    const pluginFile = path.join(pluginDir, 'wp-launcher-connector.php');

    if (!fs.existsSync(pluginFile)) {
      res.status(404).json({ error: 'Connector plugin not found on server' });
      return;
    }

    // Collect all files in the plugin directory
    const files: { name: string; data: Buffer }[] = [];
    function addDir(dir: string, prefix: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        const zipName = prefix + entry.name;
        if (entry.isDirectory()) {
          addDir(fullPath, zipName + '/');
        } else {
          files.push({ name: zipName, data: fs.readFileSync(fullPath) });
        }
      }
    }
    addDir(pluginDir, 'wp-launcher-connector/');

    const zipBuffer = buildZip(files);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', zipBuffer.length);
    res.setHeader('Content-Disposition', 'attachment; filename=wp-launcher-connector.zip');
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
