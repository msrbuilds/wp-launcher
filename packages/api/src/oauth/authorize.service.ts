import { getDb } from '../utils/db';
import { ForbiddenError, ValidationError } from '../utils/errors';
import { getUserById } from '../services/user.service';
import { isAdminRole } from '../services/features.service';
import { markAuthorized, resolveClient, type OAuthClient } from './clients.service';
import { redirectUriMatches } from './redirects';
import { parseScopeParam, READ_SCOPES, scopesOfferableTo, type Scope } from './scopes';
import { mintToken } from './tokens';
import { issuer, mcpResourceUrl, resourceMatches } from './urls';

export interface AuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  resource?: string;
}

export type AuthorizeCheck =
  | { ok: true; client: OAuthClient; redirectUri: string; requestedScopes: Scope[]; state?: string; codeChallenge: string; resource: string }
  | { ok: false; render: string }
  | { ok: false; redirect: string };

type OkCheck = Extract<AuthorizeCheck, { ok: true }>;

const CHALLENGE_FORMAT = /^[A-Za-z0-9_-]{43,128}$/;

/** Builds the redirect back to the client, always carrying `state` and RFC 9207 `iss`. */
function redirectTo(redirectUri: string, params: Record<string, string>, state: string | undefined): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (state !== undefined) url.searchParams.set('state', state);
  url.searchParams.set('iss', issuer());
  return url.toString();
}

/**
 * Validates an authorisation request. Until the client and its redirect URI are
 * known to be genuine, errors are *rendered*, never redirected: redirecting to
 * an unverified URI is an open redirect.
 */
export async function checkAuthorizeRequest(p: AuthorizeParams): Promise<AuthorizeCheck> {
  if (!p.client_id) return { ok: false, render: 'The request is missing client_id.' };
  const client = await resolveClient(p.client_id);
  if (!client) return { ok: false, render: 'This app is not recognised, or its registration could not be verified.' };
  if (!p.redirect_uri || !redirectUriMatches(client.redirect_uris, p.redirect_uri)) {
    return { ok: false, render: 'This app asked to return to an address it did not register.' };
  }

  const fail = (error: string, description: string): AuthorizeCheck =>
    ({ ok: false, redirect: redirectTo(p.redirect_uri!, { error, error_description: description }, p.state) });

  if (p.response_type !== 'code') return fail('unsupported_response_type', 'Only the authorization code flow is supported');
  if (p.code_challenge_method !== 'S256' || !p.code_challenge || !CHALLENGE_FORMAT.test(p.code_challenge)) {
    return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required');
  }
  const parsed = parseScopeParam(p.scope);
  if (parsed === null) return fail('invalid_scope', 'Unknown scope requested');
  const resource = p.resource ?? mcpResourceUrl();
  if (!resourceMatches(resource)) return fail('invalid_target', 'The resource is not this MCP server');

  return {
    ok: true,
    client,
    redirectUri: p.redirect_uri,
    requestedScopes: parsed.length ? parsed : [...READ_SCOPES],
    state: p.state,
    codeChallenge: p.code_challenge,
    resource: mcpResourceUrl(),
  };
}

/**
 * Records the user's decision to approve. The code carries the user's
 * token_version *now*; redemption refuses it if that has changed since, so a
 * password change between Approve and redemption yields no grant.
 */
export function approve(userId: string, check: OkCheck, grantedScopes: Scope[]): string {
  const user = getUserById(userId);
  if (!user || !user.verified || !isAdminRole(user.role)) {
    throw new ForbiddenError('MCP access is available to panel administrators only.');
  }
  const offerable = scopesOfferableTo(user.role);
  const scopes = grantedScopes.filter((s, i) => offerable.includes(s) && grantedScopes.indexOf(s) === i);
  if (scopes.length === 0) throw new ValidationError('Choose at least one scope to grant');

  const code = mintToken('code');
  getDb().prepare(`
    INSERT INTO oauth_auth_codes (code_hash, client_id, user_id, scopes, redirect_uri, code_challenge, resource, token_version, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+60 seconds'))
  `).run(code.hash, check.client.client_id, userId, scopes.join(' '), check.redirectUri, check.codeChallenge, check.resource, user.token_version ?? 0);
  markAuthorized(check.client.client_id);
  return redirectTo(check.redirectUri, { code: code.raw }, check.state);
}

export function deny(check: OkCheck): string {
  return redirectTo(check.redirectUri, { error: 'access_denied', error_description: 'The user denied access' }, check.state);
}
