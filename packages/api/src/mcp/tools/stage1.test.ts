import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createSiteTestDb } from '../../test-helpers/sites';
import { __setDbForTesting } from '../../utils/db';
import * as siteService from '../../services/site.service';
import { sitesTools } from './sites';
import { crmClientTools } from './crm-clients';
import type { McpAuthContext } from '../../oauth/token.service';

let db: Database.Database;
const ctx: McpAuthContext = { userId: 'owner', userEmail: 'owner@example.com', userRole: 'owner', grantId: 'g', clientId: 'c', clientName: 'App', scopes: ['sites:read', 'sites:write', 'crm:read'] };
const tool = (name: string) => [...sitesTools, ...crmClientTools].find((t) => t.name === name)!;

beforeEach(() => {
  db = createSiteTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO sites (id, subdomain, user_id, blueprint_id, expires_at, status, admin_password) VALUES ('mine', 'mine', 'owner', 'demo', '2099-01-01', 'running', 'SECRET-PW')").run();
  db.prepare("INSERT INTO sites (id, subdomain, user_id, blueprint_id, expires_at, status) VALUES ('theirs', 'theirs', 'alice', 'demo', '2099-01-01', 'running')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'owner', 'Acme'), ('c2', 'alice', 'Not yours')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); vi.restoreAllMocks(); });

describe('stage 1 tools', () => {
  it('sites_list returns only the caller’s sites, never all-users', async () => {
    const out = await tool('sites_list').handler({}, ctx) as { sites: { id: string }[] };
    expect(out.sites.map((s) => s.id)).toEqual(['mine']);
  });

  it('sites_get refuses someone else’s site', async () => {
    await expect(Promise.resolve().then(() => tool('sites_get').handler({ siteId: 'theirs' }, ctx))).rejects.toThrow(/Site not found/);
  });

  it('sites_delete never reaches deleteSite for a foreign site', async () => {
    const spy = vi.spyOn(siteService, 'deleteSite').mockResolvedValue();
    await expect(Promise.resolve().then(() => tool('sites_delete').handler({ siteId: 'theirs' }, ctx))).rejects.toThrow(/Site not found/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('sites_delete deletes the caller’s own site', async () => {
    const spy = vi.spyOn(siteService, 'deleteSite').mockResolvedValue();
    expect(await tool('sites_delete').handler({ siteId: 'mine' }, ctx)).toEqual({ deleted: true, siteId: 'mine' });
    expect(spy).toHaveBeenCalledWith('mine', 'owner', 'owner@example.com');
  });

  it('declares scopes, features and hints as the spec says', () => {
    expect(tool('sites_delete')).toMatchObject({ scope: 'sites:write', writeBucket: 'sites', annotations: { destructiveHint: true } });
    expect(tool('sites_list')).toMatchObject({ scope: 'sites:read', annotations: { readOnlyHint: true } });
    expect(tool('crm_clients_list')).toMatchObject({ scope: 'crm:read', feature: 'projects' });
  });

  it('crm_clients_list lists only the caller’s clients', async () => {
    const out = await tool('crm_clients_list').handler({}, ctx) as { clients: { id: string }[]; total: number };
    expect(out.clients.map((c) => c.id)).toEqual(['c1']);
    expect(out.total).toBe(1);
  });
});
