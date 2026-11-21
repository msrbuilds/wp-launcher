import crypto from 'crypto';
import { getDb } from '../utils/db';

/**
 * Per-site heartbeat tokens (GitHub #13).
 *
 * The wp-admin mu-plugin posts heartbeats from the visitor's browser, so
 * whatever credential it holds is readable by the site's owner. It used to hold
 * the install-wide heartbeat secret, which let any tenant act for every site
 * and every editor. Each site now gets a token of its own, passed to the
 * container in the same WP_HEARTBEAT_SECRET env var, so the mu-plugin and the
 * image are unchanged. A token can only ingest, and only as its own site: the
 * route overwrites every field that says whose heartbeat it is.
 *
 * Only a SHA-256 hash is stored. The token reaches the container once, at
 * creation; recreating a container (the bind-mount upgrade) copies its env.
 */

const PREFIX = 'wplhb_';

function hash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Mint the site's token, replacing any earlier one. Returns the plaintext once. */
export function mintSiteHeartbeatToken(siteId: string): string {
  const token = PREFIX + crypto.randomBytes(32).toString('base64url');
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM site_heartbeat_tokens WHERE site_id = ?').run(siteId);
    db.prepare('INSERT INTO site_heartbeat_tokens (token_hash, site_id) VALUES (?, ?)').run(hash(token), siteId);
  })();
  return token;
}

/** The running site a token belongs to, or null. A stopped or deleted site's token is dead. */
export function resolveSiteHeartbeatToken(token: unknown): { siteId: string; subdomain: string } | null {
  if (typeof token !== 'string' || !token.startsWith(PREFIX) || token.length <= PREFIX.length) return null;
  const row = getDb().prepare(`
    SELECT s.id AS siteId, s.subdomain AS subdomain
    FROM site_heartbeat_tokens t
    JOIN sites s ON s.id = t.site_id
    WHERE t.token_hash = ? AND s.status = 'running'
  `).get(hash(token)) as { siteId: string; subdomain: string } | undefined;
  return row ?? null;
}
