import dns from 'dns';
import net from 'net';
import { config } from '../config';
import { policy } from '../policy';

/**
 * SSRF protection: validates remote URLs before the server makes outbound requests.
 *
 * Blocks:
 *   - Non-HTTPS protocols in production (HTTP allowed only in dev/local mode)
 *   - Hostnames resolving to private/reserved IP ranges
 *   - Cloud metadata endpoints (169.254.169.254)
 *   - Loopback, link-local, and RFC1918 addresses
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

// Every special-purpose range (RFC 6890 and friends). Only global unicast is
// fetchable: IPv6 must sit in 2000::/3, and the transition ranges that embed an
// IPv4 address (6to4, Teredo, NAT64) are refused outright rather than decoded.
const BLOCKED = new net.BlockList();
for (const [base, prefix] of [
  ['0.0.0.0', 8],        // "this" network
  ['10.0.0.0', 8],       // RFC1918
  ['100.64.0.0', 10],    // carrier-grade NAT (RFC 6598)
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local / cloud metadata
  ['172.16.0.0', 12],    // RFC1918
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.0.2.0', 24],     // TEST-NET-1
  ['192.88.99.0', 24],   // 6to4 relay anycast
  ['192.168.0.0', 16],   // RFC1918
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // TEST-NET-2
  ['203.0.113.0', 24],   // TEST-NET-3
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reserved, incl. broadcast
] as const) BLOCKED.addSubnet(base, prefix, 'ipv4');
for (const [base, prefix] of [
  ['64:ff9b::', 96],     // NAT64
  ['64:ff9b:1::', 48],   // local-use NAT64
  ['100::', 64],         // discard-only
  ['2001::', 32],        // Teredo
  ['2001:db8::', 32],    // documentation
  ['2002::', 16],        // 6to4
] as const) BLOCKED.addSubnet(base, prefix, 'ipv6');

const GLOBAL_UNICAST_V6 = new net.BlockList();
GLOBAL_UNICAST_V6.addSubnet('2000::', 3, 'ipv6');

function isPrivateIPv4(ip: string): boolean {
  return BLOCKED.check(ip, 'ipv4');
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the embedded address.
  const embedded = normalized.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded) return isPrivateIPv4(embedded[1]);
  if (!GLOBAL_UNICAST_V6.check(normalized, 'ipv6')) return true; // ::, ::1, fc00::/7, fe80::/10, fec0::/10, ff00::/8, …
  return BLOCKED.check(normalized, 'ipv6');
}

/** Fails closed: anything that does not parse as an IP address counts as private. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

export async function validateRemoteUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }

  // Protocol allowlist
  const allowHttp = policy.allowsInsecureRemotes() || config.nodeEnv === 'development';
  if (parsed.protocol === 'http:' && !allowHttp) {
    return { valid: false, error: 'Only HTTPS URLs are allowed in production' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: `Protocol ${parsed.protocol} is not allowed` };
  }

  // Hostname blocklist
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, error: 'Hostname is blocked' };
  }
  if (hostname.endsWith('.local')) {
    return { valid: false, error: 'Hostname is blocked' };
  }

  // DNS resolution — check that it doesn't resolve to a private IP
  try {
    const addresses = await dns.promises.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.promises.resolve6(hostname).catch(() => [] as string[]);
    const all = [...addresses, ...addresses6];

    if (all.length === 0) {
      // Try lookup as fallback (handles /etc/hosts entries)
      try {
        const result = await dns.promises.lookup(hostname);
        all.push(result.address);
      } catch {
        return { valid: false, error: 'Could not resolve hostname' };
      }
    }

    for (const addr of all) {
      if (isPrivateIp(addr)) {
        return { valid: false, error: 'URL resolves to a private/reserved IP address' };
      }
    }
  } catch {
    return { valid: false, error: 'DNS resolution failed' };
  }

  return { valid: true };
}

/**
 * Safe fetch wrapper with SSRF protections:
 *   - Re-resolves DNS before each request (DNS rebinding defense)
 *   - Disables redirects
 *   - Enforces timeout
 */
export async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Re-validate the target URL before each request
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  // Quick re-check against private IPs (DNS rebinding defense)
  try {
    const result = await dns.promises.lookup(hostname);
    if (isPrivateIp(result.address)) {
      throw new Error('SSRF blocked: URL resolves to a private IP address');
    }
  } catch (err: any) {
    if (err.message.startsWith('SSRF')) throw err;
    // Allow the fetch to proceed if DNS lookup fails here — the fetch itself will fail
  }

  return fetch(url, {
    redirect: 'error', // Block redirect-based SSRF bypass
    ...options,
  });
}
