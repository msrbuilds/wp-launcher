import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '../utils/db';
import { generateSubdomain, isValidSubdomain } from '../utils/nameGenerator';
import { config, parseExpiration } from '../config';
import {
  createSiteContainer,
  removeSiteContainer,
  getContainerStatus,
  enableBindMounts,
} from './docker.service';
import { fireWebhookEvent } from './webhook.service';
import { getBlueprint } from './blueprint.service';
import { getCloudConfig } from './productivity.service';
import { ConflictError, ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';
import { policy } from '../policy';

export interface CreateSiteRequest {
  blueprintId: string;
  expiresIn?: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  // Local mode overrides
  siteTitle?: string;
  adminUser?: string;
  adminPassword?: string;
  adminEmail?: string;
  dbEngine?: 'sqlite' | 'mysql' | 'mariadb';
  phpVersion?: string;
  subdomain?: string;
  phpConfig?: {
    memoryLimit?: string;
    uploadMaxFilesize?: string;
    postMaxSize?: string;
    maxExecutionTime?: string;
    maxInputVars?: string;
    displayErrors?: string;
    extensions?: string;
  };
  directFileAccess?: boolean;
  restrictCapabilities?: boolean;
}

export interface SiteRecord {
  id: string;
  subdomain: string;
  blueprint_id: string;
  user_id: string | null;
  container_id: string | null;
  status: string;
  site_url: string | null;
  admin_url: string | null;
  admin_user: string | null;
  admin_password: string | null;
  auto_login_token: string | null;
  created_at: string;
  expires_at: string;
  deleted_at: string | null;
  /** 1 when wp-content plugins/themes are bind-mounted to the host. */
  direct_file_access: number;
  /** 1 when the WordPress admin is locked down for this site. */
  restrict_capabilities: number;
  origin: string;
}

function logSiteAction(siteRecord: SiteRecord, action: string, userEmail?: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO site_logs (site_id, user_id, user_email, blueprint_id, subdomain, site_url, action)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    siteRecord.id,
    siteRecord.user_id,
    userEmail || null,
    siteRecord.blueprint_id,
    siteRecord.subdomain,
    siteRecord.site_url,
    action,
  );
}

export async function createSite(req: CreateSiteRequest): Promise<SiteRecord & { oneTimePassword: string }> {
  const db = getDb();
  const blueprint = getBlueprint(req.blueprintId);

  // Validate subdomain early (before transaction) if custom
  let subdomain = '';
  if (req.subdomain) {
    const cleaned = req.subdomain.toLowerCase().trim();
    if (!isValidSubdomain(cleaned)) {
      throw new ValidationError('Invalid subdomain. Use 3-63 lowercase letters, numbers, and hyphens (no leading/trailing hyphens).');
    }
    subdomain = cleaned;
  } else {
    // Generate a unique subdomain, retrying on collision with active records
    for (let attempt = 0; attempt < 10; attempt++) {
      subdomain = generateSubdomain();
      const exists = db.prepare("SELECT 1 FROM sites WHERE subdomain = ? AND status NOT IN ('expired', 'error')").get(subdomain);
      if (!exists) break;
      if (attempt === 9) throw new ConflictError('Failed to generate a unique subdomain. Please try again.');
    }
  }

  const expiresIn = req.expiresIn || blueprint?.demo?.default_expiration || config.defaults.expiration;
  const expirationMs = parseExpiration(expiresIn);
  const expiresAt = expirationMs === 0
    ? '9999-12-31T23:59:59.999Z'
    : new Date(Date.now() + expirationMs).toISOString();

  const protocol = config.nodeEnv === 'production' ? 'https' : 'http';
  const siteUrl = `${protocol}://${subdomain}.${config.baseDomain}`;
  const adminUrl = `${siteUrl}/wp-admin/`;

  const adminUser = req.adminUser || blueprint?.demo?.admin_user || 'demo';
  const adminPassword = req.adminPassword || crypto.randomBytes(16).toString('base64url');
  const autoLoginToken = ''; // generated on-demand via POST /api/sites/:id/autologin
  const adminEmail = req.adminEmail || blueprint?.demo?.admin_email || 'demo@example.com';
  const siteTitle = req.siteTitle || blueprint?.name || 'Demo Site';

  const id = uuidv4();
  const maxConcurrent = blueprint?.demo?.max_concurrent_sites ?? config.defaults.maxConcurrentSites;

  // Atomic transaction: check all limits + insert site record
  const insertSiteTxn = db.transaction(() => {
    // Check per-user limit (0 = unlimited)
    const userQuota = policy.quotaForRole(req.userRole || 'member');
    if (req.userId && req.userId !== 'admin' && userQuota > 0) {
      const userCount = db
        .prepare("SELECT COUNT(*) as count FROM sites WHERE user_id = ? AND status = 'running'")
        .get(req.userId) as { count: number };
      if (userCount.count >= userQuota) {
        throw new ConflictError(`You already have ${userQuota} active sites. Please delete one before creating a new one.`);
      }
    }

    // Check global total site limit (0 = unlimited)
    const totalQuota = policy.totalSiteQuota();
    if (totalQuota > 0) {
      const totalActive = db
        .prepare("SELECT COUNT(*) as count FROM sites WHERE status = 'running'")
        .get() as { count: number };
      if (totalActive.count >= totalQuota) {
        throw new ConflictError('This server is currently at capacity. Please try again in a few minutes.');
      }
    }

    // Check concurrent site limit per product
    const productCount = db
      .prepare("SELECT COUNT(*) as count FROM sites WHERE blueprint_id = ? AND status = 'running'")
      .get(req.blueprintId) as { count: number };
    if (maxConcurrent > 0 && productCount.count >= maxConcurrent) {
      throw new ConflictError(`Maximum concurrent sites (${maxConcurrent}) reached for this product.`);
    }

    // Check subdomain uniqueness
    if (req.subdomain) {
      const existing = db.prepare("SELECT id FROM sites WHERE subdomain = ? AND status NOT IN ('expired', 'error')").get(subdomain);
      if (existing) {
        throw new ConflictError(`Subdomain "${subdomain}" is already in use. Please choose a different one.`);
      }
    }

    // Insert site record
    db.prepare(`
      INSERT INTO sites (id, subdomain, blueprint_id, user_id, status, site_url, admin_url, admin_user, admin_password, auto_login_token, expires_at, direct_file_access, restrict_capabilities)
      VALUES (?, ?, ?, ?, 'creating', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, subdomain, req.blueprintId, req.userId || null, siteUrl, adminUrl, adminUser, adminPassword, autoLoginToken, expiresAt, req.directFileAccess ? 1 : 0, (req.restrictCapabilities ?? policy.defaultRestrictCapabilities()) ? 1 : 0);
  });

  insertSiteTxn();

  // Separate plugins into install+activate vs install-only
  const installAndActivate: string[] = [];  // plugins to install with --activate flag
  const installOnly: string[] = [];          // plugins to install without activation
  const activateOnly: string[] = [];         // already-present plugins to activate by slug

  for (const p of (blueprint?.plugins?.preinstall || [])) {
    let ref = '';
    if (p.source === 'wordpress.org' && p.slug) {
      ref = p.slug;
    } else if (p.source === 'url' && p.url) {
      ref = p.url;
    } else if (p.source === 'local' && p.path) {
      ref = `/product-assets/${p.path.replace(/^product-assets\//, '')}`;
    }
    if (!ref) continue;

    if (p.activate) {
      installAndActivate.push(ref);
    } else {
      installOnly.push(ref);
    }
  }

  const installActivatePluginsList = installAndActivate.join(',');
  const installPluginsList = installOnly.join(',');
  const activatePluginsList = activateOnly.join(',');

  const pluginsToRemove = (blueprint?.plugins?.remove || []).join(',');

  // Build theme install list
  const installThemesList: string[] = [];
  let activeTheme = '';
  for (const t of (blueprint?.themes?.install || [])) {
    if (t.source === 'wordpress.org' && t.slug) {
      installThemesList.push(t.slug);
      if (t.activate) activeTheme = t.slug;
    } else if (t.source === 'url' && t.url) {
      installThemesList.push(t.url);
      if (t.activate) activeTheme = t.url.split('/').pop()?.replace(/\.zip$/, '') || '';
    } else if (t.source === 'local' && t.path) {
      installThemesList.push(`/product-assets/${t.path.replace(/^product-assets\//, '')}`);
      if (t.activate) activeTheme = t.path.split('/').pop()?.replace(/\.zip$/, '') || '';
    }
  }

  const landingPage = blueprint?.demo?.landing_page || '';

  const VALID_PHP_VERSIONS = ['7.4', '8.1', '8.2', '8.3'];
  const phpVersion = req.phpVersion && VALID_PHP_VERSIONS.includes(req.phpVersion) ? req.phpVersion : null;
  const image = blueprint?.docker?.image
    || (phpVersion ? `wp-launcher/wordpress:php${phpVersion}` : config.wpImage);
  const dbEngine = req.dbEngine || blueprint?.database || 'sqlite';

  try {
    // SBP-004: Pass heartbeat secret to container so MU-plugin can authenticate
    let heartbeatSecret: string | undefined;
    try {
      const cloudCfg = getCloudConfig();
      if (cloudCfg.heartbeat_secret) heartbeatSecret = cloudCfg.heartbeat_secret;
    } catch { /* cloud config may not exist yet */ }

    const containerId = await createSiteContainer({
      subdomain,
      image,
      expiresAt,
      siteUrl,
      adminUser,
      adminPassword,
      adminEmail,
      siteTitle,
      installActivatePlugins: installActivatePluginsList,
      installPlugins: installPluginsList,
      activatePlugins: activatePluginsList,
      removePlugins: pluginsToRemove,
      installThemes: installThemesList.join(','),
      activeTheme,
      landingPage,
      dbEngine,
      autoLoginToken,
      restrictCapabilities: req.restrictCapabilities ?? policy.defaultRestrictCapabilities(),
      enforceResourceLimits: policy.enforcesResourceLimits(),
      phpConfig: req.phpConfig,
      heartbeatSecret,
      directFileAccess: req.directFileAccess,
    });

    // Clear password from DB now that it's been sent to the container — it's only needed at provision time
    db.prepare("UPDATE sites SET container_id = ?, status = 'running', admin_password = NULL WHERE id = ?").run(containerId, id);
  } catch (err) {
    // Clear password and free subdomain on error so it can be reused
    const errorSubdomain = `${subdomain}--error-${Date.now()}`;
    db.prepare("UPDATE sites SET status = 'error', admin_password = NULL, subdomain = ? WHERE id = ?").run(errorSubdomain, id);
    throw err;
  }

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRecord;

  logSiteAction(site, 'created', req.userEmail);

  fireWebhookEvent('site.created', {
    siteId: site.id, subdomain: site.subdomain, blueprintId: site.blueprint_id,
    siteUrl: site.site_url, expiresAt: site.expires_at, userEmail: req.userEmail,
  }).catch(() => {});

  // Background: after host sync completes, upgrade container to use bind mount overlays
  // so host edits are live inside the container (bidirectional file access)
  if (req.directFileAccess && config.sitesHostPath) {
    (async () => {
      try {
        const syncMarkerUrl = `http://wp-site-${subdomain}/.wp-launcher-synced`;
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 5000));
          try {
            const probe = await fetch(syncMarkerUrl, { signal: AbortSignal.timeout(3000) });
            if (probe.status === 200) break;
          } catch { /* keep polling */ }
        }
        // Re-read site to get current container_id (in case it changed)
        const current = db.prepare('SELECT container_id, status FROM sites WHERE id = ?').get(id) as any;
        if (!current || current.status !== 'running' || !current.container_id) return;

        const newContainerId = await enableBindMounts(current.container_id, subdomain);
        db.prepare('UPDATE sites SET container_id = ? WHERE id = ?').run(newContainerId, id);
        console.log(`[site] Upgraded ${subdomain} to live bind mounts (new container: ${newContainerId.slice(0, 12)})`);
      } catch (err: any) {
        console.error(`[site] Failed to upgrade ${subdomain} to bind mounts:`, err.message);
      }
    })();
  }

  return { ...site, oneTimePassword: adminPassword };
}

export function listSites(blueprintId?: string): SiteRecord[] {
  const db = getDb();

  if (blueprintId) {
    return db
      .prepare("SELECT * FROM sites WHERE blueprint_id = ? AND status != 'expired' ORDER BY created_at DESC")
      .all(blueprintId) as SiteRecord[];
  }

  return db
    .prepare("SELECT * FROM sites WHERE status != 'expired' ORDER BY created_at DESC")
    .all() as SiteRecord[];
}

export function listUserSites(userId: string): SiteRecord[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM sites WHERE user_id = ? AND status != 'expired' ORDER BY created_at DESC")
    .all(userId) as SiteRecord[];
}

export function getSite(id: string): SiteRecord | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRecord | undefined;
}

export async function deleteSite(id: string, userId?: string, userEmail?: string): Promise<void> {
  const db = getDb();
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRecord | undefined;

  if (!site) {
    throw new NotFoundError('Site not found');
  }

  // If userId provided, ensure user owns the site (admin bypasses)
  if (userId && userId !== 'admin' && site.user_id !== userId) {
    throw new ForbiddenError('You can only delete your own sites');
  }

  // Mark the DB row as expired up-front and free the subdomain. This lets the
  // HTTP response return in milliseconds instead of blocking the dashboard for
  // 10–60s while Docker tears down the container. The orphan watchdog cleans
  // up the container even if the async cleanup below crashes mid-way.
  const deleteTxn = db.transaction(() => {
    const freedSubdomain = `${site.subdomain}--deleted-${Date.now()}`;
    db.prepare("UPDATE sites SET status = 'expired', deleted_at = datetime('now'), subdomain = ? WHERE id = ?").run(freedSubdomain, id);
    logSiteAction(site, 'deleted', userEmail);
  });
  deleteTxn();

  // Tear down container + host dir + webhook async — caller has already returned.
  void (async () => {
    if (site.container_id) {
      try {
        await removeSiteContainer(site.container_id);
      } catch (err: any) {
        console.error(`[site] Background container removal failed for ${site.subdomain}:`, err.message);
      }
    }
    try {
      cleanupSiteDir(site.subdomain);
    } catch (err: any) {
      console.error(`[site] Background site dir cleanup failed for ${site.subdomain}:`, err.message);
    }
    fireWebhookEvent('site.deleted', {
      siteId: site.id, subdomain: site.subdomain, blueprintId: site.blueprint_id,
      siteUrl: site.site_url, userEmail,
    }).catch(() => {});
  })();
}

/** Remove the host-side site directory (sites/{subdomain}/) if SITES_DIR is configured */
export function cleanupSiteDir(subdomain: string): void {
  if (!config.sitesDir) return;
  const siteDir = path.join(config.sitesDir, subdomain);
  try {
    if (fs.existsSync(siteDir)) {
      fs.rmSync(siteDir, { recursive: true, force: true });
      console.log(`[site] Removed site directory: ${siteDir}`);
    }
  } catch (err: any) {
    console.error(`[site] Failed to remove site directory ${siteDir}:`, err.message);
  }
}

export function extendSite(id: string, duration: string, userId?: string, userEmail?: string): { expiresAt: string } {
  const db = getDb();
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRecord | undefined;

  if (!site) throw new NotFoundError('Site not found');
  if (site.status !== 'running') throw new ValidationError('Only running sites can be extended');

  if (userId && userId !== 'admin' && site.user_id !== userId) {
    throw new ForbiddenError('You can only extend your own sites');
  }

  // Check feature flag
  const flag = db.prepare("SELECT value FROM settings WHERE key = 'feature.siteExtend'").get() as { value: string } | undefined;
  if (flag && flag.value === 'false') {
    throw new ForbiddenError('Site extension is not enabled');
  }

  const extensionMs = parseExpiration(duration);
  if (extensionMs === 0) throw new ValidationError('Extension duration cannot be "never"');

  // Extend from current expiration (or now if already past)
  const currentExpiry = new Date(site.expires_at).getTime();
  const base = Math.max(currentExpiry, Date.now());
  const newExpiresAt = new Date(base + extensionMs).toISOString();

  // Cap at 7 days from now
  const maxExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).getTime();
  const finalExpiresAt = new Date(Math.min(new Date(newExpiresAt).getTime(), maxExpiry)).toISOString();

  const extendTxn = db.transaction(() => {
    db.prepare('UPDATE sites SET expires_at = ? WHERE id = ?').run(finalExpiresAt, id);
    logSiteAction(site, 'extended', userEmail);
  });
  extendTxn();

  return { expiresAt: finalExpiresAt };
}

export async function getSiteStatus(id: string): Promise<{ dbStatus: string; containerStatus: string }> {
  const db = getDb();
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRecord | undefined;

  if (!site) {
    throw new NotFoundError('Site not found');
  }

  const containerStatus = site.container_id
    ? await getContainerStatus(site.container_id)
    : 'none';

  return {
    dbStatus: site.status,
    containerStatus,
  };
}

// Admin functions
export function listAllSites(limit = 100, offset = 0): SiteRecord[] {
  const db = getDb();
  return db.prepare('SELECT * FROM sites ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as SiteRecord[];
}

export function getAllSitesCount(): number {
  const db = getDb();
  return (db.prepare('SELECT COUNT(*) as count FROM sites').get() as { count: number }).count;
}

export interface SiteLogRecord {
  id: number;
  site_id: string;
  user_id: string | null;
  user_email: string | null;
  blueprint_id: string;
  subdomain: string;
  site_url: string | null;
  action: string;
  created_at: string;
}

export function getSiteLogs(limit = 100, offset = 0): SiteLogRecord[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM site_logs ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as SiteLogRecord[];
}

export function getSiteLogsByUser(userId: string): SiteLogRecord[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM site_logs WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as SiteLogRecord[];
}

export function getSiteLogsCount(): number {
  const db = getDb();
  return (db.prepare('SELECT COUNT(*) as count FROM site_logs').get() as { count: number }).count;
}

export function getSiteStats(): {
  totalSitesCreated: number;
  activeSites: number;
  totalUsers: number;
  verifiedUsers: number;
} {
  const db = getDb();
  const totalSitesCreated = (db.prepare("SELECT COUNT(*) as count FROM site_logs WHERE action = 'created'").get() as { count: number }).count;
  const activeSites = (db.prepare("SELECT COUNT(*) as count FROM sites WHERE status = 'running'").get() as { count: number }).count;
  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const verifiedUsers = (db.prepare('SELECT COUNT(*) as count FROM users WHERE verified = 1').get() as { count: number }).count;

  return { totalSitesCreated, activeSites, totalUsers, verifiedUsers };
}
