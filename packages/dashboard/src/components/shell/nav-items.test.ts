import { describe, it, expect } from 'vitest';
import { buildNavGroups } from './nav-items';

const allFeatures = {
  projects: true,
  productivityMonitor: true,
  healthMonitoring: true,
  siteSync: true,
};

describe('buildNavGroups', () => {
  it('always shows the panel group', () => {
    const groups = buildNavGroups({}, 'member');
    const panel = groups.find((g) => g.label === 'Panel');
    expect(panel?.items.map((i) => i.to)).toEqual(['/', '/sites', '/sites/new', '/blueprints']);
  });

  it('hides the clients group unless the projects feature is on', () => {
    expect(buildNavGroups({}, 'owner').find((g) => g.label === 'Clients')).toBeUndefined();
    expect(buildNavGroups(allFeatures, 'owner').find((g) => g.label === 'Clients')).toBeDefined();
  });

  it('hides productivity unless its feature is on', () => {
    const groups = buildNavGroups({ healthMonitoring: true }, 'owner');
    const insights = groups.find((g) => g.label === 'Insights');
    expect(insights?.items.some((i) => i.to === '/productivity')).toBe(false);
  });

  it('hides the settings group from members', () => {
    expect(buildNavGroups(allFeatures, 'member').find((g) => g.label === 'Settings')).toBeUndefined();
    expect(buildNavGroups(allFeatures, 'admin').find((g) => g.label === 'Settings')).toBeDefined();
    expect(buildNavGroups(allFeatures, 'owner').find((g) => g.label === 'Settings')).toBeDefined();
  });

  it('drops a group entirely when every item in it is hidden', () => {
    // A member with no features sees nothing in Insights: monitoring and
    // productivity are flag-gated, and analytics is admin-only.
    const groups = buildNavGroups({}, 'member');
    expect(groups.find((g) => g.label === 'Insights')).toBeUndefined();
    expect(groups.find((g) => g.label === 'Sync')).toBeUndefined();
  });

  it('keeps Insights for an admin even with no features, because analytics is not flagged', () => {
    const insights = buildNavGroups({}, 'owner').find((g) => g.label === 'Insights');
    expect(insights?.items.map((i) => i.to)).toEqual(['/analytics']);
  });

  it('gives every item a stable key and an icon', () => {
    for (const group of buildNavGroups(allFeatures, 'owner')) {
      for (const item of group.items) {
        expect(item.to.startsWith('/')).toBe(true);
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.icon).toBeTruthy();
      }
    }
  });
});
