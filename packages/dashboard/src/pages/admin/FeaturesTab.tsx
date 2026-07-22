import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { FEATURE_META } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { useSettings } from '../../context/SettingsContext';
import { apiFetch } from '../../utils/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

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
  const { baseDomain, smtpConfigured } = useSettings();
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
    apiFetch('/api/admin/features', { headers })
      .then((r) => r.json())
      .then((data) => setFeatures(data.features || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fetchWebhooks = useCallback(() => {
    setWebhooksLoading(true);
    apiFetch('/api/admin/webhooks', { headers })
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
      const res = await apiFetch('/api/admin/features', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
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
      const res = await apiFetch('/api/admin/webhooks', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
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
    await apiFetch(`/api/admin/webhooks/${id}`, { method: 'DELETE', headers });
    fetchWebhooks();
  }

  async function handleToggleWebhook(id: string, active: boolean) {
    await apiFetch(`/api/admin/webhooks/${id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    fetchWebhooks();
  }

  function toggleEvent(event: string) {
    setNewEvents(prev => prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <h3 className="text-base font-semibold">Feature Modules</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Enable or disable features for regular users. Admins always have access to all features.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {FEATURE_META.map((f) => {
            // Every feature is toggleable. `hint` is advisory only: it warns
            // when this install cannot fully deliver the feature yet.
            const hint =
              f.requires === 'publicDomain' && (!baseDomain || baseDomain === 'localhost')
                ? 'Needs a public domain'
                : f.requires === 'smtp' && !smtpConfigured
                  ? 'Needs email configured'
                  : '';
            const enabled = !!features[f.key];
            return (
              <div
                key={f.key}
                className={cn(
                  'flex items-center justify-between gap-4 rounded-lg border border-border p-4',
                  enabled ? 'bg-accent' : 'bg-muted',
                )}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    {f.label}
                    {hint && (
                      <Badge variant="outline" title={hint}>
                        {hint}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{f.description}</div>
                </div>
                <Switch
                  id={`feature-${f.key}`}
                  aria-label={f.label}
                  checked={enabled}
                  onCheckedChange={(checked) =>
                    setFeatures((prev) => ({ ...prev, [f.key]: checked }))
                  }
                />
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Save Changes'}
          </Button>
          {msg && (
            <span className={cn('text-sm', msg.startsWith('Failed') ? 'text-destructive' : 'text-muted-foreground')}>
              {msg}
            </span>
          )}
        </div>
      </div>

      {/* Webhooks Management — shown when webhooks feature is enabled */}
      {features.webhooks && (
        <div className="mt-4 rounded-xl border border-border bg-card p-6 text-card-foreground">
          <h3 className="text-base font-semibold">Webhook Endpoints</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure HTTP endpoints that receive notifications when site events occur. Payloads are signed with HMAC-SHA256.
          </p>

          {/* Add new webhook form */}
          <div className="mt-4 rounded-lg border border-border bg-muted p-4">
            <div className="text-sm font-medium text-foreground">Add Webhook</div>

            <div className="mt-3 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="webhook-url">Endpoint URL</Label>
                <Input
                  type="url"
                  id="webhook-url"
                  name="webhook-url"
                  placeholder="https://example.com/webhook"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Events</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_EVENTS.map(event => (
                    <Button
                      key={event}
                      type="button"
                      size="sm"
                      variant={newEvents.includes(event) ? 'default' : 'outline'}
                      onClick={() => toggleEvent(event)}
                    >
                      {event}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="webhook-secret">
                  Secret
                  <span className="font-normal text-muted-foreground">(optional — auto-generated if blank)</span>
                </Label>
                <Input
                  type="text"
                  id="webhook-secret"
                  name="webhook-secret"
                  placeholder="Leave blank to auto-generate"
                  value={newSecret}
                  onChange={(e) => setNewSecret(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  onClick={handleAddWebhook}
                  disabled={addingWebhook || !newUrl || newEvents.length === 0}
                >
                  {addingWebhook ? <><Loader2 className="h-3 w-3 animate-spin" /> Adding...</> : 'Add Webhook'}
                </Button>
                {webhookMsg && (
                  <span className={cn('text-sm', webhookMsg.startsWith('Failed') ? 'text-destructive' : 'text-muted-foreground')}>
                    {webhookMsg}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Existing webhooks list */}
          {webhooksLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading webhooks...
            </div>
          ) : webhooks.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No webhooks configured yet. Add one above.
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {webhooks.map(wh => (
                <div
                  key={wh.id}
                  className={cn(
                    'flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border p-4',
                    wh.active ? 'bg-card' : 'bg-muted opacity-60',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{wh.url}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {wh.events.split(',').map(ev => (
                        <Badge key={ev} variant="secondary">
                          {ev.trim()}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Secret: <code className="rounded bg-muted px-1 py-0.5 font-mono">{wh.secret ? wh.secret.substring(0, 8) + '...' : 'none'}</code>
                      {' · '}Added {new Date(wh.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant={wh.active ? 'secondary' : 'default'}
                      onClick={() => handleToggleWebhook(wh.id, !wh.active)}
                      title={wh.active ? 'Pause' : 'Activate'}
                    >
                      {wh.active ? 'Pause' : 'Activate'}
                    </Button>
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() => handleDeleteWebhook(wh.id)}
                    >
                      Delete
                    </Button>
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
