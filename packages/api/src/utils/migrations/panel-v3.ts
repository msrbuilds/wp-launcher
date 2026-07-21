import type Database from 'better-sqlite3';

/**
 * Values every fresh install starts with. An upgrade seeds these first, then
 * overwrites the ones that differed under the old mode.
 */
export const PANEL_DEFAULTS: Record<string, string> = {
  'panel.publicRegistration': 'false',
  'panel.defaultExpiry': 'permanent',
  'panel.quota.owner': '0',
  'panel.quota.admin': '0',
  'panel.quota.member': '0',
  'panel.quota.total': '0',
  'panel.demoPortalEnabled': 'false',
  'panel.allowInsecureRemotes': 'false',
  'panel.enforceResourceLimits': 'true',
  'panel.defaultRestrictCapabilities': 'true',
  'panel.setupComplete': 'false',
};

/** The legacy environment. This migration is the last code that reads APP_MODE. */
export interface LegacyEnv {
  APP_MODE?: string;
  MAX_SITES_PER_USER?: string;
  MAX_TOTAL_SITES?: string;
}

function addColumn(db: Database.Database, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`).run();
}

export function runPanelMigration(db: Database.Database, env: LegacyEnv = {}): void {
  // Column adds are independently idempotent and safe to repeat.
  addColumn(db, 'sites', 'restrict_capabilities', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'sites', 'origin', "TEXT NOT NULL DEFAULT 'panel'");

  const already = db.prepare("SELECT value FROM settings WHERE key = 'panel.migratedFrom'").get() as
    | { value: string }
    | undefined;
  if (already) return;

  const siteCount = (db.prepare('SELECT COUNT(*) AS c FROM sites').get() as { c: number }).c;
  const priorMode = env.APP_MODE === 'local' ? 'local' : 'agency';
  const from = siteCount === 0 ? 'fresh' : priorMode;

  const apply = db.transaction(() => {
    const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(PANEL_DEFAULTS)) seed.run(key, value);

    const set = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );

    if (from === 'local') {
      db.prepare('UPDATE sites SET restrict_capabilities = 0').run();
      set.run('panel.publicRegistration', 'false');
      set.run('panel.demoPortalEnabled', 'false');
      set.run('panel.allowInsecureRemotes', 'true');
      set.run('panel.enforceResourceLimits', 'false');
      // Local sites always had an unlocked wp-admin; keep new ones that way
      // until the UI exposes a per-site toggle.
      set.run('panel.defaultRestrictCapabilities', 'false');
    } else if (from === 'agency') {
      db.prepare('UPDATE sites SET restrict_capabilities = 1').run();
      set.run('panel.publicRegistration', 'true');
      set.run('panel.demoPortalEnabled', 'true');
      set.run('panel.allowInsecureRemotes', 'false');
      set.run('panel.enforceResourceLimits', 'true');
      set.run('panel.defaultRestrictCapabilities', 'true');
      set.run('panel.quota.member', String(parseInt(env.MAX_SITES_PER_USER || '3', 10)));
      set.run('panel.quota.total', String(parseInt(env.MAX_TOTAL_SITES || '50', 10)));
    }

    if (from !== 'fresh') {
      // 'admin' and 'local-user' are synthetic rows the old code created; a real
      // human account means this install already has an owner and can skip setup.
      const realUsers = (
        db.prepare("SELECT COUNT(*) AS c FROM users WHERE id NOT IN ('admin', 'local-user')").get() as { c: number }
      ).c;
      set.run('panel.setupComplete', realUsers > 0 ? 'true' : 'false');
    }

    set.run('panel.migratedFrom', from);
  });

  apply();
}
