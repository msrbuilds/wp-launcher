import { describe, it, expect } from 'vitest';
import { parseDestination, resolveSyncEnabled, DEFAULT_DESTINATION } from './productivity-destination';

describe('parseDestination', () => {
  it('accepts the three known values', () => {
    expect(parseDestination('auto')).toBe('auto');
    expect(parseDestination('local')).toBe('local');
    expect(parseDestination('cloud')).toBe('cloud');
  });

  it('falls back to the default for anything unrecognised', () => {
    expect(parseDestination('')).toBe(DEFAULT_DESTINATION);
    expect(parseDestination(undefined)).toBe(DEFAULT_DESTINATION);
    expect(parseDestination('nonsense')).toBe(DEFAULT_DESTINATION);
  });

  it('is case and whitespace tolerant', () => {
    expect(parseDestination(' LOCAL ')).toBe('local');
  });
});

describe('resolveSyncEnabled', () => {
  it('auto syncs only on a public deployment with a linked cloud', () => {
    expect(resolveSyncEnabled({ destination: 'auto', cloudLinked: true, isLocal: false })).toBe(true);
    expect(resolveSyncEnabled({ destination: 'auto', cloudLinked: true, isLocal: true })).toBe(false);
    expect(resolveSyncEnabled({ destination: 'auto', cloudLinked: false, isLocal: false })).toBe(false);
    expect(resolveSyncEnabled({ destination: 'auto', cloudLinked: false, isLocal: true })).toBe(false);
  });

  it('local never syncs, even on a public deployment with a linked cloud', () => {
    expect(resolveSyncEnabled({ destination: 'local', cloudLinked: true, isLocal: false })).toBe(false);
    expect(resolveSyncEnabled({ destination: 'local', cloudLinked: true, isLocal: true })).toBe(false);
  });

  it('cloud syncs whenever linked, including from a local machine', () => {
    expect(resolveSyncEnabled({ destination: 'cloud', cloudLinked: true, isLocal: true })).toBe(true);
    expect(resolveSyncEnabled({ destination: 'cloud', cloudLinked: true, isLocal: false })).toBe(true);
  });

  it('never syncs without a linked cloud account', () => {
    expect(resolveSyncEnabled({ destination: 'cloud', cloudLinked: false, isLocal: false })).toBe(false);
  });
});
