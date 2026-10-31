import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { createSiteTestDb } from '../test-helpers/sites';
import { __setDbForTesting } from '../utils/db';
import { generateToken } from '../middleware/userAuth';
import { config } from '../config';
import sitesRouter from './sites';

let db: ReturnType<typeof createSiteTestDb>;
let server: Server;
let url: string;
beforeAll(async () => {
  const app = express();
  app.use(cookieParser());
  app.use('/api/sites', sitesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/sites`;
});
beforeEach(() => {
  db = createSiteTestDb();
  __setDbForTesting(db);
  for (const [id, user, blueprint] of [['mine', 'alice', 'demo'], ['mine-two', 'alice', 'other'], ['foreign', 'bob', 'demo'], ['owned', 'owner', 'demo']]) {
    db.prepare(`INSERT INTO sites (id, subdomain, user_id, blueprint_id, expires_at) VALUES (?, ?, ?, ?, '2099-01-01')`)
      .run(id, id, user, blueprint);
  }
});
afterEach(() => { __setDbForTesting(null); db.close(); });
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

function headers(user = 'alice', claimedRole = 'member') {
  return { Authorization: `Bearer ${generateToken(user, `${user}@example.com`, claimedRole)}` };
}
async function ids(query: string, auth = headers()) {
  const response = await fetch(url + query, { headers: auth });
  expect(response.status).toBe(200);
  const body = await response.json() as { sites: { id: string }[] };
  return body.sites.map((site: { id: string }) => site.id).sort();
}

describe('site listing ownership through the HTTP/auth boundary', () => {
  it.each(['', '?all=true', '?all=false', '?all=0', '?all[]=false', '?all[x]=false', '?all=&all='])
    ('keeps members scoped for %s', async (query) => {
      expect(await ids(query)).toEqual(['mine', 'mine-two']);
    });
  it.each(['blueprintId', 'productId'])('applies %s filtering within member ownership', async (key) => {
    expect(await ids(`?all=true&${key}=demo`)).toEqual(['mine']);
  });
  it('uses the database role even when the JWT claims admin', async () => {
    expect(await ids('?all=true', headers('alice', 'admin'))).toEqual(['mine', 'mine-two']);
  });
  it.each(['owner', 'admin'])('preserves explicit global listing for %s', async (role) => {
    expect(await ids('?all=true&blueprintId=demo', headers(role, role))).toEqual(['foreign', 'mine', 'owned']);
  });
  it('preserves the privileged default of listing their own sites', async () => {
    expect(await ids('', headers('owner', 'owner'))).toEqual(['owned']);
  });
  it('permits global listing with the install API key', async () => {
    const res = await fetch(url + '?all=true', { headers: { 'X-API-Key': config.apiKey } });
    expect(res.status).toBe(200);
    expect((await res.json() as { sites: unknown[] }).sites).toHaveLength(4);
  });
  it.each([undefined, 'Bearer invalid'])('rejects missing or invalid authentication (%s)', async (authorization) => {
    const res = await fetch(url + '?all=true', { headers: authorization ? { authorization } : {} });
    expect(res.status).toBe(401);
  });
});
