import crypto from 'crypto';
import { getDb } from '../utils/db';
import { NotFoundError, ValidationError } from '../utils/errors';
import * as dockerService from './docker.service';
import { getSite, type SiteRecord } from './site.service';

/**
 * The one ownership check MCP tools use. Owner-only: no admin override and no
 * shared-site access in v1. A missing site and someone else's site get the same
 * answer, so a guessed id cannot be confirmed to exist.
 */
export function siteForUserOrFail(siteId: string, userId: string): SiteRecord {
  const site = getSite(siteId);
  if (!site || site.user_id !== userId) throw new NotFoundError('Site not found');
  return site;
}

/**
 * Mints a fresh single-use autologin link (60 s). Shared by the REST route and
 * the `sites_autologin_link` tool so the two cannot drift.
 */
export async function mintAutoLoginUrl(site: SiteRecord): Promise<{ autoLoginUrl: string; expiresIn: 60 }> {
  if (!site.container_id || site.status !== 'running') throw new ValidationError('Site is not running');
  const token = crypto.randomBytes(32).toString('base64url');
  getDb().prepare('UPDATE sites SET auto_login_token = ? WHERE id = ?').run(token, site.id);
  await dockerService.updateAutoLoginToken(site.container_id, token);
  return { autoLoginUrl: `${site.site_url}/wp-login.php?autologin=${token}`, expiresIn: 60 };
}

/** Probes the marker entrypoint.sh writes once plugins, themes and demo content are all in place. */
export async function probeSiteReady(site: SiteRecord): Promise<{ ready: boolean; reason?: string }> {
  if (site.status !== 'running' || !site.site_url) return { ready: false, reason: 'container not running' };
  try {
    const probe = await fetch(`http://wp-site-${site.subdomain}/.wp-launcher-ready`, { signal: AbortSignal.timeout(3000) });
    return { ready: probe.status === 200 };
  } catch {
    return { ready: false, reason: 'site not responding' };
  }
}
