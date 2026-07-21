import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { runPanelMigration } from '../utils/migrations/panel-v3';
import { getSetting } from './settings.service';
import { runSetup, isSetupComplete } from './setup.service';

let db: Database.Database;

const PERMANENT = '9999-12-31T23:59:59.999Z';

function seedLocalUserSite(id: string) {
  db.prepare("INSERT INTO users (id, email, role) VALUES ('local-user', 'local@localhost', 'admin')")
    .run();
  db.prepare('INSERT INTO sites (id, subdomain, product_id, user_id, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, `sub-${id}`, 'demo', 'local-user', PERMANENT);
}

beforeEach(() => {
  db = createTestDb();
  runPanelMigration(db, {});
  __setDbForTesting(db);
});

afterEach(() => {
  __setDbForTesting(null);
  db.close();
});

describe('runSetup', () => {
  it('creates a verified owner with a hashed password', async () => {
    const owner = await runSetup({ email: 'me@example.com', password: 'correct-horse-battery' });
    expect(owner.role).toBe('owner');
    expect(owner.verified).toBe(1);
    expect(owner.password_hash).not.toBe('correct-horse-battery');
    expect(await bcrypt.compare('correct-horse-battery', owner.password_hash)).toBe(true);
  });

  it('marks setup complete', async () => {
    expect(isSetupComplete()).toBe(false);
    await runSetup({ email: 'me@example.com', password: 'correct-horse-battery' });
    expect(isSetupComplete()).toBe(true);
    expect(getSetting('panel.setupComplete')).toBe('true');
  });

  it('adopts the local-user sites and removes the row', async () => {
    seedLocalUserSite('s1');
    const owner = await runSetup({ email: 'me@example.com', password: 'correct-horse-battery' });

    const site = db.prepare('SELECT user_id FROM sites WHERE id = ?').get('s1') as { user_id: string };
    expect(site.user_id).toBe(owner.id);
    const stale = db.prepare("SELECT id FROM users WHERE id = 'local-user'").get();
    expect(stale).toBeUndefined();
  });

  it('stores the panel name as the branding site title', async () => {
    await runSetup({ email: 'me@example.com', password: 'correct-horse-battery', panelName: 'MSR Panel' });
    expect(getSetting('branding.siteTitle')).toBe('MSR Panel');
  });

  it('refuses to run twice', async () => {
    await runSetup({ email: 'me@example.com', password: 'correct-horse-battery' });
    await expect(
      runSetup({ email: 'other@example.com', password: 'correct-horse-battery' }),
    ).rejects.toThrow(/already/i);
  });

  it('rejects a short password', async () => {
    await expect(runSetup({ email: 'me@example.com', password: 'short' })).rejects.toThrow(/12 characters/i);
  });

  it('rejects an invalid email', async () => {
    await expect(runSetup({ email: 'nope', password: 'correct-horse-battery' })).rejects.toThrow(/email/i);
  });
});
