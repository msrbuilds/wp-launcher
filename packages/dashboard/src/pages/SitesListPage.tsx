import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIsLocalMode } from '../context/SettingsContext';
import CountdownTimer from '../components/CountdownTimer';

interface Site {
  id: string;
  subdomain: string;
  productId: string;
  url: string;
  adminUrl: string;
  autoLoginUrl?: string;
  credentials?: { username: string; password: string };
  status: string;
  createdAt: string;
  expiresAt: string;
}

export default function SitesListPage() {
  const { isAuthenticated, token } = useAuth();
  const isLocal = useIsLocalMode();
  const [sites, setSites] = useState<Site[]>([]);
  const [maxSites, setMaxSites] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTemplate, setFilterTemplate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  function fetchSites() {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    fetch('/api/sites', { headers })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSites(data);
        } else if (data && Array.isArray(data.sites)) {
          setSites(data.sites);
          if (data.maxSites != null) setMaxSites(data.maxSites);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    fetchSites();
    const interval = setInterval(fetchSites, 10_000);
    return () => clearInterval(interval);
  }, [token]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this site?')) return;

    await fetch(`/api/sites/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    fetchSites();
  }

  // Derive unique templates and statuses for filters
  const templates = useMemo(() => [...new Set(sites.map((s) => s.productId))].sort(), [sites]);
  const statuses = useMemo(() => [...new Set(sites.map((s) => s.status))].sort(), [sites]);

  // Filtered sites
  const filtered = useMemo(() => {
    let result = sites;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.subdomain.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));
    }
    if (filterTemplate) result = result.filter((s) => s.productId === filterTemplate);
    if (filterStatus) result = result.filter((s) => s.status === filterStatus);
    return result;
  }, [sites, search, filterTemplate, filterStatus]);

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <span className="spinner spinner-dark" /> Loading sites...
      </div>
    );
  }

  if (!isAuthenticated && !isLocal) {
    return (
      <div className="card empty-state">
        <h3>Log in to see your sites</h3>
        <p>
          <a href="/login">Log in</a> or <a href="/">create an account</a> to manage your demo sites.
        </p>
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="card empty-state">
        <div className="empty-icon">
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582" />
          </svg>
        </div>
        <h3>No active sites</h3>
        <p>{isLocal
          ? <>Create a site from the <a href="/create">Create Site</a> page or the <a href="/">Templates</a> page.</>
          : <>Launch a demo from the <a href="/">Products</a> page to see it here.</>
        }</p>
      </div>
    );
  }

  // Local mode: compact table view
  if (isLocal) {
    return (
      <div>
        <div className="page-header">
          <h2>Sites ({sites.length})</h2>
          <p>Manage your WordPress sites</p>
        </div>

        <div className="sites-toolbar">
          <input
            type="text"
            className="sites-search"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="sites-filter"
            value={filterTemplate}
            onChange={(e) => setFilterTemplate(e.target.value)}
          >
            <option value="">All Templates</option>
            {templates.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className="sites-filter"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="card sites-table-wrap">
          <table className="sites-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>Template</th>
                <th>Created</th>
                <th>Expires</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((site) => (
                <tr key={site.id}>
                  <td>
                    <span className={`status-dot status-${site.status}`} />
                    <span className="status-text">{site.status}</span>
                  </td>
                  <td>
                    <a href={site.url} target="_blank" rel="noopener noreferrer" className="site-table-name">
                      {site.subdomain}
                    </a>
                  </td>
                  <td><span className="site-card-product">{site.productId}</span></td>
                  <td className="site-table-date">{new Date(site.createdAt).toLocaleDateString()}</td>
                  <td className="site-table-date"><CountdownTimer expiresAt={site.expiresAt} /></td>
                  <td>
                    <div className="site-table-actions">
                      <a
                        href={site.autoLoginUrl || site.adminUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary btn-xs"
                        title="Login to WP Admin"
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                        Login
                      </a>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-xs"
                        title="Visit site"
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582" /></svg>
                        Visit
                      </a>
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(`docker exec wp-demo-${site.subdomain} wp --allow-root `);
                          const btn = document.activeElement as HTMLButtonElement;
                          const orig = btn.innerHTML;
                          btn.textContent = 'Copied!';
                          setTimeout(() => { btn.innerHTML = orig; }, 1500);
                        }}
                        title="Copy WP-CLI command prefix"
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                        WP-CLI
                      </button>
                      <button
                        className="btn btn-danger-outline btn-xs"
                        onClick={() => handleDelete(site.id)}
                        title="Delete site"
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No sites match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Agency mode: card grid (unchanged)
  return (
    <div>
      <div className="page-header">
        <h2>My Sites ({sites.length}{maxSites ? ` / ${maxSites}` : ''})</h2>
        <p>Manage your active demo sites</p>
      </div>

      <div className="sites-grid">
        {sites.map((site) => (
          <div key={site.id} className="card site-card">
            <div className="site-card-header">
              <div className="site-card-status">
                <span className={`status-dot status-${site.status}`} />
                <span className="status-text">{site.status}</span>
              </div>
              <div className="site-card-timer">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <CountdownTimer expiresAt={site.expiresAt} />
              </div>
            </div>

            <div className="site-card-body">
              <h3 className="site-card-name">
                <a href={site.url} target="_blank" rel="noopener noreferrer">
                  {site.subdomain}
                </a>
              </h3>
              <div className="site-card-meta">
                <span className="site-card-product">{site.productId}</span>
                {site.credentials && (
                  <span className="site-card-user">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
                    </svg>
                    {site.credentials.username}
                  </span>
                )}
              </div>
            </div>

            <div className="site-card-actions">
              {site.autoLoginUrl ? (
                <a
                  href={site.autoLoginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-site-action"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                  </svg>
                  One-Click Login
                </a>
              ) : (
                <a
                  href={site.adminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-site-action"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  WP Admin
                </a>
              )}
              <a
                href={site.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-site-action"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582" />
                </svg>
                Visit Site
              </a>
              <button
                className="btn btn-danger-outline btn-site-action"
                onClick={() => handleDelete(site.id)}
                title="Delete site"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
