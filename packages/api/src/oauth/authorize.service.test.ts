import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { registerDcrClient, type OAuthClient } from './clients.service';
import { approve, checkAuthorizeRequest, deny, type AuthorizeParams } from './authorize.service';
import { hashToken } from './tokens';
import { issuer, mcpResourceUrl } from './urls';

let db: Database.Database;
let client: OAuthClient;
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email, verified, role, token_version) VALUES ('owner', 'o@x.test', 1, 'owner', 3)").run();
  db.prepare("INSERT INTO users (id, email, verified, role) VALUES ('member', 'm@x.test', 1, 'member')").run();
  client = registerDcrClient({ client_name: 'Claude', redirect_uris: [REDIRECT] });
});
afterEach(() => { __setDbForTesting(null); db.close(); });

function params(overrides: Partial<AuthorizeParams> = {}): AuthorizeParams {
  return {
    response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, scope: 'sites:read',
    state: 'xyz', code_challenge: CHALLENGE, code_challenge_method: 'S256', resource: mcpResourceUrl(), ...overrides,
  };
}

async function okCheck(overrides: Partial<AuthorizeParams> = {}) {
  const check = await checkAuthorizeRequest(params(overrides));
  if (!check.ok) throw new Error(`expected ok, got ${JSON.stringify(check)}`);
  return check;
}

describe('checkAuthorizeRequest', () => {
  it('renders (never redirects) for an unknown client', async () => {
    const check = await checkAuthorizeRequest(params({ client_id: 'dcr_unknown' }));
    expect(check).toMatchObject({ ok: false });
    expect('render' in check && check.render).toBeTruthy();
  });

  it('renders for a redirect URI the client did not register', async () => {
    const check = await checkAuthorizeRequest(params({ redirect_uri: 'https://evil.example/cb' }));
    expect('render' in check && check.render).toBeTruthy();
  });

  it('redirects invalid_request with state and iss when PKCE is plain', async () => {
    const check = await checkAuthorizeRequest(params({ code_challenge_method: 'plain' }));
    if (!('redirect' in check)) throw new Error('expected redirect');
    const url = new URL(check.redirect);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get('error')).toBe('invalid_request');
    expect(url.searchParams.get('state')).toBe('xyz');
    expect(url.searchParams.get('iss')).toBe(issuer());
  });

  it('redirects invalid_request when the challenge is missing', async () => {
    const check = await checkAuthorizeRequest(params({ code_challenge: undefined }));
    expect('redirect' in check && new URL(check.redirect).searchParams.get('error')).toBe('invalid_request');
  });

  it('redirects unsupported_response_type for anything but code', async () => {
    const check = await checkAuthorizeRequest(params({ response_type: 'token' }));
    expect('redirect' in check && new URL(check.redirect).searchParams.get('error')).toBe('unsupported_response_type');
  });

  it('redirects invalid_scope for an unknown scope', async () => {
    const check = await checkAuthorizeRequest(params({ scope: 'sites:read bogus' }));
    expect('redirect' in check && new URL(check.redirect).searchParams.get('error')).toBe('invalid_scope');
  });

  it('redirects invalid_target for a resource that is not this MCP server', async () => {
    const check = await checkAuthorizeRequest(params({ resource: 'https://evil.example/api/mcp' }));
    expect('redirect' in check && new URL(check.redirect).searchParams.get('error')).toBe('invalid_target');
  });

  it('defaults an empty scope to the read scopes and a missing resource to the MCP URL', async () => {
    const check = await okCheck({ scope: '', resource: undefined });
    expect(check.requestedScopes).toEqual(['sites:read', 'crm:read']);
    expect(check.resource).toBe(mcpResourceUrl());
  });
});

describe('approve', () => {
  it('refuses a member', async () => {
    const check = await okCheck();
    expect(() => approve('member', check, ['sites:read'])).toThrow();
  });

  it('refuses an unverified owner', async () => {
    db.prepare("UPDATE users SET verified = 0 WHERE id = 'owner'").run();
    const check = await okCheck();
    expect(() => approve('owner', check, ['sites:read'])).toThrow();
  });

  it('stores only the code hash, with the current token_version and a 60s expiry', async () => {
    const check = await okCheck();
    const url = new URL(approve('owner', check, ['sites:read']));
    const code = url.searchParams.get('code')!;
    expect(url.searchParams.get('state')).toBe('xyz');
    expect(url.searchParams.get('iss')).toBe(issuer());
    const row = db.prepare('SELECT * FROM oauth_auth_codes').get() as Record<string, unknown>;
    expect(row.code_hash).toBe(hashToken(code));
    expect(JSON.stringify(row)).not.toContain(code);
    expect(row.token_version).toBe(3);
    const ttl = db.prepare("SELECT CAST((julianday(expires_at) - julianday('now')) * 86400 AS INTEGER) AS s FROM oauth_auth_codes").get() as { s: number };
    expect(ttl.s).toBeGreaterThan(50);
    expect(ttl.s).toBeLessThanOrEqual(60);
  });

  it('grants what was ticked, not what was requested', async () => {
    const check = await okCheck({ scope: 'sites:read' });
    approve('owner', check, ['sites:read', 'sites:write']);
    const row = db.prepare('SELECT scopes FROM oauth_auth_codes').get() as { scopes: string };
    expect(row.scopes).toBe('sites:read sites:write');
  });

  it('refuses when nothing valid was ticked', async () => {
    const check = await okCheck();
    expect(() => approve('owner', check, [])).toThrow(/scope/i);
  });

  it('marks the client as authorised so pruning keeps it', async () => {
    const check = await okCheck();
    approve('owner', check, ['sites:read']);
    const row = db.prepare('SELECT last_authorized_at FROM oauth_clients WHERE client_id = ?').get(client.client_id) as { last_authorized_at: string | null };
    expect(row.last_authorized_at).not.toBeNull();
  });
});

describe('deny', () => {
  it('redirects with access_denied, state and iss', async () => {
    const url = new URL(deny(await okCheck()));
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe('xyz');
    expect(url.searchParams.get('iss')).toBe(issuer());
  });
});
