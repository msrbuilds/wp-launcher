import crypto from 'crypto';

/**
 * Opaque bearer values. They are random strings, not JWTs, so `userAuth` (which
 * accepts any JWT_SECRET-signed JWT) can never mistake one for a panel session.
 * Only the SHA-256 hash is ever stored.
 */
export type TokenKind = 'access' | 'refresh' | 'code';

const PREFIX: Record<TokenKind, string> = { access: 'wplmcp_at_', refresh: 'wplmcp_rt_', code: '' };

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function mintToken(kind: TokenKind): { raw: string; hash: string } {
  const raw = PREFIX[kind] + crypto.randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}
