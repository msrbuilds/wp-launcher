import { Response, NextFunction } from 'express';
import type { AuthRequest } from './userAuth';

export const ROLE_RANK: Record<string, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export type MinimumRole = 'member' | 'admin' | 'owner';

/**
 * Guard a route on a minimum role. Assumes an auth middleware has already
 * populated `req.userRole`.
 */
export function requireRole(minimum: MinimumRole) {
  const threshold = ROLE_RANK[minimum];
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if ((ROLE_RANK[req.userRole] ?? 0) < threshold) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
