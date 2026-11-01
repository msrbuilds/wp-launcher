import { z } from 'zod';
import * as siteService from '../../services/site.service';
import { siteForUserOrFail } from '../../services/siteAccess';
import { siteViewSchema, toSiteView } from '../../services/siteView';
import { defineTool, type ToolDef } from '../registry';

const siteId = z.string().min(1).describe('The site id, as returned by sites_list.');

export const sitesList = defineTool({
  name: 'sites_list',
  title: 'List my sites',
  description: 'Lists the WordPress sites you launched on this panel (expired sites are excluded). Requires sites:read.',
  scope: 'sites:read',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({
    status: z.string().optional().describe('Only return sites in this status: creating, running or error.'),
  }),
  output: z.object({ sites: z.array(siteViewSchema) }),
  handler: ({ status }, ctx) => {
    const sites = siteService.listUserSites(ctx.userId).filter((s) => !status || s.status === status);
    return { sites: sites.map(toSiteView) };
  },
});

export const sitesGet = defineTool({
  name: 'sites_get',
  title: 'Get a site',
  description: 'Returns one of your sites: URLs, admin username, status and expiry. Never returns passwords. Requires sites:read.',
  scope: 'sites:read',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({ siteId }),
  output: z.object({ site: siteViewSchema }),
  handler: ({ siteId: id }, ctx) => ({ site: toSiteView(siteForUserOrFail(id, ctx.userId)) }),
});

export const sitesDelete = defineTool({
  name: 'sites_delete',
  title: 'Delete a site',
  description: 'Permanently deletes one of your sites and its container. This cannot be undone — confirm with the user first. Requires sites:write.',
  scope: 'sites:write',
  writeBucket: 'sites',
  annotations: { destructiveHint: true },
  input: z.object({ siteId }),
  output: z.object({ deleted: z.literal(true), siteId: z.string() }),
  handler: async ({ siteId: id }, ctx) => {
    siteForUserOrFail(id, ctx.userId);
    await siteService.deleteSite(id, ctx.userId, ctx.userEmail);
    return { deleted: true as const, siteId: id };
  },
});

export const sitesTools: ToolDef[] = [sitesList, sitesGet, sitesDelete];
