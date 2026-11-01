/** What `GET /api/oauth/authorize/request` answers. */
export interface ConsentRequest {
  client: { name: string; logoUri: string | null; redirectHost: string; kind: string; unverified: boolean };
  requestedScopes: string[];
  offerableScopes: string[];
  scopeInfo: Record<string, { label: string; description: string; destructive: boolean }>;
  instance: { url: string };
}
export type ConsentResponse = ConsentRequest | { render: string } | { redirect: string };

export type ConsentView =
  | { kind: 'loading' }
  | { kind: 'login'; to: string }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'return'; to: string; host: string }
  | { kind: 'consent'; request: ConsentRequest };

const STAFF = new Set(['owner', 'admin']);

/**
 * Decides what the consent page shows. An error the server marks `render` is
 * shown here and never redirected: until the client and its redirect URI are
 * verified, sending the browser there would be an open redirect. Even after
 * verification the page only *offers* the way back: registration is open, so a
 * registered redirect URI is not a trusted one, and leaving the panel's origin
 * must be the user's click (RFC 9700 §4.11.2).
 */
export function consentView(input: { signedIn: boolean; role: string | undefined; response: ConsentResponse | null; path: string }): ConsentView {
  if (!input.signedIn) return { kind: 'login', to: `/login?next=${encodeURIComponent(input.path)}` };
  if (!STAFF.has(input.role ?? '')) return { kind: 'forbidden' };
  const r = input.response;
  if (!r) return { kind: 'loading' };
  if ('render' in r) return { kind: 'error', message: r.render };
  if ('redirect' in r) return { kind: 'return', to: r.redirect, host: hostOf(r.redirect) };
  return { kind: 'consent', request: r };
}

export function initialSelection(requested: string[], offerable: string[]): string[] {
  return requested.filter((s) => offerable.includes(s));
}

export function toggleScope(selected: string[], scope: string): string[] {
  return selected.includes(scope) ? selected.filter((s) => s !== scope) : [...selected, scope];
}

export function canApprove(selected: string[]): boolean {
  return selected.length > 0;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * The panel's CSP allows images only from its own origin, so a remote logo
 * would render as a broken image. Show a logo only when it would actually load.
 */
export function renderableLogo(logoUri: string | null, panelOrigin: string): string | null {
  if (!logoUri) return null;
  try {
    return new URL(logoUri).origin === panelOrigin ? logoUri : null;
  } catch {
    return null;
  }
}
