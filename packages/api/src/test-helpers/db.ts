import Database from 'better-sqlite3';

const USERS_TABLE = `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

// The foreign key matters: production enforces it (better-sqlite3 turns
// PRAGMA foreign_keys on by default), so anything deleting a user row must
// deal with every table that references it.
const SITES_TABLE = `
  CREATE TABLE sites (
    id TEXT PRIMARY KEY,
    subdomain TEXT UNIQUE NOT NULL,
    product_id TEXT NOT NULL,
    user_id TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    expires_at TEXT NOT NULL,
    direct_file_access INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`;

const SITE_LOGS_TABLE = `
  CREATE TABLE site_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id TEXT NOT NULL,
    user_id TEXT,
    product_id TEXT NOT NULL,
    subdomain TEXT NOT NULL,
    action TEXT NOT NULL
  )`;

const CLIENTS_TABLE = `
  CREATE TABLE clients (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`;

const PROJECTS_TABLE = `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`;

const SETTINGS_TABLE = `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`;

/**
 * Minimal in-memory schema covering only the tables the panel migration
 * touches. Deliberately not the full production schema — these tests assert
 * migration behaviour, not schema completeness.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  for (const ddl of [USERS_TABLE, SITES_TABLE, SITE_LOGS_TABLE, CLIENTS_TABLE, PROJECTS_TABLE, SETTINGS_TABLE]) {
    db.prepare(ddl).run();
  }
  return db;
}
