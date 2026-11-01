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
  | { kind: 'redirect'; to: string }
  | { kind: 'consent'; request: ConsentRequest };

const STAFF = new Set(['owner', 'admin']);

/**
 * Decides what the consent page shows. An error the server marks `render` is
 * shown here and never redirected: until the client and its redirect URI are
 * verified, sending the browser there would be an open redirect.
 */
export function consentView(input: { signedIn: boolean; role: string | undefined; response: ConsentResponse | null; path: string }): ConsentView {
  if (!input.signedIn) return { kind: 'login', to: `/login?next=${encodeURIComponent(input.path)}` };
  if (!STAFF.has(input.role ?? '')) return { kind: 'forbidden' };
  const r = input.response;
  if (!r) return { kind: 'loading' };
  if ('render' in r) return { kind: 'error', message: r.render };
  if ('redirect' in r) return { kind: 'redirect', to: r.redirect };
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
