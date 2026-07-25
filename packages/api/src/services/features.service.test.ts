import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import {
  ADMIN_ONLY_FEATURES, GRANTABLE_FEATURES, ALL_FEATURES,
  isAdminRole, isAdminOnlyFeature, adminSettingKey, demoSettingKey, resolveFeature,
  isFeatureEnabled, effectiveFeatures,
} from './features.service';

describe('catalogs', () => {
  it('classifies every feature exactly once and covers all 17', () => {
    expect(ADMIN_ONLY_FEATURES.length).toBe(5);
    expect(GRANTABLE_FEATURES.length).toBe(12);
    expect(ALL_FEATURES.length).toBe(17);
    const overlap = ADMIN_ONLY_FEATURES.filter((k) => GRANTABLE_FEATURES.includes(k));
    expect(overlap).toEqual([]);
    expect(new Set(ALL_FEATURES).size).toBe(17);
  });

  it('puts the five admin-only features out of members reach', () => {
    for (const k of ['projects', 'productivityMonitor', 'siteSync', 'webhooks', 'collaborativeSites']) {
      expect(isAdminOnlyFeature(k)).toBe(true);
    }
    expect(isAdminOnlyFeature('cloning')).toBe(false);
  });
});

describe('isAdminRole', () => {
  it('treats owner and admin as privileged', () => {
    expect(isAdminRole('owner')).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
  });
  it('treats member and anonymous as unprivileged', () => {
    expect(isAdminRole('member')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole('')).toBe(false);
  });
});

describe('setting keys', () => {
  it('keeps the admin namespace unchanged and namespaces the demo set', () => {
    expect(adminSettingKey('cloning')).toBe('feature.cloning');
    expect(demoSettingKey('cloning')).toBe('feature.demo.cloning');
  });
});

describe('resolveFeature', () => {
  const grantable = 'cloning';
  const adminOnly = 'projects';

  it('gives an admin the admin toggle, ignoring the demo one', () => {
    expect(resolveFeature({ key: grantable, role: 'admin', adminOn: true, demoOn: false })).toBe(true);
    expect(resolveFeature({ key: grantable, role: 'owner', adminOn: false, demoOn: true })).toBe(false);
  });

  it('gives a member the demo toggle, ignoring the admin one', () => {
    expect(resolveFeature({ key: grantable, role: 'member', adminOn: false, demoOn: true })).toBe(true);
    expect(resolveFeature({ key: grantable, role: 'member', adminOn: true, demoOn: false })).toBe(false);
  });

  it('never grants an admin-only feature to a member, even if a demo row exists', () => {
    expect(resolveFeature({ key: adminOnly, role: 'member', adminOn: true, demoOn: true })).toBe(false);
  });

  it('treats an anonymous caller as a member', () => {
    expect(resolveFeature({ key: grantable, role: undefined, adminOn: true, demoOn: false })).toBe(false);
    expect(resolveFeature({ key: grantable, role: undefined, adminOn: false, demoOn: true })).toBe(true);
  });

  it('denies unknown keys outright', () => {
    expect(resolveFeature({ key: 'notAFeature', role: 'owner', adminOn: true, demoOn: true })).toBe(false);
  });
});

describe('DB-backed lookups', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    __setDbForTesting(db);
    const set = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    set.run('feature.cloning', 'true');        // admin: on
    set.run('feature.demo.cloning', 'false');  // demo: off
    set.run('feature.adminer', 'false');       // admin: off
    set.run('feature.demo.adminer', 'true');   // demo: on
    set.run('feature.projects', 'true');       // admin-only, on
  });

  afterEach(() => { __setDbForTesting(null); db.close(); });

  it('reads the admin namespace for an admin', () => {
    expect(isFeatureEnabled('cloning', 'admin')).toBe(true);
    expect(isFeatureEnabled('adminer', 'owner')).toBe(false);
  });

  it('reads the demo namespace for a member', () => {
    expect(isFeatureEnabled('cloning', 'member')).toBe(false);
    expect(isFeatureEnabled('adminer', 'member')).toBe(true);
  });

  it('withholds admin-only features from members regardless of rows', () => {
    expect(isFeatureEnabled('projects', 'admin')).toBe(true);
    expect(isFeatureEnabled('projects', 'member')).toBe(false);
  });

  it('treats a missing row as off', () => {
    expect(isFeatureEnabled('snapshots', 'admin')).toBe(false);
    expect(isFeatureEnabled('snapshots', 'member')).toBe(false);
  });

  it('builds an effective map covering all features for an admin', () => {
    const map = effectiveFeatures('admin');
    expect(Object.keys(map).length).toBe(17);
    expect(map.cloning).toBe(true);
    expect(map.projects).toBe(true);
  });

  it('builds an effective map where members see no admin-only features', () => {
    const map = effectiveFeatures('member');
    expect(map.adminer).toBe(true);
    expect(map.cloning).toBe(false);
    expect(map.projects).toBe(false);
    expect(map.siteSync).toBe(false);
  });
});
