import { describe, expect, it } from 'vitest';
import { isAcceptableRedirectUri } from './redirects';

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
