import { describe, expect, it } from 'vitest';
import { isAcceptableRedirectUri, redirectUriMatches } from './redirects';

describe('redirect URI rules', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback',
    'http://127.0.0.1:33418/callback',
    'http://localhost:6274/cb',
    'http://[::1]:9000/cb',
  ])('accepts %s', (uri) => {
    expect(isAcceptableRedirectUri(uri)).toBe(true);
  });

  it.each([
    'http://evil.example/cb',
    'https://x.example/cb#frag',
    'javascript:alert(1)',
    'custom-scheme://cb',
    'not a url',
    'http://localhost.evil.example/cb',
  ])('rejects %s', (uri) => {
    expect(isAcceptableRedirectUri(uri)).toBe(false);
  });
});

describe('redirectUriMatches', () => {
  it('matches non-loopback URIs exactly', () => {
    expect(redirectUriMatches(['https://claude.ai/cb'], 'https://claude.ai/cb')).toBe(true);
    expect(redirectUriMatches(['https://claude.ai/cb'], 'https://claude.ai:8443/cb')).toBe(false);
    expect(redirectUriMatches(['https://claude.ai/cb'], 'https://claude.ai/cb2')).toBe(false);
  });

  it('ignores the port on http loopback URIs (RFC 8252 §7.3)', () => {
    expect(redirectUriMatches(['http://127.0.0.1/callback'], 'http://127.0.0.1:54321/callback')).toBe(true);
    expect(redirectUriMatches(['http://localhost:3000/cb'], 'http://localhost:61000/cb')).toBe(true);
  });

  it('still requires the same loopback host, path and query', () => {
    expect(redirectUriMatches(['http://127.0.0.1/callback'], 'http://localhost:54321/callback')).toBe(false);
    expect(redirectUriMatches(['http://127.0.0.1/callback'], 'http://127.0.0.1:54321/other')).toBe(false);
    expect(redirectUriMatches(['http://127.0.0.1/cb?a=1'], 'http://127.0.0.1:5/cb?a=2')).toBe(false);
    expect(redirectUriMatches(['http://127.0.0.1/cb'], 'https://127.0.0.1:5/cb')).toBe(false);
  });
});
