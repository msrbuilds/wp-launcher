import type { RequestHandler } from 'express';
import { validateAccessToken, type McpAuthContext } from '../oauth/token.service';
import { READ_SCOPES } from '../oauth/scopes';
import { endpoints } from '../oauth/urls';

/**
 * Step 2. Bearer tokens only, from the Authorization header: the panel cookie
 * is never consulted, so a signed-in operator's browser cannot be driven into
 * tool calls, and panel JWTs or API keys are simply not tokens here.
 */
export function bearerGuard(): RequestHandler {
  return (req, res, next) => {
    const prm = endpoints().prm;
    const deny = (error?: string, description = 'Authentication required') => {
      const params = [`resource_metadata="${prm}"`, `scope="${READ_SCOPES.join(' ')}"`];
      if (error) params.push(`error="${error}"`, `error_description="${description}"`);
      res.set('WWW-Authenticate', `Bearer ${params.join(', ')}`).status(401).json({ error: error ?? 'unauthorized', error_description: description });
    };

    const header = req.headers.authorization;
    // The auth scheme is case-insensitive (RFC 6750 §2.1 / RFC 9110 §11.1).
    const match = header ? /^bearer\s+(.+)$/i.exec(header) : null;
    if (!match) {
      deny();
      return;
    }
    const token = match[1].trim();
    const ctx = validateAccessToken(token);
    if (!ctx) {
      deny('invalid_token', 'The access token is invalid, expired or revoked');
      return;
    }
    res.locals.mcp = ctx;
    // Read by the SDK adapter as `authInfo` (scope challenges, server factory).
    (req as unknown as { auth: unknown }).auth = {
      token,
      clientId: ctx.clientId,
      scopes: ctx.scopes,
      resourceMetadataUrl: prm,
      extra: { mcp: ctx },
    };
    next();
  };
}

export function mcpContextOf(locals: Record<string, unknown>): McpAuthContext {
  return locals.mcp as McpAuthContext;
}
