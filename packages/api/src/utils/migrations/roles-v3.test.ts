import { describe, it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../test-helpers/db';
import { runRolesMigration } from './roles-v3';

function seedUser(db: Database.Database, id: string, role: string, createdAt: string) {
  db.prepare('INSERT INTO users (id, email, role, verified, created_at) VALUES (?, ?, ?, 1, ?)')
    .run(id, `${id}@example.com`, role, createdAt);
}

function roleOf(db: Database.Database, id: string): string | undefined {
  const row = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined;
  return row?.role;
}

describe('runRolesMigration', () => {
  it('renames the legacy user role to member', () => {
    const db = createTestDb();
    seedUser(db, 'u1', 'user', '2026-01-01 00:00:00');
    runRolesMigration(db);
    expect(roleOf(db, 'u1')).toBe('member');
    db.close();
  });

  it('promotes the earliest real admin to owner', () => {
    const db = createTestDb();
    seedUser(db, 'later', 'admin', '2026-03-01 00:00:00');
    seedUser(db, 'earlier', 'admin', '2026-02-01 00:00:00');
    runRolesMigration(db);
    expect(roleOf(db, 'earlier')).toBe('owner');
    expect(roleOf(db, 'later')).toBe('admin');
    db.close();
  });

  it('never promotes a synthetic row to owner', () => {
    const db = createTestDb();
    seedUser(db, 'admin', 'admin', '2020-01-01 00:00:00');
    seedUser(db, 'local-user', 'admin', '2020-01-01 00:00:00');
    seedUser(db, 'real', 'admin', '2026-05-01 00:00:00');
    runRolesMigration(db);
    expect(roleOf(db, 'real')).toBe('owner');
    expect(roleOf(db, 'admin')).toBe('admin');
    expect(roleOf(db, 'local-user')).toBe('admin');
    db.close();
  });

  it('leaves no owner when there is no real admin', () => {
    const db = createTestDb();
    seedUser(db, 'admin', 'admin', '2020-01-01 00:00:00');
    seedUser(db, 'local-user', 'admin', '2020-01-01 00:00:00');
    runRolesMigration(db);
    const owners = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'owner'").get() as { c: number };
    expect(owners.c).toBe(0);
    db.close();
  });

  it('is idempotent and keeps the existing owner', () => {
    const db = createTestDb();
    seedUser(db, 'first', 'admin', '2026-01-01 00:00:00');
    seedUser(db, 'second', 'admin', '2026-02-01 00:00:00');
    runRolesMigration(db);
    runRolesMigration(db);
    const owners = db.prepare("SELECT id FROM users WHERE role = 'owner'").all() as { id: string }[];
    expect(owners).toEqual([{ id: 'first' }]);
    db.close();
  });
});
