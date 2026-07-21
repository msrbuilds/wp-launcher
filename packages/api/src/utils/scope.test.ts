import { describe, it, expect } from 'vitest';
import { seesAllRows, scopeClause } from './scope';

describe('scope', () => {
  it('lets owners and admins see every row', () => {
    expect(seesAllRows('owner')).toBe(true);
    expect(seesAllRows('admin')).toBe(true);
  });

  it('limits members to their own rows', () => {
    expect(seesAllRows('member')).toBe(false);
    expect(seesAllRows(undefined)).toBe(false);
  });

  it('produces an empty clause for privileged roles', () => {
    expect(scopeClause('owner', 'u1')).toEqual({ sql: '', params: [] });
  });

  it('produces a user filter for members', () => {
    expect(scopeClause('member', 'u1')).toEqual({ sql: 'user_id = ?', params: ['u1'] });
  });

  it('matches nothing when a member has no id', () => {
    const clause = scopeClause('member', undefined);
    expect(clause.sql).toBe('1 = 0');
    expect(clause.params).toEqual([]);
  });
});
