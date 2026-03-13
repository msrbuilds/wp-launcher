import type { ThemeEntry } from '../types/product';

interface ThemeRepeaterProps {
  themes: ThemeEntry[];
  onChange: (themes: ThemeEntry[]) => void;
  removeThemes: string;
  onRemoveThemesChange: (value: string) => void;
}

export default function ThemeRepeater({ themes, onChange, removeThemes, onRemoveThemesChange }: ThemeRepeaterProps) {
  function addTheme() {
    onChange([...themes, { source: 'wordpress.org', slug: '', activate: false }]);
  }

  function updateTheme(index: number, updates: Partial<ThemeEntry>) {
    const updated = [...themes];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  }

  function removeTheme(index: number) {
    onChange(themes.filter((_, i) => i !== index));
  }

  return (
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
          onChange={(e) => onRemoveThemesChange(e.target.value)}
          placeholder="twentytwentyfive"
        />
      </div>
    </div>
  );
}
