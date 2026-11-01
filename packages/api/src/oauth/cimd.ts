import dns from 'dns';
import https from 'https';
import { isPrivateIp } from '../utils/ssrf';
import { ValidationError } from '../utils/errors';
import { isAcceptableRedirectUri } from './redirects';
import { sanitizeClientName, sanitizeLogoUri, setDefaultCimdFetcher, type OAuthClient } from './clients.service';

/**
 * Client ID Metadata Documents: the client's id *is* an https URL, and this
 * server fetches it. That URL is chosen by a stranger and fetched from inside
 * the Docker network, so the fetch is locked down: https on 443 only, every
 * resolved address must be public, the connection goes to the address that
 * was checked (no second lookup for DNS rebinding to swap), no redirects, a
 * short timeout and a small body cap.
 */

export interface CimdDeps {
  resolve(host: string): Promise<string[]>;
  request(url: URL, address: string, opts: { timeoutMs: number; maxBytes: number }): Promise<{ status: number; headers: Record<string, string>; body: string }>;
}

const TIMEOUT_MS = 5000;
const MAX_BYTES = 65_536;

const defaultDeps: CimdDeps = {
  async resolve(host) {
    const results = await dns.promises.lookup(host, { all: true }).catch(() => []);
    return results.map((r) => r.address);
  },
  request(url, address, { timeoutMs, maxBytes }) {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: url.hostname,
          servername: url.hostname,
          port: 443,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers: { accept: 'application/json' },
          // Pin the connection to the validated address.
          lookup: (_host, _opts, cb) => cb(null, address, address.includes(':') ? 6 : 4),
          timeout: timeoutMs,
        },
        (res) => {
          let size = 0;
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              req.destroy(new ValidationError('Client metadata document is too large'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') headers[k] = v;
            resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString('utf8') });
          });
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new ValidationError('Client metadata fetch timed out')));
      req.on('error', reject);
      req.end();
    });
  },
};

function cacheSecondsFrom(cacheControl: string | undefined): number {
  const match = cacheControl?.match(/max-age=(\d+)/i);
  if (!match) return 3600;
  return Math.min(86_400, Math.max(300, parseInt(match[1], 10)));
}

export async function fetchClientMetadata(clientIdUrl: string, deps: CimdDeps = defaultDeps): Promise<OAuthClient & { cacheSeconds: number }> {
  let url: URL;
  try {
    url = new URL(clientIdUrl);
  } catch {
    throw new ValidationError('Client id is not a URL');
  }
  if (url.protocol !== 'https:') throw new ValidationError('Client metadata must be served over https');
  if (url.port && url.port !== '443') throw new ValidationError('Client metadata must be served on port 443');
  if (url.pathname === '/' || url.pathname === '') throw new ValidationError('Client metadata URL must have a path');

  const addresses = await deps.resolve(url.hostname);
  if (addresses.length === 0) throw new ValidationError('Could not resolve the client metadata host');
  if (addresses.some((a) => isPrivateIp(a))) throw new ValidationError('Client metadata host resolves to a private or reserved address');

  const res = await deps.request(url, addresses[0], { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES });
  if (res.status >= 300 && res.status < 400) throw new ValidationError('Client metadata redirects are not followed');
  if (res.status !== 200) throw new ValidationError(`Client metadata fetch returned status ${res.status}`);
  if (Buffer.byteLength(res.body) > MAX_BYTES) throw new ValidationError('Client metadata document is too large');
  if (!(res.headers['content-type'] ?? '').toLowerCase().includes('json')) throw new ValidationError('Client metadata must be JSON');

  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(res.body) as Record<string, unknown>;
  } catch {
    throw new ValidationError('Client metadata is not valid JSON');
  }
  if (doc.client_id !== clientIdUrl) throw new ValidationError('Client metadata client_id does not match its URL');
  const redirectUris = doc.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every((u) => typeof u === 'string' && isAcceptableRedirectUri(u))) {
    throw new ValidationError('Client metadata has missing or unacceptable redirect_uris');
  }

  return {
    client_id: clientIdUrl,
    kind: 'cimd',
    client_name: sanitizeClientName(doc.client_name),
    logo_uri: sanitizeLogoUri(doc.logo_uri),
    redirect_uris: redirectUris as string[],
    cacheSeconds: cacheSecondsFrom(res.headers['cache-control']),
  };
}

setDefaultCimdFetcher((url) => fetchClientMetadata(url));
