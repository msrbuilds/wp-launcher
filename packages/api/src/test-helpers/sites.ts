import { createTestDb } from './db';
import type Database from 'better-sqlite3';

/** Current site schema for lifecycle/HTTP tests; never opens the live database. */
export function createSiteTestDb(): Database.Database {
  const db = createTestDb();
  db.exec(`
    ALTER TABLE sites RENAME COLUMN product_id TO blueprint_id;
    ALTER TABLE site_logs RENAME COLUMN product_id TO blueprint_id;
    ALTER TABLE sites ADD COLUMN site_url TEXT;
    ALTER TABLE sites ADD COLUMN admin_url TEXT;
    ALTER TABLE sites ADD COLUMN admin_user TEXT;
    ALTER TABLE sites ADD COLUMN admin_password TEXT;
    ALTER TABLE sites ADD COLUMN auto_login_token TEXT;
    ALTER TABLE sites ADD COLUMN restrict_capabilities INTEGER DEFAULT 0;
    ALTER TABLE sites ADD COLUMN created_at TEXT DEFAULT '2026-01-01 00:00:00';
    ALTER TABLE sites ADD COLUMN deleted_at TEXT;
    ALTER TABLE site_logs ADD COLUMN user_email TEXT;
    ALTER TABLE site_logs ADD COLUMN site_url TEXT;
  `);
  for (const id of ['alice', 'bob', 'owner', 'admin']) {
    db.prepare('INSERT INTO users (id, email, verified, role) VALUES (?, ?, 1, ?)')
      .run(id, `${id}@example.com`, ['owner', 'admin'].includes(id) ? id : 'member');
  }
  return db;
}
