import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../utils/db';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { sendShareNotificationEmail } from './email.service';

export interface SiteShare {
  id: string;
  site_id: string;
  owner_id: string;
  shared_with_email: string;
  shared_with_id: string | null;
  role: 'viewer' | 'admin';
  status: 'pending' | 'accepted';
  created_at: string;
}

function isFeatureEnabled(): boolean {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'feature.collaborativeSites'").get() as { value: string } | undefined;
  return row?.value === 'true';
}

export function shareSite(siteId: string, ownerUserId: string, targetEmail: string, role: 'viewer' | 'admin' = 'viewer'): SiteShare {
  if (!isFeatureEnabled()) throw new ForbiddenError('Collaborative sites is disabled');
  const db = getDb();

  // Verify the site exists and the caller owns it
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId) as any;
  if (!site) throw new NotFoundError('Site not found');
  if (ownerUserId !== 'admin' && site.user_id !== ownerUserId) throw new ForbiddenError('You can only share your own sites');

  // Can't share with yourself
  const owner = db.prepare('SELECT email FROM users WHERE id = ?').get(ownerUserId) as { email: string } | undefined;
  if (owner && owner.email === targetEmail) throw new ValidationError('Cannot share a site with yourself');

  // Check for duplicate share
  const existing = db.prepare('SELECT id FROM site_shares WHERE site_id = ? AND shared_with_email = ?').get(siteId, targetEmail) as any;
  if (existing) throw new ConflictError('Site is already shared with this user');

  // If the target user exists, link their ID
  const targetUser = db.prepare('SELECT id FROM users WHERE email = ?').get(targetEmail) as { id: string } | undefined;

  const id = uuidv4();
  const status = targetUser ? 'accepted' : 'pending'; // Auto-accept if user exists

  db.prepare(
    'INSERT INTO site_shares (id, site_id, owner_id, shared_with_email, shared_with_id, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, siteId, ownerUserId, targetEmail, targetUser?.id || null, role, status);

  // Send email notification (fire-and-forget)
  sendShareNotificationEmail(
    targetEmail,
    owner?.email || 'Someone',
    site.subdomain,
    site.site_url,
    role,
  ).catch(err => console.error('[share] Failed to send notification email:', err.message));

  return db.prepare('SELECT * FROM site_shares WHERE id = ?').get(id) as SiteShare;
}

export function listSiteShares(siteId: string, userId: string): SiteShare[] {
  if (!isFeatureEnabled()) return [];
  const db = getDb();

  // Owner or admin can see all shares for a site
  const site = db.prepare('SELECT user_id FROM sites WHERE id = ?').get(siteId) as { user_id: string } | undefined;
  if (!site) throw new NotFoundError('Site not found');
  if (userId !== 'admin' && site.user_id !== userId) throw new ForbiddenError('Access denied');

  return db.prepare('SELECT * FROM site_shares WHERE site_id = ? ORDER BY created_at DESC').all(siteId) as SiteShare[];
}

export function listSharedWithMe(userId: string, userEmail: string): any[] {
  if (!isFeatureEnabled()) return [];
  const db = getDb();

  // Find shares by user ID or email
  const shares = db.prepare(
    "SELECT ss.*, s.subdomain, s.site_url, s.admin_url, s.status as site_status, s.product_id, s.expires_at, s.created_at as site_created_at " +
    "FROM site_shares ss JOIN sites s ON ss.site_id = s.id " +
    "WHERE (ss.shared_with_id = ? OR ss.shared_with_email = ?) AND s.status = 'running' " +
    "ORDER BY ss.created_at DESC"
  ).all(userId, userEmail);

  return shares;
}

export function revokeShare(shareId: string, userId: string): void {
  if (!isFeatureEnabled()) throw new ForbiddenError('Collaborative sites is disabled');
  const db = getDb();

  const share = db.prepare('SELECT * FROM site_shares WHERE id = ?').get(shareId) as SiteShare | undefined;
  if (!share) throw new NotFoundError('Share not found');

  // Owner or admin can revoke; shared user can also remove themselves
  if (userId !== 'admin' && share.owner_id !== userId && share.shared_with_id !== userId) {
    throw new ForbiddenError('Access denied');
  }

  db.prepare('DELETE FROM site_shares WHERE id = ?').run(shareId);
}

export function updateShareRole(shareId: string, userId: string, role: 'viewer' | 'admin'): void {
  if (!isFeatureEnabled()) throw new ForbiddenError('Collaborative sites is disabled');
  const db = getDb();

  const share = db.prepare('SELECT * FROM site_shares WHERE id = ?').get(shareId) as SiteShare | undefined;
  if (!share) throw new NotFoundError('Share not found');
  if (userId !== 'admin' && share.owner_id !== userId) throw new ForbiddenError('Only the owner can change roles');

  db.prepare('UPDATE site_shares SET role = ? WHERE id = ?').run(role, shareId);
}

// Check if a user has access to a site (either owns it or has a share)
export function hasAccessToSite(siteId: string, userId: string, userEmail?: string): { access: boolean; role: 'owner' | 'admin' | 'viewer' } {
  const db = getDb();

  const site = db.prepare('SELECT user_id FROM sites WHERE id = ?').get(siteId) as { user_id: string } | undefined;
  if (!site) return { access: false, role: 'viewer' };
  if (site.user_id === userId || userId === 'admin') return { access: true, role: 'owner' };

  if (!isFeatureEnabled()) return { access: false, role: 'viewer' };

  // Check shares
  const share = db.prepare(
    'SELECT role FROM site_shares WHERE site_id = ? AND (shared_with_id = ? OR shared_with_email = ?) AND status = ?'
  ).get(siteId, userId, userEmail || '', 'accepted') as { role: string } | undefined;

  if (share) return { access: true, role: share.role as 'admin' | 'viewer' };
  return { access: false, role: 'viewer' };
}

// When a new user registers, link any pending shares to their account
export function linkPendingShares(userId: string, email: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE site_shares SET shared_with_id = ?, status = 'accepted' WHERE shared_with_email = ? AND status = 'pending'"
  ).run(userId, email);
}
