import { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, LayoutGrid, Loader2, Palette, Settings } from 'lucide-react';
import { useSettings, ColorPalette } from '../../context/SettingsContext';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DEFAULT_COLORS: ColorPalette = {
  primaryDark: '#14213d',
  accent: '#fb8500',
  grey: '#e5e5e5',
  textMuted: '#6b7280',
  textLight: '#9ca3af',
  border: '#e5e5e5',
  bgSurface: '#f5f5f5',
};

/**
 * Only the accent remains configurable. Every other colour now comes from the
 * light/dark token sets in styles/theme.css, so exposing them would let an
 * admin produce combinations that are unreadable in one theme or the other.
 * The retired values stay in the settings table, simply unused.
 */
const COLOR_META: { key: keyof ColorPalette; label: string; description: string; cssVar: string }[] = [
  { key: 'accent', label: 'Accent colour', description: 'Buttons, links and focus rings. All other colours follow the light or dark theme.', cssVar: '--primary' },
];

const PRESETS: { name: string; colors: ColorPalette }[] = [
  {
    name: 'Default',
    colors: { primaryDark: '#14213d', accent: '#fb8500', grey: '#e5e5e5', textMuted: '#6b7280', textLight: '#9ca3af', border: '#e5e5e5', bgSurface: '#f5f5f5' },
  },
  {
    name: 'Ocean Blue',
    colors: { primaryDark: '#0f172a', accent: '#0ea5e9', grey: '#e2e8f0', textMuted: '#64748b', textLight: '#94a3b8', border: '#e2e8f0', bgSurface: '#f8fafc' },
  },
  {
    name: 'Forest',
    colors: { primaryDark: '#1a2e1a', accent: '#16a34a', grey: '#e2e8e2', textMuted: '#4b6b4b', textLight: '#86a886', border: '#d4e5d4', bgSurface: '#f5f8f5' },
  },
  {
    name: 'Royal Purple',
    colors: { primaryDark: '#1e1b3a', accent: '#8b5cf6', grey: '#e8e5f0', textMuted: '#6b6789', textLight: '#9b97b0', border: '#e5e2f0', bgSurface: '#f8f7fc' },
  },
  {
    name: 'Crimson',
    colors: { primaryDark: '#1c1917', accent: '#dc2626', grey: '#e7e5e4', textMuted: '#78716c', textLight: '#a8a29e', border: '#e7e5e4', bgSurface: '#fafaf9' },
  },
  {
    name: 'Sunset',
    colors: { primaryDark: '#2d1b2e', accent: '#f43f5e', grey: '#f0e4e8', textMuted: '#7c6275', textLight: '#a8919e', border: '#eadce2', bgSurface: '#fdf6f8' },
  },
  {
    name: 'Teal',
    colors: { primaryDark: '#0f2b2b', accent: '#14b8a6', grey: '#d6e8e5', textMuted: '#4a7c76', textLight: '#80aba5', border: '#cce4e0', bgSurface: '#f0faf8' },
  },
  {
    name: 'Slate',
    colors: { primaryDark: '#1e293b', accent: '#475569', grey: '#e2e8f0', textMuted: '#64748b', textLight: '#94a3b8', border: '#cbd5e1', bgSurface: '#f1f5f9' },
  },
  {
    name: 'Amber',
    colors: { primaryDark: '#292118', accent: '#d97706', grey: '#eee8df', textMuted: '#806848', textLight: '#a89478', border: '#e8ddd0', bgSurface: '#fdf8f0' },
  },
  {
    name: 'Midnight',
    colors: { primaryDark: '#020617', accent: '#6366f1', grey: '#e0e1eb', textMuted: '#5b5d7a', textLight: '#8c8ea8', border: '#dddeed', bgSurface: '#f5f5fc' },
  },
];

const TABS = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'colors', label: 'Color Palette', icon: Palette },
  { id: 'layout', label: 'Layout', icon: LayoutGrid },
] as const;

type TabId = typeof TABS[number]['id'];

export default function BrandingTab() {
  const headers = useAdminHeaders();
  const { refresh } = useSettings();
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [siteTitle, setSiteTitle] = useState('');
  const [cardLayout, setCardLayout] = useState<'full' | 'compact'>('full');
  const [logoUrl, setLogoUrl] = useState('');
  const [colors, setColors] = useState<ColorPalette>(DEFAULT_COLORS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch('/api/admin/branding', { headers })
      .then((r) => r.json())
      .then((data) => {
        setSiteTitle(data.siteTitle || 'WP Launcher');
        setCardLayout(data.cardLayout || 'full');
        setLogoUrl(data.logoUrl || '');
        setColors({ ...DEFAULT_COLORS, ...(data.colors || {}) });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const res = await apiFetch('/api/admin/branding', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteTitle, cardLayout, colors }),
      });
      if (res.ok) {
        setMsg('Branding updated');
        refresh();
        setTimeout(() => setMsg(''), 4000);
      } else {
        setMsg('Failed to save');
      }
    } catch {
      setMsg('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMsg('File too large (max 2MB)');
      return;
    }
    setUploading(true);
    setMsg('');
    try {
      const res = await apiFetch('/api/admin/branding/logo', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': file.type },
        body: file,
      });
      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.logoUrl + '?t=' + Date.now());
        setMsg('Logo uploaded');
        refresh();
        setTimeout(() => setMsg(''), 4000);
      } else {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }));
        setMsg(data.error || 'Upload failed');
      }
    } catch {
      setMsg('Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleRemoveLogo() {
    setUploading(true);
    try {
      const res = await apiFetch('/api/admin/branding/logo', {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        setLogoUrl('');
        setMsg('Logo removed');
        refresh();
        setTimeout(() => setMsg(''), 4000);
      }
    } catch {
      setMsg('Failed to remove logo');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">Site Branding</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize the dashboard appearance — logo, identity, colors, and layout.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList className="mb-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id}>
                <Icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="general">
          <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            {/* Logo */}
            <div className="mb-6">
              <Label className="mb-2">Logo</Label>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                      {uploading ? <><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</> : 'Upload Logo'}
                    </Button>
                    {logoUrl && (
                      <Button size="sm" variant="destructive" onClick={handleRemoveLogo} disabled={uploading}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    PNG, JPG, WebP, or GIF. Max 2MB. Square, at least 128x128px.
                  </span>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Site Title */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="branding-site-title">Site Title</Label>
              <Input
                id="branding-site-title"
                type="text"
                value={siteTitle}
                onChange={(e) => setSiteTitle(e.target.value)}
                placeholder="WP Launcher"
                maxLength={100}
                className="max-w-md"
              />
              <p className="text-xs text-muted-foreground">Displayed in the header navigation bar.</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="colors">
          <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold">Color Palette</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Customize the color scheme across the entire dashboard.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setColors(DEFAULT_COLORS)}>
                Reset to Defaults
              </Button>
            </div>

            {/* Preset palettes */}
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {PRESETS.map((preset) => {
                const isActive = Object.keys(preset.colors).every(
                  (k) => colors[k as keyof ColorPalette] === preset.colors[k as keyof ColorPalette]
                );
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setColors(preset.colors)}
                    className={cn(
                      'flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors',
                      isActive
                        ? 'border-primary bg-accent'
                        : 'border-border bg-card hover:bg-accent',
                    )}
                  >
                    <div className="flex gap-1">
                      {/* Preview swatches render admin-chosen preset colours (user data,
                          not design tokens), so the value must stay inline. */}
                      <div className="h-4 w-4 rounded-sm border border-border" style={{ background: preset.colors.primaryDark }} />
                      <div className="h-4 w-4 rounded-sm border border-border" style={{ background: preset.colors.accent }} />
                      <div className="h-4 w-4 rounded-sm border border-border" style={{ background: preset.colors.textMuted }} />
                      <div className="h-4 w-4 rounded-sm border border-border" style={{ background: preset.colors.bgSurface }} />
                    </div>
                    <span className={cn('text-xs', isActive ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                      {preset.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Color preview bar */}
            <div className="mb-5 flex h-8 overflow-hidden rounded-lg border border-border">
              {COLOR_META.map(({ key }) => (
                /* Live preview of the admin-chosen colour value (user data, not a token). */
                <div key={key} className="flex-1" style={{ background: colors[key] }} title={key} />
              ))}
            </div>

            {/* Color grid */}
            <div className="flex flex-col gap-3">
              {COLOR_META.map(({ key, label, description }) => (
                <div key={key} className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-4">
                  <label className="relative cursor-pointer">
                    {/* Swatch shows the currently selected colour (user data, not a token). */}
                    <div className="h-10 w-10 rounded-lg border border-border" style={{ background: colors[key] }} />
                    <input
                      type="color"
                      aria-label={label}
                      value={colors[key]}
                      onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{label}</div>
                    <div className="text-xs text-muted-foreground">{description}</div>
                  </div>
                  <Input
                    type="text"
                    aria-label={`${label} hex value`}
                    value={colors[key]}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColors((prev) => ({ ...prev, [key]: v }));
                    }}
                    maxLength={7}
                    className="w-28 font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="layout">
          <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <h4 className="text-sm font-semibold">Product Card Layout</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Controls how products appear on the launch page.
            </p>
            <div className="mt-4 flex flex-wrap gap-4">
              <label
                className={cn(
                  'flex w-44 cursor-pointer flex-col items-center gap-3 rounded-lg border-2 p-4 transition-colors',
                  cardLayout === 'full'
                    ? 'border-primary bg-accent text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                <input
                  type="radio"
                  name="cardLayout"
                  value="full"
                  checked={cardLayout === 'full'}
                  onChange={() => setCardLayout('full')}
                  className="sr-only"
                />
                <svg width="48" height="40" fill="none" viewBox="0 0 48 40" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="20" height="38" rx="1" />
                  <rect x="27" y="1" width="20" height="38" rx="1" />
                  <rect x="3" y="3" width="16" height="14" rx="0.5" fill="currentColor" fillOpacity="0.2" stroke="none" />
                  <rect x="29" y="3" width="16" height="14" rx="0.5" fill="currentColor" fillOpacity="0.2" stroke="none" />
                  <line x1="3" y1="21" x2="19" y2="21" strokeWidth="1" />
                  <line x1="3" y1="25" x2="14" y2="25" strokeWidth="1" />
                  <line x1="29" y1="21" x2="45" y2="21" strokeWidth="1" />
                  <line x1="29" y1="25" x2="40" y2="25" strokeWidth="1" />
                </svg>
                <span className={cn('text-sm', cardLayout === 'full' ? 'font-medium' : '')}>Full Cards</span>
              </label>
              <label
                className={cn(
                  'flex w-44 cursor-pointer flex-col items-center gap-3 rounded-lg border-2 p-4 transition-colors',
                  cardLayout === 'compact'
                    ? 'border-primary bg-accent text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent',
                )}
              >
                <input
                  type="radio"
                  name="cardLayout"
                  value="compact"
                  checked={cardLayout === 'compact'}
                  onChange={() => setCardLayout('compact')}
                  className="sr-only"
                />
                <svg width="48" height="40" fill="none" viewBox="0 0 48 40" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="46" height="11" rx="1" />
                  <rect x="1" y="15" width="46" height="11" rx="1" />
                  <rect x="1" y="29" width="46" height="11" rx="1" />
                  <rect x="3" y="3" width="7" height="7" rx="0.5" fill="currentColor" fillOpacity="0.2" stroke="none" />
                  <rect x="3" y="17" width="7" height="7" rx="0.5" fill="currentColor" fillOpacity="0.2" stroke="none" />
                  <rect x="3" y="31" width="7" height="7" rx="0.5" fill="currentColor" fillOpacity="0.2" stroke="none" />
                  <line x1="14" y1="6" x2="38" y2="6" strokeWidth="1" />
                  <line x1="14" y1="20" x2="38" y2="20" strokeWidth="1" />
                  <line x1="14" y1="34" x2="38" y2="34" strokeWidth="1" />
                </svg>
                <span className={cn('text-sm', cardLayout === 'compact' ? 'font-medium' : '')}>Compact List</span>
              </label>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Save bar — always visible */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Save Changes'}
        </Button>
        {msg && (
          <span
            className={cn(
              'text-sm',
              msg.startsWith('Failed') || msg.startsWith('File') ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
