import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import * as userService from '../services/user.service';
import { optionalUserAuth, userAuth, type AuthRequest } from './userAuth';
import { registerDcrClient } from '../oauth/clients.service';
import { approve, checkAuthorizeRequest } from '../oauth/authorize.service';
import { redeemCode } from '../oauth/token.service';

let db: Database.Database;
let server: Server;
let base: string;
const REDIRECT = 'http://127.0.0.1:1/cb';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

beforeAll(async () => {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', userAuth, (_req, res) => { res.json({ ok: true }); });
  app.get('/optional', optionalUserAuth, (req: AuthRequest, res) => { res.json({ userId: req.userId ?? null }); });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); });
beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email, verified, role) VALUES ('owner', 'o@x.test', 1, 'owner')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); vi.restoreAllMocks(); });

async function mcpTokens() {
  const client = registerDcrClient({ client_name: 'Agent', redirect_uris: [REDIRECT] });
  const check = await checkAuthorizeRequest({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: CHALLENGE, code_challenge_method: 'S256' });
  if (!check.ok) throw new Error('bad check');
  const code = new URL(approve('owner', check, ['sites:read', 'sites:write'])).searchParams.get('code')!;
  return redeemCode({ code, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: VERIFIER });
}

describe('MCP tokens give no staff identity outside /api/mcp', () => {
  it('a userAuth route answers 401 without ever consulting the user store', async () => {
    const tokens = await mcpTokens();
    const spy = vi.spyOn(userService, 'getUserById');
    for (const token of [tokens.access_token, tokens.refresh_token]) {
      const res = await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status).toBe(401);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('an optionalUserAuth route treats the token as anonymous', async () => {
    const tokens = await mcpTokens();
    const res = await fetch(`${base}/optional`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: null });
  });
});
