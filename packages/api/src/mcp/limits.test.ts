import { beforeEach, describe, expect, it } from 'vitest';
import { __resetLimitsForTesting, consumeGrantRequest, consumeWrite } from './limits';

beforeEach(() => __resetLimitsForTesting());

describe('limits', () => {
  it('allows 10 site writes per user per window, then refuses', () => {
    for (let i = 0; i < 10; i++) expect(consumeWrite('sites', 'u1')).toBe(true);
    expect(consumeWrite('sites', 'u1')).toBe(false);
    expect(consumeWrite('sites', 'u2')).toBe(true);
  });

  it('gives CRM and admin writes 60 each, separately', () => {
    for (let i = 0; i < 60; i++) expect(consumeWrite('crm', 'u1')).toBe(true);
    expect(consumeWrite('crm', 'u1')).toBe(false);
    expect(consumeWrite('admin', 'u1')).toBe(true);
  });

  it('allows 300 requests per grant per window', () => {
    for (let i = 0; i < 300; i++) expect(consumeGrantRequest('g1')).toBe(true);
    expect(consumeGrantRequest('g1')).toBe(false);
    expect(consumeGrantRequest('g2')).toBe(true);
  });
});
