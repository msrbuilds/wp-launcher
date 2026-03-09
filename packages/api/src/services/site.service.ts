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

export async function createSite(req: CreateSiteRequest): Promise<SiteRecord & { oneTimePassword: string; autoLoginToken: string }> {
  const db = getDb();
  const productConfig = getProductConfig(req.productId);

  // If user is provided, enforce max active sites per user (0 = unlimited)
  if (req.userId && MAX_SITES_PER_USER > 0) {
    const activeSiteCount = db
      .prepare("SELECT COUNT(*) as count FROM sites WHERE user_id = ? AND status = 'running'")
      .get(req.userId) as { count: number };

    if (activeSiteCount.count >= MAX_SITES_PER_USER) {
      throw new Error(`You already have ${MAX_SITES_PER_USER} active demo sites. Please delete one before creating a new one.`);
    }
  }

  // Check global total site limit
  const totalActive = db
    .prepare("SELECT COUNT(*) as count FROM sites WHERE status = 'running'")
    .get() as { count: number };

  if (config.defaults.maxTotalSites > 0 && totalActive.count >= config.defaults.maxTotalSites) {
    throw new Error('Our servers are currently at capacity. Please try again in a few minutes.');
  }

  // Check concurrent site limit per product
  const activeSiteCount = db
    .prepare("SELECT COUNT(*) as count FROM sites WHERE product_id = ? AND status = 'running'")
    .get(req.productId) as { count: number };

  const maxConcurrent = productConfig?.demo?.max_concurrent_sites ?? config.defaults.maxConcurrentSites;
  if (maxConcurrent > 0 && activeSiteCount.count >= maxConcurrent) {
    throw new Error(`Maximum concurrent sites (${maxConcurrent}) reached for this product.`);
  }

  const id = uuidv4();

  // Use custom subdomain if provided, otherwise generate one
  let subdomain: string;
  if (req.subdomain) {
    const cleaned = req.subdomain.toLowerCase().trim();
    if (!isValidSubdomain(cleaned)) {
      throw new Error('Invalid subdomain. Use 3-63 lowercase letters, numbers, and hyphens (no leading/trailing hyphens).');
    }
    // Check uniqueness
    const existing = db.prepare("SELECT id FROM sites WHERE subdomain = ? AND status != 'expired'").get(cleaned);
    if (existing) {
      throw new Error(`Subdomain "${cleaned}" is already in use. Please choose a different one.`);
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
  const autoLoginToken = crypto.randomBytes(32).toString('base64url'); // for one-click login
  const adminEmail = req.adminEmail || productConfig?.demo?.admin_email || 'demo@example.com';
  const siteTitle = req.siteTitle || productConfig?.name || 'Demo Site';

  const pluginsToActivate = productConfig?.plugins?.preinstall
    ?.map((p: any) => p.slug || p.path?.split('/').pop()?.replace(/\.zip$/, ''))
    .filter(Boolean)
    .join(',') || '';

  const pluginsToRemove = (productConfig?.plugins?.remove || []).join(',');

  const activeTheme = productConfig?.themes?.install
    ?.find((t: any) => t.activate)?.slug || '';

  const landingPage = productConfig?.demo?.landing_page || '';

  const VALID_PHP_VERSIONS = ['8.1', '8.2', '8.3'];
  const phpVersion = req.phpVersion && VALID_PHP_VERSIONS.includes(req.phpVersion) ? req.phpVersion : null;
  const image = productConfig?.docker?.image
    || (phpVersion ? `wp-launcher/wordpress:php${phpVersion}` : config.wpImage);
  const dbEngine = req.dbEngine || productConfig?.database || 'sqlite';

  db.prepare(`
    INSERT INTO sites (id, subdomain, product_id, user_id, status, site_url, admin_url, admin_user, admin_password, auto_login_token, expires_at)
    VALUES (?, ?, ?, ?, 'creating', ?, ?, ?, ?, ?, ?)
  `).run(id, subdomain, req.productId, req.userId || null, siteUrl, adminUrl, adminUser, adminPassword, autoLoginToken, expiresAt);

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
      activatePlugins: pluginsToActivate,
      removePlugins: pluginsToRemove,
      activeTheme,
      landingPage,
      dbEngine,
      autoLoginToken,
      localMode: config.isLocalMode,
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

  return { ...site, oneTimePassword: adminPassword, autoLoginToken };
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
    throw new Error('Site not found');
  }

  // If userId provided, ensure user owns the site
  if (userId && site.user_id !== userId) {
    throw new Error('You can only delete your own sites');
  }

  if (site.container_id) {
    await removeSiteContainer(site.container_id);
  }

  db.prepare("UPDATE sites SET status = 'expired', deleted_at = datetime('now') WHERE id = ?").run(id);

  logSiteAction(site, 'deleted', userEmail);
}

export async function getSiteStatus(id: string): Promise<{ dbStatus: string; containerStatus: string }> {
  const db = getDb();
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRecord | undefined;

  if (!site) {
    throw new Error('Site not found');
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
