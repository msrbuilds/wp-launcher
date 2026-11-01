import crypto from 'crypto';
import { getDb } from '../utils/db';
import { isAdminRole } from '../services/features.service';
import { parseScopeParam, type Scope } from './scopes';
import { hashToken, mintToken } from './tokens';
import { mcpResourceUrl, resourceMatches } from './urls';

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: 3600;
  refresh_token: string;
  scope: string;
}

export type OAuthErrorCode = 'invalid_grant' | 'invalid_request' | 'invalid_client' | 'invalid_target' | 'unsupported_grant_type';

export class OAuthError extends Error {
  constructor(public code: OAuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'OAuthError';
  }
}

export interface McpAuthContext {
  userId: string;
  userEmail: string;
  userRole: 'owner' | 'admin';
  grantId: string;
  clientId: string;
  clientName: string;
  scopes: Scope[];
}

const ACCESS_TTL = '+1 hour';
const REFRESH_TTL = '+30 days';

interface CodeRow {
  code_hash: string; client_id: string; user_id: string; scopes: string; redirect_uri: string;
  code_challenge: string; resource: string; token_version: number; expires_at: string;
  used_at: string | null; grant_id: string | null; invalidated_at: string | null; live: number;
}
interface GrantRow { id: string; client_id: string; user_id: string; scopes: string; resource: string; token_version: number; revoked_at: string | null }
interface UserRow { id: string; email: string; role: string; verified: number; token_version: number | null }

function intersect(a: Scope[], b: Scope[]): Scope[] {
  return a.filter((s) => b.includes(s));
}

function pkceS256(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** The user may hold a grant only while still a verified owner/admin on the same token_version. */
function userStillEntitled(user: UserRow | undefined, tokenVersion: number): user is UserRow {
  return !!user && !!user.verified && isAdminRole(user.role) && (user.token_version ?? 0) === tokenVersion;
}

function getUser(id: string): UserRow | undefined {
  return getDb().prepare('SELECT id, email, role, verified, token_version FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

function revokeGrantRow(grantId: string): void {
  getDb().prepare("UPDATE oauth_grants SET revoked_at = COALESCE(revoked_at, datetime('now')) WHERE id = ?").run(grantId);
}

function issueTokens(grantId: string, scopes: Scope[]): TokenResponse {
  const db = getDb();
  const access = mintToken('access');
  const refreshTok = mintToken('refresh');
  // Each token records its own scopes: a refresh may narrow them, and the
  // narrowing must bind the new access token and every later refresh.
  const insert = db.prepare("INSERT INTO oauth_tokens (token_hash, grant_id, kind, scopes, expires_at) VALUES (?, ?, ?, ?, datetime('now', ?))");
  insert.run(access.hash, grantId, 'access', scopes.join(' '), ACCESS_TTL);
  insert.run(refreshTok.hash, grantId, 'refresh', scopes.join(' '), REFRESH_TTL);
  return { access_token: access.raw, token_type: 'Bearer', expires_in: 3600, refresh_token: refreshTok.raw, scope: scopes.join(' ') };
}

/**
 * Exchanges an authorisation code, in one transaction. The grant carries the
 * code's token_version (captured at approval), never a fresh read of the
 * user's, and a used code is never redeemable again: replay revokes the grant
 * the first redemption created.
 */
export function redeemCode(p: { code: string; client_id: string; redirect_uri: string; code_verifier: string; resource?: string }): TokenResponse {
  const db = getDb();
  const outcome = db.transaction((): TokenResponse | OAuthError => {
    const row = db.prepare("SELECT *, expires_at > datetime('now') AS live FROM oauth_auth_codes WHERE code_hash = ?")
      .get(hashToken(p.code ?? '')) as CodeRow | undefined;
    if (!row) return new OAuthError('invalid_grant', 'Unknown authorization code');
    if (row.used_at) {
      if (row.grant_id) revokeGrantRow(row.grant_id);
      return new OAuthError('invalid_grant', 'Authorization code already used');
    }
    if (row.invalidated_at || !row.live) return new OAuthError('invalid_grant', 'Authorization code expired or revoked');
    if (row.client_id !== p.client_id || row.redirect_uri !== p.redirect_uri) return new OAuthError('invalid_grant', 'Code was issued to another client or redirect URI');
    if (!p.code_verifier || !safeEqual(pkceS256(p.code_verifier), row.code_challenge)) return new OAuthError('invalid_grant', 'PKCE verification failed');
    if (p.resource !== undefined && !resourceMatches(p.resource)) return new OAuthError('invalid_target', 'The resource is not this MCP server');
    if (!userStillEntitled(getUser(row.user_id), row.token_version)) return new OAuthError('invalid_grant', 'The authorization is no longer valid');

    // Re-authorising the same app replaces its previous grant instead of stacking another.
    db.prepare("UPDATE oauth_grants SET revoked_at = datetime('now') WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL")
      .run(row.client_id, row.user_id);
    const grantId = crypto.randomUUID();
    db.prepare('INSERT INTO oauth_grants (id, client_id, user_id, scopes, resource, token_version) VALUES (?, ?, ?, ?, ?, ?)')
      .run(grantId, row.client_id, row.user_id, row.scopes, row.resource, row.token_version);
    db.prepare("UPDATE oauth_auth_codes SET used_at = datetime('now'), grant_id = ? WHERE code_hash = ?").run(grantId, row.code_hash);
    return issueTokens(grantId, parseScopeParam(row.scopes) ?? []);
  })();
  if (outcome instanceof OAuthError) throw outcome;
  return outcome;
}

/**
 * Rotates a refresh token, in one transaction: load the grant live, check the
 * user is still entitled, consume the token conditionally, and only then mint
 * successors. Zero rows consumed means the token was already used — reuse —
 * which revokes the whole grant (strict: no grace window).
 */
export function refresh(p: { refresh_token: string; client_id: string; resource?: string; scope?: string }): TokenResponse {
  const db = getDb();
  const outcome = db.transaction((): TokenResponse | OAuthError => {
    const tokenHash = hashToken(p.refresh_token ?? '');
    const tok = db.prepare("SELECT grant_id, scopes, expires_at > datetime('now') AS live FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh'")
      .get(tokenHash) as { grant_id: string; scopes: string; live: number } | undefined;
    if (!tok || !tok.live) return new OAuthError('invalid_grant', 'Unknown or expired refresh token');

    const grant = db.prepare('SELECT * FROM oauth_grants WHERE id = ?').get(tok.grant_id) as GrantRow | undefined;
    if (!grant || grant.revoked_at) return new OAuthError('invalid_grant', 'The authorization was revoked');
    if (grant.client_id !== p.client_id) return new OAuthError('invalid_grant', 'Refresh token was issued to another client');
    if (!userStillEntitled(getUser(grant.user_id), grant.token_version)) {
      revokeGrantRow(grant.id);
      return new OAuthError('invalid_grant', 'The authorization is no longer valid');
    }
    if (p.resource !== undefined && !resourceMatches(p.resource)) return new OAuthError('invalid_target', 'The resource is not this MCP server');

    // The ceiling is what this refresh token carries, never more than the grant.
    const granted = intersect(parseScopeParam(tok.scopes) ?? [], parseScopeParam(grant.scopes) ?? []);
    let scopes = granted;
    if (p.scope !== undefined) {
      const asked = parseScopeParam(p.scope);
      if (!asked || asked.some((s) => !granted.includes(s))) return new OAuthError('invalid_grant', 'A refresh cannot widen the granted scopes');
      if (asked.length) scopes = asked;
    }

    const consumed = db.prepare("UPDATE oauth_tokens SET rotated_at = datetime('now') WHERE token_hash = ? AND rotated_at IS NULL").run(tokenHash);
    if (consumed.changes === 0) {
      revokeGrantRow(grant.id);
      return new OAuthError('invalid_grant', 'Refresh token reuse detected; the authorization was revoked');
    }
    const issued = issueTokens(grant.id, scopes);
    db.prepare('UPDATE oauth_tokens SET replaced_by = ? WHERE token_hash = ?').run(hashToken(issued.refresh_token), tokenHash);
    return issued;
  })();
  if (outcome instanceof OAuthError) throw outcome;
  return outcome;
}

/** Revokes one grant and cancels any code that client still has pending for that user. */
export function revokeGrant(grantId: string): void {
  const db = getDb();
  db.transaction(() => {
    const grant = db.prepare('SELECT client_id, user_id FROM oauth_grants WHERE id = ?').get(grantId) as { client_id: string; user_id: string } | undefined;
    revokeGrantRow(grantId);
    if (grant) {
      db.prepare("UPDATE oauth_auth_codes SET invalidated_at = datetime('now') WHERE client_id = ? AND user_id = ? AND used_at IS NULL AND invalidated_at IS NULL")
        .run(grant.client_id, grant.user_id);
    }
  })();
}

/** Revokes every grant and cancels every pending code, so an approval in flight cannot land afterwards. */
export function revokeAllForUser(userId: string): number {
  const db = getDb();
  return db.transaction(() => {
    const revoked = db.prepare("UPDATE oauth_grants SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").run(userId).changes;
    db.prepare("UPDATE oauth_auth_codes SET invalidated_at = datetime('now') WHERE user_id = ? AND used_at IS NULL AND invalidated_at IS NULL").run(userId);
    return revoked;
  })();
}

/** RFC 7009. Revoking either token revokes the grant; an unknown token is not an error. */
export function revokeToken(rawToken: string): void {
  const row = getDb().prepare('SELECT grant_id FROM oauth_tokens WHERE token_hash = ?').get(hashToken(rawToken ?? '')) as { grant_id: string } | undefined;
  if (row) revokeGrant(row.grant_id);
}

/**
 * Validates an access token against the live grant and user on every call, so
 * revocation, demotion, deletion and a token_version change all bite on the
 * next request rather than when the token expires.
 */
export function validateAccessToken(raw: string, resource?: string): McpAuthContext | null {
  if (!raw) return null;
  if (resource !== undefined && !resourceMatches(resource)) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT g.id AS grant_id, g.client_id, g.user_id, g.scopes, t.scopes AS token_scopes, g.resource, g.token_version, g.revoked_at,
           (g.last_used_at IS NULL OR g.last_used_at < datetime('now','-1 minute')) AS stale,
           c.client_name
    FROM oauth_tokens t
    JOIN oauth_grants g ON g.id = t.grant_id
    LEFT JOIN oauth_clients c ON c.client_id = g.client_id
    WHERE t.token_hash = ? AND t.kind = 'access' AND t.expires_at > datetime('now')
  `).get(hashToken(raw)) as (GrantRow & { grant_id: string; token_scopes: string; stale: number; client_name: string | null }) | undefined;
  if (!row || row.revoked_at) return null;
  if (row.resource !== mcpResourceUrl()) return null;
  const user = getUser(row.user_id);
  if (!userStillEntitled(user, row.token_version)) return null;
  if (row.stale) db.prepare("UPDATE oauth_grants SET last_used_at = datetime('now') WHERE id = ?").run(row.grant_id);
  return {
    userId: user.id,
    userEmail: user.email,
    userRole: user.role as 'owner' | 'admin',
    grantId: row.grant_id,
    clientId: row.client_id,
    clientName: row.client_name ?? 'Unknown app',
    scopes: intersect(parseScopeParam(row.token_scopes) ?? [], parseScopeParam(row.scopes) ?? []),
  };
}
