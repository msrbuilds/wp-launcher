import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('accepts a same-origin relative path with its query', () => {
    expect(safeNext('/oauth/authorize?client_id=x&state=y')).toBe('/oauth/authorize?client_id=x&state=y');
    expect(safeNext('/')).toBe('/');
  });

  it.each([null, '', '//evil.com', 'https://evil.com', '/\\evil.com', '\\\\evil.com', 'javascript:alert(1)', 'oauth/authorize', '/foo\nbar', '/%0d%0aSet-Cookie'])(
    'rejects %j', (value) => {
      expect(safeNext(value as string | null)).toBeNull();
    },
  );
});
