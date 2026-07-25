import { describe, it, expect } from 'vitest';
import {
  ADMIN_ONLY_FEATURES, GRANTABLE_FEATURES, ALL_FEATURES,
  isAdminRole, isAdminOnlyFeature, adminSettingKey, demoSettingKey, resolveFeature,
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
