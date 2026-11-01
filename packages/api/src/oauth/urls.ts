import { config } from '../config';

/**
 * Canonical URLs for the OAuth authorisation server and the MCP resource.
 * Everything is derived from PUBLIC_URL's *origin*: a trailing slash, a path or
 * an uppercase host on the env var must not produce an issuer or resource that
 * differs from what clients compute, or every token request fails.
 */
export function issuer(publicUrl: string = config.publicUrl): string {
  return new URL(publicUrl).origin; // lowercases scheme/host, drops path and default port
}

export function mcpResourceUrl(publicUrl?: string): string {
  return `${issuer(publicUrl)}/api/mcp`;
}

/** RFC 8707 comparison: scheme and host case-insensitive, path exact. */
export function resourceMatches(candidate: string, publicUrl?: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (parsed.hash || parsed.search) return false;
  return `${parsed.origin}${parsed.pathname}` === mcpResourceUrl(publicUrl);
}

export function endpoints(publicUrl?: string) {
  const base = issuer(publicUrl);
  return {
    authorize: `${base}/oauth/authorize`,
    token: `${base}/api/oauth/token`,
    register: `${base}/api/oauth/register`,
    revoke: `${base}/api/oauth/revoke`,
    prm: `${base}/.well-known/oauth-protected-resource/api/mcp`,
    asMetadata: `${base}/.well-known/oauth-authorization-server`,
  };
}
