import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { runPanelMigration } from '../utils/migrations/panel-v3';
import { getSetting, getBool, getInt, setSetting } from './settings.service';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  runPanelMigration(db, {});
  __setDbForTesting(db);
});

afterEach(() => {
  __setDbForTesting(null);
  db.close();
});

describe('settings.service', () => {
  it('reads a seeded value', () => {
    expect(getSetting('panel.defaultExpiry')).toBe('permanent');
  });

  it('falls back to the built-in default when the row is missing', () => {
    db.prepare("DELETE FROM settings WHERE key = 'panel.defaultExpiry'").run();
    expect(getSetting('panel.defaultExpiry')).toBe('permanent');
  });

  it('coerces booleans', () => {
    expect(getBool('panel.publicRegistration')).toBe(false);
    setSetting('panel.publicRegistration', 'true');
    expect(getBool('panel.publicRegistration')).toBe(true);
  });

  it('coerces integers', () => {
    setSetting('panel.quota.total', '42');
    expect(getInt('panel.quota.total')).toBe(42);
  });

  it('treats an unparseable integer as 0', () => {
    setSetting('panel.quota.total', 'not-a-number');
    expect(getInt('panel.quota.total')).toBe(0);
  });

  it('upserts rather than duplicating on write', () => {
    setSetting('panel.quota.total', '7');
    setSetting('panel.quota.total', '9');
    const rows = db.prepare("SELECT value FROM settings WHERE key = 'panel.quota.total'").all() as { value: string }[];
    expect(rows).toEqual([{ value: '9' }]);
  });
});
