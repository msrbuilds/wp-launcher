import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import {
  THEME_STORAGE_KEY,
  isThemeChoice,
  resolveTheme,
  nextTheme,
  type ThemeChoice,
  type ResolvedTheme,
} from '../lib/theme';

interface ThemeContextValue {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  choice: 'system',
  resolved: 'light',
  setTheme: () => {},
  cycleTheme: () => {},
});

function readStoredChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStoredChoice);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  // Track the OS preference so `system` stays live rather than snapshotting at mount.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(choice, systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage disabled — the choice still applies for this session */
    }
  }, []);

  const cycleTheme = useCallback(() => setTheme(nextTheme(choice)), [choice, setTheme]);

  return (
    <ThemeContext.Provider value={{ choice, resolved, setTheme, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
