import dns from 'dns/promises';
import { getDb } from '../utils/db';
import { config } from '../config';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';
import { execWpCommands } from './docker.service';

const PROVISIONER_URL = process.env.PROVISIONER_URL || 'http://provisioner:4000';
const INTERNAL_KEY = process.env.PROVISIONER_INTERNAL_KEY || '';

async function provisionerFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(INTERNAL_KEY ? { 'x-internal-key': INTERNAL_KEY } : {}),
  };
  const res = await fetch(`${PROVISIONER_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown provisioner error' }));
    throw new Error((body as any).error || `Provisioner error: ${res.status}`);
  }
  return res;
}

// Validate domain format
function isValidDomain(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain) && domain.length <= 253;
}

// Build the original site URL from subdomain
function getOriginalSiteUrl(subdomain: string): string {
  const protocol = config.publicUrl.startsWith('https') ? 'https' : 'http';
  return `${protocol}://${subdomain}.${config.baseDomain}`;
}

// Update WordPress siteurl/home via wp-cli and do search-replace
async function updateWordPressUrls(containerId: string, oldUrl: string, newUrl: string): Promise<void> {
  const commands = [
    `wp option update siteurl '${newUrl}'`,
    `wp option update home '${newUrl}'`,
    `wp search-replace '${oldUrl}' '${newUrl}' --skip-columns=guid --skip-tables=wp_users`,
    `wp cache flush`,
  ];

  console.log(`[domain] Updating WordPress URLs: ${oldUrl} -> ${newUrl}`);
  const result = await execWpCommands(containerId, commands);

  // Log any failures but don't block — the Traefik config is already written
  for (const r of result.results) {
    if (r.exitCode !== 0) {
      console.warn(`[domain] wp-cli command failed: ${r.command} -> ${r.output}`);
    }
  }
}

export async function setCustomDomain(siteId: string, domain: string, userId?: string): Promise<{ domain: string; status: string }> {
  // Block in local mode — no DNS/TLS available
  if (config.appMode === 'local') {
    throw new ValidationError('Custom domains are not available in local mode');
  }

  const db = getDb();
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId) as any;
  if (!site) throw new NotFoundError('Site not found');
  if (userId && userId !== 'admin' && site.user_id !== userId) {
    throw new ForbiddenError('You do not own this site');
  }
  if (site.status !== 'running') {
    throw new ValidationError('Site must be running to set a custom domain');
  }
  if (!site.container_id) {
    throw new ValidationError('Site has no running container');
  }

  const cleanDomain = domain.trim().toLowerCase();
  if (!isValidDomain(cleanDomain)) {
    throw new ValidationError('Invalid domain format');
  }

  // Check domain isn't already used by another site
  const existing = db.prepare('SELECT id FROM sites WHERE custom_domain = ? AND id != ? AND status = ?').get(cleanDomain, siteId, 'running') as any;
  if (existing) {
    throw new ValidationError('This domain is already assigned to another site');
  }

  // Determine the protocol — use HTTPS if TLS is enabled
  const protocol = config.publicUrl.startsWith('https') ? 'https' : 'http';
  const newUrl = `${protocol}://${cleanDomain}`;
  const oldUrl = site.custom_domain
    ? `${protocol}://${site.custom_domain}`   // Replacing an existing custom domain
    : getOriginalSiteUrl(site.subdomain);      // First time — replacing subdomain URL

  // Write Traefik dynamic config via provisioner
  await provisionerFetch(`/custom-domains/${site.subdomain}`, {
    method: 'PUT',
    body: JSON.stringify({ domain: cleanDomain }),
  });

  // Update WordPress siteurl/home and search-replace in the database
  await updateWordPressUrls(site.container_id, oldUrl, newUrl);

  // Update DB
  db.prepare('UPDATE sites SET custom_domain = ? WHERE id = ?').run(cleanDomain, siteId);

  // Check DNS
  const dnsStatus = await checkDns(cleanDomain);

  return { domain: cleanDomain, status: dnsStatus };
}

export async function getCustomDomain(siteId: string, userId?: string): Promise<{ domain: string | null; status: string }> {
  if (!userId) throw new ForbiddenError('Authentication required');
  const db = getDb();
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId) as any;
  if (!site) throw new NotFoundError('Site not found');
  if (userId !== 'admin' && site.user_id !== userId) {
    throw new ForbiddenError('You do not own this site');
  }

  if (!site.custom_domain) {
    return { domain: null, status: 'none' };
  }

  const dnsStatus = await checkDns(site.custom_domain);
  return { domain: site.custom_domain, status: dnsStatus };
}

export async function removeCustomDomain(siteId: string, userId?: string): Promise<void> {
  const db = getDb();
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId) as any;
  if (!site) throw new NotFoundError('Site not found');
  if (userId && userId !== 'admin' && site.user_id !== userId) {
    throw new ForbiddenError('You do not own this site');
  }

  if (!site.custom_domain) return;

  // Revert WordPress URLs back to the original subdomain-based URL
  if (site.container_id && site.status === 'running') {
    const protocol = config.publicUrl.startsWith('https') ? 'https' : 'http';
    const customUrl = `${protocol}://${site.custom_domain}`;
    const originalUrl = getOriginalSiteUrl(site.subdomain);

    try {
      await updateWordPressUrls(site.container_id, customUrl, originalUrl);
    } catch (err: any) {
      console.warn(`[domain] Failed to revert WordPress URLs: ${err.message}`);
    }
  }

  // Remove Traefik dynamic config
  try {
    await provisionerFetch(`/custom-domains/${site.subdomain}`, {
      method: 'DELETE',
    });
  } catch {
    // Best-effort cleanup
  }

  db.prepare('UPDATE sites SET custom_domain = NULL WHERE id = ?').run(siteId);
}

// Resolve the server's own IP(s) from the baseDomain for A-record verification
async function getServerIps(): Promise<string[]> {
  try {
    return await dns.resolve4(config.baseDomain);
  } catch {
    return [];
  }
}

async function checkDns(domain: string): Promise<string> {
  // Check CNAME first (e.g. demo.client.com CNAME demo.example.com)
  try {
    const cnames = await dns.resolveCname(domain);
    if (cnames.some((c) => c.endsWith(config.baseDomain))) {
      return 'verified';
    }
  } catch {
    // No CNAME — check A record
  }

  // Check A record (e.g. client.com A 1.2.3.4 pointing to our server)
  try {
    const domainIps = await dns.resolve4(domain);
    const serverIps = await getServerIps();
    if (serverIps.length > 0 && domainIps.some((ip) => serverIps.includes(ip))) {
      return 'verified';
    }
    // Has A record but doesn't point to us
    if (domainIps.length > 0) {
      return 'pending';
    }
  } catch {
    // No A record either
  }

  return 'pending';
}

// Get DNS setup instructions for the UI
export async function getDnsInstructions(): Promise<{ baseDomain: string; serverIp: string | null; method: string; instructions: string[] }> {
  const serverIps = await getServerIps();
  const serverIp = serverIps.length > 0 ? serverIps[0] : null;
  const ipDisplay = serverIp || 'your server IP';

  return {
    baseDomain: config.baseDomain,
    serverIp,
    method: 'CNAME or A record',
    instructions: [
      `Option 1 (subdomains): Add a CNAME record pointing to ${config.baseDomain}`,
      `Option 2 (root/apex): Add an A record pointing to ${ipDisplay}`,
      `DNS changes can take up to 24-48 hours to propagate`,
    ],
  };
}
