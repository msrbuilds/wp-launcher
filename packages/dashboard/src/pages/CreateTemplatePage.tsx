import { useState } from 'react';
import type { PluginEntry, ThemeEntry } from '../types/product';
import PluginRepeater from '../components/PluginRepeater';
import ThemeRepeater from '../components/ThemeRepeater';
import ImageUpload from '../components/ImageUpload';
import { apiFetch } from '../utils/api';

const DB_OPTIONS = [
  { label: 'SQLite (fastest)', value: 'sqlite' },
  { label: 'MySQL 8.4', value: 'mysql' },
  { label: 'MariaDB 11', value: 'mariadb' },
];

export default function CreateTemplatePage() {


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
  const [cardImagePreview, setCardImagePreview] = useState<string | null>(null);
  const [cardIconFile, setCardIconFile] = useState<File | null>(null);
  const [cardIconPreview, setCardIconPreview] = useState<string | null>(null);

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

  // ── Image helper ──
  function handleImageFile(file: File, setFile: (f: File | null) => void, setPreview: (s: string | null) => void) {
    setFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
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

      const formData = new FormData();
      formData.append('config', JSON.stringify(configObj));

      for (const p of plugins) {
        if (p.source === 'local' && p.file) {
          formData.append('plugin_files', p.file);
        }
      }

      for (const t of themes) {
        if (t.source === 'local' && t.file) {
          formData.append('theme_files', t.file);
        }
      }

      if (cardImageFile) formData.append('card_image', cardImageFile);
      if (cardIconFile) formData.append('card_icon', cardIconFile);

      const res = await apiFetch('/api/templates', {
        method: 'POST',
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
            <PluginRepeater
              plugins={plugins}
              onChange={setPlugins}
              removePlugins={removePlugins}
              onRemovePluginsChange={setRemovePlugins}
            />
          )}

        {/* ── Themes ── */}
          {activeSection === 'themes' && (
            <ThemeRepeater
              themes={themes}
              onChange={setThemes}
              removeThemes={removeThemes}
              onRemoveThemesChange={setRemoveThemes}
            />
          )}

        {/* ── Branding ── */}
          {activeSection === 'branding' && (
            <div className="tmpl-section-body">
              <div className="form-row ctmpl-branding-row">
                <ImageUpload
                  label="Card Image"
                  hint="Displayed as the template card background. Recommended: 600x400px."
                  preview={cardImagePreview}
                  onFileSelect={(file) => handleImageFile(file, setCardImageFile, setCardImagePreview)}
                  onClear={() => { setCardImageFile(null); setCardImagePreview(null); }}
                />
                <ImageUpload
                  label="Card Icon"
                  hint="Small icon/logo. Recommended: 128x128px."
                  preview={cardIconPreview}
                  onFileSelect={(file) => handleImageFile(file, setCardIconFile, setCardIconPreview)}
                  onClear={() => { setCardIconFile(null); setCardIconPreview(null); }}
                  className="tmpl-image-upload--icon"
                />
              </div>
            </div>
          )}
        </div>

        {error && <div className="alert-error">{error}</div>}
        {success && <div className="alert-success">{success}</div>}

        <button
          type="submit"
          className="btn btn-primary btn-lg ctmpl-submit-btn"
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
