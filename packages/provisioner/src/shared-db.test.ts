import { describe, it, expect } from 'vitest';
import {
  engineHost, engineImage, engineVolume, siteDbIdentifier,
  selectDatabasesToDrop, ENGINE_FLAGS,
} from './shared-db';

describe('engine metadata', () => {
  it('names a container, image and volume per engine', () => {
    expect(engineHost('mariadb')).toBe('wpl-db-mariadb');
    expect(engineHost('mysql')).toBe('wpl-db-mysql');
    expect(engineImage('mariadb')).toBe('mariadb:11');
    expect(engineImage('mysql')).toBe('mysql:8.4');
    expect(engineVolume('mariadb')).toBe('wpl-db-mariadb-data');
  });

  it('turns off the single largest memory consumer', () => {
    // performance_schema alone accounts for 200-400MB on MySQL 8.4.
    expect(ENGINE_FLAGS).toContain('--performance-schema=OFF');
  });
});

describe('siteDbIdentifier', () => {
  it('fits MySQL’s 32-character username limit even for the longest subdomain', () => {
    const longest = 'a'.repeat(63);
    expect(siteDbIdentifier(longest).length).toBeLessThanOrEqual(32);
  });

  it('keeps the subdomain readable at the front', () => {
    expect(siteDbIdentifier('golden-star-579af1')).toMatch(/^wp_golden_star_579af1_[0-9a-f]{4}$/);
  });

  it('distinguishes subdomains that share their first 20 characters', () => {
    const a = siteDbIdentifier('aaaaaaaaaaaaaaaaaaaaaa-one');
    const b = siteDbIdentifier('aaaaaaaaaaaaaaaaaaaaaa-two');
    expect(a).not.toBe(b);
  });

  it('emits only characters legal in an unquoted identifier', () => {
    expect(siteDbIdentifier('Has.Dots-And_Mixed')).toMatch(/^[a-z0-9_]+$/);
  });

  it('is stable for the same subdomain', () => {
    expect(siteDbIdentifier('warm-vale-214873')).toBe(siteDbIdentifier('warm-vale-214873'));
  });

  it('matches the API package’s copy, which drives the orphan sweep', () => {
    // packages/api/src/utils/dbIdentifier.ts asserts this same golden value.
    // The API cannot import this module (its Docker build copies only its own
    // src), so drift between the two is caught here instead: a divergence would
    // make the sweep drop live sites' databases.
    expect(siteDbIdentifier('golden-star-579af1')).toBe('wp_golden_star_579af1_eb1b');
  });
});

describe('selectDatabasesToDrop', () => {
  const system = ['mysql', 'information_schema', 'performance_schema', 'sys'];

  it('drops wp_ databases that no live site claims', () => {
    const all = [...system, 'wp_alpha_1111', 'wp_beta_2222'];
    expect(selectDatabasesToDrop(all, ['wp_alpha_1111'])).toEqual(['wp_beta_2222']);
  });

  it('never touches system databases', () => {
    expect(selectDatabasesToDrop(system, ['wp_alpha_1111'])).toEqual([]);
  });

  it('never touches databases outside our prefix', () => {
    const all = ['customer_crm', 'analytics', 'wp_beta_2222'];
    expect(selectDatabasesToDrop(all, [])).not.toContain('customer_crm');
  });

  it('selects nothing when the keep list is empty', () => {
    // A caller that failed to enumerate sites must not be able to wipe them.
    expect(selectDatabasesToDrop(['wp_alpha_1111', 'wp_beta_2222'], [])).toEqual([]);
  });
});
