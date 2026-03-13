import type { PluginEntry } from '../types/product';

interface PluginRepeaterProps {
  plugins: PluginEntry[];
  onChange: (plugins: PluginEntry[]) => void;
  removePlugins: string;
  onRemovePluginsChange: (value: string) => void;
}

export default function PluginRepeater({ plugins, onChange, removePlugins, onRemovePluginsChange }: PluginRepeaterProps) {
  function addPlugin() {
    onChange([...plugins, { source: 'wordpress.org', slug: '', activate: true }]);
  }

  function updatePlugin(index: number, updates: Partial<PluginEntry>) {
    const updated = [...plugins];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  }

  function removePlugin(index: number) {
    onChange(plugins.filter((_, i) => i !== index));
  }

  return (
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
          onChange={(e) => onRemovePluginsChange(e.target.value)}
          placeholder="hello, akismet"
        />
      </div>
    </div>
  );
}
