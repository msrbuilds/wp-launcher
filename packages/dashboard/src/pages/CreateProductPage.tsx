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

const EXPIRATION_OPTIONS = [
  { label: 'Never', value: 'never' },
  { label: '30 Minutes', value: '30m' },
  { label: '1 Hour', value: '1h' },
  { label: '4 Hours', value: '4h' },
  { label: '24 Hours', value: '24h' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
];

const BLOCKED_CAPABILITIES = [
  { key: 'install_plugins', label: 'Install Plugins' },
  { key: 'install_themes', label: 'Install Themes' },
  { key: 'edit_plugins', label: 'Edit Plugins' },
  { key: 'edit_themes', label: 'Edit Themes' },
  { key: 'update_core', label: 'Update Core' },
  { key: 'export', label: 'Export' },
  { key: 'import', label: 'Import' },
];

const HIDDEN_MENU_ITEMS = [
  { key: 'tools.php', label: 'Tools' },
  { key: 'options-general.php', label: 'Settings' },
  { key: 'edit.php?post_type=page', label: 'Pages' },
  { key: 'users.php', label: 'Users' },
  { key: 'plugins.php', label: 'Plugins' },
  { key: 'themes.php', label: 'Appearance' },
];

export default function CreateProductPage() {
  // Basic info
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [database, setDatabase] = useState('sqlite');

  // WordPress
  const [wpVersion, setWpVersion] = useState('6.9');
  const [wpLocale, setWpLocale] = useState('en_US');

  // Demo settings
  const [defaultExpiration, setDefaultExpiration] = useState('24h');
  const [maxConcurrentSites, setMaxConcurrentSites] = useState(10);
  const [adminUser, setAdminUser] = useState('demo');
  const [adminEmail, setAdminEmail] = useState('demo@example.com');
  const [landingPage, setLandingPage] = useState('');

  // Plugins
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [removePlugins, setRemovePlugins] = useState('hello, akismet');

  // Themes
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [removeThemes, setRemoveThemes] = useState('');

  // Restrictions
  const [disableFileMods, setDisableFileMods] = useState(true);
  const [blockedCapabilities, setBlockedCapabilities] = useState<string[]>([
    'install_plugins', 'install_themes', 'edit_plugins', 'edit_themes', 'update_core',
  ]);
  const [hiddenMenuItems, setHiddenMenuItems] = useState<string[]>([]);

  // Branding
  const [bannerText, setBannerText] = useState('This is a temporary demo site. It will expire in {time_remaining}.');
  const [cardImagePreview, setCardImagePreview] = useState<string | null>(null);
  const [cardIconPreview, setCardIconPreview] = useState<string | null>(null);
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [cardIconFile, setCardIconFile] = useState<File | null>(null);

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
    { id: 'demo', label: 'Site Defaults' },
    { id: 'restrictions', label: 'Restrictions' },
    { id: 'branding', label: 'Branding' },
  ];

  // ── Capability toggles ──
  function toggleCapability(cap: string) {
    setBlockedCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
  }

  function toggleMenuItem(item: string) {
    setHiddenMenuItems(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  }

  // ── Image helpers ──
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
      const productId = id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!productId || !name) {
        throw new Error('Product ID and Name are required');
      }

      const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
      const configObj = {
        id: productId,
        name,
        ...(category && { category }),
        ...(tagsArray.length > 0 && { tags: tagsArray }),
        wordpress: { version: wpVersion, locale: wpLocale },
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
        demo: {
          default_expiration: defaultExpiration,
          max_concurrent_sites: maxConcurrentSites,
          admin_user: adminUser,
          admin_email: adminEmail,
          landing_page: landingPage,
        },
        database,
        restrictions: {
          disable_file_mods: disableFileMods,
          hidden_menu_items: hiddenMenuItems,
          blocked_capabilities: blockedCapabilities,
        },
        branding: {
          description,
          banner_text: bannerText,
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

      const res = await apiFetch('/api/products', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create product');
      }

      setSuccess(`Product "${name}" created successfully! It will now appear on the launch page.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="tmpl-creator">
      <div className="page-header">
        <h2>Create Product</h2>
        <p>Configure a product for your demo site launcher with plugins, themes, restrictions, and branding.</p>
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
                  <label htmlFor="prod-id">Product ID</label>
                  <input
                    id="prod-id"
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="my-product"
                    required
                  />
                  <span className="form-hint">Lowercase, hyphens only. Used as identifier.</span>
                </div>
                <div className="form-group">
                  <label htmlFor="prod-name">Display Name</label>
                  <input
                    id="prod-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Awesome Plugin Demo"
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="prod-db">Database Engine</label>
                  <select id="prod-db" value={database} onChange={(e) => setDatabase(e.target.value)}>
                    {DB_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="prod-wp-version">WordPress Version</label>
                  <input
                    id="prod-wp-version"
                    type="text"
                    value={wpVersion}
                    onChange={(e) => setWpVersion(e.target.value)}
                    placeholder="6.9"
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="prod-desc">Description</label>
                <textarea
                  id="prod-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Shown on the product card in the launch page"
                  rows={2}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="prod-category">Category</label>
                  <input
                    id="prod-category"
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Plugins, Themes, Starter"
                  />
                  <span className="form-hint">Used for filtering on the launch page.</span>
                </div>
                <div className="form-group">
                  <label htmlFor="prod-tags">Tags</label>
                  <input
                    id="prod-tags"
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="e.g. ecommerce, starter, blog"
                  />
                  <span className="form-hint">Comma-separated. Used for search.</span>
                </div>
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

        {/* ── Demo Settings ── */}
          {activeSection === 'demo' && (
            <div className="tmpl-section-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Default Expiration</label>
                  <select value={defaultExpiration} onChange={(e) => setDefaultExpiration(e.target.value)}>
                    {EXPIRATION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Max Concurrent Sites <span className="cprod-label-hint">(0 = unlimited)</span></label>
                  <input
                    type="number"
                    min={0}
                    value={maxConcurrentSites}
                    onChange={(e) => setMaxConcurrentSites(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="form-group">
                  <label>WordPress Locale</label>
                  <input
                    type="text"
                    value={wpLocale}
                    onChange={(e) => setWpLocale(e.target.value)}
                    placeholder="en_US"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Admin Username</label>
                  <input
                    type="text"
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                    placeholder="demo"
                  />
                </div>
                <div className="form-group">
                  <label>Admin Email</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="demo@example.com"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Landing Page <span className="cprod-label-hint">(path after login, e.g. /wp-admin/plugins.php)</span></label>
                <input
                  type="text"
                  value={landingPage}
                  onChange={(e) => setLandingPage(e.target.value)}
                  placeholder="Leave empty for default dashboard"
                />
              </div>
            </div>
          )}

        {/* ── Restrictions ── */}
          {activeSection === 'restrictions' && (
            <div className="tmpl-section-body">
              <label className="tmpl-toggle-wrap cprod-toggle-spaced">
                <input
                  type="checkbox"
                  checked={disableFileMods}
                  onChange={(e) => setDisableFileMods(e.target.checked)}
                />
                <span className="tmpl-toggle" />
                <span className="tmpl-toggle-label">Disable File Modifications (DISALLOW_FILE_MODS)</span>
              </label>

              <div className="form-group">
                <label>Blocked Capabilities</label>
                <div className="tmpl-checkbox-grid">
                  {BLOCKED_CAPABILITIES.map(cap => (
                    <label key={cap.key} className="tmpl-toggle-wrap">
                      <input
                        type="checkbox"
                        checked={blockedCapabilities.includes(cap.key)}
                        onChange={() => toggleCapability(cap.key)}
                      />
                      <span className="tmpl-toggle" />
                      <span className="tmpl-toggle-label">{cap.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Hidden Admin Menu Items</label>
                <div className="tmpl-checkbox-grid">
                  {HIDDEN_MENU_ITEMS.map(item => (
                    <label key={item.key} className="tmpl-toggle-wrap">
                      <input
                        type="checkbox"
                        checked={hiddenMenuItems.includes(item.key)}
                        onChange={() => toggleMenuItem(item.key)}
                      />
                      <span className="tmpl-toggle" />
                      <span className="tmpl-toggle-label">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

        {/* ── Branding ── */}
          {activeSection === 'branding' && (
            <div className="tmpl-section-body">
              <div className="form-group">
                <label>Banner Text <span className="cprod-label-hint">({'{time_remaining}'} for countdown)</span></label>
                <input
                  type="text"
                  value={bannerText}
                  onChange={(e) => setBannerText(e.target.value)}
                  placeholder="This is a temporary demo site. It will expire in {time_remaining}."
                />
              </div>
              <div className="form-row">
                <ImageUpload
                  label="Card Image"
                  hint="3:2 ratio recommended"
                  preview={cardImagePreview}
                  onFileSelect={(file) => handleImageFile(file, setCardImageFile, setCardImagePreview)}
                  onClear={() => { setCardImageFile(null); setCardImagePreview(null); }}
                />
                <ImageUpload
                  label="Card Icon"
                  hint="Square, 160px"
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
          className="btn btn-primary btn-lg cprod-submit-btn"
          disabled={submitting || !id || !name}
        >
          {submitting ? (
            <><span className="spinner" /> Creating Product...</>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Create Product
            </>
          )}
        </button>
      </form>
    </div>
  );
}
