import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { getUserById } from '../services/user.service';

function isValidApiKey(req: Request): boolean {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey || !config.apiKey) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(config.apiKey));
  } catch {
    return false;
  }
}

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

// Extract JWT from httpOnly cookie or Authorization header
export function extractToken(req: Request): string | null {
  // Cookie takes priority (more secure)
  const cookieToken = (req as any).cookies?.wpl_token;
  if (cookieToken) return cookieToken;

  // Fall back to Authorization header (for API consumers)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

  return null;
}

export function generateToken(userId: string, email: string, role: string = 'user'): string {
  return jwt.sign({ userId, email, role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function localModeAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  req.userId = 'local-user';
  req.userEmail = 'local@localhost';
  req.userRole = 'admin';
  next();
}

export function conditionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (config.isLocalMode) {
    return localModeAuth(req, res, next);
  }
  return userAuth(req, res, next);
}

export function conditionalOptionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (config.isLocalMode) {
    return localModeAuth(req, res, next);
  }
  return optionalUserAuth(req, res, next);
}

export function userAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  // Allow API key as admin auth
  if (isValidApiKey(req)) {
    req.userId = 'admin';
    req.userEmail = 'admin@localhost';
    req.userRole = 'admin';
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; email: string; role?: string };
    const user = getUserById(decoded.userId);

    if (!user || !user.verified) {
      res.status(401).json({ error: 'Invalid or unverified user' });
      return;
    }

    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    // Use DB role (authoritative) rather than JWT claim to handle role changes
    req.userRole = user.role || 'user';
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalUserAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  // Allow API key as admin auth
  if (isValidApiKey(req)) {
    req.userId = 'admin';
    req.userEmail = 'admin@localhost';
    req.userRole = 'admin';
    return next();
  }

  const token = extractToken(req);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; email: string; role?: string };
    const user = getUserById(decoded.userId);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userRole = user?.role || decoded.role || 'user';
  } catch {
    // Ignore invalid tokens for optional auth
  }

  next();
}
