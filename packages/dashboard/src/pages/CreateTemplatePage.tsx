import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

interface PluginEntry {
  source: 'wordpress.org' | 'url' | 'local';
  slug?: string;
  url?: string;
  file?: File | null;
  filename?: string;
  activate: boolean;
}

interface ThemeEntry {
  source: 'wordpress.org' | 'url' | 'local';
  slug?: string;
  url?: string;
  file?: File | null;
  filename?: string;
  activate: boolean;
}

const DB_OPTIONS = [
  { label: 'SQLite (fastest)', value: 'sqlite' },
  { label: 'MySQL 8.4', value: 'mysql' },
  { label: 'MariaDB 11', value: 'mariadb' },
];

export default function CreateTemplatePage() {
  const { token } = useAuth();

  // Basic info
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [database, setDatabase] = useState('sqlite');

  // WordPress
  const [wpVersion, setWpVersion] = useState('6.9');

  // Plugins
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [removePlugins, setRemovePlugins] = useState('hello, akismet');

  // Themes
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [removeThemes, setRemoveThemes] = useState('');

  // Branding — image uploads
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [cardImagePreview, setCardImagePreview] = useState('');
  const [cardIconFile, setCardIconFile] = useState<File | null>(null);
  const [cardIconPreview, setCardIconPreview] = useState('');
  const cardImageRef = useRef<HTMLInputElement>(null);
  const cardIconRef = useRef<HTMLInputElement>(null);

  // State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Active tab
  const [activeSection, setActiveSection] = useState<string>('basic');

  const TABS = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'plugins', label: 'Plugins' },
    { id: 'themes', label: 'Themes' },
    { id: 'branding', label: 'Branding' },
  ];

  // ── Image handlers ──
  function handleImageSelect(file: File | null, setFile: (f: File | null) => void, setPreview: (s: string) => void) {
    if (!file) return;
    setFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function clearImage(setFile: (f: File | null) => void, setPreview: (s: string) => void, ref: React.RefObject<HTMLInputElement | null>) {
    setFile(null);
    setPreview('');
    if (ref.current) ref.current.value = '';
  }

  // ── Plugin repeater ──
  function addPlugin() {
    setPlugins([...plugins, { source: 'wordpress.org', slug: '', activate: true }]);
  }

  function updatePlugin(index: number, updates: Partial<PluginEntry>) {
    const updated = [...plugins];
    updated[index] = { ...updated[index], ...updates };
    setPlugins(updated);
  }

  function removePlugin(index: number) {
    setPlugins(plugins.filter((_, i) => i !== index));
  }

  // ── Theme repeater ──
  function addTheme() {
    setThemes([...themes, { source: 'wordpress.org', slug: '', activate: false }]);
  }

  function updateTheme(index: number, updates: Partial<ThemeEntry>) {
    const updated = [...themes];
    updated[index] = { ...updated[index], ...updates };
    setThemes(updated);
  }

  function removeTheme(index: number) {
    setThemes(themes.filter((_, i) => i !== index));
  }

  // ── Submit ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const templateId = id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!templateId || !name) {
        throw new Error('Template ID and Name are required');
      }

      // Build the config object
      const configObj = {
        id: templateId,
        name,
        wordpress: { version: wpVersion },
        plugins: {
          preinstall: plugins.map(p => {
            if (p.source === 'wordpress.org') return { source: p.source, slug: p.slug, activate: p.activate };
            if (p.source === 'url') return { source: p.source, url: p.url, activate: p.activate };
            return { source: 'local' as const, path: p.filename || p.file?.name || '', activate: p.activate };
          }),
          remove: removePlugins.split(',').map(s => s.trim()).filter(Boolean),
        },
        themes: {
          install: themes.map(t => {
            if (t.source === 'wordpress.org') return { source: t.source, slug: t.slug, activate: t.activate };
            if (t.source === 'url') return { source: t.source, url: t.url, activate: t.activate };
            return { source: 'local' as const, path: t.filename || t.file?.name || '', activate: t.activate };
          }),
          remove: removeThemes.split(',').map(s => s.trim()).filter(Boolean),
        },
        database,
        branding: {
          description,
        },
      };

      // Build FormData with config JSON + file uploads
      const formData = new FormData();
      formData.append('config', JSON.stringify(configObj));

      // Append plugin zip files
      for (const p of plugins) {
        if (p.source === 'local' && p.file) {
          formData.append('plugin_files', p.file);
        }
      }

      // Append theme zip files
      for (const t of themes) {
        if (t.source === 'local' && t.file) {
          formData.append('theme_files', t.file);
        }
      }

      // Append image files
      if (cardImageFile) formData.append('card_image', cardImageFile);
      if (cardIconFile) formData.append('card_icon', cardIconFile);

      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create template');
      }

      setSuccess(`Template "${name}" created successfully! You can now use it when creating sites.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="tmpl-creator">
      <div className="page-header">
        <h2>Create Template</h2>
        <p>Configure a reusable WordPress site template with plugins, themes, and settings.</p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Horizontal Tabs ── */}
        <div className="tmpl-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`tmpl-tab ${activeSection === tab.id ? 'active' : ''}`}
              onClick={() => setActiveSection(tab.id)}
            >
              {tab.label}
              {tab.id === 'plugins' && plugins.length > 0 && <span className="tmpl-tab-badge">{plugins.length}</span>}
              {tab.id === 'themes' && themes.length > 0 && <span className="tmpl-tab-badge">{themes.length}</span>}
            </button>
          ))}
        </div>

        <div className="tmpl-tab-content card">
        {/* ── Basic Info ── */}
        {activeSection === 'basic' && (
            <div className="tmpl-section-body">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="tmpl-id">Template ID</label>
                  <input
                    id="tmpl-id"
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="my-template"
                    required
                  />
                  <span className="form-hint">Lowercase, hyphens only. Used as filename.</span>
                </div>
                <div className="form-group">
                  <label htmlFor="tmpl-name">Display Name</label>
                  <input
                    id="tmpl-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Custom Template"
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="tmpl-db">Database Engine</label>
                  <select id="tmpl-db" value={database} onChange={(e) => setDatabase(e.target.value)}>
                    {DB_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="tmpl-wp-version">WordPress Version</label>
                  <input
                    id="tmpl-wp-version"
                    type="text"
                    value={wpVersion}
                    onChange={(e) => setWpVersion(e.target.value)}
                    placeholder="6.9"
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="tmpl-desc">Description</label>
                <textarea
                  id="tmpl-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Shown on the template card in the dashboard"
                  rows={2}
                />
              </div>
            </div>
          )}

        {/* ── Plugins ── */}
          {activeSection === 'plugins' && (
            <div className="tmpl-section-body">
              {plugins.map((plugin, i) => (
                <div key={i} className="tmpl-repeater-item">
                  <div className="tmpl-repeater-row">
                    <div className="form-group" style={{ flex: '0 0 140px' }}>
                      <label>Source</label>
                      <select value={plugin.source} onChange={(e) => updatePlugin(i, { source: e.target.value as any })}>
                        <option value="wordpress.org">WordPress.org</option>
                        <option value="url">URL</option>
                        <option value="local">Upload Zip</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      {plugin.source === 'wordpress.org' && (
                        <>
                          <label>Plugin Slug</label>
                          <input
                            type="text"
                            value={plugin.slug || ''}
                            onChange={(e) => updatePlugin(i, { slug: e.target.value })}
                            placeholder="e.g. woocommerce"
                          />
                        </>
                      )}
                      {plugin.source === 'url' && (
                        <>
                          <label>Download URL</label>
                          <input
                            type="url"
                            value={plugin.url || ''}
                            onChange={(e) => updatePlugin(i, { url: e.target.value })}
                            placeholder="https://example.com/plugin.zip"
                          />
                        </>
                      )}
                      {plugin.source === 'local' && (
                        <>
                          <label>Zip File</label>
                          <input
                            type="file"
                            accept=".zip"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              updatePlugin(i, { file, filename: file?.name });
                            }}
                          />
                          {plugin.filename && <span className="form-hint">{plugin.filename}</span>}
                        </>
                      )}
                    </div>
                    <div className="tmpl-repeater-actions">
                      <label className="tmpl-toggle-wrap">
                        <input
                          type="checkbox"
                          checked={plugin.activate}
                          onChange={(e) => updatePlugin(i, { activate: e.target.checked })}
                        />
                        <span className="tmpl-toggle" />
                        <span className="tmpl-toggle-label">Activate</span>
                      </label>
                      <button type="button" className="btn btn-danger btn-xs tmpl-remove-btn" onClick={() => removePlugin(i)} title="Remove">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addPlugin}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Plugin
              </button>
              <div className="form-group" style={{ marginTop: '1.25rem' }}>
                <label>Remove Default Plugins <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.75rem' }}>(comma-separated slugs)</span></label>
                <input
                  type="text"
                  value={removePlugins}
                  onChange={(e) => setRemovePlugins(e.target.value)}
                  placeholder="hello, akismet"
                />
              </div>
            </div>
          )}

        {/* ── Themes ── */}
          {activeSection === 'themes' && (
            <div className="tmpl-section-body">
              {themes.map((theme, i) => (
                <div key={i} className="tmpl-repeater-item">
                  <div className="tmpl-repeater-row">
                    <div className="form-group" style={{ flex: '0 0 140px' }}>
                      <label>Source</label>
                      <select value={theme.source} onChange={(e) => updateTheme(i, { source: e.target.value as any })}>
                        <option value="wordpress.org">WordPress.org</option>
                        <option value="url">URL</option>
                        <option value="local">Upload Zip</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      {theme.source === 'wordpress.org' && (
                        <>
                          <label>Theme Slug</label>
                          <input
                            type="text"
                            value={theme.slug || ''}
                            onChange={(e) => updateTheme(i, { slug: e.target.value })}
                            placeholder="e.g. flavor"
                          />
                        </>
                      )}
                      {theme.source === 'url' && (
                        <>
                          <label>Download URL</label>
                          <input
                            type="url"
                            value={theme.url || ''}
                            onChange={(e) => updateTheme(i, { url: e.target.value })}
                            placeholder="https://example.com/theme.zip"
                          />
                        </>
                      )}
                      {theme.source === 'local' && (
                        <>
                          <label>Zip File</label>
                          <input
                            type="file"
                            accept=".zip"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              updateTheme(i, { file, filename: file?.name });
                            }}
                          />
                          {theme.filename && <span className="form-hint">{theme.filename}</span>}
                        </>
                      )}
                    </div>
                    <div className="tmpl-repeater-actions">
                      <label className="tmpl-toggle-wrap">
                        <input
                          type="checkbox"
                          checked={theme.activate}
                          onChange={(e) => updateTheme(i, { activate: e.target.checked })}
                        />
                        <span className="tmpl-toggle" />
                        <span className="tmpl-toggle-label">Activate</span>
                      </label>
                      <button type="button" className="btn btn-danger btn-xs tmpl-remove-btn" onClick={() => removeTheme(i)} title="Remove">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addTheme}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Theme
              </button>
              <div className="form-group" style={{ marginTop: '1.25rem' }}>
                <label>Remove Default Themes <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.75rem' }}>(comma-separated slugs)</span></label>
                <input
                  type="text"
                  value={removeThemes}
                  onChange={(e) => setRemoveThemes(e.target.value)}
                  placeholder="twentytwentyfive"
                />
              </div>
            </div>
          )}

        {/* ── Branding ── */}
          {activeSection === 'branding' && (
            <div className="tmpl-section-body">
              <div className="form-row" style={{ gap: '2rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Card Image</label>
                  <span className="form-hint" style={{ marginTop: 0, marginBottom: '0.5rem' }}>Displayed as the template card background. Recommended: 600x400px.</span>
                  <div
                    className="tmpl-image-upload"
                    onClick={() => cardImageRef.current?.click()}
                  >
                    {cardImagePreview ? (
                      <img src={cardImagePreview} alt="Card image preview" />
                    ) : (
                      <div className="tmpl-image-placeholder">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        <span>Click to upload</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={cardImageRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImageSelect(e.target.files?.[0] || null, setCardImageFile, setCardImagePreview)}
                  />
                  {cardImageFile && (
                    <button type="button" className="btn btn-secondary btn-xs" style={{ marginTop: '0.5rem' }} onClick={() => clearImage(setCardImageFile, setCardImagePreview, cardImageRef)}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="form-group" style={{ flex: '0 0 160px' }}>
                  <label>Card Icon</label>
                  <span className="form-hint" style={{ marginTop: 0, marginBottom: '0.5rem' }}>Small icon/logo. Recommended: 128x128px.</span>
                  <div
                    className="tmpl-image-upload tmpl-image-upload--icon"
                    onClick={() => cardIconRef.current?.click()}
                  >
                    {cardIconPreview ? (
                      <img src={cardIconPreview} alt="Card icon preview" />
                    ) : (
                      <div className="tmpl-image-placeholder">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        <span>Upload</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={cardIconRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImageSelect(e.target.files?.[0] || null, setCardIconFile, setCardIconPreview)}
                  />
                  {cardIconFile && (
                    <button type="button" className="btn btn-secondary btn-xs" style={{ marginTop: '0.5rem' }} onClick={() => clearImage(setCardIconFile, setCardIconPreview, cardIconRef)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Submit ── */}

        {error && <div className="alert-error">{error}</div>}
        {success && <div className="alert-success">{success}</div>}

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          style={{ width: '100%', marginTop: '0.5rem' }}
          disabled={submitting || !id || !name}
        >
          {submitting ? (
            <><span className="spinner" /> Creating Template...</>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Create Template
            </>
          )}
        </button>
      </form>
    </div>
  );
}
