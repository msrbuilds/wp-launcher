import { z } from 'zod';
import * as siteService from '../../services/site.service';
import * as userService from '../../services/user.service';
import * as analytics from '../../services/analytics.service';
import * as buildJobs from '../../services/imageBuildJob.service';
import * as imageAdmin from '../../services/imageAdmin.service';
import { listBlueprints } from '../../services/blueprint.service';
import { deleteBlueprint, upsertBlueprintJson } from '../../services/blueprintUpsert';
import { blueprintConfigSchema } from '../../utils/schemas';
import { NotFoundError } from '../../utils/errors';
import { defineTool, type ToolDef } from '../registry';

/**
 * Platform admin. Deliberately absent: user invite/delete/role changes, feature
 * flags, settings, branding, SMTP, the API key, webhooks and sync connections —
 * each widens access, mails new people, or exposes a secret.
 */

/**
 * getBlueprint() never returns nothing: for an unknown id it shapes one from
 * _default, which is right at launch time and wrong here. The listing honours
 * deletion tombstones, so it is the existence check.
 */
function blueprintOrFail(id: string) {
  const blueprint = listBlueprints().find((b) => b.id === id);
  if (!blueprint) throw new NotFoundError('Blueprint not found');
  return blueprint;
}

const read = { scope: 'admin:read' as const, annotations: { readOnlyHint: true, idempotentHint: true } };
const write = { scope: 'admin:write' as const, writeBucket: 'admin' as const };
const page = { limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional() };

export const adminStats = defineTool({
  name: 'admin_stats',
  title: 'Panel statistics',
  description: 'Install-wide totals: sites created and running, users, and launch trends. Requires admin:read.',
  ...read,
  input: z.object({}),
  output: z.object({
    totalSitesCreated: z.number(), activeSites: z.number(), totalUsers: z.number(), verifiedUsers: z.number(),
    sitesToday: z.number(), sitesThisWeek: z.number(), sitesThisMonth: z.number(), avgLifetimeHours: z.number().nullable(), peakHour: z.number().nullable(),
  }),
  handler: () => ({ ...siteService.getSiteStats(), ...analytics.getAnalyticsSummary() }),
});

export const adminSiteLogs = defineTool({
  name: 'admin_site_logs',
  title: 'Site activity log',
  description: 'Install-wide log of site launches, extensions and deletions, newest first. Reading only: it never lets you act on another user’s site. Requires admin:read.',
  ...read,
  input: z.object(page),
  output: z.object({
    logs: z.array(z.object({ id: z.number(), siteId: z.string(), userEmail: z.string().nullable(), blueprintId: z.string(), subdomain: z.string(), action: z.string(), createdAt: z.string() })),
    total: z.number(),
  }),
  handler: ({ limit, offset }) => ({
    logs: siteService.getSiteLogs(limit ?? 50, offset ?? 0).map((l) => ({
      id: l.id, siteId: l.site_id, userEmail: l.user_email, blueprintId: l.blueprint_id, subdomain: l.subdomain, action: l.action, createdAt: l.created_at,
    })),
    total: siteService.getSiteLogsCount(),
  }),
});

export const adminUsersList = defineTool({
  name: 'admin_users_list',
  title: 'List users',
  description: 'Lists panel accounts with their role and verification state. Requires admin:read.',
  ...read,
  input: z.object(page),
  output: z.object({
    users: z.array(z.object({ id: z.string(), email: z.string(), name: z.string().nullable(), role: z.string(), verified: z.boolean(), createdAt: z.string() })),
    total: z.number(),
  }),
  handler: ({ limit, offset }) => ({
    users: userService.listUsers(limit ?? 50, offset ?? 0).map((u) => ({
      id: u.id, email: u.email, name: u.name ?? null, role: u.role, verified: !!u.verified, createdAt: u.created_at,
    })),
    total: userService.getUsersCount(),
  }),
});

export const adminImagesList = defineTool({
  name: 'admin_images_list',
  title: 'List WordPress images',
  description: 'Lists built wp-launcher images and which blueprints use each. Requires admin:read.',
  ...read,
  input: z.object({}),
  output: z.object({ images: z.array(z.object({ tag: z.string(), size: z.number(), created: z.number(), usedByBlueprints: z.array(z.string()) })) }),
  handler: async () => ({ images: await imageAdmin.listImagesWithUsage() }),
});

export const adminBuildJobGet = defineTool({
  name: 'admin_build_job_get',
  title: 'Image build status',
  description: 'Returns an image build job’s status and the last 200 lines of its log. Poll it after admin_images_build. Requires admin:read.',
  ...read,
  input: z.object({ jobId: z.string().min(1) }),
  output: z.object({
    id: z.string(), tag: z.string(), status: z.string(), error: z.string().nullable(), log: z.string(),
    startedAt: z.string().nullable(), completedAt: z.string().nullable(),
  }),
  handler: ({ jobId }) => {
    const job = buildJobs.getBuildJob(jobId);
    if (!job) throw new NotFoundError('Build not found');
    return {
      id: job.id, tag: job.tag, status: job.status, error: job.error, log: (job.log ?? '').split('\n').slice(-200).join('\n'),
      startedAt: job.started_at, completedAt: job.completed_at,
    };
  },
});

export const adminImagesBuild = defineTool({
  name: 'admin_images_build',
  title: 'Build a WordPress image',
  description: 'Starts building a base image for a PHP and WordPress version pair. Returns a job id for admin_build_job_get. Requires admin:write.',
  ...write, annotations: {},
  input: z.object({ phpVersion: z.string().describe('e.g. "8.3".'), wpVersion: z.string().describe('e.g. "6.9".') }),
  output: z.object({ jobId: z.string(), tag: z.string() }),
  handler: ({ phpVersion, wpVersion }, ctx) => imageAdmin.startBaseBuild(phpVersion, wpVersion, ctx.userId),
});

export const adminImagesRebuild = defineTool({
  name: 'admin_images_rebuild',
  title: 'Rebuild a WordPress image',
  description: 'Rebuilds a missing or broken base image from its tag (e.g. after a launch failed with IMAGE_NOT_BUILT). Custom product images cannot be rebuilt this way. Requires admin:write.',
  ...write, annotations: {},
  input: z.object({ tag: z.string().min(1) }),
  output: z.object({ jobId: z.string(), tag: z.string() }),
  handler: ({ tag }, ctx) => imageAdmin.startRebuild(tag, ctx.userId),
});

export const adminImagesDelete = defineTool({
  name: 'admin_images_delete',
  title: 'Delete a WordPress image',
  description: 'Removes a built image. Refused while a blueprint uses it unless force is true, which breaks launches of those blueprints. Confirm with the user first. Requires admin:write.',
  ...write, annotations: { destructiveHint: true },
  input: z.object({ tag: z.string().min(1), force: z.boolean().optional() }),
  output: z.object({ removed: z.literal(true) }),
  handler: async ({ tag, force }) => {
    await imageAdmin.removeImageGuarded(tag, !!force);
    return { removed: true as const };
  },
});

// Blueprint configs are admin data with no credentials; the schema's own shape is the output.
export const adminBlueprintsGet = defineTool({
  name: 'admin_blueprints_get',
  title: 'Get a blueprint',
  description: 'Returns a blueprint’s full configuration (plugins, themes, restrictions, branding, docker image). Requires admin:write.',
  ...write, writeBucket: undefined, annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({ id: z.string().min(1) }),
  output: z.object({ blueprint: blueprintConfigSchema }),
  handler: ({ id }) => {
    return { blueprint: blueprintOrFail(id) };
  },
});

export const adminBlueprintsCreate = defineTool({
  name: 'admin_blueprints_create',
  title: 'Create a blueprint',
  description: 'Creates a blueprint from a JSON configuration (id, name, plugins, themes, restrictions, branding, docker image). Plugin and theme files cannot be uploaded this way; use wordpress.org or URL sources. Requires admin:write.',
  ...write, annotations: {},
  input: z.object({ blueprint: z.record(z.string(), z.unknown()).describe('The blueprint configuration. Must include id and name.') }),
  output: z.object({ blueprint: blueprintConfigSchema }),
  handler: ({ blueprint }) => ({ blueprint: upsertBlueprintJson(blueprint) }),
});

export const adminBlueprintsUpdate = defineTool({
  name: 'admin_blueprints_update',
  title: 'Update a blueprint',
  description: 'Replaces a blueprint’s configuration with the fields you pass, merged over the current ones. Requires admin:write.',
  ...write, annotations: { idempotentHint: true },
  input: z.object({ id: z.string().min(1), blueprint: z.record(z.string(), z.unknown()) }),
  output: z.object({ blueprint: blueprintConfigSchema }),
  handler: ({ id, blueprint }) => {
    return { blueprint: upsertBlueprintJson({ ...blueprintOrFail(id), ...blueprint }, { id }) };
  },
});

export const adminBlueprintsDelete = defineTool({
  name: 'admin_blueprints_delete',
  title: 'Delete a blueprint',
  description: 'Deletes a blueprint. Existing sites keep running. Cannot be undone; confirm with the user first. Requires admin:write.',
  ...write, annotations: { destructiveHint: true },
  input: z.object({ id: z.string().min(1) }),
  output: z.object({ deleted: z.literal(true) }),
  handler: ({ id }) => {
    deleteBlueprint(id);
    return { deleted: true as const };
  },
});

export const adminTools: ToolDef[] = [
  adminStats, adminSiteLogs, adminUsersList, adminImagesList, adminBuildJobGet,
  adminImagesBuild, adminImagesRebuild, adminImagesDelete,
  adminBlueprintsGet, adminBlueprintsCreate, adminBlueprintsUpdate, adminBlueprintsDelete,
];
