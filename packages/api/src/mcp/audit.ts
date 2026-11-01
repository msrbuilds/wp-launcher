import crypto from 'crypto';
import { getDb } from '../utils/db';

export interface AuditRow {
  id: string;
  grantId: string;
  clientId: string;
  clientName: string | null;
  tool: string;
  argsSummary: unknown;
  outcome: 'ok' | 'error' | 'denied';
  error: string | null;
  durationMs: number;
  bypass: boolean;
  createdAt: string;
}

const SECRET_KEY = /password|secret|token|key|credential/i;
const MAX_STRING = 200;
const MAX_ITEMS = 20;
const MAX_DEPTH = 4;

/**
 * A bounded, secret-free picture of what an agent asked for. Message bodies and
 * descriptions are summarised by length, not stored: the log records *that* an
 * agent wrote to a client, not a second copy of what it wrote.
 */
export function redactArgs(args: unknown, depth = 0): unknown {
  if (typeof args === 'string') return args.length > MAX_STRING ? `<string: ${args.length} chars>` : args;
  if (args === null || typeof args !== 'object') return args;
  if (depth >= MAX_DEPTH) return '<object>';
  if (Array.isArray(args)) {
    const head = args.slice(0, MAX_ITEMS).map((v) => redactArgs(v, depth + 1));
    return args.length > MAX_ITEMS ? [...head, `<+${args.length - MAX_ITEMS} more>`] : head;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (SECRET_KEY.test(k)) continue;
    out[k] = redactArgs(v, depth + 1);
  }
  return out;
}

export function recordAudit(e: {
  grantId: string; userId: string; clientId: string; tool: string; args: unknown;
  outcome: 'ok' | 'error' | 'denied'; error?: string; durationMs: number; bypass?: boolean;
}): void {
  getDb().prepare(`
    INSERT INTO mcp_audit_log (id, grant_id, user_id, client_id, tool, args_summary, outcome, error, duration_ms, bypass)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), e.grantId, e.userId, e.clientId, e.tool, JSON.stringify(redactArgs(e.args) ?? null),
    e.outcome, e.error ?? null, Math.round(e.durationMs), e.bypass ? 1 : 0);
}

/** The caller's own rows only — one admin never reads another's agent activity. */
export function listAudit(userId: string, opts: { clientId?: string; outcome?: string; limit?: number; offset?: number }): { rows: AuditRow[]; total: number } {
  const where = ['a.user_id = ?'];
  const params: unknown[] = [userId];
  if (opts.clientId) { where.push('a.client_id = ?'); params.push(opts.clientId); }
  if (opts.outcome) { where.push('a.outcome = ?'); params.push(opts.outcome); }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM mcp_audit_log a WHERE ${where.join(' AND ')}`).get(...params) as { c: number }).c;
  const rows = db.prepare(`
    SELECT a.*, c.client_name FROM mcp_audit_log a
    LEFT JOIN oauth_clients c ON c.client_id = a.client_id
    WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC, a.rowid DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Record<string, any>[];
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id, grantId: r.grant_id, clientId: r.client_id, clientName: r.client_name ?? null, tool: r.tool,
      argsSummary: r.args_summary ? JSON.parse(r.args_summary) : null, outcome: r.outcome, error: r.error,
      durationMs: r.duration_ms, bypass: !!r.bypass, createdAt: r.created_at,
    })),
  };
}

export function pruneAudit(): number {
  return getDb().prepare("DELETE FROM mcp_audit_log WHERE created_at < datetime('now','-90 days')").run().changes;
}
