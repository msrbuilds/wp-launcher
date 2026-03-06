import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against itself to keep constant time, then return false
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey || !safeEqual(apiKey, config.apiKey)) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }

  next();
}
