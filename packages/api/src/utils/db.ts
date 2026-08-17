import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { runPanelMigration } from './migrations/panel-v3';
import { runRolesMigration } from './migrations/roles-v3';
import {
  mergeBlueprintDirectories,
  renameProductsTable,
  renameProductIdColumns,
  repointRenamedBlueprints,
} from './migrations/blueprints-v3';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const dbPath = path.join(config.dataDir, 'wp-launcher.db');

    // Clean up any stale WAL/SHM left behind from a previous WAL-mode run.
    // Without this, SQLite refuses to open the DB with SQLITE_IOERR_CORRUPTFS
    // on Windows bind mounts where the WAL files were created by a process
    // that didn't shut down cleanly.
    for (const ext of ['-wal', '-shm']) {
      const stale = dbPath + ext;
      if (fs.existsSync(stale)) {
        try { fs.unlinkSync(stale); } catch { /* best effort */ }
      }
    }

    // One-time safety copy before the panel-v3 migration rewrites settings and
    // site columns. The marker is written only after the migration succeeds, so
    // a crashed upgrade retries the backup on next boot rather than skipping it.
    const migrationMarker = path.join(config.dataDir, '.panel-migration-v3');
    if (fs.existsSync(dbPath) && !fs.existsSync(migrationMarker)) {
      const backupDir = path.join(config.dataDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `pre-v3-${stamp}.db`);
      fs.copyFileSync(dbPath, backupPath);
      console.log(`[db] Pre-migration backup written to ${backupPath}`);
    }

    db = new Database(dbPath);
    // DELETE journal (default): slower writes than WAL but reliable on Windows
    // bind mounts. Hit SQLITE_IOERR_CORRUPTFS twice in two days with WAL there.
    db.pragma('journal_mode = DELETE');
    db.pragma('synchronous = NORMAL');
    initSchema(db);
  }
  return db;
}

/**
 * Test-only: replace the module singleton with a caller-supplied database.
 * Pass `null` to restore normal lazy initialisation.
 */
export function __setDbForTesting(instance: Database.Database | null): void {
  db = instance as Database.Database;
}

/**
 * Run the schema and migrations against an arbitrary database.
 *
 * Exported for tests only: the migration branch — where an existing install
 * gains a column — is otherwise unreachable without a real data directory, and
 * it is the branch that runs on every upgrade.
 */
export function __initSchemaForTesting(instance: Database.Database): void {
  initSchema(instance);
}

function initSchema(db: Database.Database): void {
  // Must run before the DDL below: that block creates indexes on blueprint_id,
  // which on an upgraded database does not exist until these renames happen.
  // Both are no-ops on a fresh database, where the tables aren't there yet.
  renameProductsTable(db);
  renameProductIdColumns(db);

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
      blueprint_id TEXT NOT NULL,
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
      blueprint_id TEXT NOT NULL,
      subdomain TEXT NOT NULL,
      site_url TEXT,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_site_logs_user_id ON site_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_site_logs_blueprint_id ON site_logs(blueprint_id);
    CREATE INDEX IF NOT EXISTS idx_site_logs_created_at ON site_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

    CREATE TABLE IF NOT EXISTS blueprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Blueprints shipped as JSON files live in the repo checkout, which some
    -- platforms (Dokploy) re-clone on every redeploy. Deleting the file is
    -- therefore not durable; recording the deletion here is, because the
    -- database is a persistent volume.
    CREATE TABLE IF NOT EXISTS blueprint_deletions (
      id TEXT PRIMARY KEY,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      name TEXT NOT NULL,
      db_engine TEXT NOT NULL DEFAULT 'sqlite',
      storage_path TEXT NOT NULL,
      size_bytes INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      -- When this snapshot was last restored onto its site. Null means never.
      -- The panel badges the most recent one as "Last restored".
      restored_at TEXT,
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    CREATE TABLE IF NOT EXISTS bulk_jobs (
      id TEXT PRIMARY KEY,
      blueprint_id TEXT NOT NULL,
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
      blueprint_id TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS remote_connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      instance_mode TEXT,
      last_tested_at TEXT,
      status TEXT NOT NULL DEFAULT 'untested',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_history (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      remote_connection_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      remote_site_id TEXT,
      remote_site_url TEXT,
      snapshot_id TEXT,
      db_engine TEXT,
      size_bytes INTEGER,
      error TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_history_site ON sync_history(site_id);

    CREATE TABLE IF NOT EXISTS sync_state (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      remote_connection_id TEXT NOT NULL,
      last_synced_at TEXT,
      last_local_manifest TEXT,
      last_remote_manifest TEXT,
      UNIQUE(site_id, remote_connection_id)
    );

    CREATE TABLE IF NOT EXISTS clients (
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
    );
    CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);

    CREATE TABLE IF NOT EXISTS projects (
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
    );
    CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);

    CREATE TABLE IF NOT EXISTS project_sites (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, site_id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
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
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

    -- Productivity Monitor tables
    CREATE TABLE IF NOT EXISTS productivity_heartbeats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'file',
      project TEXT,
      language TEXT,
      category TEXT,
      editor TEXT,
      site_id TEXT,
      machine_id TEXT,
      branch TEXT,
      is_write INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_ph_created_at ON productivity_heartbeats(created_at);
    CREATE INDEX IF NOT EXISTS idx_ph_synced ON productivity_heartbeats(synced);
    CREATE INDEX IF NOT EXISTS idx_ph_source ON productivity_heartbeats(source);
    CREATE INDEX IF NOT EXISTS idx_ph_project ON productivity_heartbeats(project);

    CREATE TABLE IF NOT EXISTS productivity_goals (
      id TEXT PRIMARY KEY DEFAULT 'default',
      daily_goal_seconds INTEGER NOT NULL DEFAULT 21600,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS productivity_cloud_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS productivity_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      heartbeats_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      error TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS image_builds (
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
    'feature.publicSharing': 'true',
    'feature.siteSync': 'false',
    'feature.projects': 'false',
    'feature.productivityMonitor': 'false',
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
    db.exec(`ALTER TABLE snapshots ADD COLUMN restored_at TEXT`);
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
    db.exec(`ALTER TABLE sites ADD COLUMN direct_file_access INTEGER NOT NULL DEFAULT 0`);
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

  // Migration: account profile fields (display name, avatar, pending email
  // change) plus token_version — bumped on password/email change to invalidate
  // JWTs issued before it (see userAuth).
  for (const col of [
    `name TEXT`,
    `avatar_url TEXT`,
    `pending_email TEXT`,
    `email_change_token TEXT`,
    `email_change_expires_at TEXT`,
    `token_version INTEGER NOT NULL DEFAULT 0`,
  ]) {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col}`);
    } catch {
      // Column already exists
    }
  }

  // Panel settings + per-site columns. This is the only remaining reader of
  // APP_MODE, and only on the first run after upgrading.
  runPanelMigration(db, {
    APP_MODE: process.env.APP_MODE,
    MAX_SITES_PER_USER: process.env.MAX_SITES_PER_USER,
    MAX_TOTAL_SITES: process.env.MAX_TOTAL_SITES,
  });

  // Normalise roles and elect an owner from any pre-existing admin.
  runRolesMigration(db);

  // Blueprints: the table and column renames already ran at the top of this
  // function; the legacy config files merge here — but only once. Without the
  // marker this ran on every boot and re-copied any blueprint missing from
  // blueprints/ back from the still-present products/ and templates/ dirs, so a
  // blueprint deleted through the UI reappeared on the next restart. It also
  // only seeds on a genuinely first-run install: an established panel (setup
  // already complete) keeps exactly the blueprints its owner chose.
  const blueprintsMerged = db
    .prepare("SELECT 1 FROM settings WHERE key = 'panel.blueprintsMerged'")
    .get();
  if (!blueprintsMerged) {
    const setupDone = db
      .prepare("SELECT value FROM settings WHERE key = 'panel.setupComplete'")
      .get() as { value: string } | undefined;
    if (setupDone?.value !== 'true') {
      const merge = mergeBlueprintDirectories({
        products: config.legacyProductConfigsDir,
        templates: config.legacyTemplateConfigsDir,
        blueprints: config.blueprintConfigsDir,
      });
      // Any product displaced by a name collision takes its sites with it.
      repointRenamedBlueprints(db, merge.renamed);
    }
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('panel.blueprintsMerged', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'",
    ).run();
  }

  const migrationMarker = path.join(config.dataDir, '.panel-migration-v3');
  if (!fs.existsSync(migrationMarker)) {
    fs.writeFileSync(migrationMarker, new Date().toISOString());
  }

  // Migration: add user_id to remote_connections for tenant isolation
  try {
    db.exec(`ALTER TABLE remote_connections ADD COLUMN user_id TEXT`);
    // Backfill existing connections as admin-owned
    db.exec(`UPDATE remote_connections SET user_id = 'admin' WHERE user_id IS NULL`);
  } catch {
    // Column already exists
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_remote_connections_user_id ON remote_connections(user_id)`);
  } catch {
    // Index already exists
  }

  // Migration: add user_id to sync_history for tenant isolation
  try {
    db.exec(`ALTER TABLE sync_history ADD COLUMN user_id TEXT`);
    db.exec(`UPDATE sync_history SET user_id = 'admin' WHERE user_id IS NULL`);
  } catch {
    // Column already exists
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_history_user_id ON sync_history(user_id)`);
  } catch {
    // Index already exists
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
