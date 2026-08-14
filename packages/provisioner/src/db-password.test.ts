import { describe, it, expect } from 'vitest';
import { generateDbPassword } from './db-password';

describe('generateDbPassword', () => {
  it('returns a long, URL-safe string', () => {
    const pw = generateDbPassword();
    expect(pw.length).toBeGreaterThanOrEqual(32);
    expect(pw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('does not derive from the subdomain or a timestamp', () => {
    // The old scheme was `wp_${subdomain}_${Date.now().toString(36)}`, which
    // leaked the password to anyone who knew the site's public hostname.
    const pw = generateDbPassword();
    expect(pw).not.toContain('wp_');
    expect(pw).not.toContain(Date.now().toString(36).slice(0, 6));
  });

  it('differs between calls', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateDbPassword()));
    expect(seen.size).toBe(50);
  });
});
