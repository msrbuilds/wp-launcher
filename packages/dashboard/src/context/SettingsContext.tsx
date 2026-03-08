import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Settings {
  appMode: 'local' | 'agency';
  cardLayout: 'full' | 'compact';
  baseDomain: string;
  loading: boolean;
}

const SettingsContext = createContext<Settings>({
  appMode: 'agency',
  cardLayout: 'full',
  baseDomain: 'localhost',
  loading: true,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>({
    appMode: 'agency',
    cardLayout: 'full',
    baseDomain: 'localhost',
    loading: true,
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
        });
      })
      .catch(() => {
        setSettings((prev) => ({ ...prev, loading: false }));
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
