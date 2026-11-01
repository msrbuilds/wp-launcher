import crypto from 'crypto';
import { getDb } from '../utils/db';
import { ValidationError } from '../utils/errors';
import { isAcceptableRedirectUri } from './redirects';

export interface OAuthClient {
  client_id: string;
  kind: 'cimd' | 'dcr';
  client_name: string;
  logo_uri: string | null;
  redirect_uris: string[];
}

export type CimdFetcher = (url: string) => Promise<OAuthClient & { cacheSeconds: number }>;

interface ClientRow {
  client_id: string;
  kind: 'cimd' | 'dcr';
  client_name: string;
  logo_uri: string | null;
  redirect_uris: string;
  metadata_expires_at: string | null;
}

const NAME_MAX = 100;

/** Self-asserted by the client, so it is display text only: no control characters, bounded. */
export function sanitizeClientName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Unnamed app';
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, NAME_MAX);
  return cleaned || 'Unnamed app';
}

export function sanitizeLogoUri(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    return new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

export function validateRedirectUris(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every((u) => typeof u === 'string')) {
    throw new ValidationError('redirect_uris must be a non-empty list of URLs');
  }
  for (const uri of raw as string[]) {
    if (!isAcceptableRedirectUri(uri)) throw new ValidationError(`Unacceptable redirect URI: ${uri}`);
  }
  return raw as string[];
}

function toClient(row: ClientRow): OAuthClient {
  return {
    client_id: row.client_id,
    kind: row.kind,
    client_name: row.client_name,
    logo_uri: row.logo_uri,
    redirect_uris: JSON.parse(row.redirect_uris) as string[],
  };
}

export function registerDcrClient(meta: unknown): OAuthClient {
  const m = (meta && typeof meta === 'object' ? meta : {}) as Record<string, unknown>;
  const authMethod = m.token_endpoint_auth_method;
  if (authMethod !== undefined && authMethod !== 'none') {
    throw new ValidationError('Only public clients are supported (token endpoint auth method "none")');
  }
  if (m.grant_types !== undefined) {
    const allowed = ['authorization_code', 'refresh_token'];
    if (!Array.isArray(m.grant_types) || !m.grant_types.every((g) => allowed.includes(g as string))) {
      throw new ValidationError('Unsupported grant type; only authorization_code and refresh_token are allowed');
    }
  }
  const redirectUris = validateRedirectUris(m.redirect_uris);
  const client: OAuthClient = {
    client_id: `dcr_${crypto.randomBytes(16).toString('hex')}`,
    kind: 'dcr',
    client_name: sanitizeClientName(m.client_name),
    logo_uri: sanitizeLogoUri(m.logo_uri),
    redirect_uris: redirectUris,
  };
  getDb()
    .prepare('INSERT INTO oauth_clients (client_id, kind, client_name, logo_uri, redirect_uris) VALUES (?, ?, ?, ?, ?)')
    .run(client.client_id, client.kind, client.client_name, client.logo_uri, JSON.stringify(client.redirect_uris));
  return client;
}

export function getStoredClient(clientId: string): OAuthClient | undefined {
  const row = getDb().prepare('SELECT * FROM oauth_clients WHERE client_id = ?').get(clientId) as ClientRow | undefined;
  return row ? toClient(row) : undefined;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

let defaultFetchCimd: CimdFetcher = async () => {
  throw new Error('Client ID metadata documents are not available');
};

/** Lets the CIMD module install itself as the default fetcher without a circular import. */
export function setDefaultCimdFetcher(fetcher: CimdFetcher): void {
  defaultFetchCimd = fetcher;
}

/**
 * Looks a client up by id. An https URL is a Client ID Metadata Document: the
 * cached row is used while fresh, otherwise the document is fetched again.
 * Anything else must be a client registered through DCR.
 */
export async function resolveClient(clientId: string, deps: { fetchCimd?: CimdFetcher } = {}): Promise<OAuthClient | null> {
  const db = getDb();
  if (!isHttpsUrl(clientId)) {
    const stored = getStoredClient(clientId);
    return stored && stored.kind === 'dcr' ? stored : null;
  }

  const cached = db
    .prepare("SELECT * FROM oauth_clients WHERE client_id = ? AND kind = 'cimd' AND metadata_expires_at > datetime('now')")
    .get(clientId) as ClientRow | undefined;
  if (cached) return toClient(cached);

  let fetched: OAuthClient & { cacheSeconds: number };
  try {
    fetched = await (deps.fetchCimd ?? defaultFetchCimd)(clientId);
  } catch {
    return null;
  }
  const client: OAuthClient = {
    client_id: clientId,
    kind: 'cimd',
    client_name: sanitizeClientName(fetched.client_name),
    logo_uri: sanitizeLogoUri(fetched.logo_uri),
    redirect_uris: fetched.redirect_uris,
  };
  db.prepare(`
    INSERT INTO oauth_clients (client_id, kind, client_name, logo_uri, redirect_uris, metadata_fetched_at, metadata_expires_at)
    VALUES (?, 'cimd', ?, ?, ?, datetime('now'), datetime('now', ?))
    ON CONFLICT(client_id) DO UPDATE SET
      client_name = excluded.client_name, logo_uri = excluded.logo_uri, redirect_uris = excluded.redirect_uris,
      metadata_fetched_at = excluded.metadata_fetched_at, metadata_expires_at = excluded.metadata_expires_at
  `).run(clientId, client.client_name, client.logo_uri, JSON.stringify(client.redirect_uris), `+${Math.floor(fetched.cacheSeconds)} seconds`);
  return client;
}

export function markAuthorized(clientId: string): void {
  getDb().prepare("UPDATE oauth_clients SET last_authorized_at = datetime('now') WHERE client_id = ?").run(clientId);
}

/** DCR registration is open, so registrations nobody ever authorised are cleared after a day. */
export function pruneUnauthorizedClients(): number {
  return getDb()
    .prepare("DELETE FROM oauth_clients WHERE kind = 'dcr' AND last_authorized_at IS NULL AND created_at < datetime('now','-24 hours')")
    .run().changes;
}
