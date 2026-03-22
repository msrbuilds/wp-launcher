import { useState, useEffect, useRef } from 'react';
import { useSettings, ColorPalette } from '../../context/SettingsContext';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';

const DEFAULT_COLORS: ColorPalette = {
  primaryDark: '#14213d',
  accent: '#fb8500',
  grey: '#e5e5e5',
  textMuted: '#6b7280',
  textLight: '#9ca3af',
  border: '#e5e5e5',
  bgSurface: '#f5f5f5',
};

const COLOR_META: { key: keyof ColorPalette; label: string; description: string; cssVar: string }[] = [
  { key: 'primaryDark', label: 'Primary Dark', description: 'Header, sidebar, dark backgrounds', cssVar: '--prussian-blue' },
  { key: 'accent', label: 'Accent', description: 'Buttons, links, active states', cssVar: '--orange' },
  { key: 'grey', label: 'Grey', description: 'Subtle backgrounds, dividers', cssVar: '--grey' },
  { key: 'textMuted', label: 'Text Muted', description: 'Secondary text, labels', cssVar: '--text-muted' },
  { key: 'textLight', label: 'Text Light', description: 'Hints, placeholders', cssVar: '--text-light' },
  { key: 'border', label: 'Border', description: 'Card borders, separators', cssVar: '--border' },
  { key: 'bgSurface', label: 'Surface', description: 'Card backgrounds, panels', cssVar: '--bg-surface' },
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
  { id: 'general', label: 'General', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'colors', label: 'Color Palette', icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
  { id: 'layout', label: 'Layout', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
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

  if (loading) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="br-header">
        <h3 className="br-title">Site Branding</h3>
        <p className="br-subtitle">
          Customize the dashboard appearance — logo, identity, colors, and layout.
        </p>
      </div>

      {/* Tab bar */}
      <div className="br-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`br-tab-btn ${activeTab === tab.id ? 'br-tab-btn--active' : 'br-tab-btn--inactive'}`}
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'general' && (
        <div className="card">
          {/* Logo */}
          <div className="br-logo-section">
            <label className="br-label">Logo</label>
            <div className="br-logo-row">
              <div className="br-logo-preview">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="br-logo-img" />
                ) : (
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="var(--text-light)" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 3h18a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 19.5v-15A1.5 1.5 0 0 1 3 3Z" />
                  </svg>
                )}
              </div>
              <div className="br-logo-actions">
                <div className="br-logo-buttons">
                  <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <><span className="spinner spinner-sm" /> Uploading...</> : 'Upload Logo'}
                  </button>
                  {logoUrl && (
                    <button className="btn btn-danger-outline btn-sm" onClick={handleRemoveLogo} disabled={uploading}>Remove</button>
                  )}
                </div>
                <span className="br-logo-hint">PNG, JPG, WebP, or GIF. Max 2MB. Square, at least 128x128px.</span>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleLogoUpload} className="br-hidden" />
            </div>
          </div>

          {/* Site Title */}
          <div>
            <label className="br-label--title">Site Title</label>
            <input
              type="text"
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              placeholder="WP Launcher"
              maxLength={100}
              className="br-site-title-input"
            />
            <p className="br-field-hint">Displayed in the header navigation bar.</p>
          </div>
        </div>
      )}

      {activeTab === 'colors' && (
        <div className="card">
          <div className="br-colors-header">
            <div>
              <h4 className="br-colors-title">Color Palette</h4>
              <p className="br-colors-desc">
                Customize the color scheme across the entire dashboard.
              </p>
            </div>
            <button
              className="btn btn-sm br-reset-btn"
              onClick={() => setColors(DEFAULT_COLORS)}
            >
              Reset to Defaults
            </button>
          </div>

          {/* Preset palettes */}
          <div className="br-presets-grid">
            {PRESETS.map((preset) => {
              const isActive = Object.keys(preset.colors).every(
                (k) => colors[k as keyof ColorPalette] === preset.colors[k as keyof ColorPalette]
              );
              return (
                <button
                  key={preset.name}
                  onClick={() => setColors(preset.colors)}
                  className={`br-preset-btn ${isActive ? 'br-preset-btn--active' : 'br-preset-btn--inactive'}`}
                >
                  <div className="br-preset-swatches">
                    <div className="br-preset-swatch" style={{ background: preset.colors.primaryDark }} />
                    <div className="br-preset-swatch" style={{ background: preset.colors.accent }} />
                    <div className="br-preset-swatch" style={{ background: preset.colors.textMuted }} />
                    <div className="br-preset-swatch" style={{ background: preset.colors.bgSurface }} />
                  </div>
                  <span className={`br-preset-name ${isActive ? 'br-preset-name--active' : 'br-preset-name--inactive'}`}>
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Color preview bar */}
          <div className="br-color-bar">
            {COLOR_META.map(({ key }) => (
              <div key={key} className="br-color-bar-segment" style={{ background: colors[key] }} title={key} />
            ))}
          </div>

          {/* Color grid */}
          <div className="br-color-grid">
            {COLOR_META.map(({ key, label, description }) => (
              <div key={key} className="br-color-item">
                <label className="br-color-picker-label">
                  <div className="br-color-swatch" style={{ background: colors[key] }} />
                  <input
                    type="color"
                    value={colors[key]}
                    onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="br-color-input-hidden"
                  />
                </label>
                <div className="br-color-info">
                  <div className="br-color-label">{label}</div>
                  <div className="br-color-description">{description}</div>
                </div>
                <input
                  type="text"
                  value={colors[key]}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColors((prev) => ({ ...prev, [key]: v }));
                  }}
                  maxLength={7}
                  className="br-color-hex-input"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'layout' && (
        <div className="card">
          <h4 className="br-layout-title">Product Card Layout</h4>
          <p className="br-layout-desc">
            Controls how products appear on the launch page.
          </p>
          <div className="br-layout-options">
            <label
              className="br-layout-option"
              style={{
                border: `2px solid ${cardLayout === 'full' ? 'var(--orange)' : 'var(--border)'}`,
                background: cardLayout === 'full' ? '#fff8f0' : '#fff',
              }}
            >
              <input type="radio" name="cardLayout" value="full" checked={cardLayout === 'full'} onChange={() => setCardLayout('full')} className="br-layout-radio" />
              <svg width="48" height="40" fill="none" viewBox="0 0 48 40" stroke={cardLayout === 'full' ? 'var(--orange)' : 'var(--text-light)'} strokeWidth="1.5">
                <rect x="1" y="1" width="20" height="38" rx="1" />
                <rect x="27" y="1" width="20" height="38" rx="1" />
                <rect x="3" y="3" width="16" height="14" rx="0.5" fill={cardLayout === 'full' ? '#fde8c8' : '#f1f5f9'} stroke="none" />
                <rect x="29" y="3" width="16" height="14" rx="0.5" fill={cardLayout === 'full' ? '#fde8c8' : '#f1f5f9'} stroke="none" />
                <line x1="3" y1="21" x2="19" y2="21" strokeWidth="1" />
                <line x1="3" y1="25" x2="14" y2="25" strokeWidth="1" />
                <line x1="29" y1="21" x2="45" y2="21" strokeWidth="1" />
                <line x1="29" y1="25" x2="40" y2="25" strokeWidth="1" />
              </svg>
              <span className={`br-layout-label ${cardLayout === 'full' ? 'br-layout-label--active' : 'br-layout-label--muted'}`}>Full Cards</span>
            </label>
            <label
              className="br-layout-option"
              style={{
                border: `2px solid ${cardLayout === 'compact' ? 'var(--orange)' : 'var(--border)'}`,
                background: cardLayout === 'compact' ? '#fff8f0' : '#fff',
              }}
            >
              <input type="radio" name="cardLayout" value="compact" checked={cardLayout === 'compact'} onChange={() => setCardLayout('compact')} className="br-layout-radio" />
              <svg width="48" height="40" fill="none" viewBox="0 0 48 40" stroke={cardLayout === 'compact' ? 'var(--orange)' : 'var(--text-light)'} strokeWidth="1.5">
                <rect x="1" y="1" width="46" height="11" rx="1" />
                <rect x="1" y="15" width="46" height="11" rx="1" />
                <rect x="1" y="29" width="46" height="11" rx="1" />
                <rect x="3" y="3" width="7" height="7" rx="0.5" fill={cardLayout === 'compact' ? '#fde8c8' : '#f1f5f9'} stroke="none" />
                <rect x="3" y="17" width="7" height="7" rx="0.5" fill={cardLayout === 'compact' ? '#fde8c8' : '#f1f5f9'} stroke="none" />
                <rect x="3" y="31" width="7" height="7" rx="0.5" fill={cardLayout === 'compact' ? '#fde8c8' : '#f1f5f9'} stroke="none" />
                <line x1="14" y1="6" x2="38" y2="6" strokeWidth="1" />
                <line x1="14" y1="20" x2="38" y2="20" strokeWidth="1" />
                <line x1="14" y1="34" x2="38" y2="34" strokeWidth="1" />
              </svg>
              <span className={`br-layout-label ${cardLayout === 'compact' ? 'br-layout-label--active' : 'br-layout-label--muted'}`}>Compact List</span>
            </label>
          </div>
        </div>
      )}

      {/* Save bar — always visible */}
      <div className="br-save-bar">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><span className="spinner" /> Saving...</> : 'Save Changes'}
        </button>
        {msg && (
          <span className={msg.startsWith('Failed') || msg.startsWith('File') ? 'br-msg--error' : 'br-msg--success'}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
