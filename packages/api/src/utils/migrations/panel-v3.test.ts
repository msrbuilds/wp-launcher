import { describe, it, expect } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../../test-helpers/db';
import { runPanelMigration, PANEL_DEFAULTS } from './panel-v3';

const PERMANENT = '9999-12-31T23:59:59.999Z';

function setting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

function seedSite(db: Database.Database, id: string, directFileAccess = 0) {
  db.prepare(
    'INSERT INTO sites (id, subdomain, product_id, expires_at, direct_file_access) VALUES (?, ?, ?, ?, ?)',
  ).run(id, `sub-${id}`, 'demo', PERMANENT, directFileAccess);
}

function seedUser(db: Database.Database, id: string, role = 'user') {
  db.prepare('INSERT INTO users (id, email, role) VALUES (?, ?, ?)').run(id, `${id}@example.com`, role);
}

describe('runPanelMigration', () => {
  it('adds the new site columns', () => {
    const db = createTestDb();
    runPanelMigration(db, {});
    const cols = (db.prepare('PRAGMA table_info(sites)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('restrict_capabilities');
    expect(cols).toContain('origin');
    db.close();
  });

  it('seeds every panel default on a fresh install and records migratedFrom=fresh', () => {
    const db = createTestDb();
    runPanelMigration(db, {});
    for (const [key, value] of Object.entries(PANEL_DEFAULTS)) {
      expect(setting(db, key), key).toBe(value);
    }
    expect(setting(db, 'panel.migratedFrom')).toBe('fresh');
    expect(setting(db, 'panel.setupComplete')).toBe('false');
    db.close();
  });

  it('backfills an upgraded local install', () => {
    const db = createTestDb();
    seedSite(db, 's1');
    runPanelMigration(db, { APP_MODE: 'local' });

    expect(setting(db, 'panel.migratedFrom')).toBe('local');
    expect(setting(db, 'panel.publicRegistration')).toBe('false');
    expect(setting(db, 'panel.demoPortalEnabled')).toBe('false');
    expect(setting(db, 'panel.allowInsecureRemotes')).toBe('true');
    expect(setting(db, 'panel.enforceResourceLimits')).toBe('false');
    expect(setting(db, 'panel.defaultRestrictCapabilities')).toBe('false');
    expect(setting(db, 'panel.quota.member')).toBe('0');
    expect(setting(db, 'panel.quota.total')).toBe('0');

    const site = db.prepare('SELECT restrict_capabilities FROM sites WHERE id = ?').get('s1') as { restrict_capabilities: number };
    expect(site.restrict_capabilities).toBe(0);
    db.close();
  });

  it('backfills an upgraded agency install, taking quotas from env', () => {
    const db = createTestDb();
    seedSite(db, 's1');
    runPanelMigration(db, { APP_MODE: 'agency', MAX_SITES_PER_USER: '5', MAX_TOTAL_SITES: '80' });

    expect(setting(db, 'panel.migratedFrom')).toBe('agency');
    expect(setting(db, 'panel.publicRegistration')).toBe('true');
    expect(setting(db, 'panel.demoPortalEnabled')).toBe('true');
    expect(setting(db, 'panel.allowInsecureRemotes')).toBe('false');
    expect(setting(db, 'panel.enforceResourceLimits')).toBe('true');
    expect(setting(db, 'panel.defaultRestrictCapabilities')).toBe('true');
    expect(setting(db, 'panel.quota.member')).toBe('5');
    expect(setting(db, 'panel.quota.total')).toBe('80');

    const site = db.prepare('SELECT restrict_capabilities FROM sites WHERE id = ?').get('s1') as { restrict_capabilities: number };
    expect(site.restrict_capabilities).toBe(1);
    db.close();
  });

  it('treats a missing APP_MODE on an upgrade as agency', () => {
    const db = createTestDb();
    seedSite(db, 's1');
    runPanelMigration(db, {});
    expect(setting(db, 'panel.migratedFrom')).toBe('agency');
    db.close();
  });

  it('never overwrites direct_file_access', () => {
    const db = createTestDb();
    seedSite(db, 'exposed', 1);
    seedSite(db, 'hidden', 0);
    runPanelMigration(db, { APP_MODE: 'local' });
    const rows = db.prepare('SELECT id, direct_file_access FROM sites ORDER BY id').all() as { id: string; direct_file_access: number }[];
    expect(rows).toEqual([
      { id: 'exposed', direct_file_access: 1 },
      { id: 'hidden', direct_file_access: 0 },
    ]);
    db.close();
  });

  it('marks setup complete only when a real user already exists', () => {
    const withUser = createTestDb();
    seedSite(withUser, 's1');
    seedUser(withUser, 'real-person', 'admin');
    runPanelMigration(withUser, { APP_MODE: 'agency' });
    expect(setting(withUser, 'panel.setupComplete')).toBe('true');
    withUser.close();

    const withoutUser = createTestDb();
    seedSite(withoutUser, 's1');
    seedUser(withoutUser, 'admin', 'admin');
    seedUser(withoutUser, 'local-user', 'admin');
    runPanelMigration(withoutUser, { APP_MODE: 'local' });
    expect(setting(withoutUser, 'panel.setupComplete')).toBe('false');
    withoutUser.close();
  });

  it('is idempotent and ignores APP_MODE on later runs', () => {
    const db = createTestDb();
    seedSite(db, 's1');
    runPanelMigration(db, { APP_MODE: 'local' });
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'panel.publicRegistration'").run();

    runPanelMigration(db, { APP_MODE: 'agency' });

    expect(setting(db, 'panel.migratedFrom')).toBe('local');
    expect(setting(db, 'panel.publicRegistration')).toBe('true');
    const site = db.prepare('SELECT restrict_capabilities FROM sites WHERE id = ?').get('s1') as { restrict_capabilities: number };
    expect(site.restrict_capabilities).toBe(0);
    db.close();
  });
});
