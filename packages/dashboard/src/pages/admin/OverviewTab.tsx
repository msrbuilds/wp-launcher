import { useState, useEffect } from 'react';
import { Stats, AdminSite, SiteLog, FEATURE_META } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';
import { apiFetch } from '../../utils/api';

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card ov-stat-center">
      <div className="ov-stat-value">{value}</div>
      <div className="ov-stat-label">{label}</div>
    </div>
  );
}

export default function OverviewTab() {
  const headers = useAdminHeaders();
  const isLocal = useIsLocalMode();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentSites, setRecentSites] = useState<AdminSite[]>([]);
  const [recentLogs, setRecentLogs] = useState<SiteLog[]>([]);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/stats', { headers }).then((r) => r.json()),
      apiFetch('/api/admin/sites?limit=5&offset=0', { headers }).then((r) => r.json()),
      apiFetch('/api/admin/logs?limit=20&offset=0', { headers }).then((r) => r.json()),
      apiFetch('/api/admin/features', { headers }).then((r) => r.json()),
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
        <div className="ov-stats-grid">
          <StatCard label="Total Sites Created" value={stats.totalSitesCreated} />
          <StatCard label="Active Sites" value={stats.activeSites} />
          {!isLocal && <StatCard label="Total Users" value={stats.totalUsers} />}
          {!isLocal && <StatCard label="Verified Users" value={stats.verifiedUsers} />}
        </div>
      )}

      <div className="ov-panels-grid">
        <div className="card">
          <h3 className="ov-section-title">Recent Sites</h3>
          {recentSites.length === 0 ? (
            <p className="ov-muted-text">No sites yet.</p>
          ) : (
            <div className="ov-site-list">
              {recentSites.map((s) => (
                <div key={s.id} className="ov-site-row">
                  <div className="ov-site-left">
                    <span className={`status-dot status-${s.status}`} />
                    <div>
                      <div className="ov-site-name">
                        {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="ov-site-link">{s.subdomain}</a> : s.subdomain}
                      </div>
                      <div className="ov-site-product">{s.productId}</div>
                    </div>
                  </div>
                  <div className="ov-site-right">
                    <span className={`badge badge-${s.status}`}>{s.status}</span>
                    <div className="ov-time-ago">{timeAgo(s.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="ov-section-title">Active Modules</h3>
          <div className="ov-module-list">
            {FEATURE_META.filter((f) => !isLocal || !f.agencyOnly).map((f) => (
              <div key={f.key} className="ov-module-row" style={{ background: features[f.key] ? '#f0fdf4' : 'var(--bg-surface)' }}>
                <div className="ov-module-left">
                  <span className={`ov-module-dot ${features[f.key] ? 'ov-module-dot-on' : 'ov-module-dot-off'}`} />
                  <span className="ov-module-name">{f.label}</span>
                </div>
                <span className={`ov-module-status ${features[f.key] ? 'ov-module-status-on' : 'ov-module-status-off'}`}>
                  {features[f.key] ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="ov-section-title">Recent Activity</h3>
        {recentLogs.length === 0 ? (
          <p className="ov-muted-text">No activity yet.</p>
        ) : (
          <div className="ov-activity-scroll">
            <table className="ov-activity-table">
              <thead>
                <tr className="ov-activity-thead">
                  {['Time', 'Action', ...(!isLocal ? ['User'] : []), 'Site', isLocal ? 'Template' : 'Product'].map((h) => (
                    <th key={h} className="ov-activity-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentLogs.slice(0, 10).map((log) => (
                  <tr key={log.id} className="ov-activity-row">
                    <td className="ov-activity-td-time">{timeAgo(log.created_at)}</td>
                    <td className="ov-activity-td">
                      <span className={`badge ${log.action === 'created' ? 'badge-running' : log.action === 'error' ? 'badge-error' : 'badge-expired'}`}>{log.action}</span>
                    </td>
                    {!isLocal && <td className="ov-activity-td">{log.user_email || '—'}</td>}
                    <td className="ov-activity-td">
                      {log.site_url ? <a href={log.site_url} target="_blank" rel="noopener noreferrer">{log.subdomain}</a> : log.subdomain}
                    </td>
                    <td className="ov-activity-td">{log.product_id}</td>
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
