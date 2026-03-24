import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useIsLocalMode, useFeatures } from '../context/SettingsContext';
import CountdownTimer from '../components/CountdownTimer';
import { apiFetch } from '../utils/api';

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
  hostPath?: string;
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
  const navigate = useNavigate();
  // Admin auth is handled via httpOnly cookie — no sessionStorage needed
  // Features are gated by feature flags — disabled features are hidden for everyone
  const canClone = features.cloning;
  const canSnapshot = features.snapshots;
  const canTemplate = features.templates;
  const canDomain = features.customDomains;
  const canPhp = features.phpConfig;
  const canExtend = features.siteExtend;
  const canPassword = features.sitePassword;
  const canExport = features.exportZip;
  const canHealth = features.healthMonitoring;
  const canShare = features.collaborativeSites;
  const canAdminer = features.adminer;
  const canTunnel = features.publicSharing;
  const [sites, setSites] = useState<Site[]>([]);
  const [maxSites, setMaxSites] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTemplate, setFilterTemplate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<'php' | 'snapshots' | 'domain' | 'health' | 'share' | 'tunnel' | null>(null);
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
  const [domainRechecking, setDomainRechecking] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<{ action: string; subdomain: string; product_id: string; created_at: string; site_url: string | null }[]>([]);
  const [showActivity, setShowActivity] = useState(false);

  function getPhpConfig(siteId: string): PhpConfig {
    return phpConfigs[siteId] || { ...DEFAULT_PHP_CONFIG };
  }

  async function fetchPhpConfig(siteId: string) {
    setLoadingPhp(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/php-config`);
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
      const res = await apiFetch(`/api/sites/${siteId}/snapshots`);
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
      const res = await apiFetch(`/api/sites/${siteId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await apiFetch(`/api/sites/${siteId}/snapshots/${snapshotId}/restore`, {
        method: 'POST',
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
      await apiFetch(`/api/sites/${siteId}/snapshots/${snapshotId}`, {
        method: 'DELETE',
      });
      await fetchSnapshots(siteId);
    } catch { /* ignore */ }
  }

  async function handleCloneSite(siteId: string) {
    if (!confirm('Clone this site? A new site will be created with the same content.')) return;
    setCloning(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
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
      const res = await apiFetch(`/api/sites/${siteId}/export-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  async function fetchDomainStatus(siteId: string, showLoading = false) {
    if (showLoading) setDomainRechecking(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/domain`);
      if (res.ok) {
        const data = await res.json();
        setDomainStatus((prev) => ({ ...prev, [siteId]: data }));
        if (data.domain) setDomainInput((prev) => ({ ...prev, [siteId]: data.domain }));
      }
    } catch { /* ignore */ }
    finally { if (showLoading) setDomainRechecking(null); }
  }

  async function handleSetDomain(siteId: string) {
    const domain = (domainInput[siteId] || '').trim();
    if (!domain) return;
    setDomainSaving(siteId);
    setDomainError((prev) => ({ ...prev, [siteId]: '' }));
    try {
      const res = await apiFetch(`/api/sites/${siteId}/domain`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
      await apiFetch(`/api/sites/${siteId}/domain`, { method: 'DELETE' });
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
      const res = await apiFetch(`/api/sites/${siteId}/php-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await apiFetch(`/api/sites/${siteId}/autologin`, {
        method: 'POST',
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
  const [siteReady, setSiteReady] = useState<Record<string, boolean>>({});

  // Poll readiness for sites created in the last 2 minutes
  useEffect(() => {
    const recentSites = sites.filter(s => s.status === 'running' && (Date.now() - new Date(s.createdAt).getTime()) < 120000 && !siteReady[s.id]);
    if (recentSites.length === 0) return;
    let cancelled = false;
    for (const s of recentSites) {
      (async () => {
        for (let i = 0; i < 30 && !cancelled; i++) {
          try {
            const res = await apiFetch(`/api/sites/${s.id}/ready`);
            if (res.ok) {
              const data = await res.json();
              if (data.ready) {
                setSiteReady(prev => ({ ...prev, [s.id]: true }));
                return;
              }
            }
          } catch { /* not ready */ }
          await new Promise(r => setTimeout(r, 3000));
        }
      })();
    }
    return () => { cancelled = true; };
  }, [sites.map(s => s.id).join(',')]);

  function isSiteReady(site: Site): boolean {
    if (site.status !== 'running') return false;
    // Sites older than 2 minutes are always considered ready
    if (Date.now() - new Date(site.createdAt).getTime() > 120000) return true;
    return !!siteReady[site.id];
  }

  function fetchSites() {
    const url = '/api/sites';
    apiFetch(url)
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

  function fetchActivity() {
    apiFetch('/api/sites/my/activity')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setActivityLog(data.slice(0, 20)); })
      .catch(() => {});
  }

  // Scheduled launches
  const canSchedule = features.scheduledLaunch;
  const [scheduledLaunches, setScheduledLaunches] = useState<any[]>([]);

  function fetchScheduled() {
    if (!canSchedule) return;
    apiFetch('/api/sites/scheduled')
      .then(r => r.json())
      .then(data => { if (data.launches) setScheduledLaunches(data.launches.filter((l: any) => l.status === 'pending')); })
      .catch(() => {});
  }

  async function handleCancelScheduled(id: string) {
    if (!confirm('Cancel this scheduled launch?')) return;
    await apiFetch(`/api/sites/scheduled/${id}`, { method: 'DELETE' });
    fetchScheduled();
  }

  useEffect(() => {
    fetchSites();
    fetchScheduled();
    const interval = setInterval(fetchSites, 10_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this site?')) return;

    await apiFetch(`/api/sites/${id}`, {
      method: 'DELETE',
    });
    fetchSites();
  }

  const [extendOpen, setExtendOpen] = useState<string | null>(null);
  const EXTEND_OPTIONS = [
    { label: '30 minutes', value: '30m' },
    { label: '1 hour', value: '1h' },
    { label: '2 hours', value: '2h' },
    { label: '6 hours', value: '6h' },
    { label: '1 day', value: '1d' },
  ];

  async function handleExtend(siteId: string, duration: string) {
    setExtendOpen(null);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to extend site' }));
        alert(err.error || 'Failed to extend site');
        return;
      }
      fetchSites();
    } catch {
      alert('Failed to extend site');
    }
  }

  // Site password protection
  const [passwordModal, setPasswordModal] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordScope, setPasswordScope] = useState<'frontend' | 'admin' | 'all'>('frontend');
  const [passwordLoading, setPasswordLoading] = useState<string | null>(null);

  async function handleSetPassword(siteId: string) {
    setPasswordLoading(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordValue || null, scope: passwordScope }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        alert(err.error || 'Failed to set password');
        return;
      }
      setPasswordModal(null);
      setPasswordValue('');
    } catch {
      alert('Failed to set password');
    } finally {
      setPasswordLoading(null);
    }
  }

  async function handleRemovePassword(siteId: string) {
    setPasswordLoading(siteId);
    try {
      await apiFetch(`/api/sites/${siteId}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: null }),
      });
    } catch {}
    setPasswordLoading(null);
  }

  // Export site as ZIP
  const [exportLoading, setExportLoading] = useState<string | null>(null);

  async function handleExportZip(siteId: string) {
    setExportLoading(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/export-zip`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to export' }));
        alert(err.error || 'Failed to export site');
        return;
      }
      const data = await res.json();
      if (!data.downloadUrl) {
        alert('Export failed: no download URL returned');
        return;
      }
      // Download with credentials and trigger browser save
      const dlRes = await apiFetch(data.downloadUrl);
      if (!dlRes.ok) {
        alert('Download failed');
        return;
      }
      const blob = await dlRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'site-export.tar.gz';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export site');
    } finally {
      setExportLoading(null);
    }
  }

  // Adminer (Database Manager)
  const [dbModal, setDbModal] = useState<{ site: Site; host: string; user: string; password: string; database: string; dbEngine: string; adminerUrl: string } | null>(null);
  const [dbCopied, setDbCopied] = useState('');

  async function handleOpenAdminer(site: Site) {
    try {
      const res = await apiFetch(`/api/sites/${site.id}/db-credentials`, { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to get database credentials' }));
        alert(err.error || 'Failed to get database credentials');
        return;
      }
      const data = await res.json();
      if (!data.supported) {
        alert(data.message || 'This site uses SQLite and does not support Adminer');
        return;
      }
      console.log('[DB Modal] Setting credentials:', data);
      setDbModal({ site, host: data.host, user: data.user, password: data.password, database: data.database, dbEngine: data.dbEngine, adminerUrl: data.adminerUrl });
      setDbCopied('');
    } catch {
      alert('Failed to get database credentials');
    }
  }

  function copyDbField(value: string, field: string) {
    navigator.clipboard.writeText(value);
    setDbCopied(field);
    setTimeout(() => setDbCopied(''), 2000);
  }

  // Public Sharing (Tunnels)
  const [tunnelStatus, setTunnelStatus] = useState<Record<string, { active: boolean; method?: string; url?: string | null; status?: string }>>({});
  const [tunnelCreating, setTunnelCreating] = useState<string | null>(null);
  const [tunnelMethod, setTunnelMethod] = useState<'lan' | 'cloudflare' | 'ngrok'>('cloudflare');
  const [ngrokToken, setNgrokToken] = useState('');
  const [tunnelCopied, setTunnelCopied] = useState(false);

  async function fetchTunnelStatus(siteId: string, poll = false) {
    try {
      const res = await apiFetch(`/api/sites/${siteId}/tunnel`);
      if (res.ok) {
        const data = await res.json();
        setTunnelStatus(prev => ({ ...prev, [siteId]: data }));
        if (poll && data.active && data.status === 'connecting') {
          setTimeout(() => fetchTunnelStatus(siteId, true), 2000);
        }
      }
    } catch {}
  }

  async function handleCreateTunnel(siteId: string) {
    setTunnelCreating(siteId);
    try {
      const body: any = { method: tunnelMethod };
      if (tunnelMethod === 'ngrok') body.ngrokAuthToken = ngrokToken;
      const res = await apiFetch(`/api/sites/${siteId}/tunnel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to create tunnel' }));
        alert(err.error || 'Failed to create tunnel');
        return;
      }
      // Poll for URL
      setTimeout(() => fetchTunnelStatus(siteId, true), 2000);
      setTunnelStatus(prev => ({ ...prev, [siteId]: { active: true, method: tunnelMethod, url: null, status: 'connecting' } }));
    } catch {
      alert('Failed to create tunnel');
    } finally {
      setTunnelCreating(null);
    }
  }

  async function handleRemoveTunnel(siteId: string) {
    try {
      await apiFetch(`/api/sites/${siteId}/tunnel`, { method: 'DELETE' });
      setTunnelStatus(prev => ({ ...prev, [siteId]: { active: false } }));
    } catch {}
  }

  // Site health stats
  const [healthStats, setHealthStats] = useState<Record<string, any>>({});
  const [healthLoading, setHealthLoading] = useState<string | null>(null);

  async function fetchHealthStats(siteId: string) {
    setHealthLoading(siteId);
    try {
      const res = await apiFetch(`/api/sites/${siteId}/stats`);
      if (res.ok) {
        const data = await res.json();
        setHealthStats(prev => ({ ...prev, [siteId]: data }));
      }
    } catch {}
    setHealthLoading(null);
  }

  // Collaborative sites — sharing
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState<'viewer' | 'admin'>('viewer');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [siteShares, setSiteShares] = useState<Record<string, any[]>>({});
  const [sharedWithMe, setSharedWithMe] = useState<any[]>([]);

  async function fetchShares(siteId: string) {
    try {
      const res = await apiFetch(`/api/sites/${siteId}/shares`);
      if (res.ok) {
        const data = await res.json();
        setSiteShares(prev => ({ ...prev, [siteId]: data.shares || [] }));
      }
    } catch {}
  }

  function fetchSharedWithMe() {
    if (!canShare) return;
    apiFetch('/api/sites/shared-with-me')
      .then(r => r.json())
      .then(data => { if (data.sites) setSharedWithMe(data.sites); })
      .catch(() => {});
  }

  async function handleShare(siteId: string) {
    if (!shareEmail) return;
    setShareLoading(true);
    setShareMsg('');
    try {
      const res = await apiFetch(`/api/sites/${siteId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: shareEmail, role: shareRole }),
      });
      if (res.ok) {
        setShareEmail('');
        setShareMsg('Shared successfully!');
        fetchShares(siteId);
        setTimeout(() => setShareMsg(''), 3000);
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        setShareMsg(err.error || 'Failed to share');
      }
    } catch {
      setShareMsg('Failed to share');
    } finally {
      setShareLoading(false);
    }
  }

  async function handleRevokeShare(siteId: string, shareId: string) {
    await apiFetch(`/api/sites/${siteId}/shares/${shareId}`, { method: 'DELETE' });
    fetchShares(siteId);
  }

  useEffect(() => { fetchSharedWithMe(); }, [canShare]);

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
      <div className="card sl-loading">
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
      <div className="sl-fetch-error">
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
          <div>
            <h2>Sites ({sites.length})</h2>
            <p>Manage your WordPress sites</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/create')}>+ New Site</button>
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
                    {!isSiteReady(site) && site.status === 'running' ? (
                      <div className="sl-setup-indicator">
                        <span className="spinner spinner-sm spinner-dark" /> Setting up...
                      </div>
                    ) : (
                    <div className="site-table-actions sl-table-actions-right">
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
                          navigator.clipboard.writeText(`docker exec wp-site-${site.subdomain} wp --allow-root `);
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
                      {site.hostPath && (
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(site.hostPath!).then(() => {
                          const btn = document.activeElement as HTMLButtonElement;
                          const orig = btn.innerHTML;
                          btn.textContent = 'Path copied!';
                          setTimeout(() => { btn.innerHTML = orig; }, 2000);
                        });
                        }}
                        title={`Copy wp-content path: ${site.hostPath}`}
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
                        Files
                      </button>
                      )}
                      {/* Tools dropdown for feature actions */}
                      {(canClone || canTemplate || canSnapshot || canPhp || canHealth || canPassword || canExport || canAdminer || canTunnel) && site.status === 'running' && (
                        <div className="sl-dropdown-wrapper">
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => cloning !== site.id && setActionsOpen(actionsOpen === site.id ? null : site.id)}
                            disabled={cloning === site.id}
                            title="Tools"
                          >
                            {cloning === site.id ? (
                              <><span className="spinner spinner-sm" /> Cloning...</>
                            ) : (
                              <><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" /></svg> Tools</>
                            )}
                          </button>
                          {actionsOpen === site.id && (
                            <div className="sl-dropdown-menu">
                              {canClone && (
                                <button className="sl-dropdown-item" onClick={() => { handleCloneSite(site.id); setActionsOpen(null); }} disabled={cloning === site.id}>
                                  {cloning === site.id ? <span className="spinner spinner-sm" /> : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" /></svg>}
                                  Clone
                                </button>
                              )}
                              {canTemplate && (
                                <button className="sl-dropdown-item" onClick={() => { setTemplateModal(site.id); setTemplateId(''); setTemplateName(''); setTemplateError(''); setActionsOpen(null); }}>
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
                                  Save as Template
                                </button>
                              )}
                              {canSnapshot && (
                                <button className="sl-dropdown-item" onClick={() => { setActionsOpen(null); setExpandedSite(site.id); setExpandedPanel('snapshots'); if (!snapshots[site.id]) fetchSnapshots(site.id); }}>
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" /></svg>
                                  Snapshots
                                </button>
                              )}
                              {canPhp && (
                                <button className="sl-dropdown-item" onClick={() => { setActionsOpen(null); setExpandedSite(site.id); setExpandedPanel('php'); if (!phpConfigs[site.id]) fetchPhpConfig(site.id); }}>
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                                  PHP Config
                                </button>
                              )}
                              {canHealth && (
                                <button className="sl-dropdown-item" onClick={() => { setActionsOpen(null); setExpandedSite(site.id); setExpandedPanel('health'); fetchHealthStats(site.id); }}>
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
                                  Stats
                                </button>
                              )}
                              {canPassword && (
                                <button className="sl-dropdown-item" onClick={() => { setPasswordModal(site.id); setPasswordValue(''); setActionsOpen(null); }}>
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                                  Password
                                </button>
                              )}
                              {canExport && (
                                <button className="sl-dropdown-item" onClick={() => { handleExportZip(site.id); setActionsOpen(null); }} disabled={exportLoading === site.id}>
                                  {exportLoading === site.id ? <span className="spinner spinner-sm" /> : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>}
                                  Export ZIP
                                </button>
                              )}
                              {canAdminer && (
                                <button className="sl-dropdown-item" onClick={() => { handleOpenAdminer(site); setActionsOpen(null); }}>
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" /></svg>
                                  Database
                                </button>
                              )}
                              {canTunnel && (
                                <button className="sl-dropdown-item" onClick={() => { setActionsOpen(null); setExpandedSite(site.id); setExpandedPanel('tunnel'); fetchTunnelStatus(site.id); }}>
                                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>
                                  Share Publicly
                                </button>
                              )}
                            </div>
                          )}
                        </div>
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
                    )}
                  </td>
                </tr>
                {canSnapshot && expandedSite === site.id && expandedPanel === 'snapshots' && (
                  <tr key={`${site.id}-snaps`}>
                    <td colSpan={5} className="sl-expanded-cell">
                      <div className="sl-dark-panel">
                        <div className="sl-dark-panel-header">
                          <span className="sl-dark-panel-title">Snapshots</span>
                          <button
                            className="btn btn-primary btn-xs"
                            onClick={() => handleTakeSnapshot(site.id)}
                            disabled={snapshotLoading === site.id}
                          >
                            {snapshotLoading === site.id ? <><span className="spinner spinner-sm" /> Working...</> : 'Take Snapshot'}
                          </button>
                        </div>
                        {(snapshots[site.id] || []).length === 0 ? (
                          <p className="sl-dark-muted">No snapshots yet. Take one to save the current state.</p>
                        ) : (
                          <table className="sl-snap-table">
                            <thead>
                              <tr className="sl-snap-thead-row">
                                <th className="sl-snap-th">Name</th>
                                <th className="sl-snap-th">Size</th>
                                <th className="sl-snap-th">Created</th>
                                <th className="sl-snap-th-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(snapshots[site.id] || []).map((snap) => (
                                <tr key={snap.id} className="sl-snap-row">
                                  <td className="sl-snap-td">{snap.name}</td>
                                  <td className="sl-snap-td">{snap.size_bytes ? `${(snap.size_bytes / 1024 / 1024).toFixed(1)} MB` : '—'}</td>
                                  <td className="sl-snap-td">{new Date(snap.created_at).toLocaleString()}</td>
                                  <td className="sl-snap-td-right">
                                    <button className="btn btn-secondary btn-xs sl-snap-restore-btn"
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
                    <td colSpan={5} className="sl-expanded-cell">
                      <div className="sl-dark-panel">
                        <span className="sl-dark-panel-title-block">Custom Domain</span>
                        {domainStatus[site.id]?.domain ? (
                          <div>
                            <div className="sl-domain-row">
                              <span className="sl-dark-text">{domainStatus[site.id].domain}</span>
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
                                className="btn btn-secondary btn-xs sl-ml-auto"
                                onClick={() => fetchDomainStatus(site.id, true)}
                                disabled={domainRechecking === site.id}
                              >{domainRechecking === site.id ? <><span className="spinner spinner-sm" /> Checking...</> : 'Recheck'}</button>
                              <button
                                className="btn btn-danger-outline btn-xs"
                                onClick={() => handleRemoveDomain(site.id)}
                                disabled={domainSaving === site.id}
                              >Remove</button>
                            </div>
                            <p className="sl-dark-hint-inline">
                              Point a CNAME record for <strong>{domainStatus[site.id].domain}</strong> to <strong>{site.subdomain}.{window.location.hostname}</strong>
                            </p>
                          </div>
                        ) : (
                          <div>
                            <div className="sl-domain-input-row">
                              <input
                                type="text"
                                placeholder="demo.yourdomain.com"
                                value={domainInput[site.id] || ''}
                                onChange={(e) => setDomainInput((prev) => ({ ...prev, [site.id]: e.target.value }))}
                                className="sl-domain-input"
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
                              <p className="sl-domain-error">{domainError[site.id]}</p>
                            )}
                            <p className="sl-dark-hint">
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
                    <td colSpan={5} className="sl-expanded-cell">
                      <div className="sl-dark-panel">
                        <div className="sl-dark-panel-header-inline">
                          <span className="sl-dark-panel-title">PHP Settings</span>
                          <span className="sl-dark-panel-subtitle">Changes apply instantly (Apache graceful reload)</span>
                        </div>
                        {loadingPhp === site.id ? (
                          <div className="sl-dark-loading">
                            <span className="spinner spinner-sm" /> Loading PHP config...
                          </div>
                        ) : (
                        <>
                        <div className="sl-php-grid">
                          <div className="form-group sl-php-field">
                            <label className="sl-php-label">Memory Limit</label>
                            <select value={getPhpConfig(site.id).memoryLimit} onChange={(e) => updatePhpField(site.id, 'memoryLimit', e.target.value)} className="sl-php-select">
                              <option value="128M">128 MB</option>
                              <option value="256M">256 MB</option>
                              <option value="512M">512 MB</option>
                              <option value="1G">1 GB</option>
                              <option value="2G">2 GB</option>
                              <option value="-1">Unlimited</option>
                            </select>
                          </div>
                          <div className="form-group sl-php-field">
                            <label className="sl-php-label">Upload Max</label>
                            <select value={getPhpConfig(site.id).uploadMaxFilesize} onChange={(e) => updatePhpField(site.id, 'uploadMaxFilesize', e.target.value)} className="sl-php-select">
                              <option value="2M">2 MB</option>
                              <option value="16M">16 MB</option>
                              <option value="64M">64 MB</option>
                              <option value="128M">128 MB</option>
                              <option value="256M">256 MB</option>
                              <option value="512M">512 MB</option>
                              <option value="1G">1 GB</option>
                              <option value="2G">2 GB</option>
                              <option value="0">Unlimited</option>
                            </select>
                          </div>
                          <div className="form-group sl-php-field">
                            <label className="sl-php-label">Post Max Size</label>
                            <select value={getPhpConfig(site.id).postMaxSize} onChange={(e) => updatePhpField(site.id, 'postMaxSize', e.target.value)} className="sl-php-select">
                              <option value="8M">8 MB</option>
                              <option value="16M">16 MB</option>
                              <option value="64M">64 MB</option>
                              <option value="128M">128 MB</option>
                              <option value="256M">256 MB</option>
                              <option value="512M">512 MB</option>
                              <option value="1G">1 GB</option>
                              <option value="2G">2 GB</option>
                              <option value="0">Unlimited</option>
                            </select>
                          </div>
                          <div className="form-group sl-php-field">
                            <label className="sl-php-label">Max Exec Time</label>
                            <select value={getPhpConfig(site.id).maxExecutionTime} onChange={(e) => updatePhpField(site.id, 'maxExecutionTime', e.target.value)} className="sl-php-select">
                              <option value="30">30s</option>
                              <option value="60">60s</option>
                              <option value="120">120s</option>
                              <option value="300">300s</option>
                              <option value="0">Unlimited</option>
                            </select>
                          </div>
                          <div className="form-group sl-php-field">
                            <label className="sl-php-label">Max Input Vars</label>
                            <select value={getPhpConfig(site.id).maxInputVars} onChange={(e) => updatePhpField(site.id, 'maxInputVars', e.target.value)} className="sl-php-select">
                              <option value="1000">1,000</option>
                              <option value="3000">3,000</option>
                              <option value="5000">5,000</option>
                              <option value="10000">10,000</option>
                            </select>
                          </div>
                          <div className="form-group sl-php-field">
                            <label className="sl-php-label">Display Errors</label>
                            <select value={getPhpConfig(site.id).displayErrors} onChange={(e) => updatePhpField(site.id, 'displayErrors', e.target.value)} className="sl-php-select">
                              <option value="On">On</option>
                              <option value="Off">Off</option>
                            </select>
                          </div>
                        </div>
                        <div className="sl-php-extensions-section">
                          <label className="sl-php-extensions-label">Extensions</label>
                          <div className="sl-php-extensions-wrap">
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
                        <div className="sl-php-save-row">
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
                {canHealth && expandedSite === site.id && expandedPanel === 'health' && (
                  <tr key={`${site.id}-health`}>
                    <td colSpan={5} className="sl-expanded-cell">
                      <div className="sl-dark-panel">
                        <div className="sl-dark-panel-header-inline">
                          <span className="sl-dark-panel-title">Resource Usage</span>
                          <button className="btn btn-secondary btn-xs" onClick={() => fetchHealthStats(site.id)} disabled={healthLoading === site.id}>
                            {healthLoading === site.id ? <span className="spinner spinner-sm" /> : 'Refresh'}
                          </button>
                          <button className="btn btn-secondary btn-xs sl-ml-auto" onClick={() => { setExpandedSite(null); setExpandedPanel(null); }}>Close</button>
                        </div>
                        {healthStats[site.id] ? (
                          <div className="sl-health-grid">
                            <div className="sl-health-card">
                              <div className="sl-health-card-label">CPU</div>
                              <div className="sl-health-card-value-lg" style={{ color: healthStats[site.id].cpu.percent > 80 ? '#ef4444' : '#22c55e' }}>
                                {healthStats[site.id].cpu.percent}%
                              </div>
                              <div className="sl-health-card-sublabel">{healthStats[site.id].cpu.cores} core(s)</div>
                            </div>
                            <div className="sl-health-card">
                              <div className="sl-health-card-label">Memory</div>
                              <div className="sl-health-card-value-lg" style={{ color: healthStats[site.id].memory.percent > 80 ? '#ef4444' : '#22c55e' }}>
                                {healthStats[site.id].memory.usedMB} MB
                              </div>
                              <div className="sl-health-card-sublabel">
                                {healthStats[site.id].memory.percent}% of {healthStats[site.id].memory.limitMB} MB
                              </div>
                              <div className="sl-health-bar-track">
                                <div className="sl-health-bar-fill" style={{ width: `${Math.min(healthStats[site.id].memory.percent, 100)}%`, background: healthStats[site.id].memory.percent > 80 ? '#ef4444' : '#22c55e' }} />
                              </div>
                            </div>
                            <div className="sl-health-card">
                              <div className="sl-health-card-label">Network</div>
                              <div className="sl-health-card-value-md">
                                {(healthStats[site.id].network.rxBytes / 1024 / 1024).toFixed(1)} MB in
                              </div>
                              <div className="sl-health-card-value-md">
                                {(healthStats[site.id].network.txBytes / 1024 / 1024).toFixed(1)} MB out
                              </div>
                            </div>
                            <div className="sl-health-card">
                              <div className="sl-health-card-label">Uptime</div>
                              <div className="sl-health-card-value-md">
                                {(() => {
                                  const ms = Date.now() - new Date(healthStats[site.id].uptime).getTime();
                                  const h = Math.floor(ms / 3600000);
                                  const m = Math.floor((ms % 3600000) / 60000);
                                  return h > 0 ? `${h}h ${m}m` : `${m}m`;
                                })()}
                              </div>
                              <div className="sl-health-card-sublabel">PID {healthStats[site.id].pid}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="sl-dark-loading">
                            <span className="spinner spinner-sm" /> Loading stats...
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {canShare && expandedSite === site.id && expandedPanel === 'share' && (
                  <tr key={`${site.id}-share`}>
                    <td colSpan={5} className="sl-expanded-cell">
                      <div className="sl-dark-panel">
                        <div className="sl-dark-panel-header-inline">
                          <span className="sl-dark-panel-title">Share Site</span>
                          <button className="btn btn-secondary btn-xs sl-ml-auto" onClick={() => { setExpandedSite(null); setExpandedPanel(null); }}>Close</button>
                        </div>
                        <div className="sl-share-form-row">
                          <input
                            type="email"
                            placeholder="user@example.com"
                            value={shareEmail}
                            onChange={e => setShareEmail(e.target.value)}
                            className="sl-share-input-dark"
                          />
                          <select
                            value={shareRole}
                            onChange={e => setShareRole(e.target.value as 'viewer' | 'admin')}
                            className="sl-share-select-dark"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button className="btn btn-primary btn-xs" onClick={() => handleShare(site.id)} disabled={shareLoading || !shareEmail}>
                            {shareLoading ? <span className="spinner spinner-sm" /> : 'Share'}
                          </button>
                        </div>
                        {shareMsg && <div style={{ fontSize: '0.8rem', color: shareMsg.includes('success') ? '#22c55e' : '#ef4444', marginBottom: '0.5rem' }}>{shareMsg}</div>}
                        {(siteShares[site.id] || []).length > 0 && (
                          <div className="sl-share-list">
                            {(siteShares[site.id] || []).map((s: any) => (
                              <div key={s.id} className="sl-share-item-dark">
                                <span className="sl-dark-text-lg">
                                  {s.shared_with_email}
                                  <span className="sl-share-role-badge">{s.role}</span>
                                  <span style={{ color: s.status === 'accepted' ? '#22c55e' : '#ecc94b', marginLeft: '0.5rem', fontSize: '0.7rem' }}>{s.status}</span>
                                </span>
                                <button className="btn btn-danger-outline btn-xs sl-revoke-btn-sm" onClick={() => handleRevokeShare(site.id, s.id)}>Revoke</button>
                              </div>
                            ))}
                          </div>
                        )}
                        {(siteShares[site.id] || []).length === 0 && (
                          <p className="sl-dark-no-data">No shares yet. Enter an email above to share this site.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {canTunnel && expandedSite === site.id && expandedPanel === 'tunnel' && (
                  <tr key={`${site.id}-tunnel`}>
                    <td colSpan={5} className="sl-expanded-cell">
                      <div className="sl-dark-panel">
                        <div className="sl-dark-panel-header-inline">
                          <span className="sl-dark-panel-title">Share Publicly</span>
                          <button className="btn btn-secondary btn-xs sl-ml-auto" onClick={() => { setExpandedSite(null); setExpandedPanel(null); }}>Close</button>
                        </div>

                        {tunnelStatus[site.id]?.active ? (
                          <div>
                            <div className="sl-tunnel-row">
                              <span style={{ background: tunnelStatus[site.id].method === 'cloudflare' ? '#f48120' : tunnelStatus[site.id].method === 'ngrok' ? '#1f1e37' : '#3b82f6', color: '#fff', padding: '0.2rem 0.6rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {tunnelStatus[site.id].method}
                              </span>
                              {tunnelStatus[site.id].status === 'connecting' ? (
                                <span className="sl-tunnel-connecting"><span className="spinner spinner-sm" /> Establishing tunnel...</span>
                              ) : (
                                <span className="sl-tunnel-connected">Connected</span>
                              )}
                            </div>
                            {tunnelStatus[site.id].url ? (
                              <div className="sl-tunnel-url-row">
                                <input readOnly value={tunnelStatus[site.id].url || ''} className="sl-tunnel-url-input" onClick={e => (e.target as HTMLInputElement).select()} />
                                <button className="btn btn-primary btn-xs" onClick={() => { navigator.clipboard.writeText(tunnelStatus[site.id].url || ''); setTunnelCopied(true); setTimeout(() => setTunnelCopied(false), 2000); }}>
                                  {tunnelCopied ? 'Copied!' : 'Copy'}
                                </button>
                                <a href={tunnelStatus[site.id].url || ''} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-xs">Open</a>
                              </div>
                            ) : null}
                            <button className="btn btn-danger-outline btn-xs" onClick={() => handleRemoveTunnel(site.id)}>Stop Sharing</button>
                          </div>
                        ) : (
                          <div>
                            <div className="sl-tunnel-method-row">
                              {(['cloudflare', 'lan', 'ngrok'] as const).map(m => (
                                <button
                                  key={m}
                                  onClick={() => setTunnelMethod(m)}
                                  style={{
                                    padding: '0.5rem 1rem', border: tunnelMethod === m ? '2px solid #fb8500' : '1px solid #334155',
                                    background: tunnelMethod === m ? 'rgba(251,133,0,0.15)' : '#1e293b', color: tunnelMethod === m ? '#fb8500' : '#94a3b8',
                                    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase',
                                  }}
                                >
                                  {m === 'cloudflare' ? 'Cloudflare' : m === 'ngrok' ? 'ngrok' : 'LAN'}
                                </button>
                              ))}
                            </div>
                            <p className="sl-tunnel-desc">
                              {tunnelMethod === 'cloudflare' && 'Free public URL via Cloudflare Quick Tunnel. No account needed.'}
                              {tunnelMethod === 'ngrok' && 'Public URL via ngrok. Requires a free auth token from ngrok.com.'}
                              {tunnelMethod === 'lan' && 'Share on your local network. Other devices can access via IP address.'}
                            </p>
                            {tunnelMethod === 'ngrok' && (
                              <input
                                type="text"
                                placeholder="Enter ngrok auth token"
                                value={ngrokToken}
                                onChange={e => setNgrokToken(e.target.value)}
                                className="sl-tunnel-ngrok-input"
                              />
                            )}
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleCreateTunnel(site.id)}
                              disabled={tunnelCreating === site.id || (tunnelMethod === 'ngrok' && !ngrokToken)}
                            >
                              {tunnelCreating === site.id ? <><span className="spinner spinner-sm" /> Starting...</> : 'Start Sharing'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="sl-empty-filtered">
                    No sites match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Save as Template Modal */}
        {templateModal && (
          <div className="sl-modal-overlay"
            onClick={() => !templateSaving && setTemplateModal(null)}
          >
            <div className="sl-template-modal-dark"
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Save as Template</h3>
              <p className="sl-template-modal-dark-desc">
                Export this site's plugins, themes, and settings as a reusable template.
              </p>
              <div className="form-group sl-form-group-sm">
                <label className="sl-template-label-dark">Template ID (slug)</label>
                <input
                  type="text"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="e.g. my-starter-theme"
                  className="sl-template-input-dark"
                  disabled={templateSaving}
                />
              </div>
              <div className="form-group sl-form-group-md">
                <label className="sl-template-label-dark">Template Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. My Starter Theme"
                  className="sl-template-input-dark"
                  disabled={templateSaving}
                />
              </div>
              {templateError && (
                <div className="sl-template-error">{templateError}</div>
              )}
              <div className="sl-modal-actions">
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

        {/* Password Protection Modal */}
        {passwordModal && (
          <div className="sl-modal-overlay-inset">
            <div className="card sl-password-modal">
              <h3>Password Protection</h3>
              <p className="sl-password-modal-desc">
                Set a password to restrict access. Choose what to protect.
              </p>
              <div className="sl-password-scope-list">
                {([
                  { value: 'frontend' as const, label: 'Frontend Only', desc: 'Visitors need password, admin stays open' },
                  { value: 'admin' as const, label: 'Admin Only', desc: 'wp-admin needs password, site stays open' },
                  { value: 'all' as const, label: 'Entire Site', desc: 'Password required everywhere' },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPasswordScope(opt.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem',
                      border: passwordScope === opt.value ? '2px solid var(--orange)' : '1px solid var(--border)',
                      borderRadius: 8, background: passwordScope === opt.value ? '#fff8f0' : '#fafafa',
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', width: '100%',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      border: passwordScope === opt.value ? '5px solid var(--orange)' : '2px solid var(--border)',
                      background: '#fff',
                    }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: passwordScope === opt.value ? 'var(--orange)' : 'var(--prussian-blue)' }}>{opt.label}</div>
                      <div className="sl-password-scope-desc">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Enter password (min 4 chars)"
                value={passwordValue}
                onChange={(e) => setPasswordValue(e.target.value)}
                className="sl-password-input"
              />
              <div className="sl-modal-actions-left">
                <button className="btn btn-primary btn-sm" onClick={() => handleSetPassword(passwordModal)} disabled={passwordLoading === passwordModal || passwordValue.length < 4}>
                  {passwordLoading === passwordModal ? <><span className="spinner spinner-sm" /> Setting...</> : 'Set Password'}
                </button>
                <button className="btn btn-danger-outline btn-sm" onClick={() => { handleRemovePassword(passwordModal); setPasswordModal(null); }}>
                  Remove
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => setPasswordModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {dbModal && createPortal(
          <div className="sl-modal-overlay-portal">
            <div className="card sl-db-modal">
              <h3>Database Credentials</h3>
              <p className="sl-db-modal-desc">
                {dbModal.site.subdomain} &mdash; {dbModal.dbEngine.toUpperCase()}
              </p>
              {[
                { label: 'Server', value: dbModal.host, key: 'host' },
                { label: 'Username', value: dbModal.user, key: 'user' },
                { label: 'Password', value: dbModal.password, key: 'password' },
                { label: 'Database', value: dbModal.database, key: 'database' },
              ].map(field => (
                <div key={field.key} className="sl-db-field-row">
                  <label className="sl-db-field-label">{field.label}</label>
                  <input readOnly value={field.value} className="sl-db-field-input" />
                  <button
                    onClick={() => copyDbField(field.value, field.key)}
                    className={`sl-db-copy-btn ${dbCopied === field.key ? 'sl-db-copy-btn-copied' : 'sl-db-copy-btn-default'}`}
                  >
                    {dbCopied === field.key ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ))}
              <div className="sl-db-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const params = new URLSearchParams({ server: dbModal.host, username: dbModal.user, db: dbModal.database });
                    window.open(`${dbModal.adminerUrl}?${params.toString()}`, '_blank');
                  }}
                >
                  Open Adminer
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => setDbModal(null)}>Close</button>
              </div>
            </div>
          </div>,
          document.body
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

      {/* Shared with me */}
      {sharedWithMe.length > 0 && (
        <div className="sl-section-block">
          <h4 className="sl-section-heading">
            Shared with me ({sharedWithMe.length})
          </h4>
          <div className="sites-grid">
            {sharedWithMe.map((share: any) => (
              <div key={share.id} className="card site-card sl-shared-card-accent">
                <div className="site-card-header">
                  <div className="site-card-status">
                    <span className={`status-dot status-${share.site_status}`} />
                    <span className="status-text">{share.site_status}</span>
                  </div>
                  <span style={{
                    padding: '0.15rem 0.5rem', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600,
                    background: share.role === 'admin' ? '#fef3c7' : '#ede9fe',
                    color: share.role === 'admin' ? '#92400e' : '#6d28d9',
                  }}>
                    {share.role.toUpperCase()}
                  </span>
                </div>
                <div className="site-card-body">
                  <h3 className="site-card-name">
                    <a href={share.site_url} target="_blank" rel="noopener noreferrer">{share.subdomain}</a>
                  </h3>
                  <div className="site-card-meta">
                    <span className="site-card-product">{share.product_id}</span>
                  </div>
                </div>
                <div className="site-card-actions sl-card-actions-compact">
                  <a href={share.site_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">Visit</a>
                  {share.role === 'admin' && share.admin_url && (
                    <a href={share.admin_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">Admin</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scheduled Launches */}
      {scheduledLaunches.length > 0 && (
        <div className="sl-section-block">
          <h4 className="sl-section-heading">
            Scheduled ({scheduledLaunches.length})
          </h4>
          <div className="sites-grid">
            {scheduledLaunches.map((launch) => (
              <div key={launch.id} className="card site-card sl-scheduled-card">
                <div className="site-card-header sl-scheduled-header">
                  <div className="site-card-status">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--orange)" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                    <span className="sl-scheduled-label">SCHEDULED</span>
                  </div>
                  <span className="sl-scheduled-date">
                    {new Date(launch.scheduled_at).toLocaleDateString()} {new Date(launch.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="site-card-body">
                  <h3 className="site-card-name sl-scheduled-name">
                    {launch.product_id}
                  </h3>
                  <div className="sl-scheduled-countdown">
                    Launches in {(() => {
                      const ms = new Date(launch.scheduled_at).getTime() - Date.now();
                      if (ms <= 0) return 'any moment now';
                      const h = Math.floor(ms / 3600000);
                      const m = Math.floor((ms % 3600000) / 60000);
                      if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
                      if (h > 0) return `${h}h ${m}m`;
                      return `${m}m`;
                    })()}
                  </div>
                </div>
                <div className="site-card-actions sl-card-actions-compact">
                  <button
                    className="btn btn-danger-outline btn-sm"
                    onClick={() => handleCancelScheduled(launch.id)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sites-grid">
        {sites.map((site) => (
          <div key={site.id} className="card site-card">
            <div className="site-card-header">
              <div className="site-card-status">
                <span className={`status-dot status-${site.status}`} />
                <span className="status-text">{site.status}</span>
              </div>
              <div className="sl-card-header-right">
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
            <div className="sl-dark-actions-panel">
              {canClone && (
              <button
                className="sl-dark-action-btn"
                onClick={() => { handleCloneSite(site.id); setActionsOpen(null); }}
                disabled={cloning === site.id}
              >
                {cloning === site.id ? <span className="spinner spinner-sm" /> : (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" /></svg>
                )}
                Clone Site
              </button>
              )}
              {canDomain && (
              <button
                className="sl-dark-action-btn"
                onClick={() => {
                  setActionsOpen(null);
                  setExpandedSite(site.id);
                  setExpandedPanel('domain');
                  if (!domainStatus[site.id]) fetchDomainStatus(site.id);
                }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 2.164A8.961 8.961 0 0 1 21 12c0 .778-.099 1.533-.284 2.253" /></svg>
                Custom Domain
              </button>
              )}
              {canTemplate && (
              <button
                className="sl-dark-action-btn"
                onClick={() => {
                  setActionsOpen(null);
                  setTemplateModal(site.id);
                  setTemplateId('');
                  setTemplateName('');
                  setTemplateError('');
                }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
                Save as Template
              </button>
              )}
              {canSnapshot && (
              <button
                className="sl-dark-action-btn"
                onClick={() => {
                  setActionsOpen(null);
                  setExpandedSite(site.id);
                  setExpandedPanel('snapshots');
                  if (!snapshots[site.id]) fetchSnapshots(site.id);
                }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" /></svg>
                Snapshots
              </button>
              )}
              {canPhp && (
              <button
                className="sl-dark-action-btn"
                onClick={() => {
                  setActionsOpen(null);
                  setExpandedSite(site.id);
                  setExpandedPanel('php');
                  if (!phpConfigs[site.id]) fetchPhpConfig(site.id);
                }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                PHP Settings
              </button>
              )}
              {canShare && site.status === 'running' && (
              <button
                className="sl-dark-action-btn"
                onClick={() => {
                  setActionsOpen(null);
                  // Toggle: if already open, close
                  if (expandedSite === site.id && expandedPanel === 'share') {
                    setExpandedSite(null); setExpandedPanel(null);
                  } else {
                    setExpandedSite(site.id); setExpandedPanel('share' as any);
                    fetchShares(site.id);
                  }
                }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>
                Share Site
              </button>
              )}
              {canHealth && site.status === 'running' && (
              <button
                className="sl-dark-action-btn"
                onClick={() => {
                  setActionsOpen(null);
                  setExpandedSite(site.id);
                  setExpandedPanel('health');
                  fetchHealthStats(site.id);
                }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
                Resource Stats
              </button>
              )}
              {canPassword && site.status === 'running' && (
              <button
                className="sl-dark-action-btn"
                onClick={() => { setActionsOpen(null); setPasswordModal(site.id); setPasswordValue(''); }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                Password Protection
              </button>
              )}
              {canExport && site.status === 'running' && (
              <button
                className="sl-dark-action-btn"
                onClick={() => { setActionsOpen(null); handleExportZip(site.id); }}
                disabled={exportLoading === site.id}
              >
                {exportLoading === site.id ? <span className="spinner spinner-sm" /> : (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                )}
                Export as ZIP
              </button>
              )}
              {canAdminer && site.status === 'running' && (
              <button
                className="sl-dark-action-btn"
                onClick={() => { setActionsOpen(null); handleOpenAdminer(site); }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" /></svg>
                Database
              </button>
              )}
              {canTunnel && site.status === 'running' && (
              <button
                className="sl-dark-action-btn"
                onClick={() => { setActionsOpen(null); setExpandedSite(site.id); setExpandedPanel('tunnel'); fetchTunnelStatus(site.id); }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>
                Share Publicly
              </button>
              )}
              {canExtend && site.status === 'running' && (
              <>
                <div className="sl-dark-extend-label">Extend by</div>
                {EXTEND_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className="sl-dark-action-btn-sm"
                    onClick={() => { handleExtend(site.id, opt.value); setActionsOpen(null); }}
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                    + {opt.label}
                  </button>
                ))}
              </>
              )}
              <div className="sl-dark-separator" />
              <button
                className="sl-dark-action-btn-danger"
                onClick={() => { handleDelete(site.id); setActionsOpen(null); }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                Delete Site
              </button>
            </div>
            )}

            {/* Expandable panels for agency mode — placed right after dropdown for visibility */}
            {canSnapshot && expandedSite === site.id && expandedPanel === 'snapshots' && (
            <div className="sl-card-panel">
              <div className="sl-card-panel-header">
                <strong className="sl-panel-title">Snapshots</strong>
                <button className="btn btn-primary btn-xs" onClick={() => handleTakeSnapshot(site.id)} disabled={snapshotLoading === site.id}>
                  {snapshotLoading === site.id ? <span className="spinner spinner-sm" /> : '+ Create'}
                </button>
                <button className="btn btn-secondary btn-xs sl-ml-auto" onClick={() => { setExpandedSite(null); setExpandedPanel(null); }}>Close</button>
              </div>
              {(snapshots[site.id] || []).length === 0 ? (
                <p className="sl-snap-list-empty">No snapshots yet</p>
              ) : (
                <div className="sl-share-list">
                  {(snapshots[site.id] || []).map((snap) => (
                    <div key={snap.id} className="sl-snap-item">
                      <span className="sl-snap-item-name">{snap.name} <span className="sl-snap-item-date">({new Date(snap.created_at).toLocaleDateString()})</span></span>
                      <div className="sl-snap-item-actions">
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
            <div className="sl-card-panel">
              <div className="sl-card-panel-header-spread">
                <strong className="sl-panel-title">Custom Domain</strong>
                <button className="btn btn-secondary btn-xs sl-ml-auto" onClick={() => { setExpandedSite(null); setExpandedPanel(null); }}>Close</button>
              </div>
              {domainStatus[site.id]?.domain ? (
                <div className="sl-agency-domain-text">
                  <div className="sl-domain-row">
                    <span className="sl-agency-domain-name">{domainStatus[site.id].domain}</span>
                    <span style={{ color: domainStatus[site.id].status === 'verified' ? '#48bb78' : '#ecc94b', fontSize: '0.75rem', fontWeight: 600 }}>
                      {domainStatus[site.id].status === 'verified' ? 'Verified' : 'Pending DNS'}
                    </span>
                    <button className="btn btn-secondary btn-xs" onClick={() => fetchDomainStatus(site.id, true)} disabled={domainRechecking === site.id}>{domainRechecking === site.id ? <><span className="spinner spinner-sm" /> Checking...</> : 'Recheck'}</button>
                    <button className="btn btn-danger-outline btn-xs" onClick={() => handleRemoveDomain(site.id)} disabled={domainSaving === site.id}>Remove</button>
                  </div>
                  {domainStatus[site.id].status !== 'verified' && (
                    <div className="sl-agency-dns-block">
                      <p className="sl-agency-dns-heading">Configure your DNS (choose one):</p>
                      <p className="sl-agency-dns-entry">
                        <strong className="sl-agency-domain-name">CNAME</strong> (for subdomains like demo.client.com):<br />
                        <code className="sl-agency-dns-code">{domainStatus[site.id].domain} → CNAME → {domainStatus[site.id].dns?.baseDomain || window.location.hostname}</code>
                      </p>
                      <p className="sl-agency-dns-entry">
                        <strong className="sl-agency-domain-name">A Record</strong> (for root domains like client.com):<br />
                        <code className="sl-agency-dns-code">{domainStatus[site.id].domain} → A → {domainStatus[site.id].dns?.serverIp || 'your server IP'}</code>
                      </p>
                      <p className="sl-agency-dns-note">DNS changes may take up to 24-48 hours to propagate.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="sl-domain-input-row-spaced">
                    <input
                      type="text"
                      placeholder="demo.example.com or example.com"
                      value={domainInput[site.id] || ''}
                      onChange={(e) => setDomainInput((prev) => ({ ...prev, [site.id]: e.target.value }))}
                      className="sl-agency-domain-input-dark"
                    />
                    <button className="btn btn-primary btn-xs" onClick={() => handleSetDomain(site.id)} disabled={domainSaving === site.id || !domainInput[site.id]}>
                      {domainSaving === site.id ? <span className="spinner spinner-sm" /> : 'Set Domain'}
                    </button>
                  </div>
                  <p className="sl-agency-domain-hint">
                    After setting, you'll need to add a CNAME or A record in your DNS provider pointing to this server.
                    WordPress URLs will be automatically updated.
                  </p>
                </div>
              )}
              {domainError[site.id] && <p className="sl-domain-error-agency">{domainError[site.id]}</p>}
            </div>
            )}

            {canPhp && expandedSite === site.id && expandedPanel === 'php' && (
            <div className="sl-card-panel">
              <div className="sl-card-panel-header-spread">
                <strong className="sl-panel-title">PHP Configuration</strong>
                <button className="btn btn-secondary btn-xs sl-ml-auto" onClick={() => { setExpandedSite(null); setExpandedPanel(null); }}>Close</button>
              </div>
              {loadingPhp === site.id ? (
                <div className="sl-php-loading-row"><span className="spinner spinner-sm" /> <span className="sl-php-loading-text">Loading...</span></div>
              ) : (
                <div className="sl-php-grid-2col">
                  {[
                    { key: 'memoryLimit', label: 'Memory' },
                    { key: 'uploadMaxFilesize', label: 'Upload Max' },
                    { key: 'postMaxSize', label: 'Post Max' },
                    { key: 'maxExecutionTime', label: 'Max Exec Time' },
                    { key: 'maxInputVars', label: 'Max Input Vars' },
                    { key: 'displayErrors', label: 'Display Errors' },
                  ].map(({ key, label }) => (
                    <div key={key} className="sl-php-field-col">
                      <label className="sl-php-field-label-dark">{label}</label>
                      <input
                        type="text"
                        value={(getPhpConfig(site.id) as unknown as Record<string, string>)[key] || ''}
                        onChange={(e) => setPhpConfigs((prev) => ({
                          ...prev,
                          [site.id]: { ...getPhpConfig(site.id), [key]: e.target.value },
                        }))}
                        className="sl-php-field-input-dark"
                      />
                    </div>
                  ))}
                  <div className="sl-php-save-row-agency">
                    <button
                      className="btn btn-primary btn-xs"
                      onClick={() => handleSavePhpConfig(site.id)}
                      disabled={savingPhp === site.id}
                    >
                      {savingPhp === site.id ? <span className="spinner spinner-sm" /> : 'Save PHP Config'}
                    </button>
                    {phpSaveMsg[site.id] && <span className="sl-php-save-msg-agency">{phpSaveMsg[site.id]}</span>}
                  </div>
                </div>
              )}
            </div>
            )}

            {canHealth && expandedSite === site.id && expandedPanel === 'health' && (
            <div className="sl-card-panel">
              <div className="sl-dark-panel-header-inline">
                <strong className="sl-panel-title">Resource Usage</strong>
                <button className="btn btn-secondary btn-xs" onClick={() => fetchHealthStats(site.id)} disabled={healthLoading === site.id}>
                  {healthLoading === site.id ? <span className="spinner spinner-sm" /> : 'Refresh'}
                </button>
                <button className="btn btn-secondary btn-xs sl-ml-auto" onClick={() => { setExpandedSite(null); setExpandedPanel(null); }}>Close</button>
              </div>
              {healthStats[site.id] ? (
                <div className="sl-health-grid-2col">
                  <div className="sl-health-card-sm">
                    <div className="sl-health-label-sm">CPU</div>
                    <div className="sl-health-value-lg" style={{ color: healthStats[site.id].cpu.percent > 80 ? '#ef4444' : '#22c55e' }}>{healthStats[site.id].cpu.percent}%</div>
                  </div>
                  <div className="sl-health-card-sm">
                    <div className="sl-health-label-sm">Memory</div>
                    <div className="sl-health-value-lg" style={{ color: healthStats[site.id].memory.percent > 80 ? '#ef4444' : '#22c55e' }}>{healthStats[site.id].memory.usedMB} MB</div>
                    <div className="sl-health-bar-track-sm">
                      <div className="sl-health-bar-fill" style={{ height: '100%', width: `${Math.min(healthStats[site.id].memory.percent, 100)}%`, background: healthStats[site.id].memory.percent > 80 ? '#ef4444' : '#22c55e' }} />
                    </div>
                  </div>
                  <div className="sl-health-card-sm">
                    <div className="sl-health-label-sm">Network</div>
                    <div className="sl-health-value-md">{(healthStats[site.id].network.rxBytes / 1024 / 1024).toFixed(1)} MB in / {(healthStats[site.id].network.txBytes / 1024 / 1024).toFixed(1)} MB out</div>
                  </div>
                  <div className="sl-health-card-sm">
                    <div className="sl-health-label-sm">Uptime</div>
                    <div className="sl-health-value-md">
                      {(() => { const ms = Date.now() - new Date(healthStats[site.id].uptime).getTime(); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); return h > 0 ? `${h}h ${m}m` : `${m}m`; })()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="sl-health-loading"><span className="spinner spinner-sm" /> Loading...</div>
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
              {site.hostPath && (
              <button
                className="btn btn-secondary btn-site-action"
                onClick={() => {
                  navigator.clipboard.writeText(site.hostPath!).then(() => {
                          const btn = document.activeElement as HTMLButtonElement;
                          const orig = btn.innerHTML;
                          btn.textContent = 'Path copied!';
                          setTimeout(() => { btn.innerHTML = orig; }, 2000);
                        });
                }}
                title={`Copy wp-content path: ${site.hostPath}`}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
                Open Files
              </button>
              )}
              {canExtend && site.status === 'running' && (
                <div className="sl-dropdown-wrapper">
                  <button
                    className="btn btn-outline btn-site-action"
                    onClick={() => setExtendOpen(extendOpen === site.id ? null : site.id)}
                    title="Extend expiration"
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  </button>
                  {extendOpen === site.id && (
                    <div className="sl-dropdown-menu-up">
                      {EXTEND_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          className="sl-extend-dropdown-item"
                          onClick={() => handleExtend(site.id, opt.value)}
                        >
                          + {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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

            {/* Share panel for mobile/card view */}
            {canShare && expandedSite === site.id && expandedPanel === 'share' && (
            <div className="sl-share-panel-light">
              <div className="sl-card-panel-header">
                <strong className="sl-share-title-light">Share Site</strong>
                <button className="btn btn-secondary btn-xs sl-ml-auto" onClick={() => { setExpandedSite(null); setExpandedPanel(null); }}>Close</button>
              </div>
              <div className="sl-share-form-row-light">
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={shareEmail}
                  onChange={e => setShareEmail(e.target.value)}
                  className="sl-share-input-light"
                />
                <select
                  value={shareRole}
                  onChange={e => setShareRole(e.target.value as 'viewer' | 'admin')}
                  className="sl-share-select-light"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
                <button className="btn btn-primary btn-xs" onClick={() => handleShare(site.id)} disabled={shareLoading || !shareEmail}>
                  {shareLoading ? <span className="spinner spinner-sm" /> : 'Share'}
                </button>
              </div>
              {shareMsg && <div style={{ fontSize: '0.8rem', color: shareMsg.includes('success') ? '#22c55e' : '#ef4444', marginBottom: '0.5rem' }}>{shareMsg}</div>}
              {(siteShares[site.id] || []).length > 0 ? (
                <div className="sl-share-list">
                  {(siteShares[site.id] || []).map((s: any) => (
                    <div key={s.id} className="sl-share-item-light">
                      <span>
                        {s.shared_with_email}
                        <span className="sl-share-role-badge-light">{s.role}</span>
                        <span style={{ color: s.status === 'accepted' ? '#22c55e' : '#ecc94b', marginLeft: '0.5rem', fontSize: '0.7rem' }}>{s.status}</span>
                      </span>
                      <button className="btn btn-danger-outline btn-xs sl-revoke-btn-sm" onClick={() => handleRevokeShare(site.id, s.id)}>Revoke</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="sl-share-no-data-light">No shares yet. Enter an email above to share.</p>
              )}
            </div>
            )}
          </div>
        ))}
      </div>

      {/* Activity Timeline */}
      {!isLocal && (
        <div className="card sl-activity-card">
          <div className={showActivity ? 'sl-activity-header-expanded' : 'sl-activity-header'}>
            <h3 className="sl-activity-title">Recent Activity</h3>
            <button
              className="btn btn-xs btn-outline"
              onClick={() => { setShowActivity(!showActivity); if (!showActivity && activityLog.length === 0) fetchActivity(); }}
            >
              {showActivity ? 'Hide' : 'Show'}
            </button>
          </div>
          {showActivity && (
            activityLog.length === 0 ? (
              <p className="sl-activity-empty">No activity yet.</p>
            ) : (
              <div className="sl-activity-scroll">
                {activityLog.map((log, i) => (
                  <div key={i} className={i < activityLog.length - 1 ? 'sl-activity-item-bordered' : 'sl-activity-item'}>
                    <div className="sl-activity-dot" style={{
                      background: log.action === 'created' ? '#22c55e' : log.action === 'deleted' ? '#ef4444' : log.action === 'extended' ? '#3b82f6' : '#f59e0b',
                    }} />
                    <div className="sl-activity-body">
                      <div className="sl-activity-text">
                        <strong className="sl-activity-action">{log.action}</strong>
                        {' '}
                        <span className="sl-activity-subdomain">{log.subdomain}</span>
                        {log.product_id && <span className="sl-activity-product"> ({log.product_id})</span>}
                      </div>
                      <div className="sl-activity-date">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Save as Template Modal (agency mode) */}
      {templateModal && (
        <div className="sl-modal-overlay"
          onClick={() => !templateSaving && setTemplateModal(null)}
        >
          <div className="card sl-template-modal-light"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Save as Template</h3>
            <p className="sl-template-modal-desc">
              Export this site's plugins, themes, and settings as a reusable template.
            </p>
            <div className="form-group sl-form-group-sm">
              <label>Template ID (slug)</label>
              <input
                type="text"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="e.g. my-starter-theme"
                disabled={templateSaving}
              />
            </div>
            <div className="form-group sl-form-group-md">
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
            <div className="sl-modal-actions">
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

      {/* Password Protection Modal */}
      {passwordModal && (
        <div className="sl-modal-overlay-inset">
          <div className="card sl-password-modal">
            <h3>Password Protection</h3>
            <p className="sl-password-modal-desc">
              Set a password to restrict access. Choose what to protect.
            </p>

            <div className="sl-password-scope-list">
              {([
                { value: 'frontend' as const, label: 'Frontend Only', desc: 'Visitors need password, admin stays open' },
                { value: 'admin' as const, label: 'Admin Only', desc: 'wp-admin needs password, site stays open' },
                { value: 'all' as const, label: 'Entire Site', desc: 'Password required everywhere' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPasswordScope(opt.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem',
                    border: passwordScope === opt.value ? '2px solid var(--orange)' : '1px solid var(--border)',
                    borderRadius: 8, background: passwordScope === opt.value ? '#fff8f0' : '#fafafa',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', width: '100%',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    border: passwordScope === opt.value ? '5px solid var(--orange)' : '2px solid var(--border)',
                    background: '#fff',
                  }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: passwordScope === opt.value ? 'var(--orange)' : 'var(--prussian-blue)' }}>{opt.label}</div>
                    <div className="sl-password-scope-desc">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Enter password (min 4 chars)"
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              className="sl-password-input"
            />
            <div className="sl-modal-actions-left">
              <button className="btn btn-primary btn-sm" onClick={() => handleSetPassword(passwordModal)} disabled={passwordLoading === passwordModal || passwordValue.length < 4}>
                {passwordLoading === passwordModal ? <><span className="spinner spinner-sm" /> Setting...</> : 'Set Password'}
              </button>
              <button className="btn btn-danger-outline btn-sm" onClick={() => { handleRemovePassword(passwordModal); setPasswordModal(null); }}>
                Remove
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setPasswordModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {dbModal && createPortal(
        <div className="sl-modal-overlay-portal">
          <div className="card sl-db-modal">
            <h3>Database Credentials</h3>
            <p className="sl-db-modal-desc">
              {dbModal.site.subdomain} &mdash; {dbModal.dbEngine.toUpperCase()}
            </p>
            {[
              { label: 'Server', value: dbModal.host, key: 'host' },
              { label: 'Username', value: dbModal.user, key: 'user' },
              { label: 'Password', value: dbModal.password, key: 'password' },
              { label: 'Database', value: dbModal.database, key: 'database' },
            ].map(field => (
              <div key={field.key} className="sl-db-field-row">
                <label className="sl-db-field-label">{field.label}</label>
                <input readOnly value={field.value} className="sl-db-field-input" />
                <button
                  onClick={() => copyDbField(field.value, field.key)}
                  className={`sl-db-copy-btn ${dbCopied === field.key ? 'sl-db-copy-btn-copied' : 'sl-db-copy-btn-default'}`}
                >
                  {dbCopied === field.key ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ))}
            <div className="sl-db-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const params = new URLSearchParams({ server: dbModal.host, username: dbModal.user, db: dbModal.database });
                  window.open(`${dbModal.adminerUrl}?${params.toString()}`, '_blank');
                }}
              >
                Open Adminer
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setDbModal(null)}>Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
