import { useState, useEffect, useCallback } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useFeatures } from '../context/SettingsContext';
import { apiFetch } from '../utils/api';
import { useConfirm } from '../components/ConfirmDialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Connection {
  id: string;
  name: string;
  url: string;
  api_key: string;
  instance_mode: string | null;
  status: string;
  last_tested_at: string | null;
}

interface SiteInfo {
  id: string;
  subdomain: string;
  url: string | null;
  status: string;
}

interface SyncRecord {
  id: string;
  site_id: string;
  direction: string;
  status: string;
  remote_site_url: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export default function SyncPage() {
  const features = useFeatures();
  const confirm = useConfirm();

  const [connections, setConnections] = useState<Connection[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addKey, setAddKey] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [connMsg, setConnMsg] = useState('');
  const [testResults, setTestResults] = useState<Record<string, { status: string; siteName?: string; wpVersion?: string; theme?: string; error?: string }>>({});

  const [selectedLocal, setSelectedLocal] = useState('');
  const [selectedConn, setSelectedConn] = useState('');
  const [localSites, setLocalSites] = useState<SiteInfo[]>([]);

  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ status: string; direction?: string; error?: string } | null>(null);
  const [activeSyncId, setActiveSyncId] = useState('');
  const [history, setHistory] = useState<SyncRecord[]>([]);

  if (!features.siteSync) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-card-foreground">Site Sync</h3>
        <p className="mt-2 text-sm text-muted-foreground">Enable the Site Sync feature in Features settings to push/pull site content between your local sites and remote WordPress installations.</p>
      </div>
    );
  }

  const fetchConnections = useCallback(() => {
    apiFetch('/api/sync/connections').then(r => r.json()).then(data => { if (Array.isArray(data)) setConnections(data); }).catch(() => {});
  }, []);

  const fetchLocalSites = useCallback(() => {
    apiFetch('/api/sites').then(r => r.json()).then(data => {
      const sites = (data.sites || data || []).filter((s: any) => s.status === 'running');
      setLocalSites(sites.map((s: any) => ({ id: s.id, subdomain: s.subdomain, url: s.siteUrl || s.site_url || s.url, status: s.status })));
    }).catch(() => {});
  }, []);

  const fetchHistory = useCallback(() => {
    apiFetch('/api/sync/history').then(r => r.json()).then(data => { if (Array.isArray(data)) setHistory(data); }).catch(() => {});
  }, []);

  useEffect(() => { fetchConnections(); fetchLocalSites(); fetchHistory(); }, []);

  useEffect(() => {
    if (!activeSyncId) return;
    const interval = setInterval(() => {
      apiFetch(`/api/sync/status/${activeSyncId}`).then(r => r.json()).then(data => {
        setSyncStatus({ status: data.status, direction: data.direction, error: data.error });
        if (data.status === 'completed' || data.status === 'error') {
          setSyncing(false); setActiveSyncId(''); fetchHistory();
        }
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [activeSyncId]);

  async function handleAddConnection() {
    setAddLoading(true); setConnMsg('');
    try {
      const res = await apiFetch('/api/sync/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: addName, url: addUrl, apiKey: addKey }) });
      if (res.ok) {
        const conn = await res.json();
        setAddName(''); setAddUrl(''); setAddKey(''); setShowAddForm(false);
        fetchConnections(); handleTestConnection(conn.id);
      } else { const err = await res.json().catch(() => ({ error: 'Failed' })); setConnMsg(err.error || 'Failed'); }
    } catch { setConnMsg('Failed to add connection'); } finally { setAddLoading(false); }
  }

  async function handleTestConnection(id: string) {
    setTestResults(prev => ({ ...prev, [id]: { status: 'testing' } }));
    try {
      const res = await apiFetch(`/api/sync/connections/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [id]: data })); fetchConnections();
    } catch { setTestResults(prev => ({ ...prev, [id]: { status: 'error', error: 'Test failed' } })); }
  }

  async function handleDeleteConnection(id: string) {
    if (!(await confirm({
      title: 'Remove connection?',
      description: 'This removes the saved remote connection. Sites synced through it are unaffected.',
      confirmText: 'Remove',
      variant: 'destructive',
    }))) return;
    await apiFetch(`/api/sync/connections/${id}`, { method: 'DELETE' });
    if (selectedConn === id) setSelectedConn('');
    fetchConnections();
  }

  async function handleSync(direction: 'push' | 'pull') {
    if (!selectedLocal || !selectedConn) return;
    setSyncing(true);
    setSyncStatus({ status: direction === 'push' ? 'snapshotting' : 'preparing', direction });
    try {
      const res = await apiFetch(`/api/sync/${direction}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedLocal, connectionId: selectedConn }),
      });
      const data = await res.json();
      if (res.ok) { setActiveSyncId(data.syncId); }
      else { setSyncStatus({ status: 'error', direction, error: data.error }); setSyncing(false); }
    } catch (err: any) { setSyncStatus({ status: 'error', direction, error: err.message }); setSyncing(false); }
  }

  const canSync = selectedLocal && selectedConn && !syncing;

  const statusLabels: Record<string, string> = {
    snapshotting: 'Taking snapshot of local site...',
    uploading: 'Uploading to remote WordPress site...',
    preparing: 'Requesting export from remote site...',
    downloading: 'Downloading from remote site...',
    restoring: 'Restoring content...',
    completed: 'Sync completed!',
    error: 'Sync failed',
    syncing: 'Syncing...',
  };

  function timeAgo(dateStr: string) {
    // DB stores UTC timestamps without Z suffix — append it for correct parsing
    const utc = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
    const d = Date.now() - new Date(utc).getTime();
    if (d < 0) return 'just now';
    const m = Math.floor(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  const siteItemClass = (selected: boolean) => cn(
    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
    selected ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50',
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Site Sync</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Push and pull site content between your local WP Launcher sites and remote WordPress installations.
          Install the <strong className="font-medium text-foreground">WP Launcher Connector</strong> plugin on the remote site, then add it as a connection.
        </p>
      </div>

      {/* Plugin download */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <strong className="text-sm font-semibold text-card-foreground">WP Launcher Connector</strong>
            <span className="max-w-2xl text-sm text-muted-foreground">Install this plugin on any WordPress site to enable sync. After activation, find the API key under Tools → WP Launcher Sync.</span>
          </div>
          <Button asChild size="sm">
            <a href="/api/sync/connector-plugin" download>
              <Download className="h-3.5 w-3.5" />
              Download Plugin
            </a>
          </Button>
        </div>
      </div>

      {/* Connections */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-card-foreground">WordPress Connections</h3>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? 'Cancel' : '+ Add Site'}
          </Button>
        </div>
        {showAddForm && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
            <h4 className="text-sm font-semibold text-card-foreground">Connect a WordPress Site</h4>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              Install &amp; activate the <strong className="font-medium text-foreground">WP Launcher Connector</strong> plugin, then find credentials under <em>Tools → WP Launcher Sync</em>.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sync-add-name">Name</Label>
                <Input id="sync-add-name" placeholder="My Live Site" value={addName} onChange={e => setAddName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sync-add-url">WordPress URL</Label>
                <Input id="sync-add-url" placeholder="https://example.com" value={addUrl} onChange={e => setAddUrl(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sync-add-key">Connector API Key</Label>
                <Input id="sync-add-key" type="password" placeholder="From plugin settings" value={addKey} onChange={e => setAddKey(e.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button size="sm" onClick={handleAddConnection} disabled={addLoading || !addName || !addUrl || !addKey}>
                {addLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting...</> : 'Connect'}
              </Button>
              {connMsg && <span className="text-xs text-destructive">{connMsg}</span>}
            </div>
          </div>
        )}
        {connections.length === 0 && !showAddForm ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No WordPress sites connected. Add one to start syncing.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {connections.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-card-foreground">{c.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.url}{testResults[c.id]?.siteName ? ` · ${testResults[c.id].siteName}` : ''}</div>
                </div>
                <Badge variant={c.status === 'connected' ? 'default' : c.status === 'error' ? 'destructive' : 'secondary'}>
                  {testResults[c.id]?.status === 'testing' ? 'testing...' : c.status}
                </Badge>
                <div className="flex gap-2">
                  <Button size="xs" variant="secondary" onClick={() => handleTestConnection(c.id)}>Test</Button>
                  <Button size="xs" variant="outline" className="text-destructive" onClick={() => handleDeleteConnection(c.id)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {Object.entries(testResults).map(([id, r]) =>
          r.error ? <div key={id} className="mt-2 text-xs text-destructive">Error: {r.error}</div> : null
        )}
      </div>

      {/* Sync Panel */}
      {connections.length > 0 && localSites.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-3 text-sm font-semibold text-card-foreground">Sync Content</h3>

          <div className="grid items-start gap-4 lg:grid-cols-[1fr_auto_1fr]">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-card-foreground">Local Site</h3>
                <Badge variant="secondary">WP Launcher</Badge>
              </div>
              <div className="space-y-2">
                {localSites.map(s => (
                  <div key={s.id} className={siteItemClass(selectedLocal === s.id)} onClick={() => setSelectedLocal(s.id)}>
                    <input type="radio" className="accent-primary" checked={selectedLocal === s.id} readOnly />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-card-foreground">{s.subdomain}</div>
                      <div className="truncate text-xs text-muted-foreground">{s.url}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-row justify-center gap-2 lg:flex-col lg:pt-10">
              <Button variant="secondary" disabled={!canSync} onClick={() => handleSync('push')} title="Push local site content to the remote WordPress site">
                Push →
              </Button>
              <Button variant="secondary" disabled={!canSync} onClick={() => handleSync('pull')} title="Pull remote WordPress site content to local">
                ← Pull
              </Button>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-card-foreground">Remote Site</h3>
                <Badge variant="outline">WordPress</Badge>
              </div>
              <div className="space-y-2">
                {connections.filter(c => c.status === 'connected').map(c => (
                  <div key={c.id} className={siteItemClass(selectedConn === c.id)} onClick={() => setSelectedConn(c.id)}>
                    <input type="radio" className="accent-primary" checked={selectedConn === c.id} readOnly />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-card-foreground">{c.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{c.url}</div>
                    </div>
                  </div>
                ))}
                {connections.filter(c => c.status === 'connected').length === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No connected sites. Test your connections above.</div>
                )}
              </div>
            </div>
          </div>

          {syncStatus && (
            <div className={cn(
              'mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm',
              syncStatus.status === 'error'
                ? 'border-destructive/40 text-destructive'
                : syncStatus.status === 'completed'
                  ? 'border-primary/40 text-foreground'
                  : 'border-border text-muted-foreground',
            )}>
              {syncStatus.status !== 'completed' && syncStatus.status !== 'error' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>
                {syncStatus.direction === 'push' ? '↑ Push' : '↓ Pull'}:{' '}
                {statusLabels[syncStatus.status] || syncStatus.status}
                {syncStatus.error && ` — ${syncStatus.error}`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-card-foreground">Recent Sync History</h3>
          <div className="mt-3 space-y-2">
            {history.slice(0, 10).map(h => (
              <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                <span className="text-xs font-medium text-card-foreground">{h.direction === 'push' ? '↑ Push' : '↓ Pull'}</span>
                <Badge variant={h.status === 'error' ? 'destructive' : h.status === 'completed' ? 'default' : 'secondary'}>{h.status}</Badge>
                {h.remote_site_url && <span className="truncate text-xs text-muted-foreground">{h.remote_site_url}</span>}
                {h.error && <span className="text-xs text-destructive">{h.error}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{timeAgo(h.started_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
