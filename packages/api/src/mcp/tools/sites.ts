import { z } from 'zod';
import * as siteService from '../../services/site.service';
import * as snapshotService from '../../services/snapshot.service';
import * as dockerService from '../../services/docker.service';
import { listBlueprints } from '../../services/blueprint.service';
import { mintAutoLoginUrl, probeSiteReady, siteForUserOrFail } from '../../services/siteAccess';
import { validatePhpConfig } from '../../utils/phpConfigValidation';
import { ValidationError } from '../../utils/errors';
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

const runningContainer = (site: siteService.SiteRecord): string => {
  if (!site.container_id || site.status !== 'running') throw new ValidationError('Site is not running');
  return site.container_id;
};

export const blueprintsList = defineTool({
  name: 'blueprints_list',
  title: 'List blueprints',
  description: 'Lists the blueprints a site can be launched from (pass the id to sites_launch). Requires sites:read.',
  scope: 'sites:read',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({}),
  output: z.object({
    blueprints: z.array(z.object({
      id: z.string(), name: z.string(), description: z.string().nullable(), database: z.string().nullable(), defaultExpiration: z.string().nullable(),
    })),
  }),
  handler: () => ({
    blueprints: listBlueprints().map((b) => ({
      id: b.id, name: b.name, description: b.branding?.description ?? null, database: b.database ?? null, defaultExpiration: b.demo?.default_expiration ?? null,
    })),
  }),
});

export const sitesLaunch = defineTool({
  name: 'sites_launch',
  title: 'Launch a site',
  description: 'Launches a new WordPress site from a blueprint (see blueprints_list). Returns the site and a one-time admin password, shown only here; prefer sites_autologin_link for logging in. Call sites_wait_ready afterwards. Requires sites:write.',
  scope: 'sites:write',
  writeBucket: 'sites',
  annotations: {},
  input: z.object({
    blueprintId: z.string().min(1).describe('Blueprint id from blueprints_list.'),
    siteTitle: z.string().max(200).optional().describe('WordPress site title.'),
    expiresIn: z.string().optional().describe('How long the site lives, e.g. "1h", "1d", "7d". Defaults to the blueprint setting.'),
    phpVersion: z.string().optional().describe('PHP version, e.g. "8.3". Must be a built image.'),
    dbEngine: z.enum(['sqlite', 'mysql', 'mariadb']).optional().describe('Database engine. Defaults to the blueprint setting.'),
    subdomain: z.string().optional().describe('Requested subdomain (lowercase letters, digits, hyphens). Random if omitted.'),
    adminUser: z.string().optional().describe('WordPress admin username.'),
    adminEmail: z.string().email().optional().describe('WordPress admin email.'),
  }),
  output: z.object({ site: siteViewSchema, oneTimePassword: z.string() }),
  handler: async (args, ctx) => {
    const site = await siteService.createSite({ ...args, userId: ctx.userId, userEmail: ctx.userEmail, userRole: ctx.userRole });
    return { site: toSiteView(site), oneTimePassword: site.oneTimePassword };
  },
});

export const sitesWaitReady = defineTool({
  name: 'sites_wait_ready',
  title: 'Wait until a site is ready',
  description: 'Polls a newly launched site until WordPress setup has finished (plugins, themes, demo content) or the timeout passes. Requires sites:read.',
  scope: 'sites:read',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({ siteId, timeoutSeconds: z.number().int().min(1).max(120).optional().describe('Give up after this many seconds (1 to 120, default 60).') }),
  output: z.object({ ready: z.boolean(), status: z.string(), reason: z.string().optional() }),
  handler: async ({ siteId: id, timeoutSeconds }, ctx) => {
    const deadline = Date.now() + (timeoutSeconds ?? 60) * 1000;
    for (;;) {
      const site = siteForUserOrFail(id, ctx.userId);
      const probe = await probeSiteReady(site);
      if (probe.ready || Date.now() + 3000 > deadline) return { ...probe, status: site.status };
      await new Promise((r) => setTimeout(r, 3000));
    }
  },
});

export const sitesExtend = defineTool({
  name: 'sites_extend',
  title: 'Extend a site',
  description: 'Pushes back the expiry of one of your sites. Requires sites:write.',
  scope: 'sites:write',
  feature: 'siteExtend',
  writeBucket: 'sites',
  annotations: {},
  input: z.object({ siteId, duration: z.string().regex(/^\d+[mhd]$/).describe('How much longer, e.g. "30m", "2h", "1d".') }),
  output: z.object({ siteId: z.string(), expiresAt: z.string() }),
  handler: ({ siteId: id, duration }, ctx) => {
    siteForUserOrFail(id, ctx.userId);
    return { siteId: id, expiresAt: siteService.extendSite(id, duration, ctx.userId, ctx.userEmail).expiresAt };
  },
});

export const sitesAutologinLink = defineTool({
  name: 'sites_autologin_link',
  title: 'One-time login link',
  description: 'Creates a single-use link that logs straight into the site admin. It expires after 60 seconds, so hand it to the user immediately. Requires sites:write.',
  scope: 'sites:write',
  writeBucket: 'sites',
  annotations: {},
  input: z.object({ siteId }),
  output: z.object({ url: z.string(), expiresIn: z.literal(60) }),
  handler: async ({ siteId: id }, ctx) => {
    const { autoLoginUrl, expiresIn } = await mintAutoLoginUrl(siteForUserOrFail(id, ctx.userId));
    return { url: autoLoginUrl, expiresIn };
  },
});

export const sitesClone = defineTool({
  name: 'sites_clone',
  title: 'Clone a site',
  description: 'Creates a copy of one of your sites (files and database). Requires sites:write.',
  scope: 'sites:write',
  feature: 'cloning',
  writeBucket: 'sites',
  annotations: {},
  input: z.object({ siteId, subdomain: z.string().optional().describe('Subdomain for the copy.'), expiresIn: z.string().optional().describe('Lifetime of the copy, e.g. "1d".') }),
  output: z.object({ site: siteViewSchema }),
  handler: async ({ siteId: id, subdomain, expiresIn }, ctx) => {
    siteForUserOrFail(id, ctx.userId);
    const clone = await snapshotService.cloneSite(id, ctx.userId, { subdomain, expiresIn });
    return { site: toSiteView(clone) };
  },
});

// A flat map of PHP ini values: no secrets live here, so a record schema is acceptable.
const phpSettings = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]));

export const sitesPhpConfigGet = defineTool({
  name: 'sites_php_config_get',
  title: 'Read PHP settings',
  description: 'Reads the live PHP settings (memory limit, upload size, execution time, extensions) of one of your running sites. Requires sites:read.',
  scope: 'sites:read',
  feature: 'phpConfig',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({ siteId }),
  output: z.object({ settings: phpSettings }),
  handler: async ({ siteId: id }, ctx) => ({ settings: await dockerService.getPhpConfig(runningContainer(siteForUserOrFail(id, ctx.userId))) }),
});

export const sitesPhpConfigUpdate = defineTool({
  name: 'sites_php_config_update',
  title: 'Change PHP settings',
  description: 'Changes PHP settings on one of your running sites and reloads Apache. Requires sites:write.',
  scope: 'sites:write',
  feature: 'phpConfig',
  writeBucket: 'sites',
  annotations: { idempotentHint: true },
  input: z.object({
    siteId,
    settings: z.object({
      memoryLimit: z.string().optional().describe('e.g. "256M", or "-1" for unlimited.'),
      uploadMaxFilesize: z.string().optional().describe('e.g. "64M".'),
      postMaxSize: z.string().optional().describe('e.g. "64M".'),
      maxExecutionTime: z.string().optional().describe('Seconds, e.g. "120".'),
      maxInputVars: z.string().optional().describe('e.g. "3000".'),
      displayErrors: z.string().optional().describe('"On" or "Off".'),
      extensions: z.string().optional().describe('Comma-separated optional extensions to enable: redis, xdebug, sockets, calendar, pcntl, ldap, gettext.'),
    }),
  }),
  output: z.object({ status: z.literal('updated') }),
  handler: async ({ siteId: id, settings }, ctx) => {
    const container = runningContainer(siteForUserOrFail(id, ctx.userId));
    validatePhpConfig(settings);
    await dockerService.updatePhpConfig(container, settings);
    return { status: 'updated' as const };
  },
});

export const sitesHealth = defineTool({
  name: 'sites_health',
  title: 'Site health',
  description: 'Reports live CPU, memory and network use for one of your running sites. Requires sites:read.',
  scope: 'sites:read',
  feature: 'healthMonitoring',
  annotations: { readOnlyHint: true },
  input: z.object({ siteId }),
  output: z.object({
    cpu: z.object({ percent: z.number(), cores: z.number() }),
    memory: z.object({ usedMB: z.number(), limitMB: z.number(), percent: z.number() }),
    network: z.object({ rxBytes: z.number(), txBytes: z.number() }),
    uptime: z.string(),
  }),
  handler: async ({ siteId: id }, ctx) => dockerService.getContainerStats(runningContainer(siteForUserOrFail(id, ctx.userId))),
});

export const sitesTools: ToolDef[] = [
  blueprintsList, sitesList, sitesGet, sitesLaunch, sitesWaitReady, sitesExtend, sitesAutologinLink, sitesClone,
  sitesPhpConfigGet, sitesPhpConfigUpdate, sitesHealth, sitesDelete,
];
