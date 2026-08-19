import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { generateClientToken, CLIENT_TOKEN_SCOPE, CLIENT_COOKIE } from './clientAuth';

// Spied so the tests can prove *where* a portal token is refused, not merely
// that it is. Without the scope guard, userAuth would look the id up, find
// nothing, and answer 401 anyway — so asserting the status alone cannot tell
// the guard apart from its absence. Asserting the lookup never happens can.
const getUserById = vi.fn(() => undefined);
vi.mock('../services/user.service', () => ({
  getUserById: (...args: unknown[]) => getUserById(...(args as [])),
}));

import { generateToken, userAuth, optionalUserAuth } from './userAuth';

describe('client token shape', () => {
  it('carries the client scope and both ids', () => {
    const decoded = jwt.verify(generateClientToken('cu-1', 'c-1'), config.jwtSecret) as Record<string, unknown>;
    expect(decoded.scope).toBe(CLIENT_TOKEN_SCOPE);
    expect(decoded.clientUserId).toBe('cu-1');
    expect(decoded.clientId).toBe('c-1');
  });

  it('carries no userId for staff middleware to trust', () => {
    // Staff middleware reads `userId`. A portal token must not supply one at
    // all, so no code path can mistake it for a staff session.
    const decoded = jwt.verify(generateClientToken('cu-1', 'c-1'), config.jwtSecret) as Record<string, unknown>;
    expect(decoded.userId).toBeUndefined();
  });

  it('uses a cookie name that cannot collide with the staff session', () => {
    expect(CLIENT_COOKIE).toBe('wpl_client_token');
    expect(CLIENT_COOKIE).not.toBe('wpl_token');
  });

  it('is distinguishable from a staff token by scope alone', () => {
    const staff = jwt.verify(generateToken('u-1', 'a@b.c', 'admin'), config.jwtSecret) as Record<string, unknown>;
    expect(staff.scope).toBeUndefined();
  });
});

function runMiddleware(mw: typeof userAuth, token: string) {
  const req = { headers: { authorization: `Bearer ${token}` }, cookies: {} } as any;
  let status = 0;
  const res = {
    status(code: number) { status = code; return this; },
    json() { return this; },
  } as any;
  let passed = false;
  mw(req, res, () => { passed = true; });
  return { status, passed, req };
}

describe('staff middleware refuses portal tokens', () => {
  beforeEach(() => { getUserById.mockClear(); });

  it('userAuth rejects a client-scoped token without consulting the user store', () => {
    // The guarantee this phase rests on. The status alone proves nothing —
    // an unguarded userAuth would look up an undefined id, find nothing and
    // answer 401 too. That it never reaches the lookup is what shows the
    // token was refused on its claim.
    const result = runMiddleware(userAuth, generateClientToken('cu-1', 'c-1'));
    expect(result.passed).toBe(false);
    expect(result.status).toBe(401);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('still consults the user store for a staff token', () => {
    // The counterpart: the guard must reject portal tokens specifically, not
    // short-circuit every request.
    runMiddleware(userAuth, generateToken('u-1', 'a@b.c', 'admin'));
    expect(getUserById).toHaveBeenCalledWith('u-1');
  });

  it('optionalUserAuth treats a client token as no token, not as a user', () => {
    const result = runMiddleware(optionalUserAuth as typeof userAuth, generateClientToken('cu-1', 'c-1'));
    expect(result.passed).toBe(true);
    expect(result.req.userId).toBeUndefined();
    expect(getUserById).not.toHaveBeenCalled();
  });
});
