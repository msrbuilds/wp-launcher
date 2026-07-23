import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getUserById } from '../services/user.service';
import { extractToken, AuthRequest } from './userAuth';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against itself to keep constant time, then return false
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// API key only — for M2M endpoints. Header-only: the old wpl_admin cookie path
// was removed so a value that leaks into a browser cookie can't grant admin.
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey && safeEqual(apiKey, config.apiKey)) {
    return next();
  }

  res.status(401).json({ error: 'Invalid or missing API key' });
}

// Admin auth — accepts API key (M2M) OR JWT with role=admin (human)
export function adminAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  // Path 1: API key (M2M)
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey && safeEqual(apiKey, config.apiKey)) {
    req.userId = 'admin';
    req.userEmail = 'admin@localhost';
    req.userRole = 'admin';
    return next();
  }

  // Path 2: JWT belonging to a user the DB still says is an owner or admin.
  // The DB is authoritative: a token's own role claim is never trusted, so
  // revoking a role or deleting an account takes effect immediately rather
  // than when the token expires.
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; email: string; role?: string; tv?: number };
      const user = getUserById(decoded.userId);
      const tvOk = user && (typeof decoded.tv === 'number' ? decoded.tv : 0) === (user.token_version ?? 0);
      if (user && tvOk && (user.role === 'owner' || user.role === 'admin')) {
        req.userId = decoded.userId;
        req.userEmail = decoded.email;
        req.userRole = user.role;
        return next();
      }
    } catch {
      // Invalid token — fall through to 401
    }
  }

  res.status(401).json({ error: 'Admin access required' });
}
