import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { __initSchemaForTesting } from './db';

function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

describe('snapshots.restored_at', () => {
  it('exists on a freshly created database', () => {
    const db = new Database(':memory:');
    __initSchemaForTesting(db);
    expect(columns(db, 'snapshots')).toContain('restored_at');
    db.close();
  });

  it('is added to an existing install, preserving its snapshots', () => {
    // The upgrade path: a database whose snapshots table predates the column.
    // Without the migration, every restore fails with "no such column".
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE snapshots (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        name TEXT NOT NULL,
        db_engine TEXT NOT NULL DEFAULT 'sqlite',
        storage_path TEXT NOT NULL,
        size_bytes INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO snapshots (id, site_id, name, storage_path, size_bytes)
      VALUES ('old-snap', 's1', 'before upgrade', 'data/snapshots/old-snap', 42);
    `);
    expect(columns(db, 'snapshots')).not.toContain('restored_at');

    __initSchemaForTesting(db);

    expect(columns(db, 'snapshots')).toContain('restored_at');
    const row = db.prepare("SELECT name, size_bytes, restored_at FROM snapshots WHERE id = 'old-snap'")
      .get() as { name: string; size_bytes: number; restored_at: string | null };
    expect(row.name).toBe('before upgrade');
    expect(row.size_bytes).toBe(42);
    // Never restored, so it must not be badged as though it had been.
    expect(row.restored_at).toBeNull();
    db.close();
  });

  it('is safe to run twice', () => {
    // initSchema runs on every boot, so the migration must be idempotent.
    const db = new Database(':memory:');
    __initSchemaForTesting(db);
    expect(() => __initSchemaForTesting(db)).not.toThrow();
    expect(columns(db, 'snapshots').filter((c) => c === 'restored_at')).toHaveLength(1);
    db.close();
  });
});
