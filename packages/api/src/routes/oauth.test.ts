import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { config } from '../config';
import { csrfProtection } from '../middleware/csrf';
import { generateToken } from '../middleware/userAuth';
import oauthRouter, { oauthOpenCors } from './oauth';
import wellKnownRouter from './wellKnown';
import { validateAccessToken } from '../oauth/token.service';

let db: Database.Database;
let server: Server;
let base: string;
const ORIGIN = new URL(config.publicUrl).origin;
const REDIRECT = 'http://127.0.0.1:33418/callback';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

beforeAll(async () => {
  const app = express();
  app.use(oauthOpenCors);
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfProtection);
  app.use('/.well-known', wellKnownRouter);
  app.use('/api/oauth', oauthRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function enableMcp(on = true) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('feature.mcp', ?)").run(on ? 'true' : 'false');
}

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email, verified, role) VALUES ('owner', 'o@x.test', 1, 'owner')").run();
  enableMcp();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

const staffCookie = () => ({ Cookie: `wpl_token=${generateToken('owner', 'o@x.test', 'owner', 0)}` });
const csrfHeaders = () => ({ Origin: ORIGIN, 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' });

async function register(): Promise<string> {
  const res = await fetch(`${base}/api/oauth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'Claude Code', redirect_uris: [REDIRECT] }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

function authorizeQuery(clientId: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, scope: 'sites:read',
    state: 's1', code_challenge: CHALLENGE, code_challenge_method: 'S256', ...extra,
  });
}

async function approveAndGetCode(clientId: string, scopes = ['sites:read']): Promise<string> {
  const params = Object.fromEntries(authorizeQuery(clientId));
  const res = await fetch(`${base}/api/oauth/authorize/decision`, {
    method: 'POST', headers: { ...csrfHeaders(), ...staffCookie() },
    body: JSON.stringify({ ...params, approve: true, scopes }),
  });
  expect(res.status).toBe(200);
  return new URL(((await res.json()) as { redirectTo: string }).redirectTo).searchParams.get('code')!;
}

describe('feature gate', () => {
  it('answers 404 everywhere while mcp is off', async () => {
    enableMcp(false);
    for (const [method, path] of [
      ['GET', '/.well-known/oauth-authorization-server'], ['GET', '/.well-known/oauth-protected-resource'],
      ['GET', '/.well-known/oauth-protected-resource/api/mcp'], ['POST', '/api/oauth/register'],
      ['GET', '/api/oauth/authorize/request'], ['POST', '/api/oauth/token'], ['POST', '/api/oauth/revoke'],
    ]) {
      const res = await fetch(base + path, { method });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });
});

describe('discovery metadata', () => {
  it('serves RFC 8414 authorisation server metadata', async () => {
    const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json() as Record<string, unknown>;
    expect(meta).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/oauth/authorize`,
      token_endpoint: `${ORIGIN}/api/oauth/token`,
      registration_endpoint: `${ORIGIN}/api/oauth/register`,
      revocation_endpoint: `${ORIGIN}/api/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
    expect(meta.scopes_supported).toHaveLength(7);
  });

  it('serves RFC 9728 protected resource metadata at both the root and path-suffixed URLs', async () => {
    for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/mcp']) {
      const meta = await (await fetch(base + path)).json();
      expect(meta).toEqual({
        resource: `${ORIGIN}/api/mcp`,
        authorization_servers: [ORIGIN],
        scopes_supported: ['sites:read', 'crm:read'],
        bearer_methods_supported: ['header'],
        resource_name: 'WP Launcher',
      });
    }
  });
});

describe('full flow', () => {
  it('register → request → decision → token (form) → refresh → revoke', async () => {
    const clientId = await register();

    const reqRes = await fetch(`${base}/api/oauth/authorize/request?${authorizeQuery(clientId)}`, { headers: staffCookie() });
    expect(reqRes.status).toBe(200);
    const view = await reqRes.json() as Record<string, any>;
    expect(view.client).toMatchObject({ name: 'Claude Code', redirectHost: '127.0.0.1:33418', kind: 'dcr', unverified: true });
    expect(view.requestedScopes).toEqual(['sites:read']);
    expect(view.offerableScopes).toHaveLength(7);
    expect(view.scopeInfo['sites:write'].destructive).toBe(true);
    expect(view.instance.url).toBe(ORIGIN);

    const code = await approveAndGetCode(clientId);
    const tokenRes = await fetch(`${base}/api/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: VERIFIER }),
    });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.headers.get('cache-control')).toBe('no-store');
    const tokens = await tokenRes.json() as { access_token: string; refresh_token: string };
    expect(validateAccessToken(tokens.access_token)).not.toBeNull();

    const refreshRes = await fetch(`${base}/api/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId }),
    });
    expect(refreshRes.status).toBe(200);
    const refreshed = await refreshRes.json() as { access_token: string; refresh_token: string };

    const revokeRes = await fetch(`${base}/api/oauth/revoke`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshed.refresh_token }),
    });
    expect(revokeRes.status).toBe(200);
    expect(validateAccessToken(refreshed.access_token)).toBeNull();
  });

  it('authorize/request needs a staff session', async () => {
    const clientId = await register();
    const res = await fetch(`${base}/api/oauth/authorize/request?${authorizeQuery(clientId)}`);
    expect(res.status).toBe(401);
  });

  it('authorize/request renders (never redirects) for an unknown client', async () => {
    const res = await fetch(`${base}/api/oauth/authorize/request?${authorizeQuery('dcr_nope')}`, { headers: staffCookie() });
    const body = await res.json() as Record<string, unknown>;
    expect(body.render).toBeTruthy();
    expect(body.redirect).toBeUndefined();
  });

  it('a decision without CSRF headers is refused', async () => {
    const clientId = await register();
    const res = await fetch(`${base}/api/oauth/authorize/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...staffCookie() },
      body: JSON.stringify({ ...Object.fromEntries(authorizeQuery(clientId)), approve: true, scopes: ['sites:read'] }),
    });
    expect(res.status).toBe(403);
  });

  it('a member cannot approve', async () => {
    db.prepare("INSERT INTO users (id, email, verified, role) VALUES ('mem', 'm@x.test', 1, 'member')").run();
    const clientId = await register();
    const res = await fetch(`${base}/api/oauth/authorize/decision`, {
      method: 'POST', headers: { ...csrfHeaders(), Cookie: `wpl_token=${generateToken('mem', 'm@x.test', 'member', 0)}` },
      body: JSON.stringify({ ...Object.fromEntries(authorizeQuery(clientId)), approve: true, scopes: ['sites:read'] }),
    });
    expect(res.status).toBe(403);
  });

  it('deny redirects with access_denied', async () => {
    const clientId = await register();
    const res = await fetch(`${base}/api/oauth/authorize/decision`, {
      method: 'POST', headers: { ...csrfHeaders(), ...staffCookie() },
      body: JSON.stringify({ ...Object.fromEntries(authorizeQuery(clientId)), approve: false, scopes: [] }),
    });
    const { redirectTo } = await res.json() as { redirectTo: string };
    expect(new URL(redirectTo).searchParams.get('error')).toBe('access_denied');
  });
});

describe('token endpoint errors', () => {
  it('reports invalid_grant as a 400 OAuth error body', async () => {
    const clientId = await register();
    const res = await fetch(`${base}/api/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', code: 'nope', client_id: clientId, redirect_uri: REDIRECT, code_verifier: VERIFIER }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_grant' });
  });

  it('reports unsupported_grant_type', async () => {
    const res = await fetch(`${base}/api/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'password' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'unsupported_grant_type' });
  });

  it('reports invalid registration metadata', async () => {
    const res = await fetch(`${base}/api/oauth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'x', redirect_uris: ['http://evil/cb'] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_redirect_uri' });
  });
});

describe('CORS', () => {
  it('lets any origin preflight the token endpoint, without credentials', async () => {
    const res = await fetch(`${base}/api/oauth/token`, {
      method: 'OPTIONS', headers: { Origin: 'https://other.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://other.example');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });
});
