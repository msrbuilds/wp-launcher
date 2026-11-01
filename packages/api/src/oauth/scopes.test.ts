import { describe, expect, it } from 'vitest';
import { parseScopeParam, READ_SCOPES, SCOPE_INFO, SCOPES, scopesOfferableTo } from './scopes';

describe('scopes', () => {
  it('lists exactly the seven scopes, reads first', () => {
    expect([...SCOPES]).toEqual(['sites:read', 'sites:write', 'crm:read', 'crm:write', 'invoices:write', 'admin:read', 'admin:write']);
    expect(READ_SCOPES).toEqual(['sites:read', 'crm:read']);
  });

  it('parses a space-separated list, dropping duplicates', () => {
    expect(parseScopeParam('sites:read crm:read sites:read')).toEqual(['sites:read', 'crm:read']);
  });

  it('refuses the whole list when any token is unknown', () => {
    expect(parseScopeParam('sites:read bogus')).toBeNull();
  });

  it('treats an empty or missing parameter as no scopes', () => {
    expect(parseScopeParam('')).toEqual([]);
    expect(parseScopeParam(undefined)).toEqual([]);
    expect(parseScopeParam('   ')).toEqual([]);
  });

  it('flags the scopes that can destroy or send things', () => {
    expect(SCOPE_INFO['sites:write'].destructive).toBe(true);
    expect(SCOPE_INFO['invoices:write'].destructive).toBe(true);
    expect(SCOPE_INFO['sites:read'].destructive).toBe(false);
  });

  it('offers every scope to staff and none to anyone else', () => {
    expect(scopesOfferableTo('owner')).toEqual([...SCOPES]);
    expect(scopesOfferableTo('admin')).toEqual([...SCOPES]);
    expect(scopesOfferableTo('member')).toEqual([]);
    expect(scopesOfferableTo('user')).toEqual([]);
  });
});
