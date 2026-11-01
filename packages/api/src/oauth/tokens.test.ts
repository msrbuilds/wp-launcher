import { describe, expect, it } from 'vitest';
import { hashToken, mintToken } from './tokens';

describe('opaque tokens', () => {
  it('prefixes access and refresh tokens so they are recognisable in logs', () => {
    expect(mintToken('access').raw).toMatch(/^wplmcp_at_[A-Za-z0-9_-]{43}$/);
    expect(mintToken('refresh').raw).toMatch(/^wplmcp_rt_[A-Za-z0-9_-]{43}$/);
  });

  it('gives codes no prefix', () => {
    expect(mintToken('code').raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never repeats', () => {
    expect(mintToken('access').raw).not.toBe(mintToken('access').raw);
  });

  it('stores only a sha256 hex hash that the raw value reproduces', () => {
    const minted = mintToken('access');
    expect(minted.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(minted.raw)).toBe(minted.hash);
    expect(minted.hash).not.toContain(minted.raw);
  });

  it('cannot be a panel JWT: no dots, so jwt.verify can never accept it', () => {
    expect(mintToken('access').raw).not.toContain('.');
  });
});
