import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { expectedDbIdentifiers, isSweepableSiteContainer } from './cleanup.service';
// Compare against the real derivation rather than a hardcoded hash, so the
// test cannot drift from the implementation.
import { siteDbIdentifier } from '../utils/dbIdentifier';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'a@b.c')").run();
});
afterEach(() => { __setDbForTesting(null); db.close(); });

function seed(id: string, subdomain: string, status: string) {
  db.prepare(
    `INSERT INTO sites (id, subdomain, product_id, user_id, status, expires_at)
     VALUES (?, ?, 'demo', 'u1', ?, '2099-01-01T00:00:00.000Z')`,
  ).run(id, subdomain, status);
}

describe('expectedDbIdentifiers', () => {
  it('keeps running sites', () => {
    seed('a', 'alpha-site', 'running');
    expect(expectedDbIdentifiers()).toContain(siteDbIdentifier('alpha-site'));
  });

  it('keeps sites that are still being created', () => {
    // Their database exists before their container does; a sweep driven from
    // containers would delete it mid-launch.
    seed('b', 'beta-site', 'creating');
    expect(expectedDbIdentifiers()).toContain(siteDbIdentifier('beta-site'));
  });

  it('does not keep deleted sites', () => {
    seed('c', 'gone-site-1', 'expired');
    expect(expectedDbIdentifiers()).not.toContain(siteDbIdentifier('gone-site-1'));
  });

  it('reports failure rather than returning a partial list', () => {
    // The caller must be able to tell "no sites" from "could not ask".
    db.prepare('DROP TABLE sites').run();
    expect(expectedDbIdentifiers()).toBeNull();
  });
});

describe('isSweepableSiteContainer', () => {
  it('sweeps ordinary site containers', () => {
    expect(isSweepableSiteContainer({
      'wp-launcher.managed': 'true',
      'wp-launcher.site-id': 'alpha-site',
    })).toBe(true);
  });

  it('never sweeps a shared database engine', () => {
    // The engines are managed containers that are not sites, so the orphan
    // rule would remove them — taking every site database with them.
    expect(isSweepableSiteContainer({
      'wp-launcher.managed': 'true',
      'wp-launcher.site-id': 'alpha-site',
      'wp-launcher.role': 'shared-db',
    })).toBe(false);
  });

  it('ignores containers with no site at all', () => {
    expect(isSweepableSiteContainer({ 'wp-launcher.managed': 'true' })).toBe(false);
    expect(isSweepableSiteContainer(undefined)).toBe(false);
  });
});

describe('siteDbIdentifier (API copy)', () => {
  it('matches the provisioner’s implementation', () => {
    // packages/provisioner/src/shared-db.ts is the source of truth and asserts
    // this same golden value. If the two ever diverge, the sweep would send a
    // keep-list the provisioner does not recognise and drop live databases.
    expect(siteDbIdentifier('golden-star-579af1')).toBe('wp_golden_star_579af1_eb1b');
  });
});
