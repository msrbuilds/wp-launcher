import crypto from 'crypto';

/**
 * The database and user name for a site on a shared engine.
 *
 * **Source of truth: `packages/provisioner/src/shared-db.ts`.** This is a
 * deliberate copy, not a shared module: the API's tsconfig has `rootDir: ./src`
 * and its Dockerfile copies only `packages/api/src`, so importing across
 * packages would break the image build rather than merely the typecheck.
 *
 * Both copies assert the same golden value in their own test suite
 * (`wp_golden_star_579af1_eb1b`), so a change to one fails the other's tests.
 * The API needs this only to build the keep-list for the orphan sweep — a
 * silent divergence would make the sweep drop live sites' databases.
 */
export function siteDbIdentifier(subdomain: string): string {
  const safe = subdomain.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
  const hash = crypto.createHash('sha1').update(subdomain).digest('hex').slice(0, 4);
  return `wp_${safe}_${hash}`;
}
