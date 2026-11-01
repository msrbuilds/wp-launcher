import { z } from 'zod';
import * as snapshotService from '../../services/snapshot.service';
import { siteForUserOrFail } from '../../services/siteAccess';
import { defineTool, type ToolDef } from '../registry';

const siteId = z.string().min(1).describe('The site id, as returned by sites_list.');
const snapshotId = z.string().min(1).describe('The snapshot id, as returned by snapshots_list.');

// storage_path is an on-disk location and never leaves the server.
const snapshotSchema = z.object({
  id: z.string(), siteId: z.string(), name: z.string(), dbEngine: z.string(), sizeBytes: z.number().nullable(), createdAt: z.string(), restoredAt: z.string().nullable(),
});
const toSnapshotView = (s: snapshotService.SnapshotRecord) => ({
  id: s.id, siteId: s.site_id, name: s.name, dbEngine: s.db_engine, sizeBytes: s.size_bytes, createdAt: s.created_at, restoredAt: s.restored_at,
});

export const snapshotsList = defineTool({
  name: 'snapshots_list',
  title: 'List snapshots',
  description: 'Lists saved snapshots (files + database) of one of your sites. Requires sites:read.',
  scope: 'sites:read',
  feature: 'snapshots',
  annotations: { readOnlyHint: true, idempotentHint: true },
  input: z.object({ siteId }),
  output: z.object({ snapshots: z.array(snapshotSchema) }),
  handler: ({ siteId: id }, ctx) => {
    siteForUserOrFail(id, ctx.userId);
    return { snapshots: snapshotService.listSnapshots(id, ctx.userId).map(toSnapshotView) };
  },
});

export const snapshotsCreate = defineTool({
  name: 'snapshots_create',
  title: 'Take a snapshot',
  description: 'Saves a snapshot of one of your running sites so it can be restored later. Requires sites:write.',
  scope: 'sites:write',
  feature: 'snapshots',
  writeBucket: 'sites',
  annotations: {},
  input: z.object({ siteId, name: z.string().max(100).optional().describe('A label for the snapshot.') }),
  output: z.object({ snapshot: snapshotSchema }),
  handler: async ({ siteId: id, name }, ctx) => {
    siteForUserOrFail(id, ctx.userId);
    return { snapshot: toSnapshotView(await snapshotService.takeSnapshot(id, name, ctx.userId)) };
  },
});

export const snapshotsRestore = defineTool({
  name: 'snapshots_restore',
  title: 'Restore a snapshot',
  description: 'Overwrites one of your sites with a saved snapshot. Everything changed since the snapshot is lost, so confirm with the user first. Requires sites:write.',
  scope: 'sites:write',
  feature: 'snapshots',
  writeBucket: 'sites',
  annotations: { destructiveHint: true },
  input: z.object({ siteId, snapshotId }),
  output: z.object({ status: z.literal('restored') }),
  handler: async ({ siteId: id, snapshotId: sid }, ctx) => {
    siteForUserOrFail(id, ctx.userId);
    await snapshotService.restoreSnapshotToSite(id, sid, ctx.userId);
    return { status: 'restored' as const };
  },
});

export const snapshotsDelete = defineTool({
  name: 'snapshots_delete',
  title: 'Delete a snapshot',
  description: 'Permanently deletes a saved snapshot of one of your sites. Requires sites:write.',
  scope: 'sites:write',
  feature: 'snapshots',
  writeBucket: 'sites',
  annotations: { destructiveHint: true },
  input: z.object({ siteId, snapshotId }),
  output: z.object({ deleted: z.literal(true) }),
  handler: async ({ siteId: id, snapshotId: sid }, ctx) => {
    siteForUserOrFail(id, ctx.userId);
    await snapshotService.deleteSnapshot(id, sid, ctx.userId);
    return { deleted: true as const };
  },
});

export const snapshotTools: ToolDef[] = [snapshotsList, snapshotsCreate, snapshotsRestore, snapshotsDelete];
