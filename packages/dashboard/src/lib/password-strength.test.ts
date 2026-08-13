import { describe, it, expect } from 'vitest';
import { evaluatePassword } from './password-strength';

describe('evaluatePassword', () => {
  it('reports nothing for an empty password', () => {
    const r = evaluatePassword('');
    expect(r.ok).toBe(false);
    expect(r.label).toBe('');
  });

  it('rejects a password below the default minimum', () => {
    const r = evaluatePassword('Ab3$xy');
    expect(r.ok).toBe(false);
    expect(r.label).toBe('Too short');
  });

  it('accepts a varied password at the default minimum', () => {
    const r = evaluatePassword('Tr0ub4dor&3');
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(2);
  });

  it('caps common passwords regardless of length', () => {
    expect(evaluatePassword('password123').ok).toBe(false);
  });

  /**
   * The bug this guards: the setup page requires 12 characters, but the meter
   * used a hardcoded minimum of 8. An 11-character password therefore rendered
   * a green "Strong" while the submit button stayed disabled, with nothing
   * explaining why. The caller's minimum must drive both.
   */
  describe('caller-supplied minimum', () => {
    it('fails a password shorter than the requested minimum, however varied', () => {
      const r = evaluatePassword('Tr0ub4dor&3', 12); // 11 chars
      expect(r.ok).toBe(false);
      expect(r.label).toBe('Too short');
      expect(r.score).toBe(0);
    });

    it('passes once the requested minimum is met', () => {
      const r = evaluatePassword('Tr0ub4dor&37', 12); // 12 chars
      expect(r.ok).toBe(true);
      expect(r.label).toBe('Strong');
    });

    it('tells the user how many characters are still needed', () => {
      const r = evaluatePassword('Tr0ub4dor&3', 12);
      expect(r.suggestions.some((s) => s.includes('12'))).toBe(true);
    });

    it('defaults to 8 when no minimum is given, preserving existing callers', () => {
      expect(evaluatePassword('Tr0ub4dor').ok).toBe(true);
    });
  });
});
