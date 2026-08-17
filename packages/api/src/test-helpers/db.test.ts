import { describe, it, expect } from 'vitest';
import { createTestDb } from './db';

describe('createTestDb', () => {
  it('creates the tables the panel migration needs', () => {
    const db = createTestDb();
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name)
      .sort();
    expect(names).toEqual(['clients', 'image_builds', 'projects', 'settings', 'site_logs', 'sites', 'snapshots', 'sqlite_sequence', 'users']);
    db.close();
  });

  it('starts empty', () => {
    const db = createTestDb();
    const row = db.prepare('SELECT COUNT(*) AS c FROM sites').get() as { c: number };
    expect(row.c).toBe(0);
    db.close();
  });
});
