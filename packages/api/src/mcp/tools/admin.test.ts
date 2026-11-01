import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type Database from 'better-sqlite3';
import { createSiteTestDb } from '../../test-helpers/sites';
import { __setDbForTesting } from '../../utils/db';
import * as dockerService from '../../services/docker.service';
import * as wpImageTags from '../../services/wpImageTags.service';
import * as buildJobs from '../../services/imageBuildJob.service';
import { adminTools } from './admin';
import type { McpAuthContext } from '../../oauth/token.service';

vi.mock('../../config', async () => {
  const actual = await vi.importActual<typeof import('../../config')>('../../config');
  return { ...actual, config: { ...actual.config, get blueprintConfigsDir() { return process.env.__TEST_BP_DIR!; } } };
});

let db: Database.Database;
let dir: string;
const ctx: McpAuthContext = { userId: 'owner', userEmail: 'owner@example.com', userRole: 'owner', grantId: 'g', clientId: 'c', clientName: 'App', scopes: ['admin:read', 'admin:write'] };
const tool = (name: string) => adminTools.find((t) => t.name === name)!;
const run = (name: string, args: Record<string, unknown>) => Promise.resolve().then(() => tool(name).handler(args as never, ctx));

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-mcp-admin-'));
  process.env.__TEST_BP_DIR = dir;
  db = createSiteTestDb();
  db.exec(`CREATE TABLE blueprints (id TEXT PRIMARY KEY, name TEXT NOT NULL, config TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
           CREATE TABLE blueprint_deletions (id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  __setDbForTesting(db);
  (await import('../../services/blueprint.service')).clearBlueprintCache();
  db.prepare("UPDATE users SET password_hash = 'HASH-SECRET', token_version = 7 WHERE id = 'owner'").run();
  vi.spyOn(wpImageTags, 'getBuildableWpByPhp').mockResolvedValue({ '8.3': ['6.9'] } as never);
  vi.spyOn(buildJobs, 'enqueueBuild').mockImplementation(() => {});
});
afterEach(() => { __setDbForTesting(null); db.close(); vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('catalogue', () => {
  it('declares admin scopes, buckets and destructive hints', () => {
    for (const n of ['admin_stats', 'admin_site_logs', 'admin_users_list', 'admin_images_list', 'admin_build_job_get']) expect(tool(n), n).toMatchObject({ scope: 'admin:read' });
    for (const n of ['admin_images_build', 'admin_images_rebuild', 'admin_images_delete', 'admin_blueprints_create', 'admin_blueprints_update', 'admin_blueprints_delete']) {
      expect(tool(n), n).toMatchObject({ scope: 'admin:write', writeBucket: 'admin' });
    }
    // A read under admin:write (the spec groups it with blueprint editing) spends no write budget.
    expect(tool('admin_blueprints_get')).toMatchObject({ scope: 'admin:write', writeBucket: undefined, annotations: { readOnlyHint: true } });
    expect(tool('admin_images_delete').annotations.destructiveHint).toBe(true);
    expect(tool('admin_blueprints_delete').annotations.destructiveHint).toBe(true);
  });

  it('offers nothing that widens access, mails new people or exposes secrets', () => {
    expect(adminTools.filter((t) => /user_(invite|delete|role)|feature|setting|webhook|api_key|smtp/.test(t.name))).toEqual([]);
  });
});

describe('reads', () => {
  it('admin_users_list carries no password hash, tokens or token version', async () => {
    const out = tool('admin_users_list').output.parse(await run('admin_users_list', {}));
    const raw = JSON.stringify(out);
    expect(raw).not.toMatch(/HASH-SECRET|password|verification_token|token_version/);
    expect((out as { users: { email: string }[] }).users.map((u) => u.email)).toContain('owner@example.com');
  });
});

describe('images', () => {
  it('builds a buildable pair and queues the job', async () => {
    const out = await run('admin_images_build', { phpVersion: '8.3', wpVersion: '6.9' }) as { jobId: string; tag: string };
    expect(out.tag).toMatch(/^wp-launcher\/wordpress:php8\.3/);
    expect(buildJobs.enqueueBuild).toHaveBeenCalledWith(out.jobId, expect.any(String));
  });

  it('refuses a pair that is not buildable', async () => {
    await expect(run('admin_images_build', { phpVersion: '5.6', wpVersion: '4.0' })).rejects.toThrow(/not a buildable combination/);
  });

  it('refuses to rebuild a custom image tag', async () => {
    await expect(run('admin_images_rebuild', { tag: 'wp-launcher/my-product:latest' })).rejects.toThrow(/not a WP Launcher base image/);
    expect(buildJobs.enqueueBuild).not.toHaveBeenCalled();
  });

  it('refuses to delete an image a blueprint uses unless forced', async () => {
    const remove = vi.spyOn(dockerService, 'removeImage').mockResolvedValue();
    await run('admin_blueprints_create', { blueprint: { id: 'uses-it', name: 'Uses it', docker: { image: 'wp-launcher/wordpress:php8.3' } } });
    await expect(run('admin_images_delete', { tag: 'wp-launcher/wordpress:php8.3' })).rejects.toThrow(/In use by blueprint/);
    expect(remove).not.toHaveBeenCalled();
    await run('admin_images_delete', { tag: 'wp-launcher/wordpress:php8.3', force: true });
    expect(remove).toHaveBeenCalledWith('wp-launcher/wordpress:php8.3');
  });
});

describe('blueprints', () => {
  it('creates, reads, updates and deletes a blueprint', async () => {
    const created = await run('admin_blueprints_create', { blueprint: { id: 'Agency Demo!', name: 'Agency demo' } }) as { blueprint: { id: string } };
    expect(created.blueprint.id).toBe('agency-demo');
    await run('admin_blueprints_update', { id: 'agency-demo', blueprint: { name: 'Agency demo v2' } });
    const got = await run('admin_blueprints_get', { id: 'agency-demo' }) as { blueprint: { name: string } };
    expect(got.blueprint.name).toBe('Agency demo v2');
    await run('admin_blueprints_delete', { id: 'agency-demo' });
    await expect(run('admin_blueprints_get', { id: 'agency-demo' })).rejects.toThrow(/not found/i);
  });

  it('rejects an invalid blueprint config', async () => {
    await expect(run('admin_blueprints_create', { blueprint: { id: 'x' } })).rejects.toThrow(/Invalid blueprint config/);
  });
});
