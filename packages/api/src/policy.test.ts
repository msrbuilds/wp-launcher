import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './test-helpers/db';
import { __setDbForTesting } from './utils/db';
import { runPanelMigration } from './utils/migrations/panel-v3';
import { setSetting } from './services/settings.service';
import { policy, PERMANENT_EXPIRY, SiteFacts } from './policy';

let db: Database.Database;

function migrateAs(mode: 'local' | 'agency') {
  db.close();
  db = createTestDb();
  db.prepare('INSERT INTO sites (id, subdomain, product_id, expires_at) VALUES (?, ?, ?, ?)').run(
    'seed', 'seed', 'demo', PERMANENT_EXPIRY,
  );
  runPanelMigration(db, { APP_MODE: mode, MAX_SITES_PER_USER: '3', MAX_TOTAL_SITES: '50' });
  __setDbForTesting(db);
}

function site(overrides: Partial<SiteFacts> = {}): SiteFacts {
  return { expires_at: PERMANENT_EXPIRY, restrict_capabilities: 1, direct_file_access: 0, ...overrides };
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

describe('policy — parity with the old local mode', () => {
  beforeEach(() => migrateAs('local'));

  it('does not enforce per-user or total quotas', () => {
    expect(policy.quotaForRole('member')).toBe(0);
    expect(policy.totalSiteQuota()).toBe(0);
  });

  it('allows plain-http remotes', () => {
    expect(policy.allowsInsecureRemotes()).toBe(true);
  });

  it('does not apply container resource limits', () => {
    expect(policy.enforcesResourceLimits()).toBe(false);
  });

  it('leaves wp-admin unlocked on new sites by default', () => {
    expect(policy.defaultRestrictCapabilities()).toBe(false);
  });

  it('does not offer public registration or a demo portal', () => {
    expect(policy.allowsPublicRegistration()).toBe(false);
    expect(policy.demoPortalEnabled()).toBe(false);
  });
});

describe('policy — parity with the old agency mode', () => {
  beforeEach(() => migrateAs('agency'));

  it('enforces the quotas that came from env', () => {
    expect(policy.quotaForRole('member')).toBe(3);
    expect(policy.totalSiteQuota()).toBe(50);
  });

  it('rejects plain-http remotes', () => {
    expect(policy.allowsInsecureRemotes()).toBe(false);
  });

  it('applies container resource limits', () => {
    expect(policy.enforcesResourceLimits()).toBe(true);
  });

  it('locks wp-admin on new sites by default', () => {
    expect(policy.defaultRestrictCapabilities()).toBe(true);
  });

  it('offers public registration and a demo portal', () => {
    expect(policy.allowsPublicRegistration()).toBe(true);
    expect(policy.demoPortalEnabled()).toBe(true);
  });
});

describe('policy — per-site questions', () => {
  it('reads restrictions off the site row, not a global', () => {
    expect(policy.restrictsWpCapabilities(site({ restrict_capabilities: 1 }))).toBe(true);
    expect(policy.restrictsWpCapabilities(site({ restrict_capabilities: 0 }))).toBe(false);
  });

  it('reads file exposure off the site row', () => {
    expect(policy.exposesFiles(site({ direct_file_access: 1 }))).toBe(true);
    expect(policy.exposesFiles(site({ direct_file_access: 0 }))).toBe(false);
  });

  it('treats the sentinel expiry as permanent', () => {
    expect(policy.isPermanent(site({ expires_at: PERMANENT_EXPIRY }))).toBe(true);
    expect(policy.isPermanent(site({ expires_at: '2026-01-01T00:00:00.000Z' }))).toBe(false);
  });
});

describe('policy — quota roles', () => {
  it('maps the legacy "user" role onto the member quota', () => {
    setSetting('panel.quota.member', '4');
    expect(policy.quotaForRole('user')).toBe(4);
  });

  it('falls back to the member quota for an unknown role', () => {
    setSetting('panel.quota.member', '2');
    expect(policy.quotaForRole('something-else')).toBe(2);
  });

  it('gives owners and admins their own quota keys', () => {
    setSetting('panel.quota.owner', '11');
    setSetting('panel.quota.admin', '12');
    expect(policy.quotaForRole('owner')).toBe(11);
    expect(policy.quotaForRole('admin')).toBe(12);
  });
});
