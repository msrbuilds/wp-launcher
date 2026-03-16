import { useState, useEffect } from 'react';
import { FEATURE_META } from './shared';
import { useAdminHeaders } from './AdminLayout';

export default function FeaturesTab() {
  const headers = useAdminHeaders();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/admin/features', { headers, credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setFeatures(data.features || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/features', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ features }),
      });
      if (res.ok) {
        setMsg('Features updated. Users will see changes on next page load.');
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

  if (loading) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div className="card">
      <h3 style={{ marginBottom: '0.25rem' }}>Feature Modules</h3>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        Enable or disable features for regular users. Admins always have access to all features.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {FEATURE_META.map((f) => (
          <div
            key={f.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: features[f.key] ? '#f0fdf4' : '#fafafa',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.label}</div>
              <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{f.description}</div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0, marginLeft: '1rem' }}>
              <input
                type="checkbox"
                checked={!!features[f.key]}
                onChange={(e) => setFeatures((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                background: features[f.key] ? '#22c55e' : '#cbd5e1',
                borderRadius: '24px', transition: 'background 0.2s',
              }}>
                <span style={{
                  position: 'absolute', height: '18px', width: '18px',
                  left: features[f.key] ? '23px' : '3px', bottom: '3px',
                  background: 'white', borderRadius: '50%', transition: 'left 0.2s',
                }} />
              </span>
            </label>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><span className="spinner" /> Saving...</> : 'Save Changes'}
        </button>
        {msg && (
          <span style={{ fontSize: '0.85rem', color: msg.startsWith('Failed') ? '#ef4444' : '#22c55e' }}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
