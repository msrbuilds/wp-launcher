import { z } from 'zod';
import { issuer } from '../oauth/urls';
import type { SiteRecord } from './site.service';

/**
 * The safe projection of a site row, shared by REST and MCP so the two cannot
 * drift. `sites` rows carry the admin password, the autologin token and the
 * container id; none of them ever leave through here.
 */
export const siteViewSchema = z.object({
  id: z.string(),
  subdomain: z.string(),
  blueprintId: z.string(),
  url: z.string().nullable(),
  adminUrl: z.string().nullable(),
  adminUser: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  panelUrl: z.string(),
});
export type SiteView = z.infer<typeof siteViewSchema>;

export function toSiteView(site: SiteRecord): SiteView {
  return {
    id: site.id,
    subdomain: site.subdomain,
    blueprintId: site.blueprint_id,
    url: site.site_url,
    adminUrl: site.admin_url,
    adminUser: site.admin_user,
    status: site.status,
    createdAt: site.created_at,
    expiresAt: site.expires_at,
    panelUrl: `${issuer()}/sites/${site.id}`,
  };
}

/** The historical REST JSON for a site, built on the same projection. */
export function toRestSite(site: SiteRecord) {
  const { adminUser, panelUrl: _panelUrl, ...rest } = toSiteView(site);
  return { ...rest, productId: rest.blueprintId, credentials: { username: adminUser } };
}
