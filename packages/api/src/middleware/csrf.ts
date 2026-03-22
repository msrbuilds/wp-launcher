import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * CSRF protection middleware.
 *
 * Defence layers:
 *   1. Origin / Referer validation — only the exact dashboard origin is trusted,
 *      NOT wildcard *.baseDomain (demo sites are untrusted siblings).
 *   2. Custom-header requirement — plain HTML form POSTs cannot set custom
 *      headers, so requiring `X-Requested-With` blocks cross-origin form CSRF.
 *
 * Skips:
 *   - Safe methods (GET, HEAD, OPTIONS)
 *   - Requests authenticated via X-Api-Key header (M2M, not cookie-based)
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  // The dashboard / public URL itself
  if (config.publicUrl) {
    origins.add(normalizeOrigin(config.publicUrl));
  }

  // Base domain (both protocols)
  if (config.baseDomain) {
    origins.add(`https://${config.baseDomain}`);
    origins.add(`http://${config.baseDomain}`);
  }

  // Explicit CORS origins (may include dev URLs)
  if (Array.isArray(config.corsOrigins)) {
    for (const o of config.corsOrigins) {
      origins.add(normalizeOrigin(o));
    }
  }

  return origins;
}

function normalizeOrigin(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

function extractOriginFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

let cachedOrigins: Set<string> | null = null;

function getAllowedOrigins(): Set<string> {
  if (!cachedOrigins) {
    cachedOrigins = buildAllowedOrigins();
  }
  return cachedOrigins;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip safe (read-only) methods
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip M2M requests authenticated via API key header (not cookie-based)
  if (req.headers['x-api-key']) {
    return next();
  }

  // Layer 1: Origin / Referer check
  const origin = req.headers['origin'] as string | undefined;
  const derivedOrigin = origin || extractOriginFromReferer(req.headers['referer'] as string | undefined);

  if (!derivedOrigin) {
    res.status(403).json({ error: 'CSRF validation failed: missing origin' });
    return;
  }

  const allowed = getAllowedOrigins();
  if (!allowed.has(derivedOrigin)) {
    res.status(403).json({ error: 'CSRF validation failed: untrusted origin' });
    return;
  }

  // Layer 2: Custom header requirement (blocks plain HTML form POSTs)
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    res.status(403).json({ error: 'CSRF validation failed: missing custom header' });
    return;
  }

  next();
}
