import Database from 'better-sqlite3';

const USERS_TABLE = `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'user',
    name TEXT,
    avatar_url TEXT,
    pending_email TEXT,
    email_change_token TEXT,
    email_change_expires_at TEXT,
    token_version INTEGER NOT NULL DEFAULT 0,
    verification_token TEXT,
    verification_expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    container_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`;

const SNAPSHOTS_TABLE = `
  CREATE TABLE snapshots (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    name TEXT NOT NULL,
    db_engine TEXT NOT NULL DEFAULT 'sqlite',
    storage_path TEXT NOT NULL,
    size_bytes INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    restored_at TEXT,
    FOREIGN KEY (site_id) REFERENCES sites(id)
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
    email TEXT,
    phone TEXT,
    company TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`;

const CLIENT_USERS_TABLE = `
  CREATE TABLE client_users (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0,
    invite_token TEXT,
    invite_expires_at TEXT,
    token_version INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  )`;

const PROJECTS_TABLE = `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    client_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  )`;

const PROJECT_SITES_TABLE = `
  CREATE TABLE project_sites (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, site_id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (site_id) REFERENCES sites(id)
  )`;

const BOARD_COLUMNS_TABLE = `
  CREATE TABLE board_columns (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    client_visible INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`;

const BOARD_CARDS_TABLE = `
  CREATE TABLE board_cards (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    labels TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (column_id) REFERENCES board_columns(id)
  )`;

const INVOICES_TABLE = `
  CREATE TABLE invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    project_id TEXT,
    items TEXT NOT NULL DEFAULT '[]',
    subtotal REAL NOT NULL DEFAULT 0,
    tax_rate REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'draft',
    issue_date TEXT NOT NULL DEFAULT (datetime('now')),
    due_date TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`;

const SETTINGS_TABLE = `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`;

const PAYMENT_METHODS_TABLE = `
  CREATE TABLE payment_methods (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

const INVOICE_PAYMENT_METHODS_TABLE = `
  CREATE TABLE invoice_payment_methods (
    invoice_id TEXT NOT NULL,
    payment_method_id TEXT NOT NULL,
    PRIMARY KEY (invoice_id, payment_method_id),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
  )`;

const PAYMENT_PROOFS_TABLE = `
  CREATE TABLE payment_proofs (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    client_user_id TEXT,
    storage_path TEXT NOT NULL,
    original_name TEXT NOT NULL DEFAULT '',
    mime TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    amount REAL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at TEXT,
    reject_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
  )`;

const CLIENT_MESSAGES_TABLE = `
  CREATE TABLE client_messages (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    author_type TEXT NOT NULL,
    author_id TEXT,
    author_label TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    project_id TEXT,
    invoice_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  )`;

const IMAGE_BUILDS_TABLE = `
  CREATE TABLE image_builds (
    id TEXT PRIMARY KEY,
    tag TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    log TEXT NOT NULL DEFAULT '',
    error TEXT,
    spec TEXT,
    created_by TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

/**
 * Minimal in-memory schema covering only the tables the panel migration
 * touches. Deliberately not the full production schema — these tests assert
 * migration behaviour, not schema completeness.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  for (const ddl of [USERS_TABLE, SITES_TABLE, SITE_LOGS_TABLE, CLIENTS_TABLE, CLIENT_USERS_TABLE, PROJECTS_TABLE, PROJECT_SITES_TABLE, BOARD_COLUMNS_TABLE, BOARD_CARDS_TABLE, INVOICES_TABLE, SETTINGS_TABLE, IMAGE_BUILDS_TABLE, SNAPSHOTS_TABLE, PAYMENT_METHODS_TABLE, INVOICE_PAYMENT_METHODS_TABLE, PAYMENT_PROOFS_TABLE, CLIENT_MESSAGES_TABLE]) {
    db.prepare(ddl).run();
  }
  return db;
}
