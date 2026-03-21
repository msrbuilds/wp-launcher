import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAdminHeaders } from './admin/AdminLayout';
import { Stats, AdminSite, SiteLog } from './admin/shared';

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card stat-card">
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}

const SHORTCUTS = [
  {
    to: '/create',
    label: 'New Site',
    icon: 'M12 4v16m8-8H4',
    color: '#fb8500',
    bg: 'rgba(251, 133, 0, 0.1)',
    border: 'rgba(251, 133, 0, 0.3)',
  },
  {
    to: '/create-template',
    label: 'New Template',
    icon: 'M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.1)',
    border: 'rgba(139, 92, 246, 0.3)',
  },
  {
    to: '/sites',
    label: 'My Sites',
    icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
    color: '#2563eb',
    bg: 'rgba(37, 99, 235, 0.1)',
    border: 'rgba(37, 99, 235, 0.3)',
  },
  {
    to: '/products',
    label: 'Templates',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    color: '#059669',
    bg: 'rgba(5, 150, 105, 0.1)',
    border: 'rgba(5, 150, 105, 0.3)',
  },
];

const MAIL_SHORTCUT = {
  href: 'http://localhost:8025',
  label: 'Mailbox',
  icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  color: '#ec4899',
  bg: 'rgba(236, 72, 153, 0.1)',
  border: 'rgba(236, 72, 153, 0.3)',
};

export default function LocalDashboard() {
  const headers = useAdminHeaders();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentSites, setRecentSites] = useState<AdminSite[]>([]);
  const [recentLogs, setRecentLogs] = useState<SiteLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/stats', { headers, credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/sites?limit=5&offset=0', { headers, credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/logs?limit=10&offset=0', { headers, credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([statsData, sitesData, logsData]) => {
        setStats(statsData);
        setRecentSites(sitesData.data || []);
        setRecentLogs(logsData.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  if (loading) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div>
      {/* Shortcut Cards */}
      <div className="local-shortcuts">
        {SHORTCUTS.map((s) => (
          <Link key={s.to} to={s.to} className="local-shortcut-card" style={{ '--sc-color': s.color, '--sc-bg': s.bg, '--sc-border': s.border } as React.CSSProperties}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={s.icon} />
            </svg>
            <span>{s.label}</span>
          </Link>
        ))}
        <a href={MAIL_SHORTCUT.href} target="_blank" rel="noopener noreferrer" className="local-shortcut-card" style={{ '--sc-color': MAIL_SHORTCUT.color, '--sc-bg': MAIL_SHORTCUT.bg, '--sc-border': MAIL_SHORTCUT.border } as React.CSSProperties}>
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={MAIL_SHORTCUT.icon} />
          </svg>
          <span>{MAIL_SHORTCUT.label}</span>
        </a>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stats-grid">
          <StatCard label="Active Sites" value={stats.activeSites} />
          <StatCard label="Total Created" value={stats.totalSitesCreated} />
        </div>
      )}

      {/* Recent Sites + Recent Activity */}
      <div className="dashboard-panels">
        <div className="card">
          <div className="panel-header">
            <h3 className="panel-title">Recent Sites</h3>
            <Link to="/sites" className="panel-link">View all</Link>
          </div>
          {recentSites.length === 0 ? (
            <p className="panel-empty">No sites yet. <Link to="/create">Create one</Link></p>
          ) : (
            <div className="panel-list">
              {recentSites.map((s) => (
                <div key={s.id} className="panel-list-item">
                  <div className="panel-list-item-left">
                    <span className={`status-dot status-${s.status}`} />
                    <div>
                      <div className="panel-site-name">
                        {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.subdomain}</a> : s.subdomain}
                      </div>
                      <div className="panel-site-product">{s.productId}</div>
                    </div>
                  </div>
                  <div className="panel-list-item-right">
                    <span className={`badge badge-${s.status}`}>{s.status}</span>
                    <div className="panel-time-ago">{timeAgo(s.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="panel-title">Recent Activity</h3>
          {recentLogs.length === 0 ? (
            <p className="panel-empty">No activity yet.</p>
          ) : (
            <div className="panel-list">
              {recentLogs.map((log) => (
                <div key={log.id} className="panel-list-item">
                  <div className="panel-list-item-left">
                    <span className={`badge activity-badge ${log.action === 'created' ? 'badge-running' : log.action === 'error' ? 'badge-error' : 'badge-expired'}`}>{log.action}</span>
                    <span className="activity-subdomain">
                      {log.site_url ? <a href={log.site_url} target="_blank" rel="noopener noreferrer">{log.subdomain}</a> : log.subdomain}
                    </span>
                  </div>
                  <span className="activity-time">{timeAgo(log.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
