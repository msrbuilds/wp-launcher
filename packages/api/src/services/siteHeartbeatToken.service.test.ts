import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { __initSchemaForTesting, __setDbForTesting } from '../utils/db';
import { mintSiteHeartbeatToken, resolveSiteHeartbeatToken } from './siteHeartbeatToken.service';

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  __initSchemaForTesting(db);
  __setDbForTesting(db);
  for (const [id, sub, status] of [['site-a', 'alpha', 'running'], ['site-b', 'beta', 'running'], ['site-x', 'gone', 'expired']]) {
    db.prepare("INSERT INTO sites (id, subdomain, blueprint_id, status, expires_at) VALUES (?, ?, 'demo', ?, '2099-01-01')")
      .run(id, sub, status);
  }
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('per-site heartbeat tokens', () => {
  it('resolves a token to the site it was minted for', () => {
    const a = mintSiteHeartbeatToken('site-a');
    const b = mintSiteHeartbeatToken('site-b');
    expect(a).not.toBe(b);
    expect(resolveSiteHeartbeatToken(a)).toEqual({ siteId: 'site-a', subdomain: 'alpha' });
    expect(resolveSiteHeartbeatToken(b)).toEqual({ siteId: 'site-b', subdomain: 'beta' });
  });

  it('stores only a hash, never the token', () => {
    const token = mintSiteHeartbeatToken('site-a');
    const dump = JSON.stringify(db.prepare('SELECT * FROM site_heartbeat_tokens').all());
    expect(dump).not.toContain(token);
    expect(dump).not.toContain(token.slice(6));
  });

  it('keeps one token per site: minting again retires the old one', () => {
    const first = mintSiteHeartbeatToken('site-a');
    const second = mintSiteHeartbeatToken('site-a');
    expect(resolveSiteHeartbeatToken(first)).toBeNull();
    expect(resolveSiteHeartbeatToken(second)).toEqual({ siteId: 'site-a', subdomain: 'alpha' });
  });

  it('stops working once the site is no longer running', () => {
    const token = mintSiteHeartbeatToken('site-a');
    db.prepare("UPDATE sites SET status = 'expired' WHERE id = 'site-a'").run();
    expect(resolveSiteHeartbeatToken(token)).toBeNull();
    expect(resolveSiteHeartbeatToken(mintSiteHeartbeatToken('site-x'))).toBeNull();
  });

  it('stops working once the site row is gone', () => {
    const token = mintSiteHeartbeatToken('site-a');
    db.prepare("DELETE FROM sites WHERE id = 'site-a'").run();
    expect(resolveSiteHeartbeatToken(token)).toBeNull();
  });

  it.each([undefined, null, 42, '', 'not-a-token', 'wplhb_forged'])('rejects %j', (value) => {
    mintSiteHeartbeatToken('site-a');
    expect(resolveSiteHeartbeatToken(value)).toBeNull();
  });
});
