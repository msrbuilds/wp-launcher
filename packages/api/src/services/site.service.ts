import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from '../utils/db';
import { generateSubdomain, isValidSubdomain } from '../utils/nameGenerator';
import { config, parseExpiration } from '../config';
import {
  createSiteContainer,
  removeSiteContainer,
  getContainerStatus,
} from './docker.service';
import { getProductConfig } from './product.service';
import { ConflictError, ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';

export const MAX_SITES_PER_USER = config.isLocalMode ? 0 : parseInt(process.env.MAX_SITES_PER_USER || '3', 10);

export interface CreateSiteRequest {
  productId: string;
  expiresIn?: string;
  userId?: string;
  userEmail?: string;
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
}

export interface SiteRecord {
  id: string;
  subdomain: string;
  product_id: string;
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
}

function logSiteAction(siteRecord: SiteRecord, action: string, userEmail?: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO site_logs (site_id, user_id, user_email, product_id, subdomain, site_url, action)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    siteRecord.id,
    siteRecord.user_id,
    userEmail || null,
    siteRecord.product_id,
    siteRecord.subdomain,
    siteRecord.site_url,
    action,
  );
}

export async function createSite(req: CreateSiteRequest): Promise<SiteRecord & { oneTimePassword: string }> {
  const db = getDb();
  const productConfig = getProductConfig(req.productId);

  // Validate subdomain early (before transaction) if custom
  let subdomain: string;
  if (req.subdomain) {
    const cleaned = req.subdomain.toLowerCase().trim();
    if (!isValidSubdomain(cleaned)) {
      throw new ValidationError('Invalid subdomain. Use 3-63 lowercase letters, numbers, and hyphens (no leading/trailing hyphens).');
    }
    subdomain = cleaned;
  } else {
    subdomain = generateSubdomain();
  }

  const expiresIn = req.expiresIn || productConfig?.demo?.default_expiration || config.defaults.expiration;
  const expirationMs = parseExpiration(expiresIn);
  const expiresAt = expirationMs === 0
    ? '9999-12-31T23:59:59.999Z'
    : new Date(Date.now() + expirationMs).toISOString();

  const protocol = config.nodeEnv === 'production' ? 'https' : 'http';
  const siteUrl = `${protocol}://${subdomain}.${config.baseDomain}`;
  const adminUrl = `${siteUrl}/wp-admin/`;

  const adminUser = req.adminUser || productConfig?.demo?.admin_user || 'demo';
  const adminPassword = req.adminPassword || crypto.randomBytes(16).toString('base64url');
  const autoLoginToken = ''; // generated on-demand via POST /api/sites/:id/autologin
  const adminEmail = req.adminEmail || productConfig?.demo?.admin_email || 'demo@example.com';
  const siteTitle = req.siteTitle || productConfig?.name || 'Demo Site';

  const id = uuidv4();
  const maxConcurrent = productConfig?.demo?.max_concurrent_sites ?? config.defaults.maxConcurrentSites;

  // Atomic transaction: check all limits + insert site record
  const insertSiteTxn = db.transaction(() => {
    // Check per-user limit
    if (req.userId && req.userId !== 'admin' && MAX_SITES_PER_USER > 0) {
      const userCount = db
        .prepare("SELECT COUNT(*) as count FROM sites WHERE user_id = ? AND status = 'running'")
        .get(req.userId) as { count: number };
      if (userCount.count >= MAX_SITES_PER_USER) {
        throw new ConflictError(`You already have ${MAX_SITES_PER_USER} active demo sites. Please delete one before creating a new one.`);
      }
    }

    // Check global total site limit
    const totalActive = db
      .prepare("SELECT COUNT(*) as count FROM sites WHERE status = 'running'")
      .get() as { count: number };
    if (config.defaults.maxTotalSites > 0 && totalActive.count >= config.defaults.maxTotalSites) {
      throw new ConflictError('Our servers are currently at capacity. Please try again in a few minutes.');
    }

    // Check concurrent site limit per product
    const productCount = db
      .prepare("SELECT COUNT(*) as count FROM sites WHERE product_id = ? AND status = 'running'")
      .get(req.productId) as { count: number };
    if (maxConcurrent > 0 && productCount.count >= maxConcurrent) {
      throw new ConflictError(`Maximum concurrent sites (${maxConcurrent}) reached for this product.`);
    }

    // Check subdomain uniqueness
    if (req.subdomain) {
      const existing = db.prepare("SELECT id FROM sites WHERE subdomain = ? AND status != 'expired'").get(subdomain);
      if (existing) {
        throw new ConflictError(`Subdomain "${subdomain}" is already in use. Please choose a different one.`);
      }
    }

    // Insert site record
    db.prepare(`
      INSERT INTO sites (id, subdomain, product_id, user_id, status, site_url, admin_url, admin_user, admin_password, auto_login_token, expires_at)
      VALUES (?, ?, ?, ?, 'creating', ?, ?, ?, ?, ?, ?)
    `).run(id, subdomain, req.productId, req.userId || null, siteUrl, adminUrl, adminUser, adminPassword, autoLoginToken, expiresAt);
  });

  insertSiteTxn();

  // Separate plugins into install+activate vs install-only
  const installAndActivate: string[] = [];  // plugins to install with --activate flag
  const installOnly: string[] = [];          // plugins to install without activation
  const activateOnly: string[] = [];         // already-present plugins to activate by slug

  for (const p of (productConfig?.plugins?.preinstall || [])) {
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

  const pluginsToRemove = (productConfig?.plugins?.remove || []).join(',');

  // Build theme install list
  const installThemesList: string[] = [];
  let activeTheme = '';
  for (const t of (productConfig?.themes?.install || [])) {
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

  const landingPage = productConfig?.demo?.landing_page || '';

  const VALID_PHP_VERSIONS = ['8.1', '8.2', '8.3'];
  const phpVersion = req.phpVersion && VALID_PHP_VERSIONS.includes(req.phpVersion) ? req.phpVersion : null;
  const image = productConfig?.docker?.image
    || (phpVersion ? `wp-launcher/wordpress:php${phpVersion}` : config.wpImage);
  const dbEngine = req.dbEngine || productConfig?.database || 'sqlite';

  try {
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
      localMode: config.isLocalMode,
      phpConfig: req.phpConfig,
    });

    // Clear password from DB now that it's been sent to the container — it's only needed at provision time
    db.prepare("UPDATE sites SET container_id = ?, status = 'running', admin_password = NULL WHERE id = ?").run(containerId, id);
  } catch (err) {
    // Clear password even on error
    db.prepare("UPDATE sites SET status = 'error', admin_password = NULL WHERE id = ?").run(id);
    throw err;
  }

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRecord;

  logSiteAction(site, 'created', req.userEmail);

  return { ...site, oneTimePassword: adminPassword };
}

export function listSites(productId?: string): SiteRecord[] {
  const db = getDb();

  if (productId) {
    return db
      .prepare("SELECT * FROM sites WHERE product_id = ? AND status != 'expired' ORDER BY created_at DESC")
      .all(productId) as SiteRecord[];
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

  if (site.container_id) {
    await removeSiteContainer(site.container_id);
  }

  const deleteTxn = db.transaction(() => {
    db.prepare("UPDATE sites SET status = 'expired', deleted_at = datetime('now') WHERE id = ?").run(id);
    logSiteAction(site, 'deleted', userEmail);
  });
  deleteTxn();
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
  product_id: string;
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
