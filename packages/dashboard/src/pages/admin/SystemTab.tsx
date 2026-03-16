import { useState, useEffect } from 'react';
import { useAdminHeaders } from './AdminLayout';

interface SystemInfo {
  version: string;
  commit: string;
  commitFull: string;
  branch: string;
  buildDate: string | null;
  commitDate: string | null;
  commitMessage: string;
  nodeVersion: string;
  platform: string;
  uptime: number;
  uptimeFormatted: string;
  memoryUsage: number;
  env: string;
  appMode: string;
}

export default function SystemTab() {
  const headers = useAdminHeaders();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/system/info', { headers, credentials: 'include' })
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;
  if (!info) return <div className="card">Failed to load system info.</div>;

  return (
    <div>
      {/* Version Header */}
      <div className="card" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
            WP Launcher
            <span style={{ marginLeft: '0.5rem', fontSize: '1.1rem', color: 'var(--orange)', fontWeight: 700 }}>v{info.version}</span>
          </h3>
          {info.commitMessage && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
              Latest: {info.commitMessage}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className={`badge ${info.env === 'production' ? 'badge-running' : 'badge-expired'}`}>
            {info.env}
          </span>
          <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>
            {info.appMode}
          </span>
        </div>
      </div>

      {/* System Details Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        {/* Version Info */}
        <div className="card">
          <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontFamily: 'Poppins, sans-serif' }}>Version Info</h4>
          <InfoRow label="Version" value={`v${info.version}`} />
          <InfoRow label="Branch" value={info.branch} />
          <InfoRow label="Commit" value={info.commit} mono />
          {info.commitDate && <InfoRow label="Commit Date" value={new Date(info.commitDate).toLocaleString()} />}
          {info.buildDate && <InfoRow label="Build Date" value={new Date(info.buildDate).toLocaleString()} />}
        </div>

        {/* Runtime Info */}
        <div className="card">
          <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontFamily: 'Poppins, sans-serif' }}>Runtime</h4>
          <InfoRow label="Node.js" value={info.nodeVersion} />
          <InfoRow label="Platform" value={info.platform} />
          <InfoRow label="Uptime" value={info.uptimeFormatted} />
          <InfoRow label="Memory" value={`${info.memoryUsage} MB`} />
        </div>
      </div>

      {/* Update Instructions */}
      <div className="card">
        <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontFamily: 'Poppins, sans-serif' }}>How to Update</h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Run the update script on your server via SSH. It will pull the latest code, rebuild containers, and restart services with zero downtime.
        </p>
        <div style={{ background: '#1e293b', color: '#e2e8f0', padding: '1rem', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: 1.8, overflowX: 'auto' }}>
          <div style={{ color: '#94a3b8' }}># SSH into your server, then:</div>
          <div><span style={{ color: '#fb8500' }}>cd</span> /path/to/wp-launcher</div>
          <div><span style={{ color: '#fb8500' }}>bash</span> scripts/update.sh</div>
          <div style={{ marginTop: '0.5rem', color: '#94a3b8' }}># Or if installed via install.sh:</div>
          <div><span style={{ color: '#fb8500' }}>wpl</span> update</div>
        </div>
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '0.82rem', color: '#92400e' }}>
          The update script runs: <code>git pull</code> → <code>docker compose build</code> → <code>docker compose up -d</code> → health check. Sites remain accessible during the update.
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.82rem', fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}
