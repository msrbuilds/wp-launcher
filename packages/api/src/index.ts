import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { adminAuth } from './middleware/auth';
import sitesRouter from './routes/sites';
import productsRouter from './routes/products';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import analyticsRouter from './routes/analytics';
import bulkRouter from './routes/bulk';
import templatesRouter from './routes/templates';
import { startCleanupScheduler, cleanupOrphanedContainers } from './services/cleanup.service';
import { startScheduleProcessor } from './services/schedule.service';
import { closeDb, getDb } from './utils/db';
import { AppError } from './utils/errors';
import { Request, Response, NextFunction } from 'express';

const app = express();

// Trust the reverse proxy (Traefik) so rate limiting uses real client IPs
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Rate limiting for auth endpoints
// Strict limiter for auth write ops (login, register, verify, set-password)
const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Relaxed limiter for auth read ops (/me, logout)
const authReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for admin endpoints (brute-force protection)
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// System version info
const versionFilePath = path.resolve(__dirname, '..', 'version.json');
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function readVersionInfo() {
  try {
    return JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'));
  } catch {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));
      return { version: pkg.version || '0.0.0', commit: 'unknown', branch: 'unknown', buildDate: null, commitDate: null, commitMessage: '' };
    } catch {
      return { version: '0.0.0', commit: 'unknown', branch: 'unknown', buildDate: null, commitDate: null, commitMessage: '' };
    }
  }
}

// Public: version number only
app.get('/api/version', (_req, res) => {
  const info = readVersionInfo();
  res.json({ version: info.version });
});

// Serve uploaded branding assets (logos, etc.)
const uploadsDir = path.resolve(config.dataDir, 'uploads');
app.use('/api/uploads', express.static(uploadsDir, { maxAge: '1h', fallthrough: true }));

// Public UI settings (includes feature flags + branding)
app.get('/api/settings', (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const features: Record<string, boolean> = {};
  const branding: Record<string, string> = {};
  const colors: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith('feature.')) {
      features[row.key.replace('feature.', '')] = row.value === 'true';
    } else if (row.key.startsWith('branding.')) {
      branding[row.key.replace('branding.', '')] = row.value;
    } else if (row.key.startsWith('color.')) {
      colors[row.key.replace('color.', '')] = row.value;
    }
  }
  res.json({
    cardLayout: branding.cardLayout || config.ui.cardLayout,
    appMode: config.appMode,
    baseDomain: config.baseDomain,
    features,
    branding: {
      siteTitle: branding.siteTitle || 'WP Launcher',
      logoUrl: branding.logoUrl || '',
      cardLayout: branding.cardLayout || config.ui.cardLayout,
    },
    colors,
  });
});

if (config.isLocalMode) {
  // Local mode: minimal auth — just issue a token for the local user
  const { generateToken } = require('./middleware/userAuth');
  app.post('/api/auth/local-token', (_req: any, res: any) => {
    const token = generateToken('local-user', 'local@localhost', 'admin');
    res.cookie('wpl_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/api',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ token, user: { id: 'local-user', email: 'local@localhost', role: 'admin' } });
  });

  // Admin routes (JWT-protected in local mode, no rate limiting needed)
  app.use('/api/admin', adminRouter);
  app.use('/api/admin/analytics', analyticsRouter);
  app.use('/api/admin/bulk', bulkRouter);
} else {
  // Agency mode: auth routes with split rate limiting
  // Write ops (login, register, verify, set-password) get strict limits
  app.post('/api/auth/register', authWriteLimiter);
  app.post('/api/auth/verify', authWriteLimiter);
  app.post('/api/auth/set-password', authWriteLimiter);
  app.post('/api/auth/login', authWriteLimiter);
  // Read ops (/me, logout, update-password) get relaxed limits
  app.get('/api/auth/me', authReadLimiter);
  app.post('/api/auth/logout', authReadLimiter);
  app.post('/api/auth/update-password', authReadLimiter);
  app.use('/api/auth', authRouter);

  // Admin login — validates API key and sets httpOnly cookie
  app.post('/api/admin/login', adminLimiter, (req, res) => {
    const { apiKey: key } = req.body;
    if (!key || !config.apiKey) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
    const crypto = require('crypto');
    const a = Buffer.from(key);
    const b = Buffer.from(config.apiKey);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
    const isProduction = config.nodeEnv === 'production';
    res.cookie('wpl_admin', config.apiKey, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    res.json({ authenticated: true });
  });

  // Admin routes (API key protected + rate limited)
  app.use('/api/admin', adminLimiter, adminRouter);

  // Analytics routes (under admin, API key protected)
  // Note: adminLimiter already applied via /api/admin prefix on line above
  app.use('/api/admin/analytics', analyticsRouter);

  // Bulk provisioning routes (under admin, API key protected)
  app.use('/api/admin/bulk', bulkRouter);
}

// ── Admin endpoints available in both local and agency modes ──

// System info (admin only — full version + git details)
app.get('/api/admin/system/info', adminAuth, (_req, res) => {
  const info = readVersionInfo();
  const uptime = process.uptime();
  res.json({
    ...info,
    nodeVersion: process.version,
    platform: process.platform,
    uptime: Math.floor(uptime),
    uptimeFormatted: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    memoryUsage: Math.round(process.memoryUsage().rss / 1024 / 1024),
    env: config.nodeEnv,
    appMode: config.appMode,
  });
});

// Check for updates (admin only) — compares local version with latest GitHub release
app.get('/api/admin/system/update-check', adminAuth, async (_req, res) => {
  try {
    const info = readVersionInfo();
    const currentVersion = info.version || '0.0.0';

    // In local/development mode, skip update checks — dev is always "latest"
    if (config.isLocalMode || config.nodeEnv === 'development') {
      res.json({ currentVersion, latestVersion: currentVersion, updateAvailable: false, source: 'local' });
      return;
    }

    // Fetch latest release from GitHub API
    const response = await fetch('https://api.github.com/repos/msrbuilds/wp-launcher/releases/latest', {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'WP-Launcher' },
    });

    if (!response.ok) {
      // Fallback: check latest tag
      const tagResponse = await fetch('https://api.github.com/repos/msrbuilds/wp-launcher/tags?per_page=1', {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'WP-Launcher' },
      });
      if (tagResponse.ok) {
        const tags = await tagResponse.json() as any[];
        if (tags.length > 0) {
          const latestTag = (tags[0].name as string).replace(/^v/, '');
          const updateAvailable = compareVersions(latestTag, currentVersion) > 0;
          res.json({ currentVersion, latestVersion: latestTag, updateAvailable, source: 'tag' });
          return;
        }
      }
      // Fallback: compare commits
      const commitResponse = await fetch('https://api.github.com/repos/msrbuilds/wp-launcher/commits/main', {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'WP-Launcher' },
      });
      if (commitResponse.ok) {
        const commit = await commitResponse.json() as any;
        const latestCommit = commit.sha?.substring(0, 7) || 'unknown';
        const updateAvailable = info.commit !== latestCommit && info.commitFull !== commit.sha;
        res.json({
          currentVersion,
          latestVersion: currentVersion,
          latestCommit,
          currentCommit: info.commit,
          updateAvailable,
          source: 'commit',
          message: commit.commit?.message?.split('\n')[0] || '',
        });
        return;
      }
      res.json({ currentVersion, latestVersion: currentVersion, updateAvailable: false, error: 'Could not reach GitHub' });
      return;
    }

    const release = await response.json() as any;
    const latestVersion = (release.tag_name || '').replace(/^v/, '');
    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;

    res.json({
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: release.html_url || '',
      releaseNotes: release.body || '',
      publishedAt: release.published_at || '',
      source: 'release',
    });
  } catch (error) {
    res.json({ currentVersion: readVersionInfo().version || '0.0.0', latestVersion: 'unknown', updateAvailable: false, error: 'Failed to check for updates' });
  }
});

// Trigger self-update from dashboard (admin only)
app.post('/api/admin/system/update', adminAuth, (req: any, res) => {
  const dataDir = path.resolve(__dirname, '..', 'data');
  const triggerFile = path.join(dataDir, 'update-trigger');
  const lockFile = path.join(dataDir, 'update.lock');

  // Check if update already in progress
  if (fs.existsSync(lockFile)) {
    res.status(409).json({ error: 'An update is already in progress' });
    return;
  }
  if (fs.existsSync(triggerFile)) {
    res.status(409).json({ error: 'An update is already queued' });
    return;
  }

  const triggerId = String(Date.now());
  const trigger = {
    triggerId,
    timestamp: new Date().toISOString(),
    initiatedBy: req.userEmail || 'admin',
  };

  try {
    fs.writeFileSync(triggerFile, JSON.stringify(trigger, null, 2));
    res.json({ status: 'pending', triggerId, message: 'Update triggered. The watcher service will execute it shortly.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write update trigger' });
  }
});

// Poll update status (admin only)
app.get('/api/admin/system/update-status', adminAuth, (_req, res) => {
  const statusFile = path.resolve(__dirname, '..', 'data', 'update-status.json');
  try {
    if (fs.existsSync(statusFile)) {
      const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      res.json(status);
    } else {
      res.json({ status: 'idle' });
    }
  } catch {
    res.json({ status: 'idle' });
  }
});

// Read update log (admin only)
app.get('/api/admin/system/update-log', adminAuth, (_req, res) => {
  const logFile = path.resolve(__dirname, '..', 'data', 'update.log');
  try {
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8');
      // Return last 500 lines
      const lines = content.split('\n');
      const tail = lines.slice(-500).join('\n');
      res.type('text/plain').send(tail);
    } else {
      res.type('text/plain').send('No update log available.');
    }
  } catch {
    res.type('text/plain').send('Failed to read update log.');
  }
});

// Feature flags management (admin only)
app.get('/api/admin/features', adminAuth, (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'feature.%'").all() as { key: string; value: string }[];
  const features: Record<string, boolean> = {};
  for (const row of rows) {
    const name = row.key.replace('feature.', '');
    features[name] = row.value === 'true';
  }
  res.json({ features });
});

app.put('/api/admin/features', adminAuth, (req, res) => {
  const db = getDb();
  const { features } = req.body as { features: Record<string, boolean> };
  if (!features || typeof features !== 'object') {
    res.status(400).json({ error: 'features object is required' });
    return;
  }
  const allowed = ['cloning', 'snapshots', 'templates', 'customDomains', 'phpConfig', 'siteExtend', 'sitePassword', 'exportZip', 'webhooks', 'healthMonitoring', 'scheduledLaunch', 'collaborativeSites', 'adminer'];
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [name, enabled] of Object.entries(features)) {
    if (allowed.includes(name)) {
      update.run(`feature.${name}`, String(enabled));
    }
  }
  res.json({ status: 'updated' });
});

// Branding settings (available in both modes — no auth needed in local mode)
// In agency mode, adminLimiter already applied via /api/admin prefix mount
const brandingAuth = config.isLocalMode ? [] : [adminAuth];

app.get('/api/admin/branding', ...brandingAuth, (_req: any, res: any) => {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'branding.%' OR key LIKE 'color.%'").all() as { key: string; value: string }[];
  const branding: Record<string, string> = {};
  const colors: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith('branding.')) {
      branding[row.key.replace('branding.', '')] = row.value;
    } else if (row.key.startsWith('color.')) {
      colors[row.key.replace('color.', '')] = row.value;
    }
  }
  res.json({
    siteTitle: branding.siteTitle || 'WP Launcher',
    logoUrl: branding.logoUrl || '',
    cardLayout: branding.cardLayout || config.ui.cardLayout,
    colors,
  });
});

app.put('/api/admin/branding', ...brandingAuth, (req: any, res: any) => {
  const db = getDb();
  const { siteTitle, cardLayout, colors } = req.body as { siteTitle?: string; cardLayout?: string; colors?: Record<string, string> };
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  if (siteTitle !== undefined) {
    update.run('branding.siteTitle', siteTitle.trim().slice(0, 100));
  }
  if (cardLayout !== undefined && ['full', 'compact'].includes(cardLayout)) {
    update.run('branding.cardLayout', cardLayout);
  }
  if (colors && typeof colors === 'object') {
    const allowedColors = ['primaryDark', 'accent', 'grey', 'textMuted', 'textLight', 'border', 'bgSurface'];
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    for (const [name, value] of Object.entries(colors)) {
      if (allowedColors.includes(name) && hexRegex.test(value)) {
        update.run(`color.${name}`, value);
      }
    }
  }
  res.json({ status: 'updated' });
});

app.post('/api/admin/branding/logo', ...brandingAuth, (req: any, res: any) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const contentType = req.headers['content-type'] || '';
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif'];
    if (!allowedTypes.some((t: string) => contentType.startsWith(t))) {
      res.status(400).json({ error: 'Invalid file type. Allowed: PNG, JPEG, SVG, WebP, GIF' });
      return;
    }
    const body = Buffer.concat(chunks);
    if (body.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'File too large (max 2MB)' });
      return;
    }
    const ext = contentType.includes('png') ? '.png'
      : contentType.includes('jpeg') ? '.jpg'
      : contentType.includes('svg') ? '.svg'
      : contentType.includes('webp') ? '.webp'
      : '.gif';
    const filename = `logo${ext}`;
    const uploadDir = path.resolve(config.dataDir, 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    for (const f of fs.readdirSync(uploadDir)) {
      if (f.startsWith('logo.')) fs.unlinkSync(path.join(uploadDir, f));
    }
    fs.writeFileSync(path.join(uploadDir, filename), body);
    const logoUrl = `/api/uploads/${filename}`;
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('branding.logoUrl', logoUrl);
    res.json({ logoUrl });
  });
});

app.delete('/api/admin/branding/logo', ...brandingAuth, (_req: any, res: any) => {
  const uploadDir = path.resolve(config.dataDir, 'uploads');
  if (fs.existsSync(uploadDir)) {
    for (const f of fs.readdirSync(uploadDir)) {
      if (f.startsWith('logo.')) fs.unlinkSync(path.join(uploadDir, f));
    }
  }
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('branding.logoUrl', '');
  res.json({ status: 'removed' });
});

// Sites routes (rate limiting handled per-route inside the router)
app.use('/api/sites', sitesRouter);

// Templates routes (GET open, POST/DELETE require API key — skipped in local mode)
app.use('/api/templates', (req, res, next) => {
  if (req.method === 'GET' || config.isLocalMode) {
    return next();
  }
  return adminAuth(req as any, res, next);
}, templatesRouter);

// Serve product-assets images (card images, icons, etc.)
const productAssetsDir = path.resolve(config.templateConfigsDir, '..', 'product-assets');
app.use('/api/assets', express.static(productAssetsDir, {
  maxAge: '1h',
  fallthrough: true,
}));

// Products routes (GET open, POST/PUT/DELETE require API key)
app.use('/api/products', (req, res, next) => {
  if (req.method === 'GET') {
    return next();
  }
  return adminAuth(req as any, res, next);
}, productsRouter);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error('[api] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(config.port, () => {
  console.log(`[api] WP Launcher API running on port ${config.port}`);
  console.log(`[api] Base domain: ${config.baseDomain}`);
  console.log(`[api] Environment: ${config.nodeEnv}`);
  console.log(`[api] Mode: ${config.appMode}`);
});

// Start cleanup scheduler
startCleanupScheduler();

// Start scheduled launch processor
startScheduleProcessor();

// Run orphan cleanup every 5 minutes
setInterval(() => {
  cleanupOrphanedContainers().catch((err) => {
    console.error('[api] Orphan cleanup error:', err);
  });
}, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[api] Shutting down...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[api] Shutting down...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});
