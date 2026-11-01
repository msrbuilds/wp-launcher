const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * OAuth 2.1 redirect rules: https anywhere, or plain http only to a loopback
 * host (desktop and CLI clients listen on an ephemeral local port). No
 * fragments, no custom schemes.
 */
export function isAcceptableRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.hash) return false;
  if (parsed.protocol === 'https:') return true;
  return parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname);
}
