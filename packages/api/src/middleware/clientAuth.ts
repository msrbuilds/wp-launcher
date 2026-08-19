import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getClientUserById } from '../services/clientUser.service';

/** Marks a token as belonging to a portal client rather than a staff user. */
export const CLIENT_TOKEN_SCOPE = 'client';

/**
 * Deliberately distinct from the staff cookie (wpl_token at path /api).
 * Sharing either the name or the path would let a client signing in on a
 * shared browser overwrite a colleague's panel session, and would send portal
 * credentials to panel endpoints on every request.
 */
export const CLIENT_COOKIE = 'wpl_client_token';
export const CLIENT_COOKIE_PATH = '/api/portal';

export interface ClientAuthRequest extends Request {
  clientUserId?: string;
  clientId?: string;
}

/**
 * A portal token names the login and its client, and carries no `userId` —
 * the field staff middleware reads. There is therefore nothing in it for a
 * panel route to mistake for a staff session.
 */
export function generateClientToken(clientUserId: string, clientId: string, tokenVersion = 0): string {
  return jwt.sign(
    { scope: CLIENT_TOKEN_SCOPE, clientUserId, clientId, tv: tokenVersion },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions,
  );
}

export function extractClientToken(req: Request): string | null {
  const cookie = (req as any).cookies?.[CLIENT_COOKIE];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Guards every /api/portal route.
 *
 * `clientId` is taken from the stored record rather than the token, so a login
 * that was revoked and recreated cannot keep reaching the client it used to
 * belong to on the strength of an old token.
 */
export function clientAuth(req: ClientAuthRequest, res: Response, next: NextFunction): void {
  const token = extractClientToken(req);
  if (!token) { res.status(401).json({ error: 'Sign in to continue' }); return; }
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      scope?: string; clientUserId?: string; tv?: number;
    };
    if (decoded.scope !== CLIENT_TOKEN_SCOPE || !decoded.clientUserId) {
      res.status(401).json({ error: 'Sign in to continue' });
      return;
    }
    const record = getClientUserById(decoded.clientUserId);
    if (!record || !record.verified || record.token_version !== (decoded.tv ?? 0)) {
      res.status(401).json({ error: 'Sign in to continue' });
      return;
    }
    req.clientUserId = record.id;
    req.clientId = record.client_id;
    next();
  } catch {
    res.status(401).json({ error: 'Sign in to continue' });
  }
}
