const PRIVILEGED_ROLES = new Set(['owner', 'admin']);

export interface ScopeClause {
  /** SQL fragment without WHERE/AND, or '' when no filtering is needed. */
  sql: string;
  params: string[];
}

export function seesAllRows(role: string | undefined): boolean {
  return !!role && PRIVILEGED_ROLES.has(role);
}

/**
 * Row visibility for list endpoints. Replaces the old
 * `user_id = 'local-user'` filters, which encoded the install's mode rather
 * than the caller's identity.
 */
export function scopeClause(role: string | undefined, userId: string | undefined): ScopeClause {
  if (seesAllRows(role)) return { sql: '', params: [] };
  if (!userId) return { sql: '1 = 0', params: [] };
  return { sql: 'user_id = ?', params: [userId] };
}
