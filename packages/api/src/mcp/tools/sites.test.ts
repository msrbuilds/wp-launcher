import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createSiteTestDb } from '../../test-helpers/sites';
import { __setDbForTesting } from '../../utils/db';
import * as siteService from '../../services/site.service';
import * as snapshotService from '../../services/snapshot.service';
import * as dockerService from '../../services/docker.service';
import { mintAutoLoginUrl } from '../../services/siteAccess';
import { sitesTools } from './sites';
import { snapshotTools } from './snapshots';
import { toSdkTool } from '../wrapper';
import type { McpAuthContext } from '../../oauth/token.service';

let db: Database.Database;
const ctx: McpAuthContext = { userId: 'owner', userEmail: 'owner@example.com', userRole: 'owner', grantId: 'g', clientId: 'c', clientName: 'App', scopes: ['sites:read', 'sites:write'] };
const all = () => [...sitesTools, ...snapshotTools];
const tool = (name: string) => all().find((t) => t.name === name)!;

beforeEach(() => {
  db = createSiteTestDb();
  __setDbForTesting(db);
  db.exec('CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, site_id TEXT, name TEXT, db_engine TEXT, storage_path TEXT, size_bytes INTEGER, created_at TEXT, restored_at TEXT)');
  db.prepare(`INSERT INTO sites (id, subdomain, user_id, blueprint_id, expires_at, status, site_url, admin_user, admin_password, container_id)
    VALUES ('mine', 'mine', 'owner', 'demo', '2099-01-01', 'running', 'https://mine.x', 'admin', 'SECRET-PW', 'ctr-1')`).run();
  db.prepare("INSERT INTO sites (id, subdomain, user_id, blueprint_id, expires_at, status, container_id) VALUES ('theirs', 'theirs', 'alice', 'demo', '2099-01-01', 'running', 'ctr-2')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); vi.restoreAllMocks(); });

describe('declarations match the spec table', () => {
  it.each([
    ['blueprints_list', 'sites:read', undefined, undefined],
    ['sites_launch', 'sites:write', undefined, 'sites'],
    ['sites_wait_ready', 'sites:read', undefined, undefined],
    ['sites_extend', 'sites:write', 'siteExtend', 'sites'],
    ['sites_autologin_link', 'sites:write', undefined, 'sites'],
    ['sites_clone', 'sites:write', 'cloning', 'sites'],
    ['sites_php_config_get', 'sites:read', 'phpConfig', undefined],
    ['sites_php_config_update', 'sites:write', 'phpConfig', 'sites'],
    ['sites_health', 'sites:read', 'healthMonitoring', undefined],
    ['snapshots_list', 'sites:read', 'snapshots', undefined],
    ['snapshots_create', 'sites:write', 'snapshots', 'sites'],
    ['snapshots_restore', 'sites:write', 'snapshots', 'sites'],
    ['snapshots_delete', 'sites:write', 'snapshots', 'sites'],
  ])('%s', (name, scope, feature, bucket) => {
    const t = tool(name);
    expect(t, name).toBeDefined();
    expect(t.scope).toBe(scope);
    expect(t.feature).toBe(feature);
    expect(t.writeBucket).toBe(bucket);
  });

  it('marks restore and delete destructive, and reads read-only', () => {
    for (const n of ['snapshots_restore', 'snapshots_delete', 'sites_delete']) expect(tool(n).annotations.destructiveHint, n).toBe(true);
    for (const t of all().filter((x) => x.scope === 'sites:read')) expect(t.annotations.readOnlyHint, t.name).toBe(true);
  });
});

describe('feature flags gate the tools even though REST does not', () => {
  it('sites_clone is refused while cloning is off, and its service is never called', async () => {
    const spy = vi.spyOn(snapshotService, 'cloneSite');
    const result = await toSdkTool(tool('sites_clone'), ctx).run({ siteId: 'mine' });
    expect(result.isError).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('owner-only reach', () => {
  it('every site-scoped tool answers "Site not found" for someone else’s site and touches nothing', async () => {
    const spies = [
      vi.spyOn(siteService, 'extendSite'), vi.spyOn(snapshotService, 'cloneSite'), vi.spyOn(snapshotService, 'takeSnapshot'),
      vi.spyOn(snapshotService, 'listSnapshots'), vi.spyOn(snapshotService, 'restoreSnapshotToSite'), vi.spyOn(snapshotService, 'deleteSnapshot'),
      vi.spyOn(dockerService, 'getPhpConfig'), vi.spyOn(dockerService, 'updatePhpConfig'), vi.spyOn(dockerService, 'getContainerStats'),
      vi.spyOn(dockerService, 'updateAutoLoginToken'),
    ];
    const args: Record<string, Record<string, unknown>> = {
      sites_extend: { siteId: 'theirs', duration: '1h' }, sites_php_config_update: { siteId: 'theirs', settings: { memoryLimit: '256M' } },
      snapshots_restore: { siteId: 'theirs', snapshotId: 'x' }, snapshots_delete: { siteId: 'theirs', snapshotId: 'x' },
    };
    for (const t of all().filter((x) => 'siteId' in x.input.shape)) {
      await expect(Promise.resolve().then(() => t.handler((args[t.name] ?? { siteId: 'theirs' }) as never, ctx)), t.name).rejects.toThrow(/^Site not found$/);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('credentials', () => {
  it('sites_launch returns the password only as oneTimePassword', async () => {
    const created = { ...siteService.getSite('mine')!, oneTimePassword: 'ONE-TIME' };
    vi.spyOn(siteService, 'createSite').mockResolvedValue(created);
    const out = await tool('sites_launch').handler({ blueprintId: 'demo' } as never, ctx);
    const parsed = tool('sites_launch').output.parse(out);
    expect(parsed.oneTimePassword).toBe('ONE-TIME');
    expect(JSON.stringify(parsed)).not.toContain('SECRET-PW');
  });

  it('sites_clone returns the safe view, never the clone row’s password', async () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('feature.cloning', 'true')").run();
    vi.spyOn(snapshotService, 'cloneSite').mockResolvedValue({ ...siteService.getSite('mine')!, id: 'clone', oneTimePassword: 'X' });
    const result = await toSdkTool(tool('sites_clone'), ctx).run({ siteId: 'mine' });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result)).not.toMatch(/SECRET-PW|"X"/);
  });

  it('mintAutoLoginUrl stores a fresh token, pushes it to the container, and returns a 60s link', async () => {
    const push = vi.spyOn(dockerService, 'updateAutoLoginToken').mockResolvedValue();
    const out = await mintAutoLoginUrl(siteService.getSite('mine')!);
    const token = new URL(out.autoLoginUrl).searchParams.get('autologin')!;
    expect(out.expiresIn).toBe(60);
    expect(push).toHaveBeenCalledWith('ctr-1', token);
    expect(siteService.getSite('mine')!.auto_login_token).toBe(token);
  });

  it('mintAutoLoginUrl refuses a site that is not running', async () => {
    db.prepare("UPDATE sites SET status = 'creating' WHERE id = 'mine'").run();
    await expect(mintAutoLoginUrl(siteService.getSite('mine')!)).rejects.toThrow(/not running/i);
  });
});
