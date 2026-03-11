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
}

export function generateToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function localModeAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  req.userId = 'local-user';
  req.userEmail = 'local@localhost';
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
  // Allow API key as admin auth (for admin launching sites without JWT)
  if (isValidApiKey(req)) {
    req.userId = 'admin';
    req.userEmail = 'admin@localhost';
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; email: string };
    const user = getUserById(decoded.userId);

    if (!user || !user.verified) {
      res.status(401).json({ error: 'Invalid or unverified user' });
      return;
    }

    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalUserAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; email: string };
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
  } catch {
    // Ignore invalid tokens for optional auth
  }

  next();
}
