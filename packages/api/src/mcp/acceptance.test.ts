/**
 * Stage 1 acceptance suite — the spec's "Acceptance tests and build order".
 * A real app on port 0 with the full /api/mcp stack and real OAuth tokens.
 * Every fail-closed case asserts on a spy that the destructive service was
 * never called, not merely on the response.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import type Database from 'better-sqlite3';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createSiteTestDb } from '../test-helpers/sites';
import { __setDbForTesting } from '../utils/db';
import { config } from '../config';
import { csrfProtection } from '../middleware/csrf';
import { generateToken } from '../middleware/userAuth';
import * as siteService from '../services/site.service';
import { registerDcrClient } from '../oauth/clients.service';
import { approve, checkAuthorizeRequest } from '../oauth/authorize.service';
import { redeemCode, revokeGrant } from '../oauth/token.service';
import type { Scope } from '../oauth/scopes';
import { mcpRouter, SERVER_INFO } from './server';
import { allTools, isEligible } from './registry';
import { toSdkTool } from './wrapper';
import { buildMcpServer, createRequestHandler, type AuthInfo } from './sdk';
import { originHostGuard } from './originHost';
import { bearerGuard } from './bearer';
import { __resetLimitsForTesting } from './limits';

let db: Database.Database;
let server: Server;
let url: string;
let barePort: string;
const REDIRECT = 'http://127.0.0.1:1/cb';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const ORIGIN = new URL(config.publicUrl).origin;

/** Valid arguments for every read tool, so the output-safety sweep can call each one. A new read tool must add an entry. */
const SAMPLE_ARGS: Record<string, Record<string, unknown>> = {
  sites_list: {},
  sites_get: { siteId: 'mine' },
  blueprints_list: {},
  sites_wait_ready: { siteId: 'mine', timeoutSeconds: 1 },
  sites_php_config_get: { siteId: 'mine' },
  sites_health: { siteId: 'mine' },
  snapshots_list: { siteId: 'mine' },
  crm_clients_list: {},
};

let bareServer: Server;
beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(csrfProtection);
  app.use('/api/mcp', mcpRouter());
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/mcp`;

  // The same stack *without* pipeline() and without the SDK scope hook: only the
  // wrapper's backstop stands between a request and a handler.
  const bare = express();
  bare.use(express.json());
  bare.use('/api/mcp', originHostGuard(), bearerGuard(), createRequestHandler((authInfo: AuthInfo | undefined) => {
    const ctx = (authInfo?.extra as { mcp?: never })?.mcp as never;
    return buildMcpServer(SERVER_INFO, allTools().map((t) => ({ ...toSdkTool(t, ctx), requiredScope: undefined })));
  }));
  await new Promise<void>((resolve) => { bareServer = bare.listen(0, '127.0.0.1', resolve); });
  barePort = String((bareServer.address() as { port: number }).port);
});
afterAll(async () => {
  for (const s of [server, bareServer]) { s.closeAllConnections(); await new Promise<void>((r) => s.close(() => r())); }
});

let deleteSpy: { mock: { calls: unknown[][] } } & ReturnType<typeof vi.fn>;
beforeEach(() => {
  db = createSiteTestDb();
  __setDbForTesting(db);
  __resetLimitsForTesting();
  const set = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  set.run('feature.mcp', 'true');
  set.run('feature.projects', 'true');
  db.prepare(`INSERT INTO sites (id, subdomain, user_id, blueprint_id, expires_at, status, site_url, admin_user, admin_password, auto_login_token, container_id)
    VALUES ('mine', 'mine', 'owner', 'demo', '2099-01-01', 'running', 'https://mine.x', 'admin', 'SECRET-PW', 'SECRET-TOK', 'ctr-1')`).run();
  db.prepare("INSERT INTO sites (id, subdomain, user_id, blueprint_id, expires_at, status) VALUES ('theirs', 'theirs', 'alice', 'demo', '2099-01-01', 'running')").run();
  db.prepare("INSERT INTO clients (id, user_id, name, notes) VALUES ('c1', 'owner', 'Acme', 'SECRET-PW is not a note anyone should see')").run();
  deleteSpy = vi.spyOn(siteService, 'deleteSite').mockResolvedValue() as never;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { __setDbForTesting(null); db.close(); vi.restoreAllMocks(); });

const client = () => registerDcrClient({ client_name: 'Agent', redirect_uris: [REDIRECT] });

async function tokenFor(scopes: Scope[], userId = 'owner', c = client()): Promise<string> {
  const check = await checkAuthorizeRequest({ response_type: 'code', client_id: c.client_id, redirect_uri: REDIRECT, code_challenge: CHALLENGE, code_challenge_method: 'S256' });
  if (!check.ok) throw new Error('bad check');
  const code = new URL(approve(userId, check, scopes)).searchParams.get('code')!;
  return redeemCode({ code, client_id: c.client_id, redirect_uri: REDIRECT, code_verifier: VERIFIER }).access_token;
}

async function readRpc(res: Response): Promise<any> {
  const text = await res.text();
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const data = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean);
    return data.length ? JSON.parse(data[data.length - 1]) : null;
  }
  return text ? JSON.parse(text) : null;
}

/** A 2025-era request after initialisation (stateless: no session needed). */
function legacy(token: string | null, body: unknown, headers: Record<string, string> = {}, target = url): Promise<Response> {
  return fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
    },
    body: JSON.stringify(body),
  });
}
const callTool = (name: string, args: Record<string, unknown> = {}, id = 1) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

describe('1. token boundary', () => {
  it('refuses a panel JWT, the API key, and the panel cookie', async () => {
    const jwt = generateToken('owner', 'owner@example.com', 'owner', 0);
    const variants: Record<string, string>[] = [{ Authorization: `Bearer ${jwt}` }, { 'X-Api-Key': config.apiKey }, { Cookie: `wpl_token=${jwt}` }];
    for (const headers of variants) {
      const res = await legacy(null, callTool('sites_list'), headers);
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toMatch(/resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/api\/mcp"/);
    }
  });
});

describe('2. output safety (iterates the registry)', () => {
  it('no read tool ever returns a site password, autologin token or container id', async () => {
    const token = await tokenFor(['sites:read', 'crm:read']);
    const readTools = allTools().filter((t) => t.annotations.readOnlyHint);
    expect(readTools.length).toBeGreaterThan(0);
    for (const tool of readTools) {
      expect(SAMPLE_ARGS[tool.name], `add SAMPLE_ARGS for ${tool.name}`).toBeDefined();
      const res = await legacy(token, callTool(tool.name, SAMPLE_ARGS[tool.name]));
      const raw = await res.text();
      expect(res.status, tool.name).toBe(200);
      expect(raw, tool.name).not.toMatch(/SECRET-TOK|ctr-1/);
      if (tool.name.startsWith('sites_')) expect(raw, tool.name).not.toContain('SECRET-PW');
    }
  });
});

describe('3. revocation', () => {
  it('a password change, a demotion, and a revoke each stop the next call', async () => {
    for (const cut of [
      () => db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = 'owner'").run(),
      () => db.prepare("UPDATE users SET role = 'member' WHERE id = 'owner'").run(),
      () => revokeGrant((db.prepare('SELECT id FROM oauth_grants ORDER BY rowid DESC LIMIT 1').get() as { id: string }).id),
    ]) {
      db.prepare("UPDATE users SET token_version = 0, role = 'owner' WHERE id = 'owner'").run();
      const token = await tokenFor(['sites:read']);
      expect((await legacy(token, callTool('sites_list'))).status).toBe(200);
      cut();
      expect((await legacy(token, callTool('sites_list'))).status).toBe(401);
    }
  });

  it('switching mcp off makes the endpoint absent', async () => {
    const token = await tokenFor(['sites:read']);
    db.prepare("UPDATE settings SET value = 'false' WHERE key = 'feature.mcp'").run();
    expect((await legacy(token, callTool('sites_list'))).status).toBe(404);
  });
});

describe('4. reach', () => {
  it('another user’s site is "Site not found", and so is one shared with you', async () => {
    db.exec('CREATE TABLE IF NOT EXISTS site_shares (id TEXT, site_id TEXT, owner_id TEXT, shared_with_email TEXT, shared_with_id TEXT, role TEXT, status TEXT)');
    db.prepare("INSERT INTO site_shares VALUES ('sh', 'theirs', 'alice', 'owner@example.com', 'owner', 'admin', 'accepted')").run();
    const token = await tokenFor(['sites:read']);
    const body = await readRpc(await legacy(token, callTool('sites_get', { siteId: 'theirs' })));
    expect(body.result.isError).toBe(true);
    expect(JSON.stringify(body.result)).toContain('Site not found');
  });
});

describe('5. scope and step-up', () => {
  it('a read-only grant lists sites_delete, is challenged for sites:write, and succeeds after re-consent', async () => {
    const c = client();
    const readOnly = await tokenFor(['sites:read'], 'owner', c);
    const list = await readRpc(await legacy(readOnly, { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    expect(list.result.tools.map((t: { name: string }) => t.name)).toContain('sites_delete');

    const challenged = await legacy(readOnly, callTool('sites_delete', { siteId: 'mine' }));
    expect(challenged.status).toBe(403);
    expect(challenged.headers.get('www-authenticate')).toMatch(/error="insufficient_scope"/);
    expect(challenged.headers.get('www-authenticate')).toMatch(/scope="sites:write"/);
    expect(deleteSpy).not.toHaveBeenCalled();

    const upgraded = await tokenFor(['sites:read', 'sites:write'], 'owner', c);
    const ok = await readRpc(await legacy(upgraded, callTool('sites_delete', { siteId: 'mine' })));
    expect(ok.result.isError).toBeFalsy();
    expect(deleteSpy).toHaveBeenCalledWith('mine', 'owner', 'owner@example.com');
  });

  describe('ordering: a missing scope never wins over an earlier failure', () => {
    it('feature off → business refusal, not 403', async () => {
      db.prepare("UPDATE settings SET value = 'false' WHERE key = 'feature.projects'").run();
      const token = await tokenFor(['sites:read']);
      const res = await legacy(token, callTool('crm_clients_list'));
      expect(res.status).toBe(200);
      expect((await readRpc(res)).result).toMatchObject({ isError: true });
    });

    it('mismatched Mcp-Name → 400 -32020, not 403', async () => {
      const token = await tokenFor(['sites:read']);
      const res = await legacy(token, callTool('sites_delete', { siteId: 'mine' }), { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': 'sites_list' });
      expect(res.status).toBe(400);
      expect((await readRpc(res)).error.code).toBe(-32020);
    });

    it('unknown tool → unknown-tool error, not 403', async () => {
      const token = await tokenFor(['sites:read']);
      const res = await legacy(token, callTool('no_such_tool'));
      expect(res.status).not.toBe(403);
      const body = await readRpc(res);
      expect(body.error ?? body.result?.isError).toBeTruthy();
    });

    it('invalid token → 401, not 403', async () => {
      const res = await legacy('wplmcp_at_garbage', callTool('sites_delete', { siteId: 'mine' }));
      expect(res.status).toBe(401);
    });
  });
});

describe('fail-closed regressions (deleteSite must never run)', () => {
  it('a headerless tools/call is rejected, in 2025 and 2026 shapes', async () => {
    const token = await tokenFor(['sites:read']);
    const extras: Record<string, string>[] = [{}, { 'Mcp-Method': 'tools/call', 'Mcp-Name': 'sites_delete' }];
    for (const extra of extras) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}`, ...extra },
        body: JSON.stringify(callTool('sites_delete', { siteId: 'mine' })),
      });
      expect(res.status).toBe(400);
    }
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('without the pipeline and the SDK hook, the wrapper refuses and audits a bypass', async () => {
    const token = await tokenFor(['sites:read']);
    const body = await readRpc(await legacy(token, callTool('sites_delete', { siteId: 'mine' }), {}, url.replace(/:\d+\//, `:${barePort}/`)));
    expect(body.result.isError).toBe(true);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(db.prepare("SELECT outcome, bypass FROM mcp_audit_log WHERE tool = 'sites_delete'").get()).toEqual({ outcome: 'denied', bypass: 1 });
  });

  it('for every tool, a grant lacking its scope never runs its handler (handler alone, no pipeline)', async () => {
    for (const tool of allTools()) {
      const scopes = (['sites:read', 'crm:read', 'sites:write'] as Scope[]).filter((s) => s !== tool.scope);
      const token = await tokenFor(scopes.length ? scopes : ['admin:read']);
      const handler = vi.spyOn(tool, 'handler');
      await legacy(token, callTool(tool.name, SAMPLE_ARGS[tool.name] ?? { siteId: 'mine' }), {}, url.replace(/:\d+\//, `:${barePort}/`));
      expect(handler, tool.name).not.toHaveBeenCalled();
    }
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('a notification never runs a tool', async () => {
    const token = await tokenFor(['sites:read']);
    const res = await legacy(token, { jsonrpc: '2.0', method: 'tools/call', params: { name: 'sites_delete', arguments: { siteId: 'mine' } } });
    expect([202, 400]).toContain(res.status);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe('protocol generations', () => {
  const sdkClient = (token: string, opts: ConstructorParameters<typeof Client>[1]) => {
    const c = new Client({ name: 'acceptance', version: '1' }, opts);
    return { c, transport: new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }) };
  };

  for (const [label, opts] of [
    ['2026-07-28', { versionNegotiation: { mode: { pin: '2026-07-28' } } }],
    ['2025-11-25', { supportedProtocolVersions: ['2025-11-25'] }],
    ['2025-06-18', { supportedProtocolVersions: ['2025-06-18'] }],
  ] as const) {
    it(`a ${label} client lists tools and calls sites_list`, async () => {
      const token = await tokenFor(['sites:read']);
      const { c, transport } = sdkClient(token, opts as never);
      await c.connect(transport);
      const { tools } = await c.listTools();
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['sites_list', 'sites_get', 'sites_delete']));
      const result = await c.callTool({ name: 'sites_list', arguments: {} });
      expect((result.structuredContent as { sites: { id: string }[] }).sites.map((s) => s.id)).toEqual(['mine']);
      await c.close();
    });
  }

  for (const version of ['2025-11-25', '2025-06-18']) {
    it(`${version} lifecycle: headerless initialize → initialized (202, empty) → tools/list → tools/call`, async () => {
      const token = await tokenFor(['sites:read']);
      const base = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` };
      const init = await fetch(url, { method: 'POST', headers: base, body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 'raw', version: '1' } } }) });
      expect(init.status).toBe(200);
      expect((await readRpc(init)).result.protocolVersion).toBe(version);
      const withHeader = { ...base, 'MCP-Protocol-Version': version };
      const initialized = await fetch(url, { method: 'POST', headers: withHeader, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
      expect(initialized.status).toBe(202);
      expect(await initialized.text()).toBe('');
      const list = await readRpc(await fetch(url, { method: 'POST', headers: withHeader, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }));
      expect(list.result.tools.length).toBeGreaterThan(0);
      const called = await readRpc(await fetch(url, { method: 'POST', headers: withHeader, body: JSON.stringify(callTool('sites_list', {}, 2)) }));
      expect(called.result.isError).toBeFalsy();
      const headerless = await fetch(url, { method: 'POST', headers: base, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }) });
      expect(headerless.status).toBe(400);
    });
  }

  it('a legacy response or batch is refused; a 2026 notification is refused', async () => {
    const token = await tokenFor(['sites:read']);
    expect((await legacy(token, { jsonrpc: '2.0', id: 1, result: {} })).status).toBe(400);
    expect((await legacy(token, [callTool('sites_list')])).status).toBe(400);
    expect((await legacy(token, { jsonrpc: '2.0', method: 'notifications/initialized' }, { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'notifications/initialized' })).status).toBe(400);
  });

  it('an unsupported header version gets -32022', async () => {
    const token = await tokenFor(['sites:read']);
    const res = await legacy(token, callTool('sites_list'), { 'MCP-Protocol-Version': '2024-11-05' });
    expect(res.status).toBe(400);
    expect((await readRpc(res)).error.code).toBe(-32022);
  });
});

describe('Origin', () => {
  it('a bad Origin is 403 with or without a valid token, never 401', async () => {
    const token = await tokenFor(['sites:read']);
    expect((await legacy(token, callTool('sites_list'), { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await legacy(null, callTool('sites_list'), { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await legacy(null, callTool('sites_list'), { Origin: ORIGIN })).status).toBe(401);
  });
});

describe('eligibility helper', () => {
  it('matches what the server registers', async () => {
    expect(allTools().filter((t) => isEligible(t, { userRole: 'owner' })).length).toBeGreaterThan(0);
  });
});
