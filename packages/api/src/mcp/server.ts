import { Router, type RequestHandler } from 'express';
import cors from 'cors';
import { requireMcpFeature } from '../routes/wellKnown';
import type { McpAuthContext } from '../oauth/token.service';
import { buildMcpServer, createRequestHandler, type AuthInfo } from './sdk';
import { allTools, isEligible, registerTools } from './registry';
import { toSdkTool } from './wrapper';
import { originHostGuard, allowedMcpOrigins } from './originHost';
import { bearerGuard, mcpContextOf } from './bearer';
import { pipeline } from './pipeline';
import { consumeGrantRequest } from './limits';
import { sitesTools } from './tools/sites';
import { crmClientTools } from './tools/crm-clients';
import { snapshotTools } from './tools/snapshots';

export const SERVER_INFO = { name: 'wp-launcher', version: '1.0.0' };

/** Every tool the server can offer. Registered once per process. */
export function ensureToolsRegistered(): void {
  if (allTools().length === 0) registerTools([...sitesTools, ...snapshotTools, ...crmClientTools]);
}

/**
 * The per-request server: only tools this user is eligible for are registered
 * (role and feature flags), whatever the grant's scopes — a tool outside the
 * grant is listed and answered with a scope challenge (step-up). Without auth
 * context it has no tools at all.
 */
export function serverFor(authInfo: AuthInfo | undefined) {
  const ctx = (authInfo?.extra as { mcp?: McpAuthContext } | undefined)?.mcp;
  const tools = ctx ? allTools().filter((t) => isEligible(t, ctx)).map((t) => toSdkTool(t, ctx)) : [];
  return buildMcpServer(SERVER_INFO, tools);
}

/** CORS for /api/mcp: the Origin allowlist, never `*`, never credentials. Mounted before the global CORS. */
export const mcpCors: RequestHandler = cors({
  origin: (origin, cb) => cb(null, !origin || allowedMcpOrigins().has(origin)),
  credentials: false,
  exposedHeaders: ['WWW-Authenticate'],
});

function perGrantLimit(): RequestHandler {
  return (_req, res, next) => {
    if (!consumeGrantRequest(mcpContextOf(res.locals).grantId)) {
      res.status(429).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Too many requests for this connection. Try again shortly.' } });
      return;
    }
    next();
  };
}

/**
 * The /api/mcp endpoint. Order is the spec's request pipeline: feature gate →
 * Origin/Host → bearer → per-grant limit → envelope + eligibility → SDK
 * (scope challenge, then the wrapper's backstop, then the tool).
 */
export function mcpRouter(): Router {
  ensureToolsRegistered();
  const router = Router();
  router.use(requireMcpFeature);
  // Legacy-era answers may stream over SSE; tell nginx not to hold them back.
  router.use((_req, res, next) => { res.setHeader('X-Accel-Buffering', 'no'); next(); });
  router.use(originHostGuard());
  router.use(bearerGuard());
  router.use(perGrantLimit());
  router.use(pipeline());
  router.post('/', createRequestHandler(serverFor));
  return router;
}
