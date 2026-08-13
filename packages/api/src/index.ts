import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { adminAuth } from './middleware/auth';
import { optionalUserAuth, AuthRequest } from './middleware/userAuth';
import {
  ALL_FEATURES, ADMIN_ONLY_FEATURES, GRANTABLE_FEATURES,
  adminSettingKey, demoSettingKey, isAdminOnlyFeature, effectiveFeatures,
} from './services/features.service';
import { csrfProtection } from './middleware/csrf';
import sitesRouter from './routes/sites';
import blueprintsRouter from './routes/blueprints';
import { listBlueprints } from './services/blueprint.service';
import authRouter from './routes/auth';
import setupRouter from './routes/setup';
import adminRouter from './routes/admin';
import analyticsRouter from './routes/analytics';
import bulkRouter from './routes/bulk';
import imagesRouter from './routes/images';
import syncRouter from './routes/sync';
import projectsRouter from './routes/projects';
import productivityRouter from './routes/productivity';
import monitoringRouter from './routes/monitoring';
import { startCleanupScheduler, cleanupOrphanedContainers } from './services/cleanup.service';
import { startScheduleProcessor } from './services/schedule.service';
import { startProductivitySync } from './services/productivity-sync.service';
import { ensureHeartbeatSecret } from './services/productivity.service';
import { reconcileStuckImageBuilds } from './services/imageBuildJob.service';
import { publicApiBaseUrl, isLocalDeployment } from './utils/deployment';
import { needsAdminForBlueprintRequest } from './utils/blueprintGuard';
import { closeDb, getDb } from './utils/db';
import { getPanelSettings } from './services/settings.service';
import { policy } from './policy';
import { AppError } from './utils/errors';
import { Request, Response, NextFunction } from 'express';

const app = express();

// Trust the reverse proxy (Traefik) so rate limiting uses real client IPs
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(csrfProtection);

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

// Endpoints that send email on demand get a tight cap so a compromised admin
// token can't turn them into a spam relay.
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many invitations. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Unauthenticated public surfaces (demo portal listing).
const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
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

// Serve uploaded branding assets (logos, etc.) with restrictive headers
const uploadsDir = path.resolve(config.dataDir, 'uploads');
app.use('/api/uploads', (_req, res, next) => {
  // Neutralize script execution in any uploaded file (defense-in-depth for XSS via uploaded content)
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(uploadsDir, { maxAge: '1h', fallthrough: true }));

/*
 * Public demo portal: the blueprints an anonymous visitor may launch. Only the
 * display fields are exposed — never plugin lists, docker images or admin
 * credentials — and the whole endpoint is dark unless the portal is enabled.
 */
app.get('/api/public/blueprints', publicReadLimiter, (_req, res) => {
  if (!policy.demoPortalEnabled()) {
    res.status(404).json({ error: 'The demo portal is not enabled on this panel' });
    return;
  }
  const blueprints = listBlueprints()
    .filter((b) => b.public)
    .map((b) => ({
      id: b.id,
      name: b.name,
      description: b.branding?.description || '',
      imageUrl: b.branding?.image_url || '',
    }));
  res.json({ blueprints });
});

// Public UI settings (includes feature flags + branding)
app.get('/api/settings', optionalUserAuth, (req: AuthRequest, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  // Resolved for the caller, not the raw admin set: a member must not be shown
  // actions their role cannot use. Anonymous resolves as a member.
  const features = effectiveFeatures(req.userRole);
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
    cardLayout: branding.cardLayout || config.ui.cardLayout,
    baseDomain: config.baseDomain,
    features,
    branding: {
      siteTitle: branding.siteTitle || 'WP Launcher',
      logoUrl: branding.logoUrl || '',
      cardLayout: branding.cardLayout || config.ui.cardLayout,
    },
    colors,
    sitesHostPath: config.sitesHostPath,
    panel: getPanelSettings(),
    setupRequired: !policy.setupComplete(),
    // Advisory only: drives the "needs email" hint on feature toggles.
    smtpConfigured: !!(config.smtp.host && config.smtp.host !== 'localhost'),
  });
});

// First-run setup (unauthenticated by necessity; rate limited inside the router)
app.use('/api/setup', setupRouter);

// Auth routes with split rate limiting.
// Write ops (login, register, verify, set-password) get strict limits
app.post('/api/auth/register', authWriteLimiter);
app.post('/api/auth/verify', authWriteLimiter);
app.post('/api/auth/set-password', authWriteLimiter);
app.post('/api/auth/login', authWriteLimiter);
app.post('/api/auth/change-email', authWriteLimiter);
app.post('/api/auth/verify-email-change', authWriteLimiter);
// Read ops (/me, logout, update-password, profile) get relaxed limits
app.get('/api/auth/me', authReadLimiter);
app.post('/api/auth/logout', authReadLimiter);
app.post('/api/auth/update-password', authReadLimiter);
app.patch('/api/auth/profile', authReadLimiter);
// Avatar writes a file per call; cap it like other auth writes.
app.post('/api/auth/avatar', authWriteLimiter);
app.delete('/api/auth/avatar', authReadLimiter);
app.use('/api/auth', authRouter);

// Sending an invitation dispatches an email — throttle it hard (in addition to
// the general admin limiter applied when the router mounts).
app.post('/api/admin/users/invite', inviteLimiter);

// Admin routes — admin JWT or M2M API key, rate limited
app.use('/api/admin', adminLimiter, adminRouter);
app.use('/api/admin/analytics', analyticsRouter);
app.use('/api/admin/monitoring', monitoringRouter);
app.use('/api/admin/bulk', bulkRouter);
app.use('/api/admin/images', imagesRouter);

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
  });
});

// Check for updates (admin only) — compares local version with latest GitHub release
app.get('/api/admin/system/update-check', adminAuth, async (_req, res) => {
  try {
    const info = readVersionInfo();
    const currentVersion = info.version || '0.0.0';

    // In development mode (running from source with tsx watch), skip update checks
    if (config.nodeEnv === 'development') {
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
  const demoFeatures: Record<string, boolean> = {};
  for (const row of rows) {
    // Test the demo prefix first, or a demo row is misread as an admin feature
    // literally named "demo.cloning".
    if (row.key.startsWith('feature.demo.')) {
      demoFeatures[row.key.replace('feature.demo.', '')] = row.value === 'true';
    } else {
      features[row.key.replace('feature.', '')] = row.value === 'true';
    }
  }
  // Absent rows read as off, so the UI gets a complete map either way.
  for (const key of ALL_FEATURES) features[key] = features[key] ?? false;
  for (const key of GRANTABLE_FEATURES) demoFeatures[key] = demoFeatures[key] ?? false;
  res.json({
    features,
    demoFeatures,
    // Served so the dashboard never keeps a second copy of the classification.
    catalog: { adminOnly: ADMIN_ONLY_FEATURES, grantable: GRANTABLE_FEATURES },
    // Only worth showing the members column once non-admin users can exist.
    demoColumnVisible: policy.allowsPublicRegistration() || policy.demoPortalEnabled(),
  });
});

app.put('/api/admin/features', adminAuth, (req, res) => {
  const db = getDb();
  const { features, demoFeatures } = req.body as {
    features?: Record<string, boolean>;
    demoFeatures?: Record<string, boolean>;
  };
  if (!features && !demoFeatures) {
    res.status(400).json({ error: 'features or demoFeatures object is required' });
    return;
  }
  // Granting an admin-only capability to members is not a silent no-op: it means
  // the caller misunderstands the model, so say so.
  const illegal = Object.keys(demoFeatures || {}).filter((k) => isAdminOnlyFeature(k));
  if (illegal.length) {
    res.status(400).json({ error: `These features cannot be granted to demo users: ${illegal.join(', ')}` });
    return;
  }
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [name, enabled] of Object.entries(features || {})) {
    if (ALL_FEATURES.includes(name)) update.run(adminSettingKey(name), String(enabled));
  }
  for (const [name, enabled] of Object.entries(demoFeatures || {})) {
    if (GRANTABLE_FEATURES.includes(name)) update.run(demoSettingKey(name), String(enabled));
  }
  // Tracking needs a heartbeat secret to authenticate its clients, and that is
  // independent of any cloud account — mint it when the feature is switched on so
  // a localhost install works with no further setup.
  if (features?.productivityMonitor === true) {
    try {
      ensureHeartbeatSecret();
    } catch (err: any) {
      console.error('[productivity] could not mint heartbeat secret:', err.message);
    }
  }
  res.json({ status: 'updated' });
});

// Branding settings (available in both modes — no auth needed in local mode)
// In agency mode, adminLimiter already applied via /api/admin prefix mount
const brandingAuth = [adminAuth];

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
    // SVG uploads are rejected — SVGs can contain embedded scripts (XSS risk)
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.some((t: string) => contentType.startsWith(t))) {
      res.status(400).json({ error: 'Invalid file type. Allowed: PNG, JPEG, WebP, GIF' });
      return;
    }
    const body = Buffer.concat(chunks);
    if (body.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'File too large (max 2MB)' });
      return;
    }
    const ext = contentType.includes('png') ? '.png'
      : contentType.includes('jpeg') ? '.jpg'
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

// Sync routes — mounted before JSON parser for /api/sync/receive (binary body)
// The receive endpoint handles application/octet-stream, not JSON
app.use('/api/sync', syncRouter);

// Projects, clients, invoices routes (auth + feature gate handled inside router)
app.use('/api/projects', projectsRouter);

// Productivity monitor routes (heartbeat ingestion, stats, cloud sync)
app.use('/api/productivity', productivityRouter);

// Sites routes (rate limiting handled per-route inside the router)
app.use('/api/sites', sitesRouter);

// Blueprints (GET open, writes require an admin JWT or the M2M API key).
// /api/products and /api/templates are deprecated aliases kept so existing
// API callers and scripts keep working.
const blueprintGuard = (req: any, res: any, next: any) => {
  if (!needsAdminForBlueprintRequest(req.method, req.query || {})) return next();
  return adminAuth(req, res, next);
};
app.use('/api/blueprints', blueprintGuard, blueprintsRouter);
app.use('/api/products', blueprintGuard, blueprintsRouter);
app.use('/api/templates', blueprintGuard, blueprintsRouter);

// Serve product-assets images (card images, icons, etc.) with restrictive headers
const productAssetsDir = path.resolve(config.blueprintConfigsDir, '..', 'product-assets');
app.use('/api/assets', (_req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(productAssetsDir, {
  maxAge: '1h',
  fallthrough: true,
}));

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
  console.log(`[api] Public API URL for clients: ${publicApiBaseUrl()} (${isLocalDeployment() ? 'local' : 'public'} deployment)`);
});

// Backfill a heartbeat secret for installs that enabled tracking before it was
// decoupled from cloud linking — without one, ingestion would reject every client.
try {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'feature.productivityMonitor'").get() as { value?: string } | undefined;
  if (row?.value === 'true') ensureHeartbeatSecret();
} catch (err: any) {
  console.error('[productivity] heartbeat secret backfill failed:', err.message);
}

// An image build's runner lives in this process, so a build still marked
// 'building' when the API starts can never finish and is failed here. This must
// run only on API startup, NOT from initDb(): getDb() initialises lazily, so any
// one-off script or CLI process that opens the database would otherwise reconcile
// — and silently kill a build running in the real server.
try {
  reconcileStuckImageBuilds();
} catch (err: any) {
  console.error('[images] stuck build reconcile failed:', err.message);
}

// Start cleanup scheduler
startCleanupScheduler();

// Start scheduled launch processor
startScheduleProcessor();

// Start productivity cloud sync scheduler (every 6 hours)
startProductivitySync();

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
