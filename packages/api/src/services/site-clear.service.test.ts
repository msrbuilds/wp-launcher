import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { clearFinishedSites } from './site.service';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  // sites.user_id is a foreign key into users.
  db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'one@example.com')").run();
  db.prepare("INSERT INTO users (id, email) VALUES ('u2', 'two@example.com')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

function seed(id: string, subdomain: string, status: string, userId: string) {
  db.prepare(
    `INSERT INTO sites (id, subdomain, product_id, user_id, status, expires_at)
     VALUES (?, ?, 'demo', ?, ?, '2099-01-01T00:00:00.000Z')`,
  ).run(id, subdomain, userId, status);
}

const remaining = () =>
  (db.prepare('SELECT id FROM sites ORDER BY id').all() as { id: string }[]).map((r) => r.id);

describe('clearFinishedSites', () => {
  it('removes failed and deleted rows but keeps live ones', () => {
    seed('a', 'live-one', 'running', 'u1');
    seed('b', 'starting', 'creating', 'u1');
    seed('c', 'broke', 'error', 'u1');
    seed('d', 'gone--deleted-1', 'expired', 'u1');

    expect(clearFinishedSites()).toBe(2);
    expect(remaining()).toEqual(['a', 'b']);
  });

  it('clears only the caller’s own sites when a user is given', () => {
    seed('mine', 'mine', 'error', 'u1');
    seed('theirs', 'theirs', 'error', 'u2');

    expect(clearFinishedSites('u1')).toBe(1);
    expect(remaining()).toEqual(['theirs']);
  });

  it('clears every user when called as admin', () => {
    seed('mine', 'mine', 'error', 'u1');
    seed('theirs', 'theirs', 'expired', 'u2');

    expect(clearFinishedSites('admin')).toBe(2);
    expect(remaining()).toEqual([]);
  });

  it('reports zero when there is nothing to clear', () => {
    seed('a', 'live-one', 'running', 'u1');
    expect(clearFinishedSites()).toBe(0);
    expect(remaining()).toEqual(['a']);
  });

  it('leaves the audit trail alone', () => {
    seed('c', 'broke', 'error', 'u1');
    db.prepare(
      `INSERT INTO site_logs (site_id, user_id, product_id, subdomain, action)
       VALUES ('c', 'u1', 'demo', 'broke', 'created')`,
    ).run();

    clearFinishedSites();

    const logs = db.prepare('SELECT site_id FROM site_logs').all() as { site_id: string }[];
    expect(logs.map((l) => l.site_id)).toEqual(['c']);
  });
});
