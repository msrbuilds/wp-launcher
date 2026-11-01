import { describe, expect, it } from 'vitest';
import { canApprove, consentView, initialSelection, renderableLogo, toggleScope } from './oauth-consent';

const okResponse = {
  client: { name: 'Claude', logoUri: null, redirectHost: 'claude.ai', kind: 'cimd', unverified: true },
  requestedScopes: ['sites:read'],
  offerableScopes: ['sites:read', 'sites:write', 'crm:read'],
  scopeInfo: {},
  instance: { url: 'https://panel.example.com' },
};

describe('consentView', () => {
  it('sends a signed-out visitor to login, carrying the full request back', () => {
    expect(consentView({ signedIn: false, role: undefined, response: null, path: '/oauth/authorize?client_id=x' }))
      .toEqual({ kind: 'login', to: '/login?next=%2Foauth%2Fauthorize%3Fclient_id%3Dx' });
  });

  it('tells a member that MCP is for administrators', () => {
    expect(consentView({ signedIn: true, role: 'member', response: okResponse, path: '/' })).toEqual({ kind: 'forbidden' });
  });

  it('renders an error, never a redirect, when the server says render', () => {
    expect(consentView({ signedIn: true, role: 'owner', response: { render: 'Unknown app' }, path: '/' })).toEqual({ kind: 'error', message: 'Unknown app' });
  });

  it('offers, never auto-follows, a redirect back to the app for an error after verification', () => {
    // Registration is open, so a registered redirect URI is not a trusted one:
    // leaving the panel's origin must be the user's click.
    expect(consentView({ signedIn: true, role: 'owner', response: { redirect: 'https://claude.ai/cb?error=invalid_scope' }, path: '/' }))
      .toEqual({ kind: 'return', to: 'https://claude.ai/cb?error=invalid_scope', host: 'claude.ai' });
  });

  it('shows the consent form otherwise', () => {
    expect(consentView({ signedIn: true, role: 'admin', response: okResponse, path: '/' })).toMatchObject({ kind: 'consent' });
  });

  it('waits while the request is loading', () => {
    expect(consentView({ signedIn: true, role: 'owner', response: null, path: '/' })).toEqual({ kind: 'loading' });
  });
});

describe('scope selection', () => {
  it('pre-ticks only requested scopes the user may grant', () => {
    expect(initialSelection(['sites:read', 'admin:write'], ['sites:read', 'sites:write'])).toEqual(['sites:read']);
  });

  it('toggles a scope on and off', () => {
    expect(toggleScope(['sites:read'], 'sites:write')).toEqual(['sites:read', 'sites:write']);
    expect(toggleScope(['sites:read', 'sites:write'], 'sites:read')).toEqual(['sites:write']);
  });

  it('cannot approve with nothing ticked', () => {
    expect(canApprove([])).toBe(false);
    expect(canApprove(['sites:read'])).toBe(true);
  });
});

describe('renderableLogo', () => {
  it('only renders a logo the panel CSP (img-src self) would actually load', () => {
    expect(renderableLogo('https://cdn.example/logo.png', 'https://panel.example.com')).toBeNull();
    expect(renderableLogo('https://panel.example.com/logo.png', 'https://panel.example.com')).toBe('https://panel.example.com/logo.png');
    expect(renderableLogo(null, 'https://panel.example.com')).toBeNull();
    expect(renderableLogo('not a url', 'https://panel.example.com')).toBeNull();
  });
});
