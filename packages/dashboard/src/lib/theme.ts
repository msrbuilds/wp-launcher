export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/**
 * Also hardcoded in the no-flash script in index.html. That script runs before
 * any module loads, so it cannot import this constant — the test asserts the
 * two stay in step.
 */
export const THEME_STORAGE_KEY = 'wpl-theme';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === 'system') return systemPrefersDark ? 'dark' : 'light';
  return choice;
}

export function nextTheme(choice: ThemeChoice): ThemeChoice {
  if (choice === 'light') return 'dark';
  if (choice === 'dark') return 'system';
  return 'light';
}
