import { describe, it, expect } from 'vitest';
import { generatePassword, PASSWORD_ALPHABET } from './generate-password';
import { evaluatePassword } from './password-strength';

describe('generatePassword', () => {
  it('defaults to 20 characters', () => {
    expect(generatePassword()).toHaveLength(20);
  });

  it('honours a requested length', () => {
    expect(generatePassword(32)).toHaveLength(32);
  });

  it('refuses a length too short to hold every character class', () => {
    expect(() => generatePassword(3)).toThrow();
  });

  it('uses only the alphabet', () => {
    const allowed = new Set(PASSWORD_ALPHABET);
    for (let i = 0; i < 200; i++) {
      for (const ch of generatePassword()) expect(allowed.has(ch)).toBe(true);
    }
  });

  it('always contains a lowercase letter, an uppercase letter, a digit and a symbol', () => {
    for (let i = 0; i < 500; i++) {
      const pw = generatePassword(12);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it('scores as strong on the panel\'s own meter', () => {
    const r = evaluatePassword(generatePassword());
    expect(r.ok).toBe(true);
    expect(r.score).toBe(4);
  });

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generatePassword()));
    expect(seen.size).toBe(1000);
  });

  // Quotes, backslashes, `$` and backticks are left out: the password travels as
  // a container env var into a shell-quoted wp-cli argument, and people paste it
  // into terminals. Nothing in the alphabet needs escaping in either place.
  it('leaves out characters that need escaping in a shell or a URL', () => {
    expect(PASSWORD_ALPHABET).not.toMatch(/["'`\\$ &?/]/);
  });
});
