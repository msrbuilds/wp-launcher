import express, { Router, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { userAuth, type AuthRequest } from '../middleware/userAuth';
import { AppError, ValidationError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { getUserById } from '../services/user.service';
import { requireMcpFeature } from './wellKnown';
import { registerDcrClient } from '../oauth/clients.service';
import '../oauth/cimd'; // installs the CIMD fetcher as resolveClient's default
import { approve, checkAuthorizeRequest, deny, type AuthorizeParams } from '../oauth/authorize.service';
import { OAuthError, redeemCode, refresh, revokeToken } from '../oauth/token.service';
import { isScope, SCOPE_INFO, scopesOfferableTo, type Scope } from '../oauth/scopes';
import { issuer } from '../oauth/urls';

/**
 * Public, credential-less OAuth endpoints. Mounted *before* the global CORS
 * (which is an allowlist with credentials) so browser-based MCP clients can
 * reach them from any origin; they act on nothing without a code or token.
 */
const OPEN_PATHS = [
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource',
  '/api/oauth/register',
  '/api/oauth/token',
  '/api/oauth/revoke',
];
const openCors = cors({ origin: true, credentials: false });
export const oauthOpenCors: express.RequestHandler = (req, res, next) =>
  OPEN_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`)) ? openCors(req, res, next) : next();

const limiter = (windowMs: number, max: number) =>
  rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: 'temporarily_unavailable', error_description: 'Too many requests' } });
const registerLimiter = limiter(60 * 60 * 1000, 10);
const tokenLimiter = limiter(15 * 60 * 1000, 60);
const authorizeLimiter = limiter(15 * 60 * 1000, 30);

const router = Router();
router.use(requireMcpFeature);
router.use(express.urlencoded({ extended: false }));

function pickParams(source: Record<string, unknown>): AuthorizeParams {
  const keys: (keyof AuthorizeParams)[] = ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'resource'];
  const out: AuthorizeParams = {};
  for (const k of keys) if (typeof source[k] === 'string') out[k] = source[k] as string;
  return out;
}

function sendOAuthError(res: Response, err: unknown): void {
  res.set('Cache-Control', 'no-store');
  if (err instanceof OAuthError) {
    res.status(err.code === 'invalid_client' ? 401 : 400).json({ error: err.code, error_description: err.message });
    return;
  }
  console.error('[oauth] token endpoint error:', err);
  res.status(500).json({ error: 'server_error' });
}

router.post('/register', registerLimiter, (req, res) => {
  try {
    const client = registerDcrClient(req.body);
    res.status(201).json({
      client_id: client.client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.client_name,
      logo_uri: client.logo_uri ?? undefined,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      const error = /redirect/i.test(err.message) ? 'invalid_redirect_uri' : 'invalid_client_metadata';
      res.status(400).json({ error, error_description: err.message });
      return;
    }
    throw err;
  }
});

/** What the consent page needs to render, or how it must fail. */
router.get('/authorize/request', authorizeLimiter, userAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const check = await checkAuthorizeRequest(pickParams(req.query as Record<string, unknown>));
  if (!check.ok) {
    res.json(check);
    return;
  }
  const user = getUserById(req.userId!);
  res.json({
    client: {
      name: check.client.client_name,
      logoUri: check.client.logo_uri,
      redirectHost: new URL(check.redirectUri).host,
      kind: check.client.kind,
      unverified: true,
    },
    requestedScopes: check.requestedScopes,
    offerableScopes: scopesOfferableTo(user?.role ?? ''),
    scopeInfo: SCOPE_INFO,
    instance: { url: issuer() },
  });
}));

router.post('/authorize/decision', authorizeLimiter, userAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const check = await checkAuthorizeRequest(pickParams(body));
  if (!check.ok) {
    res.status(400).json(check);
    return;
  }
  if (body.approve !== true) {
    res.json({ redirectTo: deny(check) });
    return;
  }
  const scopes = (Array.isArray(body.scopes) ? body.scopes : []).filter((s): s is Scope => typeof s === 'string' && isScope(s));
  try {
    res.json({ redirectTo: approve(req.userId!, check, scopes) });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

router.post('/token', tokenLimiter, (req, res) => {
  const b = (req.body ?? {}) as Record<string, string | undefined>;
  try {
    let tokens;
    if (b.grant_type === 'authorization_code') {
      tokens = redeemCode({ code: b.code ?? '', client_id: b.client_id ?? '', redirect_uri: b.redirect_uri ?? '', code_verifier: b.code_verifier ?? '', resource: b.resource });
    } else if (b.grant_type === 'refresh_token') {
      tokens = refresh({ refresh_token: b.refresh_token ?? '', client_id: b.client_id ?? '', resource: b.resource, scope: b.scope });
    } else {
      throw new OAuthError('unsupported_grant_type', 'Only authorization_code and refresh_token are supported');
    }
    res.set('Cache-Control', 'no-store').set('Pragma', 'no-cache').json(tokens);
  } catch (err) {
    sendOAuthError(res, err);
  }
});

router.post('/revoke', tokenLimiter, (req, res) => {
  const token = (req.body ?? {}).token;
  if (typeof token === 'string' && token) revokeToken(token);
  res.status(200).end();
});

export default router;
