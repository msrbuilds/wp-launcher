import React, { useState, useEffect, useMemo } from 'react';
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

interface PhpConfig {
  memoryLimit: string;
  uploadMaxFilesize: string;
  postMaxSize: string;
  maxExecutionTime: string;
  maxInputVars: string;
  displayErrors: string;
  extensions: string[];
}

const DEFAULT_PHP_CONFIG: PhpConfig = {
  memoryLimit: '256M',
  uploadMaxFilesize: '64M',
  postMaxSize: '64M',
  maxExecutionTime: '300',
  maxInputVars: '3000',
  displayErrors: 'On',
  extensions: [],
};

const AVAILABLE_EXTENSIONS = [
  { value: 'redis', label: 'Redis' },
  { value: 'xdebug', label: 'Xdebug' },
  { value: 'sockets', label: 'Sockets' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'pcntl', label: 'PCNTL' },

  { value: 'ldap', label: 'LDAP' },
  { value: 'gettext', label: 'Gettext' },
];

export default function SitesListPage() {
  const { isAuthenticated, token } = useAuth();
  const isLocal = useIsLocalMode();
  const adminApiKey = sessionStorage.getItem('adminApiKey') || '';
  const isAdmin = !!adminApiKey;
  const [sites, setSites] = useState<Site[]>([]);
  const [maxSites, setMaxSites] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTemplate, setFilterTemplate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [phpConfigs, setPhpConfigs] = useState<Record<string, PhpConfig>>({});
  const [savingPhp, setSavingPhp] = useState<string | null>(null);
  const [phpSaveMsg, setPhpSaveMsg] = useState<Record<string, string>>({});

  function getPhpConfig(siteId: string): PhpConfig {
    return phpConfigs[siteId] || { ...DEFAULT_PHP_CONFIG };
  }

  function updatePhpField(siteId: string, field: keyof PhpConfig, value: any) {
    setPhpConfigs((prev) => ({
      ...prev,
      [siteId]: { ...getPhpConfig(siteId), [field]: value },
    }));
  }

  function toggleExtension(siteId: string, ext: string) {
    const cfg = getPhpConfig(siteId);
    const exts = cfg.extensions.includes(ext)
      ? cfg.extensions.filter((e) => e !== ext)
      : [...cfg.extensions, ext];
    updatePhpField(siteId, 'extensions', exts);
  }

  async function handleSavePhpConfig(siteId: string) {
    setSavingPhp(siteId);
    setPhpSaveMsg((prev) => ({ ...prev, [siteId]: '' }));
    try {
      const cfg = getPhpConfig(siteId);
      const res = await fetch(`/api/sites/${siteId}/php-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          memoryLimit: cfg.memoryLimit,
          uploadMaxFilesize: cfg.uploadMaxFilesize,
          postMaxSize: cfg.postMaxSize,
          maxExecutionTime: cfg.maxExecutionTime,
          maxInputVars: cfg.maxInputVars,
          displayErrors: cfg.displayErrors,
          extensions: cfg.extensions.length > 0 ? cfg.extensions.join(',') : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      setPhpSaveMsg((prev) => ({ ...prev, [siteId]: 'Applied! Apache reloaded.' }));
      setTimeout(() => setPhpSaveMsg((prev) => ({ ...prev, [siteId]: '' })), 3000);
    } catch (err: any) {
      setPhpSaveMsg((prev) => ({ ...prev, [siteId]: `Error: ${err.message}` }));
    } finally {
      setSavingPhp(null);
    }
  }

  function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (adminApiKey) headers['X-API-Key'] = adminApiKey;
    return headers;
  }

  function fetchSites() {
    const url = isAdmin ? '/api/sites?all=true' : '/api/sites';
    fetch(url, { headers: getAuthHeaders() })
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
      headers: getAuthHeaders(),
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

  if (!isAuthenticated && !isLocal && !isAdmin) {
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
                <React.Fragment key={site.id}>
                <tr>
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
                        className={`btn btn-secondary btn-xs${expandedSite === site.id ? ' btn-active' : ''}`}
                        onClick={() => setExpandedSite(expandedSite === site.id ? null : site.id)}
                        title="PHP Settings"
                        style={expandedSite === site.id ? { borderColor: '#fb8500', color: '#fb8500' } : {}}
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                        PHP
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
                {expandedSite === site.id && (
                  <tr key={`${site.id}-php`}>
                    <td colSpan={6} style={{ padding: 0, border: 'none' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>PHP Settings</span>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Changes apply instantly (Apache graceful reload)</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem' }}>Memory Limit</label>
                            <select value={getPhpConfig(site.id).memoryLimit} onChange={(e) => updatePhpField(site.id, 'memoryLimit', e.target.value)} style={{ fontSize: '0.8rem', padding: '0.3rem' }}>
                              <option value="128M">128 MB</option>
                              <option value="256M">256 MB</option>
                              <option value="512M">512 MB</option>
                              <option value="1G">1 GB</option>
                              <option value="-1">Unlimited</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem' }}>Upload Max</label>
                            <select value={getPhpConfig(site.id).uploadMaxFilesize} onChange={(e) => updatePhpField(site.id, 'uploadMaxFilesize', e.target.value)} style={{ fontSize: '0.8rem', padding: '0.3rem' }}>
                              <option value="2M">2 MB</option>
                              <option value="16M">16 MB</option>
                              <option value="64M">64 MB</option>
                              <option value="128M">128 MB</option>
                              <option value="256M">256 MB</option>
                              <option value="512M">512 MB</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem' }}>Post Max Size</label>
                            <select value={getPhpConfig(site.id).postMaxSize} onChange={(e) => updatePhpField(site.id, 'postMaxSize', e.target.value)} style={{ fontSize: '0.8rem', padding: '0.3rem' }}>
                              <option value="8M">8 MB</option>
                              <option value="16M">16 MB</option>
                              <option value="64M">64 MB</option>
                              <option value="128M">128 MB</option>
                              <option value="256M">256 MB</option>
                              <option value="512M">512 MB</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem' }}>Max Exec Time</label>
                            <select value={getPhpConfig(site.id).maxExecutionTime} onChange={(e) => updatePhpField(site.id, 'maxExecutionTime', e.target.value)} style={{ fontSize: '0.8rem', padding: '0.3rem' }}>
                              <option value="30">30s</option>
                              <option value="60">60s</option>
                              <option value="120">120s</option>
                              <option value="300">300s</option>
                              <option value="0">Unlimited</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem' }}>Max Input Vars</label>
                            <select value={getPhpConfig(site.id).maxInputVars} onChange={(e) => updatePhpField(site.id, 'maxInputVars', e.target.value)} style={{ fontSize: '0.8rem', padding: '0.3rem' }}>
                              <option value="1000">1,000</option>
                              <option value="3000">3,000</option>
                              <option value="5000">5,000</option>
                              <option value="10000">10,000</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.75rem' }}>Display Errors</label>
                            <select value={getPhpConfig(site.id).displayErrors} onChange={(e) => updatePhpField(site.id, 'displayErrors', e.target.value)} style={{ fontSize: '0.8rem', padding: '0.3rem' }}>
                              <option value="On">On</option>
                              <option value="Off">Off</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ marginTop: '0.75rem' }}>
                          <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.35rem', color: '#94a3b8' }}>Extensions</label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {AVAILABLE_EXTENSIONS.map((ext) => {
                              const active = getPhpConfig(site.id).extensions.includes(ext.value);
                              return (
                                <button
                                  key={ext.value}
                                  type="button"
                                  onClick={() => toggleExtension(site.id, ext.value)}
                                  style={{
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '0.3rem',
                                    border: active ? '1px solid #fb8500' : '1px solid #334155',
                                    background: active ? 'rgba(251, 133, 0, 0.15)' : 'transparent',
                                    color: active ? '#fb8500' : '#94a3b8',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  {ext.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <button
                            className="btn btn-primary btn-xs"
                            onClick={() => handleSavePhpConfig(site.id)}
                            disabled={savingPhp === site.id}
                          >
                            {savingPhp === site.id ? (
                              <><span className="spinner spinner-sm" /> Applying...</>
                            ) : (
                              'Save & Apply'
                            )}
                          </button>
                          {phpSaveMsg[site.id] && (
                            <span style={{ fontSize: '0.75rem', color: phpSaveMsg[site.id].startsWith('Error') ? '#ef4444' : '#22c55e' }}>
                              {phpSaveMsg[site.id]}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
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
