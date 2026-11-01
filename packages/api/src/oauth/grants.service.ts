import { getDb } from '../utils/db';
import { NotFoundError } from '../utils/errors';
import { parseScopeParam, type Scope } from './scopes';
import { revokeGrant } from './token.service';

export interface GrantView {
  id: string;
  clientId: string;
  clientName: string;
  redirectHost: string | null;
  scopes: Scope[];
  createdAt: string;
  lastUsedAt: string | null;
}

interface GrantRow {
  id: string; client_id: string; user_id: string; scopes: string; created_at: string; last_used_at: string | null;
  client_name: string | null; redirect_uris: string | null; user_email?: string;
}

function hostOf(redirectUris: string | null): string | null {
  try {
    const first = (JSON.parse(redirectUris ?? '[]') as string[])[0];
    return first ? new URL(first).host : null;
  } catch {
    return null;
  }
}

function toView(r: GrantRow): GrantView {
  return {
    id: r.id, clientId: r.client_id, clientName: r.client_name ?? 'Unknown app', redirectHost: hostOf(r.redirect_uris),
    scopes: parseScopeParam(r.scopes) ?? [], createdAt: r.created_at, lastUsedAt: r.last_used_at,
  };
}

const ACTIVE_GRANTS = `
  SELECT g.id, g.client_id, g.user_id, g.scopes, g.created_at, g.last_used_at, c.client_name, c.redirect_uris, u.email AS user_email
  FROM oauth_grants g
  LEFT JOIN oauth_clients c ON c.client_id = g.client_id
  LEFT JOIN users u ON u.id = g.user_id
  WHERE g.revoked_at IS NULL`;

/** The caller's own connected apps. */
export function listGrantsForUser(userId: string): GrantView[] {
  return (getDb().prepare(`${ACTIVE_GRANTS} AND g.user_id = ? ORDER BY g.created_at DESC`).all(userId) as GrantRow[]).map(toView);
}

/** Owner only: every staff user's connected apps — never their activity, which stays per user. */
export function listAllGrants(): (GrantView & { userId: string; userEmail: string | null })[] {
  return (getDb().prepare(`${ACTIVE_GRANTS} ORDER BY g.created_at DESC`).all() as GrantRow[])
    .map((r) => ({ ...toView(r), userId: r.user_id, userEmail: r.user_email ?? null }));
}

/**
 * Revokes a grant on behalf of `actor`. A user may revoke their own; the owner
 * may revoke anyone's (so a departed colleague's agent can be cut off). Anything
 * else answers "not found", so grant ids cannot be probed.
 */
export function revokeGrantAs(grantId: string, actor: { userId: string; role: string }): void {
  const row = getDb().prepare('SELECT user_id FROM oauth_grants WHERE id = ? AND revoked_at IS NULL').get(grantId) as { user_id: string } | undefined;
  if (!row || (row.user_id !== actor.userId && actor.role !== 'owner')) throw new NotFoundError('Connected app not found');
  revokeGrant(grantId);
}
