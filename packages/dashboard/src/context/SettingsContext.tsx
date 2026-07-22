import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiFetch } from '../utils/api';
import { readableForeground } from '../lib/color';

export interface FeatureFlags {
  cloning: boolean;
  snapshots: boolean;
  templates: boolean;
  customDomains: boolean;
  phpConfig: boolean;
  siteExtend: boolean;
  sitePassword: boolean;
  exportZip: boolean;
  webhooks: boolean;
  healthMonitoring: boolean;
  scheduledLaunch: boolean;
  collaborativeSites: boolean;
  adminer: boolean;
  publicSharing: boolean;
  siteSync: boolean;
  projects: boolean;
  productivityMonitor: boolean;
}

export interface Branding {
  siteTitle: string;
  logoUrl: string;
  cardLayout: 'full' | 'compact';
}

export interface ColorPalette {
  primaryDark: string;
  accent: string;
  grey: string;
  textMuted: string;
  textLight: string;
  border: string;
  bgSurface: string;
}

const DEFAULT_COLORS: ColorPalette = {
  primaryDark: '#14213d',
  accent: '#fb8500',
  grey: '#e5e5e5',
  textMuted: '#6b7280',
  textLight: '#9ca3af',
  border: '#e5e5e5',
  bgSurface: '#f5f5f5',
};

const DEFAULT_FEATURES: FeatureFlags = {
  cloning: false,
  snapshots: false,
  templates: false,
  customDomains: false,
  phpConfig: false,
  siteExtend: false,
  sitePassword: false,
  exportZip: false,
  webhooks: false,
  healthMonitoring: false,
  scheduledLaunch: false,
  collaborativeSites: false,
  adminer: false,
  publicSharing: false,
  siteSync: false,
  projects: false,
  productivityMonitor: false,
};

const DEFAULT_BRANDING: Branding = {
  siteTitle: 'WP Launcher',
  logoUrl: '',
  cardLayout: 'full',
};

interface Settings {
  cardLayout: 'full' | 'compact';
  baseDomain: string;
  features: FeatureFlags;
  branding: Branding;
  colors: ColorPalette;
  sitesHostPath: string;
  setupRequired: boolean;
  smtpConfigured: boolean;
  version: string;
  loading: boolean;
  error: string;
  refresh: () => void;
}

const SettingsContext = createContext<Settings>({
  cardLayout: 'full',
  baseDomain: 'localhost',
  features: DEFAULT_FEATURES,
  branding: DEFAULT_BRANDING,
  colors: DEFAULT_COLORS,
  sitesHostPath: '',
  setupRequired: false,
  smtpConfigured: false,
  version: '',
  loading: true,
  error: '',
  refresh: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Omit<Settings, 'refresh'>>({
      cardLayout: 'full',
    baseDomain: 'localhost',
    features: DEFAULT_FEATURES,
    branding: DEFAULT_BRANDING,
    colors: DEFAULT_COLORS,
    sitesHostPath: '',
    setupRequired: false,
  smtpConfigured: false,
    version: '',
    loading: true,
    error: '',
  });

  const fetchSettings = useCallback(() => {
    Promise.all([
      apiFetch('/api/settings').then((r) => r.json()),
      apiFetch('/api/version').then((r) => r.json()).catch(() => ({ version: '' })),
    ])
      .then(([data, versionData]) => {
        const branding = {
          ...DEFAULT_BRANDING,
          ...(data.branding || {}),
        };
        const colors = { ...DEFAULT_COLORS, ...(data.colors || {}) };
        // Apply color palette as CSS custom properties
        const root = document.documentElement;
        // Only the accent is admin-configurable now; every other colour comes
        // from the light/dark token sets in styles/theme.css.
        root.style.setProperty('--primary', colors.accent);
        root.style.setProperty('--ring', colors.accent);
        root.style.setProperty('--primary-foreground', readableForeground(colors.accent));
        // --orange is the accent legacy pages use; the rest of the legacy
        // variables are defined per-theme in styles/theme.css. Setting them
        // inline here would win over the .dark block and break dark mode.
        root.style.setProperty('--orange', colors.accent);
        setSettings({
          cardLayout: branding.cardLayout || data.cardLayout || 'full',
          baseDomain: data.baseDomain || 'localhost',
          features: { ...DEFAULT_FEATURES, ...(data.features || {}) },
          branding,
          colors,
          sitesHostPath: data.sitesHostPath || '',
          setupRequired: !!data.setupRequired,
          smtpConfigured: !!data.smtpConfigured,
          version: versionData.version || '',
          loading: false,
          error: '',
        });
      })
      .catch(() => {
        setSettings((prev) => ({ ...prev, loading: false, error: 'Failed to load settings' }));
      });
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <SettingsContext.Provider value={{ ...settings, refresh: fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export function useFeatures(): FeatureFlags {
  return useContext(SettingsContext).features;
}

export function useBranding(): Branding {
  return useContext(SettingsContext).branding;
}
