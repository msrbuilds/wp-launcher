import { useState, useEffect, useCallback } from 'react';
import { FEATURE_META } from './shared';
import { useAdminHeaders } from './AdminLayout';

interface Webhook {
  id: string;
  url: string;
  events: string;
  secret: string | null;
  active: number;
  created_at: string;
}

const ALL_EVENTS = ['site.created', 'site.expired', 'site.deleted'];

export default function FeaturesTab() {
  const headers = useAdminHeaders();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Webhooks
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<string[]>([...ALL_EVENTS]);
  const [newSecret, setNewSecret] = useState('');
  const [addingWebhook, setAddingWebhook] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState('');

  useEffect(() => {
    fetch('/api/admin/features', { headers, credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setFeatures(data.features || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fetchWebhooks = useCallback(() => {
    setWebhooksLoading(true);
    fetch('/api/admin/webhooks', { headers, credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setWebhooks(data.webhooks || []))
      .catch(() => {})
      .finally(() => setWebhooksLoading(false));
  }, [headers]);

  useEffect(() => {
    if (features.webhooks) fetchWebhooks();
  }, [features.webhooks]);

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

  async function handleAddWebhook() {
    if (!newUrl) return;
    setAddingWebhook(true);
    setWebhookMsg('');
    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: newUrl, events: newEvents, secret: newSecret || undefined }),
      });
      if (res.ok) {
        setNewUrl('');
        setNewEvents([...ALL_EVENTS]);
        setNewSecret('');
        setWebhookMsg('Webhook added');
        setTimeout(() => setWebhookMsg(''), 3000);
        fetchWebhooks();
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        setWebhookMsg(err.error || 'Failed to add webhook');
      }
    } catch {
      setWebhookMsg('Failed to add webhook');
    } finally {
      setAddingWebhook(false);
    }
  }

  async function handleDeleteWebhook(id: string) {
    if (!confirm('Delete this webhook?')) return;
    await fetch(`/api/admin/webhooks/${id}`, { method: 'DELETE', headers, credentials: 'include' });
    fetchWebhooks();
  }

  async function handleToggleWebhook(id: string, active: boolean) {
    await fetch(`/api/admin/webhooks/${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ active }),
    });
    fetchWebhooks();
  }

  function toggleEvent(event: string) {
    setNewEvents(prev => prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]);
  }

  if (loading) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <>
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

      {/* Webhooks Management — shown when webhooks feature is enabled */}
      {features.webhooks && (
        <div className="card" style={{ marginTop: '1.25rem' }}>
          <h3 style={{ marginBottom: '0.25rem' }}>Webhook Endpoints</h3>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            Configure HTTP endpoints that receive notifications when site events occur. Payloads are signed with HMAC-SHA256.
          </p>

          {/* Add new webhook form */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem', background: '#fafafa' }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.75rem' }}>Add Webhook</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.25rem', color: '#374151' }}>Endpoint URL</label>
                <input
                  type="url"
                  id="webhook-url"
                  name="webhook-url"
                  placeholder="https://example.com/webhook"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.4rem', color: '#374151' }}>Events</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {ALL_EVENTS.map(event => (
                    <button
                      key={event}
                      type="button"
                      onClick={() => toggleEvent(event)}
                      style={{
                        padding: '0.3rem 0.6rem', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer',
                        border: newEvents.includes(event) ? '2px solid var(--orange)' : '1px solid #d1d5db',
                        background: newEvents.includes(event) ? '#fff8f0' : '#fff',
                        color: newEvents.includes(event) ? 'var(--orange)' : '#374151',
                        fontWeight: newEvents.includes(event) ? 600 : 400,
                      }}
                    >
                      {event}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.25rem', color: '#374151' }}>
                  Secret <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional — auto-generated if blank)</span>
                </label>
                <input
                  type="text"
                  id="webhook-secret"
                  name="webhook-secret"
                  placeholder="Leave blank to auto-generate"
                  value={newSecret}
                  onChange={(e) => setNewSecret(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button className="btn btn-primary btn-sm" onClick={handleAddWebhook} disabled={addingWebhook || !newUrl || newEvents.length === 0}>
                  {addingWebhook ? <><span className="spinner spinner-sm" /> Adding...</> : 'Add Webhook'}
                </button>
                {webhookMsg && (
                  <span style={{ fontSize: '0.85rem', color: webhookMsg.startsWith('Failed') ? '#ef4444' : '#22c55e' }}>
                    {webhookMsg}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Existing webhooks list */}
          {webhooksLoading ? (
            <div style={{ textAlign: 'center', padding: '1rem' }}><span className="spinner spinner-dark" /> Loading webhooks...</div>
          ) : webhooks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '0.85rem' }}>
              No webhooks configured yet. Add one above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {webhooks.map(wh => (
                <div
                  key={wh.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem 1rem', border: '1px solid #e2e8f0', borderRadius: '8px',
                    background: wh.active ? '#fff' : '#f9fafb', opacity: wh.active ? 1 : 0.6,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', wordBreak: 'break-all' }}>{wh.url}</div>
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                      {wh.events.split(',').map(ev => (
                        <span key={ev} style={{
                          padding: '0.15rem 0.4rem', borderRadius: 4, fontSize: '0.7rem',
                          background: '#e0f2fe', color: '#0369a1', fontWeight: 500,
                        }}>
                          {ev.trim()}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                      Secret: <code style={{ fontSize: '0.7rem', background: '#f3f4f6', padding: '0.1rem 0.3rem', borderRadius: 3 }}>{wh.secret ? wh.secret.substring(0, 8) + '...' : 'none'}</code>
                      {' · '}Added {new Date(wh.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', marginLeft: '0.75rem', flexShrink: 0 }}>
                    <button
                      className={`btn btn-xs ${wh.active ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => handleToggleWebhook(wh.id, !wh.active)}
                      title={wh.active ? 'Pause' : 'Activate'}
                    >
                      {wh.active ? 'Pause' : 'Activate'}
                    </button>
                    <button
                      className="btn btn-danger-outline btn-xs"
                      onClick={() => handleDeleteWebhook(wh.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
