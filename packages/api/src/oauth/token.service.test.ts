import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { config } from '../config';
import { registerDcrClient, type OAuthClient } from './clients.service';
import { approve, checkAuthorizeRequest } from './authorize.service';
import {
  OAuthError, redeemCode, refresh, revokeAllForUser, revokeGrant, revokeToken, validateAccessToken, type TokenResponse,
} from './token.service';
import type { Scope } from './scopes';

let db: Database.Database;
let client: OAuthClient;
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
// RFC 7636 appendix B pair.
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const originalPublicUrl = config.publicUrl;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email, verified, role, token_version) VALUES ('owner', 'o@x.test', 1, 'owner', 0)").run();
  client = registerDcrClient({ client_name: 'Claude', redirect_uris: [REDIRECT] });
});
afterEach(() => {
  __setDbForTesting(null);
  db.close();
  (config as { publicUrl: string }).publicUrl = originalPublicUrl;
  delete process.env.TZ;
});

async function approvedCode(scopes: Scope[] = ['sites:read']): Promise<string> {
  const check = await checkAuthorizeRequest({
    response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, scope: scopes.join(' '),
    code_challenge: CHALLENGE, code_challenge_method: 'S256',
  });
  if (!check.ok) throw new Error('bad check');
  return new URL(approve('owner', check, scopes)).searchParams.get('code')!;
}

function redeem(code: string, verifier = VERIFIER): TokenResponse {
  return redeemCode({ code, client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: verifier });
}

function grantCount(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM oauth_grants').get() as { c: number }).c;
}

function expectOAuthError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(OAuthError);
    expect((err as OAuthError).code).toBe(code);
    return;
  }
  throw new Error(`expected OAuthError ${code}`);
}

describe('code redemption', () => {
  it('issues tokens that validate to the granted scopes', async () => {
    const tokens = redeem(await approvedCode(['sites:read', 'crm:read']));
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'sites:read crm:read' });
    const ctx = validateAccessToken(tokens.access_token);
    expect(ctx).toMatchObject({ userId: 'owner', userRole: 'owner', userEmail: 'o@x.test', clientId: client.client_id, clientName: 'Claude', scopes: ['sites:read', 'crm:read'] });
  });

  it('refuses a wrong PKCE verifier', async () => {
    const code = await approvedCode();
    expectOAuthError(() => redeem(code, 'x'.repeat(43)), 'invalid_grant');
  });

  it('refuses a mismatched redirect URI or client', async () => {
    const code = await approvedCode();
    expectOAuthError(() => redeemCode({ code, client_id: client.client_id, redirect_uri: 'https://other/cb', code_verifier: VERIFIER }), 'invalid_grant');
  });

  it('refuses an expired code', async () => {
    const code = await approvedCode();
    db.prepare("UPDATE oauth_auth_codes SET expires_at = datetime('now','-1 second')").run();
    expectOAuthError(() => redeem(code), 'invalid_grant');
  });

  it('treats a replayed code as theft: refuses it and revokes the grant it created', async () => {
    const code = await approvedCode();
    const first = redeem(code);
    expectOAuthError(() => redeem(code), 'invalid_grant');
    expect(validateAccessToken(first.access_token)).toBeNull();
  });

  it('yields no grant when the password changed between approve and redeem', async () => {
    const code = await approvedCode();
    db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = 'owner'").run();
    expectOAuthError(() => redeem(code), 'invalid_grant');
    expect(grantCount()).toBe(0);
  });

  it('yields no grant when Revoke all ran while the code was pending', async () => {
    const code = await approvedCode();
    revokeAllForUser('owner');
    expectOAuthError(() => redeem(code), 'invalid_grant');
    expect(grantCount()).toBe(0);
  });

  it('replaces an earlier grant for the same client and user', async () => {
    const first = redeem(await approvedCode());
    const second = redeem(await approvedCode());
    expect(validateAccessToken(first.access_token)).toBeNull();
    expect(validateAccessToken(second.access_token)).not.toBeNull();
  });
});

describe('refresh rotation', () => {
  it('rotates: the new pair works, and reusing the old refresh token revokes everything', async () => {
    const first = redeem(await approvedCode());
    const second = refresh({ refresh_token: first.refresh_token, client_id: client.client_id });
    expect(validateAccessToken(second.access_token)).not.toBeNull();
    expectOAuthError(() => refresh({ refresh_token: first.refresh_token, client_id: client.client_id }), 'invalid_grant');
    expect(validateAccessToken(second.access_token)).toBeNull();
  });

  it('never lets two refreshes of one token both produce live successors', async () => {
    const first = redeem(await approvedCode());
    const results: (TokenResponse | OAuthError)[] = [];
    for (let i = 0; i < 2; i++) {
      try { results.push(refresh({ refresh_token: first.refresh_token, client_id: client.client_id })); } catch (e) { results.push(e as OAuthError); }
    }
    const wins = results.filter((r): r is TokenResponse => !(r instanceof OAuthError));
    expect(wins).toHaveLength(1);
    expect(validateAccessToken(wins[0].access_token)).toBeNull();
    expect(() => refresh({ refresh_token: wins[0].refresh_token, client_id: client.client_id })).toThrow(OAuthError);
  });

  it('cannot undo a revoke: tokens minted just before it die on first use, and refresh after it fails', async () => {
    const first = redeem(await approvedCode());
    const minted = refresh({ refresh_token: first.refresh_token, client_id: client.client_id });
    const grantId = (db.prepare('SELECT id FROM oauth_grants').get() as { id: string }).id;
    revokeGrant(grantId);
    expect(validateAccessToken(minted.access_token)).toBeNull();
    expectOAuthError(() => refresh({ refresh_token: minted.refresh_token, client_id: client.client_id }), 'invalid_grant');
  });

  it('may narrow scope but never widen it', async () => {
    const first = redeem(await approvedCode(['sites:read', 'crm:read']));
    expectOAuthError(() => refresh({ refresh_token: first.refresh_token, client_id: client.client_id, scope: 'sites:read sites:write' }), 'invalid_grant');
    const fresh = redeem(await approvedCode(['sites:read', 'crm:read']));
    const narrowed = refresh({ refresh_token: fresh.refresh_token, client_id: client.client_id, scope: 'sites:read' });
    expect(narrowed.scope).toBe('sites:read');
  });

  it('refuses a refresh token presented by another client', async () => {
    const first = redeem(await approvedCode());
    expectOAuthError(() => refresh({ refresh_token: first.refresh_token, client_id: 'dcr_other' }), 'invalid_grant');
  });
});

describe('live validation', () => {
  it('rejects a refresh token used as an access token', async () => {
    const tokens = redeem(await approvedCode());
    expect(validateAccessToken(tokens.refresh_token)).toBeNull();
  });

  it('rejects after a password change, a demotion, or loss of verification', async () => {
    for (const mutate of [
      "UPDATE users SET token_version = token_version + 1 WHERE id = 'owner'",
      "UPDATE users SET role = 'member' WHERE id = 'owner'",
      "UPDATE users SET verified = 0 WHERE id = 'owner'",
    ]) {
      db.prepare("UPDATE users SET token_version = 0, role = 'owner', verified = 1 WHERE id = 'owner'").run();
      const tokens = redeem(await approvedCode());
      db.prepare(mutate).run();
      expect(validateAccessToken(tokens.access_token)).toBeNull();
    }
  });

  it('handles a deleted user without throwing', async () => {
    const tokens = redeem(await approvedCode());
    db.prepare("DELETE FROM users WHERE id = 'owner'").run();
    expect(validateAccessToken(tokens.access_token)).toBeNull();
    expectOAuthError(() => refresh({ refresh_token: tokens.refresh_token, client_id: client.client_id }), 'invalid_grant');
  });

  it('expires on SQL time, whatever the process time zone', async () => {
    process.env.TZ = 'Asia/Karachi';
    const tokens = redeem(await approvedCode());
    db.prepare("UPDATE oauth_tokens SET expires_at = datetime('now','+1 minute') WHERE kind = 'access'").run();
    expect(validateAccessToken(tokens.access_token)).not.toBeNull();
    db.prepare("UPDATE oauth_tokens SET expires_at = datetime('now','-1 minute') WHERE kind = 'access'").run();
    expect(validateAccessToken(tokens.access_token)).toBeNull();
  });

  it('accepts a resource that differs only by host case', async () => {
    (config as { publicUrl: string }).publicUrl = 'https://panel.example.com';
    const tokens = redeem(await approvedCode());
    expect(validateAccessToken(tokens.access_token, 'HTTPS://PANEL.EXAMPLE.COM/api/mcp')).not.toBeNull();
    expect(validateAccessToken(tokens.access_token, 'https://evil.example/api/mcp')).toBeNull();
  });

  it('rejects garbage and unknown tokens', () => {
    expect(validateAccessToken('')).toBeNull();
    expect(validateAccessToken('wplmcp_at_nope')).toBeNull();
  });
});

describe('revocation', () => {
  it('revokeToken revokes the grant behind either token; unknown tokens are a no-op', async () => {
    const tokens = redeem(await approvedCode());
    revokeToken('wplmcp_rt_unknown');
    expect(validateAccessToken(tokens.access_token)).not.toBeNull();
    revokeToken(tokens.refresh_token);
    expect(validateAccessToken(tokens.access_token)).toBeNull();
  });

  it('revokeAllForUser counts the grants it revoked', async () => {
    redeem(await approvedCode());
    expect(revokeAllForUser('owner')).toBe(1);
  });
});
