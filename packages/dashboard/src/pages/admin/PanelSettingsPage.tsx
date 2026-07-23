import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useAdminHeaders } from './AdminLayout';
import { useSettings } from '../../context/SettingsContext';
import { apiFetch } from '../../utils/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Panel = Record<string, string>;

const TOGGLES: { key: string; label: string; description: string }[] = [
  {
    key: 'panel.publicRegistration',
    label: 'Public registration',
    description: 'Let anyone create an account from the sign-up page. Off means accounts are invite-only.',
  },
  {
    key: 'panel.demoPortalEnabled',
    label: 'Public demo portal',
    description: 'Publish a /demo page where visitors can browse published blueprints and launch a site.',
  },
  {
    key: 'panel.defaultRestrictCapabilities',
    label: 'Lock down new sites',
    description: 'New sites block plugin/theme installs and other risky wp-admin capabilities by default.',
  },
  {
    key: 'panel.enforceResourceLimits',
    label: 'Enforce resource limits',
    description: 'Apply the configured memory and CPU ceilings to site containers.',
  },
  {
    key: 'panel.allowInsecureRemotes',
    label: 'Allow insecure remotes',
    description: 'Permit sync connections to remote sites over plain HTTP or with invalid certificates.',
  },
];

const QUOTAS: { key: string; label: string }[] = [
  { key: 'panel.quota.owner', label: 'Owner' },
  { key: 'panel.quota.admin', label: 'Admin' },
  { key: 'panel.quota.member', label: 'Member' },
  { key: 'panel.quota.total', label: 'Whole panel' },
];

export default function PanelSettingsPage() {
  const headers = useAdminHeaders();
  const { refresh } = useSettings();
  const [panel, setPanel] = useState<Panel>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/panel-settings', { headers })
      .then((r) => r.json())
      .then((data) => setPanel(data))
      .catch(() => setNote({ kind: 'error', text: 'Failed to load panel settings' }))
      .finally(() => setLoading(false));
  }, []);

  const bool = (key: string) => panel[key] === 'true';
  const setBool = (key: string, value: boolean) =>
    setPanel((p) => ({ ...p, [key]: value ? 'true' : 'false' }));
  const setValue = (key: string, value: string) => setPanel((p) => ({ ...p, [key]: value }));

  async function save() {
    setSaving(true);
    setNote(null);
    try {
      // Only the editable keys go up; the API rejects anything else.
      const payload: Record<string, boolean | number | string> = {};
      for (const t of TOGGLES) payload[t.key] = bool(t.key);
      for (const q of QUOTAS) payload[q.key] = parseInt(panel[q.key] || '0', 10) || 0;
      payload['panel.defaultExpiry'] = (panel['panel.defaultExpiry'] || 'permanent').trim();

      const res = await apiFetch('/api/admin/panel-settings', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setPanel(data);
      refresh(); // the public /api/settings payload carries these too
      setNote({ kind: 'ok', text: 'Panel settings saved' });
    } catch (err: any) {
      setNote({ kind: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Panel settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How this install behaves — who can join, what visitors see, and the limits on new sites.
        </p>
      </div>

      {/* Access */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-card-foreground">Access &amp; visibility</h3>
        <div className="mt-4 flex flex-col gap-3">
          {TOGGLES.map((t) => (
            <div key={t.key} className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-card-foreground">{t.label}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">{t.description}</div>
              </div>
              <Switch
                checked={bool(t.key)}
                onCheckedChange={(v) => setBool(t.key, v)}
                aria-label={t.label}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Site defaults */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-card-foreground">New site defaults</h3>
        <div className="mt-4 flex flex-col gap-2">
          <Label htmlFor="panel-expiry">Default expiry</Label>
          <Input
            id="panel-expiry"
            value={panel['panel.defaultExpiry'] || ''}
            onChange={(e) => setValue('panel.defaultExpiry', e.target.value)}
            placeholder="permanent"
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground">
            <code className="font-mono">permanent</code>, or a duration like <code className="font-mono">24h</code>,{' '}
            <code className="font-mono">7d</code>, <code className="font-mono">2w</code>.
          </p>
        </div>
      </div>

      {/* Quotas */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-card-foreground">Site quotas</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Maximum concurrent sites. <strong className="font-medium text-card-foreground">0 means unlimited.</strong>
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUOTAS.map((q) => (
            <div key={q.key} className="flex flex-col gap-2">
              <Label htmlFor={q.key}>{q.label}</Label>
              <Input
                id={q.key}
                type="number"
                min={0}
                value={panel[q.key] ?? '0'}
                onChange={(e) => setValue(q.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      {note && note.kind === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{note.text}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Save Changes'}
        </Button>
        {note && note.kind === 'ok' && (
          <span className={cn('text-sm text-muted-foreground')}>{note.text}</span>
        )}
      </div>
    </div>
  );
}
