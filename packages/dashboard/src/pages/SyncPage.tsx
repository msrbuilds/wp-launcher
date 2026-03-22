import { useState, useEffect, useCallback } from 'react';
import { useFeatures } from '../context/SettingsContext';
import { apiFetch } from '../utils/api';

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
      <div className="card sync-disabled">
        <h3>Site Sync</h3>
        <p>Enable the Site Sync feature in Features settings to push/pull site content between your local sites and remote WordPress installations.</p>
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
    if (!confirm('Remove this connection?')) return;
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

  return (
    <div className="sync-page">
      <h2>Site Sync</h2>
      <p className="sync-subtitle">
        Push and pull site content between your local WP Launcher sites and remote WordPress installations.
        Install the <strong>WP Launcher Connector</strong> plugin on the remote site, then add it as a connection.
      </p>

      {/* Plugin download */}
      <div className="card sync-plugin-card">
        <div className="sync-plugin-row">
          <div className="sync-plugin-info">
            <strong>WP Launcher Connector</strong>
            <span className="sync-plugin-desc">Install this plugin on any WordPress site to enable sync. After activation, find the API key under Tools → WP Launcher Sync.</span>
          </div>
          <a href="/api/sync/connector-plugin" download className="btn btn-sm btn-primary sync-plugin-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            Download Plugin
          </a>
        </div>
      </div>

      {/* Connections */}
      <div className="card">
        <div className="sync-col-header">
          <h3>WordPress Connections</h3>
          <button className="btn btn-sm btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? 'Cancel' : '+ Add Site'}
          </button>
        </div>
        {showAddForm && (
          <div className="sync-add-form">
            <h4>Connect a WordPress Site</h4>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 0.75rem' }}>
              Install &amp; activate the <strong>WP Launcher Connector</strong> plugin, then find credentials under <em>Tools → WP Launcher Sync</em>.
            </p>
            <div className="sync-form-fields">
              <div className="sync-form-field"><label>Name</label><input placeholder="My Live Site" value={addName} onChange={e => setAddName(e.target.value)} /></div>
              <div className="sync-form-field"><label>WordPress URL</label><input placeholder="https://example.com" value={addUrl} onChange={e => setAddUrl(e.target.value)} /></div>
              <div className="sync-form-field"><label>Connector API Key</label><input type="password" placeholder="From plugin settings" value={addKey} onChange={e => setAddKey(e.target.value)} /></div>
            </div>
            <div className="sync-form-actions">
              <button className="btn btn-primary btn-sm" onClick={handleAddConnection} disabled={addLoading || !addName || !addUrl || !addKey}>
                {addLoading ? <><span className="spinner spinner-sm" /> Connecting...</> : 'Connect'}
              </button>
              {connMsg && <span style={{ fontSize: '0.8rem', color: '#dc2626' }}>{connMsg}</span>}
            </div>
          </div>
        )}
        {connections.length === 0 && !showAddForm ? (
          <div className="sync-empty">No WordPress sites connected. Add one to start syncing.</div>
        ) : (
          <div className="sync-connections-list">
            {connections.map(c => (
              <div key={c.id} className="sync-conn-item">
                <div className="sync-conn-info">
                  <div className="sync-conn-name">{c.name}</div>
                  <div className="sync-conn-url">{c.url}{testResults[c.id]?.siteName ? ` · ${testResults[c.id].siteName}` : ''}</div>
                </div>
                <span className={`sync-conn-status ${c.status}`}>{testResults[c.id]?.status === 'testing' ? 'testing...' : c.status}</span>
                <div className="sync-conn-actions">
                  <button className="btn btn-xs btn-secondary" onClick={() => handleTestConnection(c.id)}>Test</button>
                  <button className="btn btn-xs btn-danger-outline" onClick={() => handleDeleteConnection(c.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {Object.entries(testResults).map(([id, r]) =>
          r.error ? <div key={id} style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '0.5rem' }}>Error: {r.error}</div> : null
        )}
      </div>

      {/* Sync Panel */}
      {connections.length > 0 && localSites.length > 0 && (
        <div className="card" style={{ marginTop: '1.25rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Sync Content</h3>

          <div className="sync-columns">
            <div>
              <div className="sync-col-header">
                <h3>Local Site</h3>
                <span className="sync-col-badge local">WP Launcher</span>
              </div>
              <div className="sync-site-list">
                {localSites.map(s => (
                  <div key={s.id} className={`sync-site-item ${selectedLocal === s.id ? 'selected' : ''}`} onClick={() => setSelectedLocal(s.id)}>
                    <input type="radio" className="sync-site-radio" checked={selectedLocal === s.id} readOnly />
                    <div className="sync-site-info">
                      <div className="sync-site-name">{s.subdomain}</div>
                      <div className="sync-site-url">{s.url}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sync-arrow-col">
              <button className="sync-arrow-btn push" disabled={!canSync} onClick={() => handleSync('push')} title="Push local site content to the remote WordPress site">
                Push →
              </button>
              <button className="sync-arrow-btn pull" disabled={!canSync} onClick={() => handleSync('pull')} title="Pull remote WordPress site content to local">
                ← Pull
              </button>
            </div>

            <div>
              <div className="sync-col-header">
                <h3>Remote Site</h3>
                <span className="sync-col-badge remote">WordPress</span>
              </div>
              <div className="sync-site-list">
                {connections.filter(c => c.status === 'connected').map(c => (
                  <div key={c.id} className={`sync-site-item ${selectedConn === c.id ? 'selected' : ''}`} onClick={() => setSelectedConn(c.id)}>
                    <input type="radio" className="sync-site-radio" checked={selectedConn === c.id} readOnly />
                    <div className="sync-site-info">
                      <div className="sync-site-name">{c.name}</div>
                      <div className="sync-site-url">{c.url}</div>
                    </div>
                  </div>
                ))}
                {connections.filter(c => c.status === 'connected').length === 0 && (
                  <div className="sync-empty">No connected sites. Test your connections above.</div>
                )}
              </div>
            </div>
          </div>

          {syncStatus && (
            <div className={`sync-status-bar ${syncStatus.status === 'completed' ? 'completed' : syncStatus.status === 'error' ? 'error' : 'in-progress'}`} style={{ marginTop: '1rem' }}>
              {syncStatus.status !== 'completed' && syncStatus.status !== 'error' && <span className="spinner spinner-sm" />}
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
        <div className="card sync-history" style={{ marginTop: '1.25rem' }}>
          <h3>Recent Sync History</h3>
          <div className="sync-history-list">
            {history.slice(0, 10).map(h => (
              <div key={h.id} className="sync-history-item">
                <span className={`sync-history-dir ${h.direction}`}>{h.direction === 'push' ? '↑ Push' : '↓ Pull'}</span>
                <span className={`sync-history-status ${h.status === 'completed' ? 'completed' : h.status === 'error' ? 'error' : 'in-progress'}`}>{h.status}</span>
                {h.remote_site_url && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{h.remote_site_url}</span>}
                {h.error && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{h.error}</span>}
                <span className="sync-history-time">{timeAgo(h.started_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
