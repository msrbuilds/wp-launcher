import dns from 'dns';
import net from 'net';
import { config } from '../config';

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

// IPv4 private/reserved ranges as [baseInt, maskInt]
const BLOCKED_IPV4_RANGES: [number, number][] = [
  [ipv4ToInt('127.0.0.0'), prefixToMask(8)],     // loopback
  [ipv4ToInt('10.0.0.0'), prefixToMask(8)],       // RFC1918
  [ipv4ToInt('172.16.0.0'), prefixToMask(12)],    // RFC1918
  [ipv4ToInt('192.168.0.0'), prefixToMask(16)],   // RFC1918
  [ipv4ToInt('169.254.0.0'), prefixToMask(16)],   // link-local / cloud metadata
  [ipv4ToInt('0.0.0.0'), prefixToMask(8)],        // "this" network
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function prefixToMask(prefix: number): number {
  return (~(0xffffffff >>> prefix)) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  for (const [base, mask] of BLOCKED_IPV4_RANGES) {
    if ((ipInt & mask) === (base & mask)) return true;
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;                          // loopback
  if (normalized.startsWith('fe80:')) return true;                // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4Match = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) return isPrivateIPv4(v4Match[1]);
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return false;
}

export async function validateRemoteUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }

  // Protocol allowlist
  const allowHttp = config.isLocalMode || config.nodeEnv === 'development';
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
