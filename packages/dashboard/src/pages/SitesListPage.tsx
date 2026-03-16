import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIsLocalMode, useFeatures } from '../context/SettingsContext';
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
  const { isAuthenticated } = useAuth();
  const isLocal = useIsLocalMode();
  const features = useFeatures();
  // Admin auth is handled via httpOnly cookie — no sessionStorage needed
  // Features are gated by feature flags — disabled features are hidden for everyone
  const canClone = features.cloning;
  const canSnapshot = features.snapshots;
  const canTemplate = features.templates;
  const canDomain = features.customDomains;
  const canPhp = features.phpConfig;
  const [sites, setSites] = useState<Site[]>([]);
  const [maxSites, setMaxSites] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTemplate, setFilterTemplate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<'php' | 'snapshots' | 'domain' | null>(null);
  const [phpConfigs, setPhpConfigs] = useState<Record<string, PhpConfig>>({});
  const [savingPhp, setSavingPhp] = useState<string | null>(null);
  const [phpSaveMsg, setPhpSaveMsg] = useState<Record<string, string>>({});
  const [loadingPhp, setLoadingPhp] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, { id: string; name: string; size_bytes: number | null; created_at: string }[]>>({});
  const [snapshotLoading, setSnapshotLoading] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const [templateModal, setTemplateModal] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [domainInput, setDomainInput] = useState<Record<string, string>>({});
  const [domainStatus, setDomainStatus] = useState<Record<string, { domain: string | null; status: string; dns?: { baseDomain?: string; serverIp?: string } }>>({});
  const [domainSaving, setDomainSaving] = useState<string | null>(null);
  const [domainError, setDomainError] = useState<Record<string, string>>({});
  const [actionsOpen, setActionsOpen] = useState<string | null>(null);

  function getPhpConfig(siteId: string): PhpConfig {
    return phpConfigs[siteId] || { ...DEFAULT_PHP_CONFIG };
  }

  async function fetchPhpConfig(siteId: string) {
    setLoadingPhp(siteId);
    try {
      const res = await fetch(`/api/sites/${siteId}/php-config`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPhpConfigs((prev) => ({
          ...prev,
          [siteId]: {
            memoryLimit: data.memoryLimit || DEFAULT_PHP_CONFIG.memoryLimit,
            uploadMaxFilesize: data.uploadMaxFilesize || DEFAULT_PHP_CONFIG.uploadMaxFilesize,
            postMaxSize: data.postMaxSize || DEFAULT_PHP_CONFIG.postMaxSize,
            maxExecutionTime: data.maxExecutionTime || DEFAULT_PHP_CONFIG.maxExecutionTime,
            maxInputVars: data.maxInputVars || DEFAULT_PHP_CONFIG.maxInputVars,
            displayErrors: data.displayErrors || DEFAULT_PHP_CONFIG.displayErrors,
            extensions: Array.isArray(data.extensions) ? data.extensions : [],
          },
        }));
      }
    } catch {
      // Fall back to defaults silently
    } finally {
      setLoadingPhp(null);
    }
  }

  async function fetchSnapshots(siteId: string) {
    try {
      const res = await fetch(`/api/sites/${siteId}/snapshots`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSnapshots((prev) => ({ ...prev, [siteId]: data }));
      }
    } catch { /* ignore */ }
  }

  async function handleTakeSnapshot(siteId: string) {
    const name = prompt('Snapshot name (optional):') ?? undefined;
    setSnapshotLoading(siteId);
    try {
      const res = await fetch(`/api/sites/${siteId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        await fetchSnapshots(siteId);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to take snapshot');
      }
    } catch {
      alert('Failed to take snapshot');
    } finally {
      setSnapshotLoading(null);
    }
  }

  async function handleRestoreSnapshot(siteId: string, snapshotId: string) {
    if (!confirm('Restore this snapshot? Current site data will be replaced.')) return;
    setSnapshotLoading(siteId);
    try {
      const res = await fetch(`/api/sites/${siteId}/snapshots/${snapshotId}/restore`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to restore');
      }
    } catch {
      alert('Failed to restore snapshot');
    } finally {
      setSnapshotLoading(null);
    }
  }

  async function handleDeleteSnapshot(siteId: string, snapshotId: string) {
    if (!confirm('Delete this snapshot?')) return;
    try {
      await fetch(`/api/sites/${siteId}/snapshots/${snapshotId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      await fetchSnapshots(siteId);
    } catch { /* ignore */ }
  }

  async function handleCloneSite(siteId: string) {
    if (!confirm('Clone this site? A new site will be created with the same content.')) return;
    setCloning(siteId);
    try {
      const res = await fetch(`/api/sites/${siteId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        alert('Site cloned successfully! Refresh to see the new site.');
        fetchSites();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to clone site');
      }
    } catch {
      alert('Failed to clone site');
    } finally {
      setCloning(null);
    }
  }

  async function handleExportTemplate(siteId: string) {
    if (!templateId.trim()) {
      setTemplateError('Template ID is required');
      return;
    }
    setTemplateSaving(true);
    setTemplateError('');
    try {
      const res = await fetch(`/api/sites/${siteId}/export-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ templateId: templateId.trim(), templateName: templateName.trim() || templateId.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setTemplateModal(null);
        setTemplateId('');
        setTemplateName('');
        alert(`Template "${data.name}" saved successfully! It will appear in your templates list.`);
      } else {
        const data = await res.json();
        setTemplateError(data.error || 'Failed to export template');
      }
    } catch {
      setTemplateError('Failed to export template');
    } finally {
      setTemplateSaving(false);
    }
  }

  async function fetchDomainStatus(siteId: string) {
    try {
      const res = await fetch(`/api/sites/${siteId}/domain`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDomainStatus((prev) => ({ ...prev, [siteId]: data }));
        if (data.domain) setDomainInput((prev) => ({ ...prev, [siteId]: data.domain }));
      }
    } catch { /* ignore */ }
  }

  async function handleSetDomain(siteId: string) {
    const domain = (domainInput[siteId] || '').trim();
    if (!domain) return;
    setDomainSaving(siteId);
    setDomainError((prev) => ({ ...prev, [siteId]: '' }));
    try {
      const res = await fetch(`/api/sites/${siteId}/domain`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ domain }),
      });
      if (res.ok) {
        const data = await res.json();
        setDomainStatus((prev) => ({ ...prev, [siteId]: data }));
      } else {
        const data = await res.json();
        setDomainError((prev) => ({ ...prev, [siteId]: data.error || 'Failed to set domain' }));
      }
    } catch {
      setDomainError((prev) => ({ ...prev, [siteId]: 'Failed to set domain' }));
    } finally {
      setDomainSaving(null);
    }
  }

  async function handleRemoveDomain(siteId: string) {
    if (!confirm('Remove custom domain?')) return;
    setDomainSaving(siteId);
    try {
      await fetch(`/api/sites/${siteId}/domain`, { method: 'DELETE', credentials: 'include' });
      setDomainStatus((prev) => ({ ...prev, [siteId]: { domain: null, status: 'none' } }));
      setDomainInput((prev) => ({ ...prev, [siteId]: '' }));
    } catch { /* ignore */ }
    finally { setDomainSaving(null); }
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  // Auth is handled via httpOnly cookies sent with credentials: 'include'

  async function handleAutoLogin(siteId: string, fallbackUrl: string) {
    try {
      const res = await fetch(`/api/sites/${siteId}/autologin`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        window.open(data.autoLoginUrl, '_blank');
      } else {
        window.open(fallbackUrl, '_blank');
      }
    } catch {
      window.open(fallbackUrl, '_blank');
    }
  }

  const [fetchError, setFetchError] = useState('');

  function fetchSites() {
    const url = '/api/sites';
    fetch(url, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSites(data);
        } else if (data && Array.isArray(data.sites)) {
          setSites(data.sites);
          if (data.maxSites != null) setMaxSites(data.maxSites);
        }
        setLoading(false);
        setFetchError('');
      })
      .catch(() => {
        setLoading(false);
        setFetchError('Failed to load sites. Please check your connection.');
      });
  }

  useEffect(() => {
    fetchSites();
    const interval = setInterval(fetchSites, 10_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this site?')) return;

    await fetch(`/api/sites/${id}`, {
      method: 'DELETE',
      credentials: 'include',
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

  if (fetchError) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.75rem 1rem', borderRadius: '6px', margin: '2rem' }}>
        {fetchError}
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
                <th>Actions</th>
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
                  <td>
                    <div className="site-table-actions" style={{ justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-primary btn-xs"
                        title="Login to WP Admin"
                        onClick={() => handleAutoLogin(site.id, site.adminUrl)}
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                        Login
                      </button>
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
                      {canClone && (
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => handleCloneSite(site.id)}
                        disabled={cloning === site.id || site.status !== 'running'}
                        title="Clone this site"
                      >
                        {cloning === site.id ? <><span className="spinner spinner-sm" /></> : (
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" /></svg>
                        )}
                        Clone
                      </button>
                      )}
                      {!isLocal && canDomain && (
                      <button
                        className={`btn btn-secondary btn-xs${expandedSite === site.id && expandedPanel === 'domain' ? ' btn-active' : ''}`}
                        onClick={() => {
                          if (expandedSite === site.id && expandedPanel === 'domain') {
                            setExpandedSite(null);
                            setExpandedPanel(null);
                          } else {
                            setExpandedSite(site.id);
                            setExpandedPanel('domain');
                            if (!domainStatus[site.id]) fetchDomainStatus(site.id);
                          }
                        }}
                        disabled={site.status !== 'running'}
                        title="Custom Domain"
                        style={expandedSite === site.id && expandedPanel === 'domain' ? { borderColor: '#fb8500', color: '#fb8500' } : {}}
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 2.164A8.961 8.961 0 0 1 21 12c0 .778-.099 1.533-.284 2.253" /></svg>
                        Domain
                      </button>
                      )}
                      {canTemplate && (
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => {
                          setTemplateModal(site.id);
                          setTemplateId('');
                          setTemplateName('');
                          setTemplateError('');
                        }}
                        disabled={site.status !== 'running'}
                        title="Save as Template"
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
                        Template
                      </button>
                      )}
                      {canSnapshot && (
                      <button
                        className={`btn btn-secondary btn-xs${expandedSite === site.id && expandedPanel === 'snapshots' ? ' btn-active' : ''}`}
                        onClick={() => {
                          if (expandedSite === site.id && expandedPanel === 'snapshots') {
                            setExpandedSite(null);
                            setExpandedPanel(null);
                          } else {
                            setExpandedSite(site.id);
                            setExpandedPanel('snapshots');
                            if (!snapshots[site.id]) fetchSnapshots(site.id);
                          }
                        }}
                        title="Snapshots"
                        style={expandedSite === site.id && expandedPanel === 'snapshots' ? { borderColor: '#fb8500', color: '#fb8500' } : {}}
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" /></svg>
                        Snaps
                      </button>
                      )}
                      {canPhp && (
                      <button
                        className={`btn btn-secondary btn-xs${expandedSite === site.id && expandedPanel === 'php' ? ' btn-active' : ''}`}
                        onClick={() => {
                          if (expandedSite === site.id && expandedPanel === 'php') {
                            setExpandedSite(null);
                            setExpandedPanel(null);
                          } else {
                            setExpandedSite(site.id);
                            setExpandedPanel('php');
                            if (!phpConfigs[site.id]) fetchPhpConfig(site.id);
                          }
                        }}
                        title="PHP Settings"
                        style={expandedSite === site.id && expandedPanel === 'php' ? { borderColor: '#fb8500', color: '#fb8500' } : {}}
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                        PHP
                      </button>
                      )}
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
                {canSnapshot && expandedSite === site.id && expandedPanel === 'snapshots' && (
                  <tr key={`${site.id}-snaps`}>
                    <td colSpan={5} style={{ padding: 0, border: 'none' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>Snapshots</span>
                          <button
                            className="btn btn-primary btn-xs"
                            onClick={() => handleTakeSnapshot(site.id)}
                            disabled={snapshotLoading === site.id}
                          >
                            {snapshotLoading === site.id ? <><span className="spinner spinner-sm" /> Working...</> : 'Take Snapshot'}
                          </button>
                        </div>
                        {(snapshots[site.id] || []).length === 0 ? (
                          <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No snapshots yet. Take one to save the current state.</p>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                                <th style={{ padding: '0.375rem', textAlign: 'left' }}>Name</th>
                                <th style={{ padding: '0.375rem', textAlign: 'left' }}>Size</th>
                                <th style={{ padding: '0.375rem', textAlign: 'left' }}>Created</th>
                                <th style={{ padding: '0.375rem', textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(snapshots[site.id] || []).map((snap) => (
                                <tr key={snap.id} style={{ borderBottom: '1px solid #1e293b', color: '#e2e8f0' }}>
                                  <td style={{ padding: '0.375rem' }}>{snap.name}</td>
                                  <td style={{ padding: '0.375rem' }}>{snap.size_bytes ? `${(snap.size_bytes / 1024 / 1024).toFixed(1)} MB` : '—'}</td>
                                  <td style={{ padding: '0.375rem' }}>{new Date(snap.created_at).toLocaleString()}</td>
                                  <td style={{ padding: '0.375rem', textAlign: 'right' }}>
                                    <button className="btn btn-secondary btn-xs" style={{ marginRight: '0.25rem' }}
                                      onClick={() => handleRestoreSnapshot(site.id, snap.id)}
                                      disabled={snapshotLoading === site.id}
                                    >Restore</button>
                                    <button className="btn btn-danger-outline btn-xs"
                                      onClick={() => handleDeleteSnapshot(site.id, snap.id)}
                                    >Delete</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {!isLocal && canDomain && expandedSite === site.id && expandedPanel === 'domain' && (
                  <tr key={`${site.id}-domain`}>
                    <td colSpan={5} style={{ padding: 0, border: 'none' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.75rem', display: 'block' }}>Custom Domain</span>
                        {domainStatus[site.id]?.domain ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>{domainStatus[site.id].domain}</span>
                              <span style={{
                                fontSize: '0.7rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '9999px',
                                background: domainStatus[site.id].status === 'verified' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                                color: domainStatus[site.id].status === 'verified' ? '#22c55e' : '#eab308',
                              }}>
                                {domainStatus[site.id].status === 'verified' ? 'DNS Verified' : 'DNS Pending'}
                              </span>
                              <button
                                className="btn btn-secondary btn-xs"
                                onClick={() => fetchDomainStatus(site.id)}
                                style={{ marginLeft: 'auto' }}
                              >Recheck</button>
                              <button
                                className="btn btn-danger-outline btn-xs"
                                onClick={() => handleRemoveDomain(site.id)}
                                disabled={domainSaving === site.id}
                              >Remove</button>
                            </div>
                            <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0 }}>
                              Point a CNAME record for <strong>{domainStatus[site.id].domain}</strong> to <strong>{site.subdomain}.{window.location.hostname}</strong>
                            </p>
                          </div>
                        ) : (
                          <div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <input
                                type="text"
                                placeholder="demo.yourdomain.com"
                                value={domainInput[site.id] || ''}
                                onChange={(e) => setDomainInput((prev) => ({ ...prev, [site.id]: e.target.value }))}
                                style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                                disabled={domainSaving === site.id}
                              />
                              <button
                                className="btn btn-primary btn-xs"
                                onClick={() => handleSetDomain(site.id)}
                                disabled={domainSaving === site.id || !(domainInput[site.id] || '').trim()}
                              >
                                {domainSaving === site.id ? <><span className="spinner spinner-sm" /> Saving...</> : 'Set Domain'}
                              </button>
                            </div>
                            {domainError[site.id] && (
                              <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.35rem', marginBottom: 0 }}>{domainError[site.id]}</p>
                            )}
                            <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.5rem', marginBottom: 0 }}>
                              After setting, create a CNAME DNS record pointing to <strong>{site.subdomain}.{window.location.hostname}</strong>
                            </p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {canPhp && expandedSite === site.id && expandedPanel === 'php' && (
                  <tr key={`${site.id}-php`}>
                    <td colSpan={5} style={{ padding: 0, border: 'none' }}>
                      <div style={{ padding: '1rem 1.25rem', background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>PHP Settings</span>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Changes apply instantly (Apache graceful reload)</span>
                        </div>
                        {loadingPhp === site.id ? (
                          <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>
                            <span className="spinner spinner-sm" /> Loading PHP config...
                          </div>
                        ) : (
                        <>
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
                        </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No sites match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Save as Template Modal */}
        {templateModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={() => !templateSaving && setTemplateModal(null)}
          >
            <div style={{ background: '#1e293b', borderRadius: '0.75rem', padding: '1.5rem', width: '100%', maxWidth: '420px', border: '1px solid #334155' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 0.25rem', color: '#e2e8f0', fontSize: '1.1rem' }}>Save as Template</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 1rem' }}>
                Export this site's plugins, themes, and settings as a reusable template.
              </p>
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Template ID (slug)</label>
                <input
                  type="text"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="e.g. my-starter-theme"
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem' }}
                  disabled={templateSaving}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Template Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. My Starter Theme"
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem' }}
                  disabled={templateSaving}
                />
              </div>
              {templateError && (
                <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{templateError}</div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setTemplateModal(null)}
                  disabled={templateSaving}
                >Cancel</button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleExportTemplate(templateModal)}
                  disabled={templateSaving || !templateId.trim()}
                >
                  {templateSaving ? <><span className="spinner spinner-sm" /> Exporting...</> : 'Save Template'}
                </button>
              </div>
            </div>
          </div>
        )}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div className="site-card-timer">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <CountdownTimer expiresAt={site.expiresAt} />
                </div>
                {(canClone || canSnapshot || canTemplate || canDomain || canPhp) && site.status === 'running' && (
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => {
                    setActionsOpen(actionsOpen === site.id ? null : site.id);
                    setExpandedSite(null);
                    setExpandedPanel(null);
                  }}
                  title="Tools"
                >
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.049.58.025 1.193-.14 1.743" /></svg>
                  Tools
                </button>
                )}
              </div>
            </div>

            {/* Actions panel (dropdown) */}
            {actionsOpen === site.id && (
            <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #2d3748', background: '#1a202c', display: 'flex', flexDirection: 'column', gap: '0' }}>
              {canClone && (
              <button
                onClick={() => { handleCloneSite(site.id); setActionsOpen(null); }}
                disabled={cloning === site.id}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.5rem', background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.85rem', borderRadius: '4px', width: '100%', textAlign: 'left' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#2d3748')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {cloning === site.id ? <span className="spinner spinner-sm" /> : (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" /></svg>
                )}
                Clone Site
              </button>
              )}
              {canDomain && (
              <button
                onClick={() => {
                  setActionsOpen(null);
                  setExpandedSite(site.id);
                  setExpandedPanel('domain');
                  if (!domainStatus[site.id]) fetchDomainStatus(site.id);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.5rem', background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.85rem', borderRadius: '4px', width: '100%', textAlign: 'left' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#2d3748')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 2.164A8.961 8.961 0 0 1 21 12c0 .778-.099 1.533-.284 2.253" /></svg>
                Custom Domain
              </button>
              )}
              {canTemplate && (
              <button
                onClick={() => {
                  setActionsOpen(null);
                  setTemplateModal(site.id);
                  setTemplateId('');
                  setTemplateName('');
                  setTemplateError('');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.5rem', background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.85rem', borderRadius: '4px', width: '100%', textAlign: 'left' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#2d3748')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
                Save as Template
              </button>
              )}
              {canSnapshot && (
              <button
                onClick={() => {
                  setActionsOpen(null);
                  setExpandedSite(site.id);
                  setExpandedPanel('snapshots');
                  if (!snapshots[site.id]) fetchSnapshots(site.id);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.5rem', background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.85rem', borderRadius: '4px', width: '100%', textAlign: 'left' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#2d3748')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" /></svg>
                Snapshots
              </button>
              )}
              {canPhp && (
              <button
                onClick={() => {
                  setActionsOpen(null);
                  setExpandedSite(site.id);
                  setExpandedPanel('php');
                  if (!phpConfigs[site.id]) fetchPhpConfig(site.id);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.5rem', background: 'transparent', border: 'none', color: '#e2e8f0', cursor: 'pointer', fontSize: '0.85rem', borderRadius: '4px', width: '100%', textAlign: 'left' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#2d3748')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                PHP Settings
              </button>
              )}
              <div style={{ borderTop: '1px solid #2d3748', margin: '0.25rem 0' }} />
              <button
                onClick={() => { handleDelete(site.id); setActionsOpen(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.5rem', background: 'transparent', border: 'none', color: '#fc8181', cursor: 'pointer', fontSize: '0.85rem', borderRadius: '4px', width: '100%', textAlign: 'left' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#2d3748')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                Delete Site
              </button>
            </div>
            )}

            {/* Expandable panels for agency mode — placed right after dropdown for visibility */}
            {canSnapshot && expandedSite === site.id && expandedPanel === 'snapshots' && (
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #2d3748', background: '#1a202c' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <strong style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>Snapshots</strong>
                <button className="btn btn-primary btn-xs" onClick={() => handleTakeSnapshot(site.id)} disabled={snapshotLoading === site.id}>
                  {snapshotLoading === site.id ? <span className="spinner spinner-sm" /> : '+ Create'}
                </button>
                <button className="btn btn-secondary btn-xs" onClick={() => { setExpandedSite(null); setExpandedPanel(null); }} style={{ marginLeft: 'auto' }}>Close</button>
              </div>
              {(snapshots[site.id] || []).length === 0 ? (
                <p style={{ color: '#a0aec0', fontSize: '0.8rem', margin: 0 }}>No snapshots yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {(snapshots[site.id] || []).map((snap) => (
                    <div key={snap.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0.5rem', background: '#2d3748', borderRadius: '4px', fontSize: '0.8rem' }}>
                      <span style={{ color: '#e2e8f0' }}>{snap.name} <span style={{ color: '#a0aec0' }}>({new Date(snap.created_at).toLocaleDateString()})</span></span>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className="btn btn-secondary btn-xs" onClick={() => handleRestoreSnapshot(site.id, snap.id)} disabled={snapshotLoading === site.id}>Restore</button>
                        <button className="btn btn-danger-outline btn-xs" onClick={() => handleDeleteSnapshot(site.id, snap.id)} disabled={snapshotLoading === site.id}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {canDomain && expandedSite === site.id && expandedPanel === 'domain' && (
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #2d3748', background: '#1a202c' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>Custom Domain</strong>
                <button className="btn btn-secondary btn-xs" onClick={() => { setExpandedSite(null); setExpandedPanel(null); }} style={{ marginLeft: 'auto' }}>Close</button>
              </div>
              {domainStatus[site.id]?.domain ? (
                <div style={{ fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#e2e8f0' }}>{domainStatus[site.id].domain}</span>
                    <span style={{ color: domainStatus[site.id].status === 'verified' ? '#48bb78' : '#ecc94b', fontSize: '0.75rem', fontWeight: 600 }}>
                      {domainStatus[site.id].status === 'verified' ? 'Verified' : 'Pending DNS'}
                    </span>
                    <button className="btn btn-danger-outline btn-xs" onClick={() => handleRemoveDomain(site.id)} disabled={domainSaving === site.id}>Remove</button>
                  </div>
                  {domainStatus[site.id].status !== 'verified' && (
                    <div style={{ color: '#a0aec0', fontSize: '0.75rem', margin: 0 }}>
                      <p style={{ margin: '0 0 0.35rem', fontWeight: 600, color: '#cbd5e1' }}>Configure your DNS (choose one):</p>
                      <p style={{ margin: '0 0 0.2rem' }}>
                        <strong style={{ color: '#e2e8f0' }}>CNAME</strong> (for subdomains like demo.client.com):<br />
                        <code style={{ background: '#2d3748', padding: '0.1rem 0.3rem', fontSize: '0.7rem', color: '#e2e8f0' }}>{domainStatus[site.id].domain} → CNAME → {domainStatus[site.id].dns?.baseDomain || window.location.hostname}</code>
                      </p>
                      <p style={{ margin: '0 0 0.2rem' }}>
                        <strong style={{ color: '#e2e8f0' }}>A Record</strong> (for root domains like client.com):<br />
                        <code style={{ background: '#2d3748', padding: '0.1rem 0.3rem', fontSize: '0.7rem', color: '#e2e8f0' }}>{domainStatus[site.id].domain} → A → {domainStatus[site.id].dns?.serverIp || 'your server IP'}</code>
                      </p>
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.7rem', color: '#718096' }}>DNS changes may take up to 24-48 hours to propagate.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="demo.example.com or example.com"
                      value={domainInput[site.id] || ''}
                      onChange={(e) => setDomainInput((prev) => ({ ...prev, [site.id]: e.target.value }))}
                      style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #4a5568', background: '#2d3748', color: '#e2e8f0', fontSize: '0.85rem', flex: 1 }}
                    />
                    <button className="btn btn-primary btn-xs" onClick={() => handleSetDomain(site.id)} disabled={domainSaving === site.id || !domainInput[site.id]}>
                      {domainSaving === site.id ? <span className="spinner spinner-sm" /> : 'Set Domain'}
                    </button>
                  </div>
                  <p style={{ color: '#718096', fontSize: '0.7rem', margin: 0 }}>
                    After setting, you'll need to add a CNAME or A record in your DNS provider pointing to this server.
                    WordPress URLs will be automatically updated.
                  </p>
                </div>
              )}
              {domainError[site.id] && <p style={{ color: '#fc8181', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>{domainError[site.id]}</p>}
            </div>
            )}

            {canPhp && expandedSite === site.id && expandedPanel === 'php' && (
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #2d3748', background: '#1a202c' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>PHP Configuration</strong>
                <button className="btn btn-secondary btn-xs" onClick={() => { setExpandedSite(null); setExpandedPanel(null); }} style={{ marginLeft: 'auto' }}>Close</button>
              </div>
              {loadingPhp === site.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span className="spinner spinner-sm" /> <span style={{ color: '#a0aec0', fontSize: '0.85rem' }}>Loading...</span></div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                  {[
                    { key: 'memoryLimit', label: 'Memory' },
                    { key: 'uploadMaxFilesize', label: 'Upload Max' },
                    { key: 'postMaxSize', label: 'Post Max' },
                    { key: 'maxExecutionTime', label: 'Max Exec Time' },
                    { key: 'maxInputVars', label: 'Max Input Vars' },
                    { key: 'displayErrors', label: 'Display Errors' },
                  ].map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                      <label style={{ color: '#a0aec0', fontSize: '0.75rem' }}>{label}</label>
                      <input
                        type="text"
                        value={(getPhpConfig(site.id) as unknown as Record<string, string>)[key] || ''}
                        onChange={(e) => setPhpConfigs((prev) => ({
                          ...prev,
                          [site.id]: { ...getPhpConfig(site.id), [key]: e.target.value },
                        }))}
                        style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #4a5568', background: '#2d3748', color: '#e2e8f0', fontSize: '0.8rem' }}
                      />
                    </div>
                  ))}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                    <button
                      className="btn btn-primary btn-xs"
                      onClick={() => handleSavePhpConfig(site.id)}
                      disabled={savingPhp === site.id}
                    >
                      {savingPhp === site.id ? <span className="spinner spinner-sm" /> : 'Save PHP Config'}
                    </button>
                    {phpSaveMsg[site.id] && <span style={{ color: '#48bb78', fontSize: '0.75rem' }}>{phpSaveMsg[site.id]}</span>}
                  </div>
                </div>
              )}
            </div>
            )}

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
              <button
                className="btn btn-primary btn-site-action"
                onClick={() => handleAutoLogin(site.id, site.adminUrl)}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                </svg>
                One-Click Login
              </button>
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

      {/* Save as Template Modal (agency mode) */}
      {templateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => !templateSaving && setTemplateModal(null)}
        >
          <div className="card" style={{ width: '100%', maxWidth: '420px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem' }}>Save as Template</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 1rem' }}>
              Export this site's plugins, themes, and settings as a reusable template.
            </p>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Template ID (slug)</label>
              <input
                type="text"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="e.g. my-starter-theme"
                disabled={templateSaving}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Template Name</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. My Starter Theme"
                disabled={templateSaving}
              />
            </div>
            {templateError && (
              <div className="alert-error">{templateError}</div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setTemplateModal(null)}
                disabled={templateSaving}
              >Cancel</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleExportTemplate(templateModal)}
                disabled={templateSaving || !templateId.trim()}
              >
                {templateSaving ? <><span className="spinner spinner-sm" /> Exporting...</> : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
