import { NotFoundError } from '../utils/errors';
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
