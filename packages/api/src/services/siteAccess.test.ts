import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createSiteTestDb } from '../test-helpers/sites';
import { __setDbForTesting } from '../utils/db';
import { siteForUserOrFail } from './siteAccess';
import { toRestSite, toSiteView } from './siteView';
import { getSite } from './site.service';

let db: Database.Database;
beforeEach(() => {
  db = createSiteTestDb();
  __setDbForTesting(db);
  db.prepare(`INSERT INTO sites (id, subdomain, user_id, blueprint_id, expires_at, site_url, admin_url, admin_user, admin_password, auto_login_token, container_id)
    VALUES ('mine', 'mine', 'owner', 'demo', '2099-01-01', 'https://mine.x', 'https://mine.x/wp-admin', 'admin', 'SECRET-PW', 'SECRET-TOK', 'ctr-123')`).run();
  db.prepare("INSERT INTO sites (id, subdomain, user_id, blueprint_id, expires_at) VALUES ('theirs', 'theirs', 'alice', 'demo', '2099-01-01')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('siteForUserOrFail', () => {
  it('returns the caller’s own site', () => {
    expect(siteForUserOrFail('mine', 'owner').id).toBe('mine');
  });

  it('answers "Site not found" for a missing site and for someone else’s alike', () => {
    expect(() => siteForUserOrFail('nope', 'owner')).toThrow(/^Site not found$/);
    expect(() => siteForUserOrFail('theirs', 'owner')).toThrow(/^Site not found$/);
  });

  it('gives an accepted share no access (v1 is owner-only)', () => {
    db.exec(`CREATE TABLE IF NOT EXISTS site_shares (id TEXT, site_id TEXT, owner_id TEXT, shared_with_email TEXT, shared_with_id TEXT, role TEXT, status TEXT)`);
    db.prepare("INSERT INTO site_shares VALUES ('sh1', 'theirs', 'alice', 'owner@example.com', 'owner', 'admin', 'accepted')").run();
    expect(() => siteForUserOrFail('theirs', 'owner')).toThrow(/^Site not found$/);
  });
});

describe('site projections', () => {
  it('the MCP view carries no secrets or internals', () => {
    const view = toSiteView(getSite('mine')!);
    // The dashboard has no per-site route (only /sites and /sites/new); a deeper link falls through to /.
    expect(view).toMatchObject({ id: 'mine', url: 'https://mine.x', adminUser: 'admin', panelUrl: expect.stringMatching(/\/sites$/) });
    expect(JSON.stringify(view)).not.toMatch(/SECRET-PW|SECRET-TOK|ctr-123/);
  });

  it('the REST shape keeps its historical fields and no secrets', () => {
    const rest = toRestSite(getSite('mine')!);
    expect(rest).toEqual({
      id: 'mine', subdomain: 'mine', blueprintId: 'demo', productId: 'demo', url: 'https://mine.x', adminUrl: 'https://mine.x/wp-admin',
      credentials: { username: 'admin' }, status: expect.any(String), createdAt: expect.any(String), expiresAt: '2099-01-01',
    });
  });
});
