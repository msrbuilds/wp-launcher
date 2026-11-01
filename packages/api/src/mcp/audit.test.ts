import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { listAudit, pruneAudit, recordAudit, redactArgs } from './audit';

let db: Database.Database;
beforeEach(() => { db = createTestDb(); __setDbForTesting(db); });
afterEach(() => { __setDbForTesting(null); db.close(); });

const base = { grantId: 'g', userId: 'u1', clientId: 'c', tool: 't', args: {}, outcome: 'ok' as const, durationMs: 3 };

describe('redactArgs', () => {
  it('summarises a huge string by length', () => {
    expect(redactArgs({ body: 'x'.repeat(900_000) })).toEqual({ body: '<string: 900000 chars>' });
  });

  it('keeps short strings as they are', () => {
    expect(redactArgs({ name: 'Acme' })).toEqual({ name: 'Acme' });
  });

  it('caps arrays at 20 items plus a marker', () => {
    const out = redactArgs({ ids: Array.from({ length: 10_000 }, (_, i) => i) }) as { ids: unknown[] };
    expect(out.ids).toHaveLength(21);
    expect(out.ids[20]).toBe('<+9980 more>');
  });

  it('collapses anything deeper than four levels', () => {
    expect(redactArgs({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({ a: { b: { c: { d: '<object>' } } } });
  });

  it('caps the number of keys per object and truncates long key names', () => {
    const wide = Object.fromEntries(Array.from({ length: 100_000 }, (_, i) => [`k${i}`, i]));
    const out = redactArgs(wide) as Record<string, unknown>;
    expect(Object.keys(out)).toHaveLength(21);
    expect(out['<more>']).toBe('<+99980 more keys>');
    const longKey = redactArgs({ ['x'.repeat(500)]: 1 }) as Record<string, unknown>;
    expect(Object.keys(longKey)[0].length).toBeLessThanOrEqual(64);
  });

  it('drops secret-looking keys at any depth', () => {
    expect(redactArgs({ adminPassword: 'x', apiKey: 'y', nested: { auth_token: 'z', keep: 1 }, credentials: {} })).toEqual({ nested: { keep: 1 } });
  });
});

describe('audit log', () => {
  it('stores rows and lists only the caller’s own, newest first, with filters', () => {
    recordAudit({ ...base, tool: 'first' });
    recordAudit({ ...base, tool: 'second', outcome: 'error', error: 'boom', clientId: 'c2' });
    recordAudit({ ...base, userId: 'someone-else', tool: 'theirs' });
    const all = listAudit('u1', {});
    expect(all.total).toBe(2);
    expect(all.rows.map((r) => r.tool).sort()).toEqual(['first', 'second']);
    expect(listAudit('u1', { outcome: 'error' }).rows.map((r) => r.tool)).toEqual(['second']);
    expect(listAudit('u1', { clientId: 'c2' }).rows.map((r) => r.tool)).toEqual(['second']);
  });

  it('stores the redacted summary, never the raw secret', () => {
    recordAudit({ ...base, args: { password: 'hunter2', siteId: 's1' } });
    const row = db.prepare('SELECT args_summary FROM mcp_audit_log').get() as { args_summary: string };
    expect(row.args_summary).not.toContain('hunter2');
    expect(JSON.parse(row.args_summary)).toEqual({ siteId: 's1' });
  });

  it('bounds the stored summary even when every individual cap is hit', () => {
    const big = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, Object.fromEntries(Array.from({ length: 20 }, (_, j) => [`j${j}`, 'y'.repeat(200)]))]));
    recordAudit({ ...base, args: big });
    const row = db.prepare('SELECT args_summary FROM mcp_audit_log').get() as { args_summary: string };
    expect(row.args_summary.length).toBeLessThanOrEqual(8192);
  });

  it('prunes rows older than 90 days only', () => {
    recordAudit(base);
    recordAudit(base);
    const [old, recent] = (db.prepare('SELECT id FROM mcp_audit_log').all() as { id: string }[]).map((r) => r.id);
    db.prepare("UPDATE mcp_audit_log SET created_at = datetime('now','-91 days') WHERE id = ?").run(old);
    db.prepare("UPDATE mcp_audit_log SET created_at = datetime('now','-89 days') WHERE id = ?").run(recent);
    expect(pruneAudit()).toBe(1);
    expect(listAudit('u1', {}).total).toBe(1);
  });
});
