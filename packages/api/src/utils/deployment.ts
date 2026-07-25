import { config } from '../config';

/**
 * Where this install lives, as far as clients outside the Docker network are
 * concerned. Demo-site browser JS and editor extensions need a reachable URL for
 * the API; the internal `http://api:3737` address they used to be handed is not
 * routable from a browser, and deriving one by stripping the subdomain off a
 * site URL breaks for custom domains. These helpers resolve it from config once
 * so callers never guess.
 */

/** The port the API listens on directly, used when nothing fronts it. */
const API_PORT = 3737;

/**
 * True for loopback, RFC1918 private, and mDNS hostnames — the shapes a
 * developer machine or LAN install takes, as opposed to a public deployment.
 */
export function isLocalHostname(hostname: string): boolean {
  const h = (hostname || '').trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1') return true;
  if (h.endsWith('.local')) return true;

  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 127) return true;                        // 127.0.0.0/8 loopback
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
  }
  return false;
}

/**
 * Build the browser-reachable API base URL from PUBLIC_URL, falling back to
 * BASE_DOMAIN. A local install gets the API's own port appended because the
 * dashboard and API are separate origins there; a public domain is left alone
 * because Traefik fronts both on one origin.
 */
export function buildPublicApiBaseUrl(publicUrl: string, baseDomain: string): string {
  let raw = (publicUrl || '').trim();
  if (!raw) raw = baseDomain || 'localhost';
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `http://${baseDomain || 'localhost'}`;
  }

  if (isLocalHostname(url.hostname) && !url.port) {
    url.port = String(API_PORT);
  }

  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}`;
}

/** The browser-reachable API base URL for this install. */
export function publicApiBaseUrl(): string {
  return buildPublicApiBaseUrl(config.publicUrl, config.baseDomain);
}

/** True when this install is a developer/LAN deployment rather than a public one. */
export function isLocalDeployment(): boolean {
  const base = publicApiBaseUrl();
  try {
    return isLocalHostname(new URL(base).hostname);
  } catch {
    return true;
  }
}
