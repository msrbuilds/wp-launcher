import { useState, useEffect } from 'react';
import { Stats, AdminSite, SiteLog, FEATURE_META } from './shared';
import { useAdminHeaders } from './AdminLayout';

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#2563eb' }}>{value}</div>
      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{label}</div>
    </div>
  );
}

export default function OverviewTab() {
  const headers = useAdminHeaders();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentSites, setRecentSites] = useState<AdminSite[]>([]);
  const [recentLogs, setRecentLogs] = useState<SiteLog[]>([]);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/stats', { headers, credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/sites?limit=5&offset=0', { headers, credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/logs?limit=20&offset=0', { headers, credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/features', { headers, credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([statsData, sitesData, logsData, featData]) => {
        setStats(statsData);
        setRecentSites(sitesData.data || []);
        setRecentLogs(logsData.data || []);
        setFeatures(featData.features || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div>
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <StatCard label="Total Sites Created" value={stats.totalSitesCreated} />
          <StatCard label="Active Sites" value={stats.activeSites} />
          <StatCard label="Total Users" value={stats.totalUsers} />
          <StatCard label="Verified Users" value={stats.verifiedUsers} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'Poppins, sans-serif' }}>Recent Sites</h3>
          {recentSites.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No sites yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {recentSites.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={`status-dot status-${s.status}`} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--prussian-blue)' }}>{s.subdomain}</a> : s.subdomain}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.productId}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`badge badge-${s.status}`}>{s.status}</span>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-light)', marginTop: '0.15rem' }}>{timeAgo(s.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'Poppins, sans-serif' }}>Active Modules</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {FEATURE_META.map((f) => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.5rem', background: features[f.key] ? '#f0fdf4' : 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: features[f.key] ? '#22c55e' : 'var(--text-light)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{f.label}</span>
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: features[f.key] ? '#16a34a' : 'var(--text-muted)' }}>
                  {features[f.key] ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'Poppins, sans-serif' }}>Recent Activity</h3>
        {recentLogs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No activity yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  {['Time', 'Action', 'User', 'Site', 'Product'].map((h) => (
                    <th key={h} style={{ padding: '0.5rem', fontFamily: 'Poppins, sans-serif', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentLogs.slice(0, 10).map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(log.created_at)}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className={`badge ${log.action === 'created' ? 'badge-running' : log.action === 'error' ? 'badge-error' : 'badge-expired'}`}>{log.action}</span>
                    </td>
                    <td style={{ padding: '0.5rem' }}>{log.user_email || '—'}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {log.site_url ? <a href={log.site_url} target="_blank" rel="noopener noreferrer">{log.subdomain}</a> : log.subdomain}
                    </td>
                    <td style={{ padding: '0.5rem' }}>{log.product_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
