import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Settings {
  appMode: 'local' | 'agency';
  cardLayout: 'full' | 'compact';
  baseDomain: string;
  loading: boolean;
  error: string;
}

const SettingsContext = createContext<Settings>({
  appMode: 'agency',
  cardLayout: 'full',
  baseDomain: 'localhost',
  loading: true,
  error: '',
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>({
    appMode: 'agency',
    cardLayout: 'full',
    baseDomain: 'localhost',
    loading: true,
    error: '',
  });

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        setSettings({
          appMode: data.appMode || 'agency',
          cardLayout: data.cardLayout || 'full',
          baseDomain: data.baseDomain || 'localhost',
          loading: false,
          error: '',
        });
      })
      .catch(() => {
        setSettings((prev) => ({ ...prev, loading: false, error: 'Failed to load settings' }));
      });
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export function useIsLocalMode() {
  return useContext(SettingsContext).appMode === 'local';
}
