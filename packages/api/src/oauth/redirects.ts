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

/**
 * Whether a requested redirect URI is one the client registered. Exact match,
 * except that for plain-http loopback URIs the port is ignored (RFC 8252 §7.3,
 * OAuth 2.1): native and CLI clients listen on an ephemeral port, which a
 * published client metadata document cannot list in advance.
 */
export function redirectUriMatches(registered: string[], candidate: string): boolean {
  if (registered.includes(candidate)) return true;
  let want: URL;
  try {
    want = new URL(candidate);
  } catch {
    return false;
  }
  if (want.protocol !== 'http:' || !LOOPBACK_HOSTS.has(want.hostname)) return false;
  return registered.some((uri) => {
    try {
      const have = new URL(uri);
      return have.protocol === 'http:' && have.hostname === want.hostname && have.pathname === want.pathname && have.search === want.search;
    } catch {
      return false;
    }
  });
}
