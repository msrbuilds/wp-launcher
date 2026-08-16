import crypto from 'crypto';

export type SharedDbEngine = 'mysql' | 'mariadb';

/** Container name and DNS name are the same thing on a Docker network. */
export function engineHost(engine: SharedDbEngine): string {
  return `wpl-db-${engine}`;
}

export function engineImage(engine: SharedDbEngine): string {
  return engine === 'mysql' ? 'mysql:8.4' : 'mariadb:11';
}

export function engineVolume(engine: SharedDbEngine): string {
  return `wpl-db-${engine}-data`;
}

/**
 * The CLI client to invoke inside that engine's own container.
 *
 * MariaDB 11 ships `/usr/bin/mariadb` and **no `mysql` symlink** — verified
 * against the pinned image — so calling `mysql` there fails with "not found"
 * and no MariaDB site can be provisioned at all. The mysql image has only
 * `mysql`. Each engine gets its own name rather than relying on a
 * compatibility alias that one of them has already dropped.
 */
export function engineClient(engine: SharedDbEngine): string {
  return engine === 'mysql' ? 'mysql' : 'mariadb';
}

/**
 * Server flags sized for many small databases rather than one large one.
 *
 * Stock MySQL 8.4 costs ~500MB per instance, which is what made a sidecar per
 * site untenable. `performance_schema` is the largest single item; the rest
 * trims buffers that a demo site never fills.
 */
export const ENGINE_FLAGS: readonly string[] = [
  '--performance-schema=OFF',
  '--innodb-buffer-pool-size=64M',
  '--innodb-log-buffer-size=8M',
  '--max-connections=100',
  '--table-open-cache=128',
  '--table-definition-cache=128',
  '--tmp-table-size=8M',
  '--max-heap-table-size=8M',
];

const PREFIX = 'wp_';

/**
 * The database name AND user name for a site — deliberately the same string.
 *
 * MySQL caps user names at 32 characters while a subdomain may be 63, so the
 * subdomain cannot simply be embedded. The readable prefix keeps it
 * recognisable in Adminer; the hash suffix keeps subdomains that share their
 * first 20 characters distinct.
 */
export function siteDbIdentifier(subdomain: string): string {
  const safe = subdomain.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
  const hash = crypto.createHash('sha1').update(subdomain).digest('hex').slice(0, 4);
  return `${PREFIX}${safe}_${hash}`;
}

/**
 * Which databases the sweep may drop.
 *
 * Two guards, both load-bearing: only our own prefix is ever eligible, so an
 * operator's own databases and the server's system schemas cannot be selected;
 * and an empty `keep` list selects nothing, so a caller that failed to
 * enumerate its sites destroys nothing.
 */
export function selectDatabasesToDrop(all: string[], keep: string[]): string[] {
  if (keep.length === 0) return [];
  const kept = new Set(keep);
  return all.filter((name) => name.startsWith(PREFIX) && !kept.has(name));
}
