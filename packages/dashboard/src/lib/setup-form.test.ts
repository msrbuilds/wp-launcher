import { describe, expect, it } from 'vitest';
import { describeSetupFailure, insecureContextWarning, setupBlockers } from './setup-form';

const good = { email: 'owner@example.com', password: 'Tr0ub4dor&3-horse', confirm: 'Tr0ub4dor&3-horse', minLength: 12 };

// GitHub #15: "Create Owner Account does nothing". The button was disabled with
// no reason given, so these say exactly what is missing.
describe('setupBlockers', () => {
  it('is empty when the form can be submitted', () => {
    expect(setupBlockers(good)).toEqual([]);
  });

  it('asks for a valid email', () => {
    expect(setupBlockers({ ...good, email: '' })).toContain('Enter your email address');
    expect(setupBlockers({ ...good, email: 'not-an-email' })).toContain('Enter a valid email address');
  });

  it('counts down the characters still needed', () => {
    const r = setupBlockers({ ...good, password: 'Ab3$xyzQ9', confirm: 'Ab3$xyzQ9' });
    expect(r).toContain('Password needs 3 more characters (at least 12)');
  });

  it('says one more character in the singular', () => {
    expect(setupBlockers({ ...good, password: 'Ab3$xyzQ9wk', confirm: 'Ab3$xyzQ9wk' }))
      .toContain('Password needs 1 more character (at least 12)');
  });

  it('flags a long but weak password', () => {
    expect(setupBlockers({ ...good, password: 'aaaaaaaaaaaaaa', confirm: 'aaaaaaaaaaaaaa' }))
      .toContain('Choose a stronger password: mix upper and lower case, numbers and symbols');
  });

  it('asks for the confirmation, then for it to match', () => {
    expect(setupBlockers({ ...good, confirm: '' })).toContain('Confirm your password');
    expect(setupBlockers({ ...good, confirm: good.password + 'x' })).toContain("The two passwords don't match");
  });

  it('lists every blocker at once rather than one at a time', () => {
    expect(setupBlockers({ email: '', password: '', confirm: '', minLength: 12 })).toHaveLength(3);
  });
});

describe('describeSetupFailure', () => {
  const origin = 'http://203.0.113.10';

  it('passes through a plain server message', () => {
    expect(describeSetupFailure(400, { error: 'A valid email address is required' }, origin))
      .toBe('A valid email address is required');
  });

  it('turns a CSRF origin rejection into what to do', () => {
    const msg = describeSetupFailure(403, { error: 'CSRF validation failed: untrusted origin' }, origin);
    expect(msg).toContain(origin);
    expect(msg).toContain('PUBLIC_URL');
  });

  it('explains a setup that already happened', () => {
    expect(describeSetupFailure(409, { error: 'Setup has already been completed' }, origin)).toMatch(/sign in/i);
  });

  it('explains the rate limit', () => {
    expect(describeSetupFailure(429, null, origin)).toMatch(/too many attempts/i);
  });

  it('never shows a JSON parse error for a non-JSON reply', () => {
    const msg = describeSetupFailure(502, null, origin);
    expect(msg).toContain('502');
    expect(msg).not.toMatch(/JSON|token/i);
  });

  it('explains an unreachable API', () => {
    expect(describeSetupFailure(0, null, origin)).toMatch(/could not reach/i);
  });
});

describe('insecureContextWarning', () => {
  it('warns on plain HTTP to a real host', () => {
    expect(insecureContextWarning('http:', 'demo.example.com')).toMatch(/HTTPS/);
    expect(insecureContextWarning('http:', '203.0.113.10')).toMatch(/HTTPS/);
  });

  it('stays quiet on HTTPS and on local addresses', () => {
    expect(insecureContextWarning('https:', 'demo.example.com')).toBeNull();
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'panel.localhost']) {
      expect(insecureContextWarning('http:', host)).toBeNull();
    }
  });
});
