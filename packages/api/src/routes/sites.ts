import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { createSite, listSites, listUserSites, getSite, deleteSite, getSiteStatus, extendSite, getSiteLogsByUser, MAX_SITES_PER_USER } from '../services/site.service';
import { getPhpConfig, updatePhpConfig, updateAutoLoginToken, setSitePassword, getSitePasswordStatus, exportSiteZip, getExportDownloadUrl, getContainerStats, getDbCredentials } from '../services/docker.service';
import { takeSnapshot, listSnapshots, restoreSnapshotToSite, deleteSnapshot, cloneSite } from '../services/snapshot.service';
import { exportSiteAsTemplate } from '../services/template-export.service';
import { setCustomDomain, getCustomDomain, removeCustomDomain, getDnsInstructions } from '../services/domain.service';
import { conditionalAuth, conditionalOptionalAuth, AuthRequest } from '../middleware/userAuth';
import { scheduleNewLaunch, listScheduledLaunches, cancelScheduledLaunch } from '../services/schedule.service';
import { shareSite, listSiteShares, listSharedWithMe, revokeShare, updateShareRole } from '../services/share.service';
import { createTunnel, getTunnelStatus, removeTunnel } from '../services/tunnel.service';
import { config } from '../config';
import { asyncHandler } from '../utils/asyncHandler';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { validatePhpConfig } from '../utils/phpConfigValidation';
import { getDb } from '../utils/db';

function isFeatureEnabled(key: string): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(`feature.${key}`) as { value: string } | undefined;
  return row?.value === 'true';
}

const router = Router();

// Skip rate limiting for admin (API key) requests and local mode
function isAdminRequest(req: Request): boolean {
  if (config.isLocalMode) return true;
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey || !config.apiKey) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(config.apiKey));
  } catch {
    return false;
  }
}

// Tight limit on write operations (create/delete) — 10 per 15 min per IP
const siteWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isAdminRequest,
});

// Generous limit on read/polling operations — 120 per 15 min per IP
// (allows ~30 ready-polls per site launch with headroom for listing/status)
const siteReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isAdminRequest,
});

// Create a new demo site (requires auth)
router.post('/', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { productId, expiresIn, siteTitle, adminUser, adminPassword, adminEmail, dbEngine, phpVersion, subdomain, phpConfig, directFileAccess } = req.body;

  if (!productId) {
    throw new ValidationError('productId is required');
  }

  const site = await createSite({
    productId,
    expiresIn,
    userId: req.userId,
    userEmail: req.userEmail,
    siteTitle,
    adminUser,
    adminPassword,
    adminEmail,
    dbEngine,
    phpVersion,
    subdomain,
    phpConfig,
    directFileAccess,
  });

  res.status(201).json({
    id: site.id,
    url: site.site_url,
    adminUrl: site.admin_url,
    credentials: {
      username: site.admin_user,
      password: site.oneTimePassword,
    },
    expiresAt: site.expires_at,
    status: site.status,
  });
}));

// List sites - requires auth, shows user's own sites (admin sees all)
router.get('/', siteReadLimiter, conditionalAuth, (req: AuthRequest, res: Response) => {
  const productId = req.query.productId as string | undefined;
  let sites;

  if (req.userId && !req.query.all) {
    sites = listUserSites(req.userId);
  } else if (productId) {
    sites = listSites(productId);
  } else {
    sites = listSites();
  }

  const mapped = sites.map((s) => ({
    id: s.id,
    subdomain: s.subdomain,
    productId: s.product_id,
    url: s.site_url,
    adminUrl: s.admin_url,
    credentials: req.userId ? {
      username: s.admin_user,
    } : undefined,
    status: s.status,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    hostPath: config.isLocalMode && config.sitesHostPath
      ? `${config.sitesHostPath}\\${s.subdomain}`.replace(/[/\\]+/g, config.sitesHostPath.includes('\\') ? '\\' : '/')
      : undefined,
  }));

  if (req.userId) {
    res.json({ sites: mapped, maxSites: MAX_SITES_PER_USER });
  } else {
    res.json(mapped);
  }
});

// --- Scheduled Site Launch (must be before /:id to avoid route conflict) ---

router.post('/schedule', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isFeatureEnabled('scheduledLaunch')) throw new ForbiddenError('Scheduled launches are disabled');
  const { productId, scheduledAt, config } = req.body;
  if (!productId) throw new ValidationError('productId is required');
  if (!scheduledAt) throw new ValidationError('scheduledAt is required');
  const launch = scheduleNewLaunch(productId, scheduledAt, req.userId, req.userEmail, config);
  res.status(201).json(launch);
}));

router.get('/scheduled', siteReadLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isFeatureEnabled('scheduledLaunch')) throw new ForbiddenError('Scheduled launches are disabled');
  const launches = listScheduledLaunches(req.userId);
  res.json({ launches });
}));

router.delete('/scheduled/:id', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isFeatureEnabled('scheduledLaunch')) throw new ForbiddenError('Scheduled launches are disabled');
  cancelScheduledLaunch(req.params.id, req.userId);
  res.json({ message: 'Scheduled launch cancelled' });
}));

// --- Collaborative Sites ---

// List sites shared with me (must be before /:id)
router.get('/shared-with-me', siteReadLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.userId || !req.userEmail) throw new ForbiddenError('Authentication required');
  const shared = listSharedWithMe(req.userId, req.userEmail);
  res.json({ sites: shared });
}));

// Get a specific site (requires auth, users can only view their own)
router.get('/:id', siteReadLimiter, conditionalAuth, (req: AuthRequest, res: Response) => {
  const site = getSite(req.params.id);
  if (!site) {
    throw new NotFoundError('Site not found');
  }

  if (site.user_id && site.user_id !== req.userId) {
    throw new ForbiddenError('You can only view your own sites');
  }

  res.json({
    id: site.id,
    subdomain: site.subdomain,
    productId: site.product_id,
    url: site.site_url,
    adminUrl: site.admin_url,
    credentials: {
      username: site.admin_user,
    },
    status: site.status,
    createdAt: site.created_at,
    expiresAt: site.expires_at,
  });
});

// Generate a short-lived, single-use autologin URL
router.post('/:id/autologin', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const site = getSite(req.params.id);
  if (!site) throw new NotFoundError('Site not found');
  if (req.userId !== 'admin' && site.user_id !== req.userId) {
    throw new ForbiddenError('You can only access your own sites');
  }
  if (!site.container_id || site.status !== 'running') {
    throw new ValidationError('Site is not running');
  }

  // Generate a fresh token and update both DB and container
  const token = crypto.randomBytes(32).toString('base64url');
  const { getDb } = await import('../utils/db.js');
  getDb().prepare('UPDATE sites SET auto_login_token = ? WHERE id = ?').run(token, site.id);

  // Write the token to the container's filesystem
  await updateAutoLoginToken(site.container_id, token);

  res.json({
    autoLoginUrl: `${site.site_url}/wp-login.php?autologin=${token}`,
    expiresIn: 60,
  });
}));

// Extend site expiration
router.post('/:id/extend', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { duration } = req.body;
  if (!duration || typeof duration !== 'string') {
    throw new ValidationError('Duration is required (e.g., "30m", "1h", "1d")');
  }
  const result = extendSite(req.params.id, duration, req.userId, req.userEmail);
  res.json({ message: 'Site extended', expiresAt: result.expiresAt });
}));

// Get user's own activity log
router.get('/my/activity', siteReadLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const logs = getSiteLogsByUser(req.userId!);
  res.json(logs);
}));

// Get site status
router.get('/:id/status', siteReadLimiter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const status = await getSiteStatus(req.params.id);
  res.json(status);
}));

// Check if site's WordPress is fully ready (installed and responding)
router.get('/:id/ready', siteReadLimiter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const site = getSite(req.params.id);
  if (!site) {
    throw new NotFoundError('Site not found');
  }

  if (site.status !== 'running' || !site.site_url) {
    res.json({ ready: false, reason: 'container not running' });
    return;
  }

  // Probe the ready marker file written by entrypoint.sh after ALL setup completes
  // (plugins, themes, demo content — not just WP core install)
  const markerUrl = `http://wp-site-${site.subdomain}/.wp-launcher-ready`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const probe = await fetch(markerUrl, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const ready = probe.status === 200;
    res.json({ ready });
  } catch {
    res.json({ ready: false, reason: 'site not responding' });
  }
}));

// Get current PHP config from a running site (requires auth + ownership)
router.get('/:id/php-config', conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const site = getSite(req.params.id);
  if (!site) {
    throw new NotFoundError('Site not found');
  }
  if (req.userId !== 'admin' && site.user_id !== req.userId) {
    throw new ForbiddenError('You can only view your own sites');
  }
  if (!site.container_id || site.status !== 'running') {
    throw new ValidationError('Site is not running');
  }
  const phpConfig = await getPhpConfig(site.container_id);
  res.json(phpConfig);
}));

// Update PHP config on a running site (requires auth)
router.patch('/:id/php-config', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const site = getSite(req.params.id);
  if (!site) {
    throw new NotFoundError('Site not found');
  }

  // Users can only update their own sites (admin bypasses)
  if (req.userId && req.userId !== 'admin' && site.user_id !== req.userId) {
    throw new ForbiddenError('You can only update your own sites');
  }

  if (!site.container_id || site.status !== 'running') {
    throw new ValidationError('Site is not running');
  }

  validatePhpConfig(req.body);
  await updatePhpConfig(site.container_id, req.body);
  res.json({ status: 'updated' });
}));

// --- Snapshots & Cloning ---

// Clone a site
router.post('/:id/clone', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await cloneSite(req.params.id, req.userId, {
    subdomain: req.body.subdomain,
    expiresIn: req.body.expiresIn,
  });
  res.status(201).json(result);
}));

// Take a snapshot
router.post('/:id/snapshots', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const snapshot = await takeSnapshot(req.params.id, req.body.name, req.userId);
  res.status(201).json(snapshot);
}));

// List snapshots (requires auth)
router.get('/:id/snapshots', conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const snapshots = listSnapshots(req.params.id, req.userId);
  res.json(snapshots);
}));

// Restore a snapshot
router.post('/:id/snapshots/:snapshotId/restore', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  await restoreSnapshotToSite(req.params.id, req.params.snapshotId, req.userId);
  res.json({ status: 'restored' });
}));

// Delete a snapshot
router.delete('/:id/snapshots/:snapshotId', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  await deleteSnapshot(req.params.id, req.params.snapshotId, req.userId);
  res.json({ message: 'Snapshot deleted' });
}));

// --- Custom Domain ---

// Set custom domain
router.put('/:id/domain', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { domain } = req.body;
  if (!domain) {
    throw new ValidationError('domain is required');
  }
  const result = await setCustomDomain(req.params.id, domain, req.userId);
  res.json({ ...result, dns: await getDnsInstructions() });
}));

// Get custom domain status (requires auth)
router.get('/:id/domain', conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await getCustomDomain(req.params.id, req.userId);
  res.json({ ...result, dns: await getDnsInstructions() });
}));

// Remove custom domain
router.delete('/:id/domain', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  await removeCustomDomain(req.params.id, req.userId);
  res.json({ message: 'Custom domain removed' });
}));

// Export site as template
router.post('/:id/export-template', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { templateId, templateName } = req.body;
  if (!templateId) {
    throw new ValidationError('templateId is required');
  }
  const config = await exportSiteAsTemplate(req.params.id, templateId, templateName || templateId, req.userId);
  res.status(201).json(config);
}));

// --- Site Health Monitoring ---

router.get('/:id/stats', siteReadLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isFeatureEnabled('healthMonitoring')) throw new ForbiddenError('Health monitoring is disabled');
  const site = getSite(req.params.id);
  if (!site) throw new NotFoundError('Site not found');
  if (req.userId !== 'admin' && site.user_id !== req.userId) throw new ForbiddenError('You can only view your own sites');
  if (!site.container_id || site.status !== 'running') throw new ValidationError('Site is not running');
  const stats = await getContainerStats(site.container_id);
  res.json(stats);
}));

// --- Site Password Protection ---

router.get('/:id/password', siteReadLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isFeatureEnabled('sitePassword')) throw new ForbiddenError('Site password protection is disabled');
  const site = getSite(req.params.id);
  if (!site) throw new NotFoundError('Site not found');
  if (req.userId !== 'admin' && site.user_id !== req.userId) throw new ForbiddenError('You can only view your own sites');
  if (!site.container_id) throw new ValidationError('Site has no container');
  const status = await getSitePasswordStatus(site.container_id);
  res.json(status);
}));

router.patch('/:id/password', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isFeatureEnabled('sitePassword')) throw new ForbiddenError('Site password protection is disabled');
  const site = getSite(req.params.id);
  if (!site) throw new NotFoundError('Site not found');
  if (req.userId !== 'admin' && site.user_id !== req.userId) throw new ForbiddenError('You can only modify your own sites');
  if (!site.container_id || site.status !== 'running') throw new ValidationError('Site is not running');
  const { password, scope } = req.body;
  if (password && (typeof password !== 'string' || password.length < 4)) throw new ValidationError('Password must be at least 4 characters');
  const validScopes = ['frontend', 'admin', 'all'];
  if (scope && !validScopes.includes(scope)) throw new ValidationError('Scope must be frontend, admin, or all');
  await setSitePassword(site.container_id, password || null, scope);
  res.json({ status: password ? 'protected' : 'unprotected', scope: password ? (scope || 'frontend') : null });
}));

// --- Export Site as ZIP ---

router.post('/:id/export-zip', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isFeatureEnabled('exportZip')) throw new ForbiddenError('Site export is disabled');
  const site = getSite(req.params.id);
  if (!site) throw new NotFoundError('Site not found');
  if (req.userId !== 'admin' && site.user_id !== req.userId) throw new ForbiddenError('You can only export your own sites');
  if (!site.container_id || site.status !== 'running') throw new ValidationError('Site is not running');
  const result = await exportSiteZip(site.container_id);
  res.json({
    downloadUrl: `/api/sites/${req.params.id}/export-zip/${result.exportId}/download`,
    sizeBytes: result.sizeBytes,
    dbEngine: result.dbEngine,
  });
}));

router.get('/:id/export-zip/:exportId/download', conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const site = getSite(req.params.id);
  if (!site) throw new NotFoundError('Site not found');
  if (req.userId !== 'admin' && site.user_id !== req.userId) throw new ForbiddenError('Access denied');
  const { exportId } = req.params;
  if (!/^export-\d+$/.test(exportId)) throw new ValidationError('Invalid export ID');
  // Proxy the download from provisioner
  const downloadUrl = getExportDownloadUrl(exportId);
  const provRes = await fetch(downloadUrl, {
    headers: { 'x-internal-key': process.env.PROVISIONER_INTERNAL_KEY || '' },
  });
  if (!provRes.ok) throw new NotFoundError('Export not found or already downloaded');
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${site.subdomain}-export.tar.gz"`);
  const body = provRes.body;
  if (body) {
    const reader = body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    await pump();
  } else {
    res.end();
  }
}));

// --- Database Credentials (Adminer) ---

router.get('/:id/db-credentials', conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isFeatureEnabled('adminer')) throw new ForbiddenError('Database manager is disabled');
  const site = getSite(req.params.id);
  if (!site) throw new NotFoundError('Site not found');
  if (req.userId !== 'admin' && site.user_id !== req.userId) throw new ForbiddenError('You can only access your own sites');
  if (!site.container_id || site.status !== 'running') throw new ValidationError('Site is not running');

  const credentials = await getDbCredentials(site.container_id);

  if (credentials.dbEngine === 'sqlite') {
    res.json({ dbEngine: 'sqlite', supported: false, message: 'SQLite sites use a file-based database and do not support Adminer' });
    return;
  }

  const baseDomain = config.baseDomain;
  const protocol = config.nodeEnv === 'production' ? 'https' : 'http';
  const adminerUrl = `${protocol}://db.${baseDomain}`;

  res.json({
    dbEngine: credentials.dbEngine,
    supported: true,
    host: credentials.host,
    user: credentials.user,
    password: credentials.password,
    database: credentials.database,
    adminerUrl,
  });
}));

// --- Public Sharing (Tunnels) ---

router.post('/:id/tunnel', conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isFeatureEnabled('publicSharing')) throw new ForbiddenError('Public sharing is disabled');
  const site = getSite(req.params.id);
  if (!site) throw new NotFoundError('Site not found');
  if (req.userId !== 'admin' && site.user_id !== req.userId) throw new ForbiddenError('You can only share your own sites');
  if (!site.container_id || site.status !== 'running') throw new ValidationError('Site is not running');

  const { method, ngrokAuthToken } = req.body;
  if (!method || !['lan', 'cloudflare', 'ngrok'].includes(method)) {
    throw new ValidationError('method must be lan, cloudflare, or ngrok');
  }
  if (method === 'ngrok' && !ngrokAuthToken) {
    throw new ValidationError('ngrokAuthToken is required for ngrok sharing');
  }

  const result = await createTunnel(site.subdomain, method, ngrokAuthToken);
  res.status(201).json(result);
}));

router.get('/:id/tunnel', conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isFeatureEnabled('publicSharing')) throw new ForbiddenError('Public sharing is disabled');
  const site = getSite(req.params.id);
  if (!site) throw new NotFoundError('Site not found');
  if (req.userId !== 'admin' && site.user_id !== req.userId) throw new ForbiddenError('Access denied');

  const status = await getTunnelStatus(site.subdomain);
  res.json(status);
}));

router.delete('/:id/tunnel', conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isFeatureEnabled('publicSharing')) throw new ForbiddenError('Public sharing is disabled');
  const site = getSite(req.params.id);
  if (!site) throw new NotFoundError('Site not found');
  if (req.userId !== 'admin' && site.user_id !== req.userId) throw new ForbiddenError('Access denied');

  await removeTunnel(site.subdomain);
  res.json({ message: 'Tunnel removed' });
}));

// --- Site Sharing ---

router.get('/:id/shares', siteReadLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const shares = listSiteShares(req.params.id, req.userId!);
  res.json({ shares });
}));

router.post('/:id/share', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, role } = req.body;
  if (!email) throw new ValidationError('Email is required');
  const validRoles = ['viewer', 'admin'];
  const shareRole = validRoles.includes(role) ? role : 'viewer';
  const share = shareSite(req.params.id, req.userId!, email, shareRole);
  res.status(201).json(share);
}));

router.patch('/:id/shares/:shareId', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { role } = req.body;
  if (!role || !['viewer', 'admin'].includes(role)) throw new ValidationError('Role must be viewer or admin');
  updateShareRole(req.params.shareId, req.userId!, role);
  res.json({ message: 'Role updated' });
}));

router.delete('/:id/shares/:shareId', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  revokeShare(req.params.shareId, req.userId!);
  res.json({ message: 'Share revoked' });
}));

// Delete a site (requires auth - users can only delete their own)
router.delete('/:id', siteWriteLimiter, conditionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  await deleteSite(req.params.id, req.userId, req.userEmail);
  res.json({ message: 'Site deleted successfully' });
}));

export default router;
