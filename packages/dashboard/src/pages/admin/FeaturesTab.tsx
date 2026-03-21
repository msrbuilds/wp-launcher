import { useState, useEffect, useCallback } from 'react';
import { FEATURE_META } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';

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
  const isLocal = useIsLocalMode();
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
        <h3 className="ft-heading">Feature Modules</h3>
        <p className="ft-subtext">
          Enable or disable features for regular users. Admins always have access to all features.
        </p>

        <div className="ft-feature-list">
          {FEATURE_META.map((f) => {
            const disabled = isLocal && f.agencyOnly;
            return (
              <div
                key={f.key}
                className="ft-feature-row"
                style={{
                  background: disabled ? '#f1f5f9' : features[f.key] ? '#f0fdf4' : '#fafafa',
                  opacity: disabled ? 0.55 : 1,
                }}
              >
                <div>
                  <div className="ft-feature-label">
                    {f.label}
                    {disabled && <span className="ft-agency-badge">Agency only</span>}
                  </div>
                  <div className="ft-feature-desc">{f.description}</div>
                </div>
                <label className="ft-toggle-label">
                  <input
                    type="checkbox"
                    checked={!!features[f.key]}
                    disabled={disabled}
                    onChange={(e) => setFeatures((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                    className="ft-toggle-input"
                  />
                  <span
                    className="ft-toggle-track"
                    style={{
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      background: disabled ? '#e2e8f0' : features[f.key] ? '#22c55e' : '#cbd5e1',
                    }}
                  >
                    <span
                      className="ft-toggle-knob"
                      style={{ left: features[f.key] ? '23px' : '3px' }}
                    />
                  </span>
                </label>
              </div>
            );
          })}
        </div>

        <div className="ft-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spinner" /> Saving...</> : 'Save Changes'}
          </button>
          {msg && (
            <span className={`ft-msg ${msg.startsWith('Failed') ? 'ft-msg-error' : 'ft-msg-success'}`}>
              {msg}
            </span>
          )}
        </div>
      </div>

      {/* Webhooks Management — shown when webhooks feature is enabled */}
      {features.webhooks && (
        <div className="card ft-webhooks-card">
          <h3 className="ft-heading">Webhook Endpoints</h3>
          <p className="ft-subtext">
            Configure HTTP endpoints that receive notifications when site events occur. Payloads are signed with HMAC-SHA256.
          </p>

          {/* Add new webhook form */}
          <div className="ft-webhook-form">
            <div className="ft-webhook-form-title">Add Webhook</div>

            <div className="ft-form-fields">
              <div>
                <label className="ft-field-label">Endpoint URL</label>
                <input
                  type="url"
                  id="webhook-url"
                  name="webhook-url"
                  placeholder="https://example.com/webhook"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="ft-text-input"
                />
              </div>

              <div>
                <label className="ft-field-label-events">Events</label>
                <div className="ft-events-row">
                  {ALL_EVENTS.map(event => (
                    <button
                      key={event}
                      type="button"
                      onClick={() => toggleEvent(event)}
                      className={`ft-event-btn ${newEvents.includes(event) ? 'ft-event-btn-active' : 'ft-event-btn-inactive'}`}
                    >
                      {event}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="ft-field-label">
                  Secret <span className="ft-secret-hint">(optional — auto-generated if blank)</span>
                </label>
                <input
                  type="text"
                  id="webhook-secret"
                  name="webhook-secret"
                  placeholder="Leave blank to auto-generate"
                  value={newSecret}
                  onChange={(e) => setNewSecret(e.target.value)}
                  className="ft-text-input"
                />
              </div>

              <div className="ft-actions">
                <button className="btn btn-primary btn-sm" onClick={handleAddWebhook} disabled={addingWebhook || !newUrl || newEvents.length === 0}>
                  {addingWebhook ? <><span className="spinner spinner-sm" /> Adding...</> : 'Add Webhook'}
                </button>
                {webhookMsg && (
                  <span className={`ft-msg ${webhookMsg.startsWith('Failed') ? 'ft-msg-error' : 'ft-msg-success'}`}>
                    {webhookMsg}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Existing webhooks list */}
          {webhooksLoading ? (
            <div className="ft-loading-center"><span className="spinner spinner-dark" /> Loading webhooks...</div>
          ) : webhooks.length === 0 ? (
            <div className="ft-empty-state">
              No webhooks configured yet. Add one above.
            </div>
          ) : (
            <div className="ft-webhook-list">
              {webhooks.map(wh => (
                <div
                  key={wh.id}
                  className="ft-webhook-item"
                  style={{
                    background: wh.active ? '#fff' : '#f9fafb',
                    opacity: wh.active ? 1 : 0.6,
                  }}
                >
                  <div className="ft-webhook-info">
                    <div className="ft-webhook-url">{wh.url}</div>
                    <div className="ft-webhook-events">
                      {wh.events.split(',').map(ev => (
                        <span key={ev} className="ft-event-tag">
                          {ev.trim()}
                        </span>
                      ))}
                    </div>
                    <div className="ft-webhook-meta">
                      Secret: <code className="ft-webhook-secret">{wh.secret ? wh.secret.substring(0, 8) + '...' : 'none'}</code>
                      {' · '}Added {new Date(wh.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="ft-webhook-actions">
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
