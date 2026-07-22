import { describe, it, expect } from 'vitest';
import { THEME_STORAGE_KEY, isThemeChoice, resolveTheme, nextTheme } from './theme';

describe('isThemeChoice', () => {
  it('accepts the three valid choices', () => {
    expect(isThemeChoice('light')).toBe(true);
    expect(isThemeChoice('dark')).toBe(true);
    expect(isThemeChoice('system')).toBe(true);
  });

  it('rejects anything else, including junk from localStorage', () => {
    expect(isThemeChoice('blue')).toBe(false);
    expect(isThemeChoice('')).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('returns an explicit choice unchanged, whatever the system says', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system preference when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('nextTheme', () => {
  it('cycles light to dark to system and back', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    expect(nextTheme('system')).toBe('light');
  });
});

describe('THEME_STORAGE_KEY', () => {
  it('matches the key the no-flash script in index.html reads', () => {
    expect(THEME_STORAGE_KEY).toBe('wpl-theme');
  });
});
