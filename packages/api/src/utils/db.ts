import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const dbPath = path.join(config.dataDir, 'wp-launcher.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      verification_expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);

    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      subdomain TEXT UNIQUE NOT NULL,
      product_id TEXT NOT NULL,
      user_id TEXT,
      container_id TEXT,
      status TEXT NOT NULL DEFAULT 'creating',
      site_url TEXT,
      admin_url TEXT,
      admin_user TEXT,
      admin_password TEXT,
      auto_login_token TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
    CREATE INDEX IF NOT EXISTS idx_sites_expires ON sites(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id);

    CREATE TABLE IF NOT EXISTS site_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id TEXT NOT NULL,
      user_id TEXT,
      user_email TEXT,
      product_id TEXT NOT NULL,
      subdomain TEXT NOT NULL,
      site_url TEXT,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_site_logs_user_id ON site_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_site_logs_product_id ON site_logs(product_id);
    CREATE INDEX IF NOT EXISTS idx_site_logs_created_at ON site_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      name TEXT NOT NULL,
      db_engine TEXT NOT NULL DEFAULT 'sqlite',
      storage_path TEXT NOT NULL,
      size_bytes INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    CREATE TABLE IF NOT EXISTS bulk_jobs (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      total INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      config TEXT NOT NULL,
      results TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      user_id TEXT
    );

    CREATE TABLE IF NOT EXISTS scheduled_launches (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      user_id TEXT,
      user_email TEXT,
      scheduled_at TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      site_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_status ON scheduled_launches(status);
    CREATE INDEX IF NOT EXISTS idx_scheduled_at ON scheduled_launches(scheduled_at);

    CREATE TABLE IF NOT EXISTS site_shares (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      shared_with_email TEXT NOT NULL,
      shared_with_id TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_site_shares_site ON site_shares(site_id);
    CREATE INDEX IF NOT EXISTS idx_site_shares_email ON site_shares(shared_with_email);
    CREATE INDEX IF NOT EXISTS idx_site_shares_user ON site_shares(shared_with_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT 'site.created,site.expired,site.deleted',
      secret TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default feature flags and branding
  const defaultSettings: Record<string, string> = {
    'feature.cloning': 'false',
    'feature.snapshots': 'false',
    'feature.templates': 'false',
    'feature.customDomains': 'false',
    'feature.phpConfig': 'false',
    'feature.siteExtend': 'false',
    'feature.sitePassword': 'false',
    'feature.exportZip': 'false',
    'feature.webhooks': 'false',
    'feature.healthMonitoring': 'false',
    'feature.scheduledLaunch': 'false',
    'feature.collaborativeSites': 'false',
    'feature.adminer': 'false',
    'branding.siteTitle': 'WP Launcher',
    'branding.logoUrl': '',
    'branding.cardLayout': '',
    'color.primaryDark': '#14213d',
    'color.accent': '#fb8500',
    'color.grey': '#e5e5e5',
    'color.textMuted': '#6b7280',
    'color.textLight': '#9ca3af',
    'color.border': '#e5e5e5',
    'color.bgSurface': '#f5f5f5',
  };
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  // Migrations for existing databases
  try {
    db.exec(`ALTER TABLE sites ADD COLUMN auto_login_token TEXT`);
  } catch {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE sites ADD COLUMN cloned_from TEXT`);
  } catch {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE sites ADD COLUMN custom_domain TEXT`);
  } catch {
    // Column already exists
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sites_custom_domain ON sites(custom_domain)`);
  } catch {
    // Index already exists
  }

  // Migration: add role column to users
  try {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  } catch {
    // Column already exists
  }

  // Auto-create local user in local mode
  if (config.isLocalMode) {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, verified, role)
      VALUES ('local-user', 'local@localhost', '', 1, 'admin')
    `).run();
    // Ensure existing local-user is admin
    db.prepare(`UPDATE users SET role = 'admin' WHERE id = 'local-user'`).run();
  }

  // Auto-create admin user for API key auth (needed for FK constraint on sites)
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, verified, role)
    VALUES ('admin', 'admin@localhost', '', 1, 'admin')
  `).run();
  db.prepare(`UPDATE users SET role = 'admin' WHERE id = 'admin'`).run();

  // Bootstrap: promote ADMIN_EMAIL user to admin if set and no admin users exist yet
  if (config.adminEmail) {
    const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND id NOT IN ('admin', 'local-user')").get() as { count: number }).count;
    if (adminCount === 0) {
      db.prepare("UPDATE users SET role = 'admin' WHERE email = ? AND verified = 1").run(config.adminEmail);
    }
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
