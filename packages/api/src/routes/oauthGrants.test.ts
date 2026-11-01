import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { config } from '../config';
import { csrfProtection } from '../middleware/csrf';
import { generateToken } from '../middleware/userAuth';
import oauthRouter from './oauth';
import { registerDcrClient } from '../oauth/clients.service';
import { approve, checkAuthorizeRequest } from '../oauth/authorize.service';
import { OAuthError, pruneExpiredOAuth, redeemCode, validateAccessToken } from '../oauth/token.service';
import { recordAudit } from '../mcp/audit';

let db: Database.Database;
let server: Server;
let base: string;
const ORIGIN = new URL(config.publicUrl).origin;
const REDIRECT = 'http://127.0.0.1:1/cb';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfProtection);
  app.use('/api/oauth', oauthRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/oauth`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); });
beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO settings (key, value) VALUES ('feature.mcp', 'true')").run();
  for (const [id, role] of [['owner', 'owner'], ['ada', 'admin'], ['bob', 'admin']]) {
    db.prepare('INSERT INTO users (id, email, verified, role) VALUES (?, ?, 1, ?)').run(id, `${id}@x.test`, role);
  }
});
afterEach(() => { __setDbForTesting(null); db.close(); });

async function connect(userId: string, name = 'Agent') {
  const client = registerDcrClient({ client_name: name, redirect_uris: [REDIRECT] });
  const check = await checkAuthorizeRequest({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: CHALLENGE, code_challenge_method: 'S256' });
  if (!check.ok) throw new Error('bad check');
  const code = new URL(approve(userId, check, ['sites:read'])).searchParams.get('code')!;
  const tokens = redeemCode({ code, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: VERIFIER });
  const grantId = (db.prepare('SELECT id FROM oauth_grants ORDER BY rowid DESC LIMIT 1').get() as { id: string }).id;
  return { client, tokens, grantId };
}

const as = (userId: string, role: string, extra: Record<string, string> = {}) =>
  ({ Cookie: `wpl_token=${generateToken(userId, `${userId}@x.test`, role, 0)}`, Origin: ORIGIN, 'X-Requested-With': 'XMLHttpRequest', ...extra });

describe('connected apps', () => {
  it('lists the caller’s own grants only', async () => {
    await connect('ada', 'Claude');
    await connect('bob', 'ChatGPT');
    const body = await (await fetch(`${base}/grants`, { headers: as('ada', 'admin') })).json() as { grants: { clientName: string; redirectHost: string; scopes: string[] }[] };
    expect(body.grants).toEqual([expect.objectContaining({ clientName: 'Claude', redirectHost: '127.0.0.1:1', scopes: ['sites:read'] })]);
  });

  it('an admin cannot revoke another admin’s grant; the owner can', async () => {
    const bobs = await connect('bob');
    expect((await fetch(`${base}/grants/${bobs.grantId}`, { method: 'DELETE', headers: as('ada', 'admin') })).status).toBe(404);
    expect(validateAccessToken(bobs.tokens.access_token)).not.toBeNull();
    expect((await fetch(`${base}/grants/${bobs.grantId}`, { method: 'DELETE', headers: as('owner', 'owner') })).status).toBe(200);
    expect(validateAccessToken(bobs.tokens.access_token)).toBeNull();
  });

  it('revoking needs the CSRF headers like any panel write', async () => {
    const mine = await connect('ada');
    const res = await fetch(`${base}/grants/${mine.grantId}`, { method: 'DELETE', headers: { Cookie: as('ada', 'admin').Cookie } });
    expect(res.status).toBe(403);
  });

  it('only the owner sees every user’s grants, and never their activity', async () => {
    await connect('ada');
    await connect('bob');
    expect((await fetch(`${base}/grants/all`, { headers: as('ada', 'admin') })).status).toBe(403);
    const all = await (await fetch(`${base}/grants/all`, { headers: as('owner', 'owner') })).json() as { grants: { userEmail: string }[] };
    expect(all.grants.map((g) => g.userEmail).sort()).toEqual(['ada@x.test', 'bob@x.test']);
  });

  it('revoke-all disconnects everything, including an approval still in flight', async () => {
    const live = await connect('ada');
    const client = registerDcrClient({ client_name: 'Pending', redirect_uris: [REDIRECT] });
    const check = await checkAuthorizeRequest({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: CHALLENGE, code_challenge_method: 'S256' });
    if (!check.ok) throw new Error('bad check');
    const code = new URL(approve('ada', check, ['sites:read'])).searchParams.get('code')!;
    const res = await fetch(`${base}/grants/revoke-all`, { method: 'POST', headers: as('ada', 'admin') });
    expect(await res.json()).toEqual({ revoked: 1 });
    expect(validateAccessToken(live.tokens.access_token)).toBeNull();
    expect(() => redeemCode({ code, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: VERIFIER })).toThrow(OAuthError);
  });

  it('members get nothing', async () => {
    db.prepare("INSERT INTO users (id, email, verified, role) VALUES ('mem', 'mem@x.test', 1, 'member')").run();
    expect((await fetch(`${base}/grants`, { headers: as('mem', 'member') })).status).toBe(403);
  });

  it('is absent while mcp is off', async () => {
    db.prepare("UPDATE settings SET value = 'false' WHERE key = 'feature.mcp'").run();
    expect((await fetch(`${base}/grants`, { headers: as('ada', 'admin') })).status).toBe(404);
  });
});

describe('setup info', () => {
  it('tells staff the MCP URL and whether cloud agents can reach it', async () => {
    const body = await (await fetch(`${base}/info`, { headers: as('ada', 'admin') })).json();
    expect(body).toEqual({ mcpUrl: `${ORIGIN}/api/mcp`, isPublic: false });
  });

  it('is staff-only', async () => {
    db.prepare("INSERT INTO users (id, email, verified, role) VALUES ('mem', 'mem@x.test', 1, 'member')").run();
    expect((await fetch(`${base}/info`, { headers: as('mem', 'member') })).status).toBe(403);
  });
});

describe('agent activity', () => {
  it('returns only the caller’s audit rows', async () => {
    recordAudit({ grantId: 'g', userId: 'ada', clientId: 'c', tool: 'sites_list', args: {}, outcome: 'ok', durationMs: 1 });
    recordAudit({ grantId: 'g', userId: 'bob', clientId: 'c', tool: 'crm_messages_send', args: {}, outcome: 'ok', durationMs: 1 });
    const body = await (await fetch(`${base}/audit`, { headers: as('ada', 'admin') })).json() as { rows: { tool: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.rows.map((r) => r.tool)).toEqual(['sites_list']);
  });
});

describe('pruning', () => {
  it('removes used or expired codes and long-expired tokens, keeps live ones', async () => {
    const { tokens } = await connect('ada');
    db.prepare("UPDATE oauth_auth_codes SET created_at = datetime('now','-2 days')").run();
    db.prepare("UPDATE oauth_tokens SET expires_at = datetime('now','-2 days') WHERE kind = 'access'").run();
    const removed = pruneExpiredOAuth();
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(db.prepare('SELECT COUNT(*) AS n FROM oauth_auth_codes').get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM oauth_tokens WHERE kind = 'refresh'").get()).toEqual({ n: 1 });
    expect(tokens.refresh_token).toBeTruthy();
  });
});
