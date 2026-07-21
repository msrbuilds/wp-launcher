import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import { requireRole, ROLE_RANK } from './requireRole';
import type { AuthRequest } from './userAuth';

function mockRes() {
  const res = {} as Response & { statusCode?: number; payload?: unknown };
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((body: unknown) => {
    res.payload = body;
    return res;
  });
  return res;
}

describe('requireRole', () => {
  it('ranks owner above admin above member', () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.member);
  });

  it('allows a role that meets the minimum', () => {
    const next = vi.fn();
    requireRole('admin')({ userRole: 'admin' } as AuthRequest, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows a role that exceeds the minimum', () => {
    const next = vi.fn();
    requireRole('admin')({ userRole: 'owner' } as AuthRequest, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a role below the minimum with 403', () => {
    const next = vi.fn();
    const res = mockRes();
    requireRole('admin')({ userRole: 'member' } as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('rejects an unauthenticated request with 401', () => {
    const next = vi.fn();
    const res = mockRes();
    requireRole('member')({} as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('treats an unknown role as the lowest rank', () => {
    const next = vi.fn();
    const res = mockRes();
    requireRole('member')({ userRole: 'wat' } as AuthRequest, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
