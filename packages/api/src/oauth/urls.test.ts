import { describe, expect, it } from 'vitest';
import { endpoints, issuer, mcpResourceUrl, resourceMatches } from './urls';

describe('canonical OAuth URLs', () => {
  it('reduces PUBLIC_URL to a lowercase origin with no trailing slash', () => {
    expect(issuer('https://Panel.Example.com/')).toBe('https://panel.example.com');
  });

  it('drops any path on PUBLIC_URL', () => {
    expect(issuer('https://panel.example.com/sub/path')).toBe('https://panel.example.com');
  });

  it('keeps a non-default port', () => {
    expect(issuer('http://localhost:8080')).toBe('http://localhost:8080');
  });

  it('puts the MCP resource at /api/mcp', () => {
    expect(mcpResourceUrl('http://localhost')).toBe('http://localhost/api/mcp');
  });

  it('accepts a resource that differs only by scheme and host case', () => {
    expect(resourceMatches('HTTPS://PANEL.example.com/api/mcp', 'https://panel.example.com')).toBe(true);
  });

  it('refuses a trailing slash, another host, or garbage', () => {
    expect(resourceMatches('https://panel.example.com/api/mcp/', 'https://panel.example.com')).toBe(false);
    expect(resourceMatches('https://evil.example/api/mcp', 'https://panel.example.com')).toBe(false);
    expect(resourceMatches('not a url', 'https://panel.example.com')).toBe(false);
  });

  it('builds every endpoint from the issuer', () => {
    expect(endpoints('https://panel.example.com/')).toEqual({
      authorize: 'https://panel.example.com/oauth/authorize',
      token: 'https://panel.example.com/api/oauth/token',
      register: 'https://panel.example.com/api/oauth/register',
      revoke: 'https://panel.example.com/api/oauth/revoke',
      prm: 'https://panel.example.com/.well-known/oauth-protected-resource/api/mcp',
      asMetadata: 'https://panel.example.com/.well-known/oauth-authorization-server',
    });
  });
});

describe('scheme-less PUBLIC_URL', () => {
  it('assumes https for a public host and http for a local one, instead of throwing', () => {
    expect(issuer('panel.example.com')).toBe('https://panel.example.com');
    expect(issuer('localhost:8080')).toBe('http://localhost:8080');
    expect(mcpResourceUrl('panel.example.com/')).toBe('https://panel.example.com/api/mcp');
  });
});
