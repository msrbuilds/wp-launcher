import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../context/AuthContext';
import { useFeatures } from '../context/SettingsContext';
import { apiFetch } from '../utils/api';
import { useConfirm } from '../components/ConfirmDialog';
import { ActivityEntry, PanelKind, Site } from './sites/types';
import { SiteControllers } from './sites/controllers';
import { usePhpConfig } from './sites/hooks/usePhpConfig';
import { useSnapshots } from './sites/hooks/useSnapshots';
import { useDomains } from './sites/hooks/useDomains';
import { useHealth } from './sites/hooks/useHealth';
import { useShares } from './sites/hooks/useShares';
import { useTunnel } from './sites/hooks/useTunnel';
import { useSiteTools } from './sites/hooks/useSiteTools';
import SiteFilters from './sites/SiteFilters';
import SitesTable from './sites/SitesTable';
import SharedWithMe from './sites/sections/SharedWithMe';
import ScheduledLaunches from './sites/sections/ScheduledLaunches';
import ActivityTimeline from './sites/sections/ActivityTimeline';
import SaveTemplateDialog from './sites/dialogs/SaveTemplateDialog';
import PasswordDialog from './sites/dialogs/PasswordDialog';
import DbCredentialsDialog from './sites/dialogs/DbCredentialsDialog';

export default function SitesListPage() {
  const { isAuthenticated } = useAuth();
  const features = useFeatures();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [sites, setSites] = useState<Site[]>([]);
  const [maxSites, setMaxSites] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [filterTemplate, setFilterTemplate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<PanelKind | null>(null);
  const [actionsOpen, setActionsOpen] = useState<string | null>(null);
  const [siteReady, setSiteReady] = useState<Record<string, boolean>>({});
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [scheduledLaunches, setScheduledLaunches] = useState<any[]>([]);

  const php = usePhpConfig();
  const snapshots = useSnapshots();
  const domains = useDomains();
  const health = useHealth();
  const shares = useShares(features.collaborativeSites);
  const tunnel = useTunnel();
  const tools = useSiteTools(() => fetchSites());
  const controllers: SiteControllers = { php, snapshots, domains, health, shares, tunnel, tools };

  function fetchSites() {
    apiFetch('/api/sites')
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
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setActivityLog(data.slice(0, 20)); })
      .catch(() => {});
  }

  function fetchScheduled() {
    if (!features.scheduledLaunch) return;
    apiFetch('/api/sites/scheduled')
      .then((r) => r.json())
      .then((data) => {
        if (data.launches) setScheduledLaunches(data.launches.filter((l: any) => l.status === 'pending'));
      })
      .catch(() => {});
  }

  async function handleCancelScheduled(id: string) {
    if (!(await confirm({
      title: 'Cancel scheduled launch?',
      description: 'The site will not be created at its scheduled time.',
      confirmText: 'Cancel launch',
      variant: 'destructive',
    }))) return;
    await apiFetch(`/api/sites/scheduled/${id}`, { method: 'DELETE' });
    fetchScheduled();
  }

  async function handleDelete(id: string) {
    if (!(await confirm({
      title: 'Delete site?',
      description: 'This tears down the site and its container. This cannot be undone.',
      confirmText: 'Delete site',
      variant: 'destructive',
    }))) return;

    // Optimistic remove so the dashboard never appears frozen while the API
    // tears down the container. A failed request restores the row and surfaces
    // the error.
    const prev = sites;
    setSites((s) => s.filter((site) => site.id !== id));

    try {
      const res = await apiFetch(`/api/sites/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSites(prev);
        setFetchError(body.error || `Delete failed (HTTP ${res.status})`);
        return;
      }
    } catch (err: any) {
      setSites(prev);
      setFetchError(err?.message || 'Network error while deleting site');
      return;
    }

    fetchSites();
  }

  useEffect(() => {
    fetchSites();
    fetchScheduled();
    const interval = setInterval(fetchSites, 10_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => { shares.loadSharedWithMe(); }, [features.collaborativeSites]);

  // One-shot readiness check for all running sites on load
  useEffect(() => {
    const runningSites = sites.filter((s) => s.status === 'running' && !siteReady[s.id]);
    for (const s of runningSites) {
      apiFetch(`/api/sites/${s.id}/ready`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (data?.ready) setSiteReady((prev) => ({ ...prev, [s.id]: true })); })
        .catch(() => {});
    }
  }, [sites.length]);

  // Poll readiness for recently created sites (up to 10 minutes for large plugin/theme installs)
  useEffect(() => {
    const recentSites = sites.filter((s) => s.status === 'running'
      && (Date.now() - new Date(s.createdAt + 'Z').getTime()) < 600000
      && !siteReady[s.id]);
    if (recentSites.length === 0) return;
    let cancelled = false;
    for (const s of recentSites) {
      (async () => {
        for (let i = 0; i < 120 && !cancelled; i++) {
          try {
            const res = await apiFetch(`/api/sites/${s.id}/ready`);
            if (res.ok) {
              const data = await res.json();
              if (data.ready) {
                setSiteReady((prev) => ({ ...prev, [s.id]: true }));
                return;
              }
            }
          } catch { /* not ready */ }
          await new Promise((r) => setTimeout(r, 5000));
        }
      })();
    }
    return () => { cancelled = true; };
  }, [sites.map((s) => s.id).join(',')]);

  function isSiteReady(site: Site): boolean {
    if (site.status !== 'running') return false;
    return !!siteReady[site.id];
  }

  function openPanel(siteId: string, panel: PanelKind) {
    setExpandedSite(siteId);
    setExpandedPanel(panel);
  }

  function closePanel() {
    setExpandedSite(null);
    setExpandedPanel(null);
  }

  const templates = useMemo(() => [...new Set(sites.map((s) => s.blueprintId))].sort(), [sites]);
  const statuses = useMemo(() => [...new Set(sites.map((s) => s.status))].sort(), [sites]);

  const filtered = useMemo(() => {
    let result = sites;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.subdomain.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));
    }
    if (filterTemplate) result = result.filter((s) => s.blueprintId === filterTemplate);
    if (filterStatus) result = result.filter((s) => s.status === filterStatus);
    return result;
  }, [sites, search, filterTemplate, filterStatus]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading sites...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-card-foreground">
        <h3 className="text-base font-semibold">Log in to see your sites</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          <a href="/login" className="text-primary hover:underline">Log in</a> or{' '}
          <a href="/" className="text-primary hover:underline">create an account</a> to manage your demo sites.
        </p>
      </div>
    );
  }

  if (fetchError) {
    return <div className="rounded-xl border border-border bg-card p-6 text-sm text-destructive">{fetchError}</div>;
  }

  if (sites.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center text-card-foreground">
        <Globe className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-base font-semibold">No active sites</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Create one from the{' '}
          <a href="/sites/new" className="text-primary hover:underline">New Site</a> page, or start
          from a <a href="/blueprints" className="text-primary hover:underline">blueprint</a>.
        </p>
      </div>
    );
  }

  const dialogs = (
    <>
      <SaveTemplateDialog tools={tools} />
      <PasswordDialog tools={tools} />
      <DbCredentialsDialog tools={tools} />
    </>
  );

  return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Sites ({sites.length}{maxSites ? ` / ${maxSites}` : ''})</h2>
            <p className="text-sm text-muted-foreground">Manage your WordPress sites</p>
          </div>
          <Button size="sm" onClick={() => navigate('/sites/new')}>+ New Site</Button>
        </div>

        <SharedWithMe shares={shares.sharedWithMe} />
        <ScheduledLaunches launches={scheduledLaunches} onCancel={handleCancelScheduled} />

        <SiteFilters
          search={search}
          onSearchChange={setSearch}
          template={filterTemplate}
          onTemplateChange={setFilterTemplate}
          status={filterStatus}
          onStatusChange={setFilterStatus}
          templates={templates}
          statuses={statuses}
        />

        <SitesTable
          sites={filtered}
          features={features}
          controllers={controllers}
          isSiteReady={isSiteReady}
          expandedSite={expandedSite}
          expandedPanel={expandedPanel}
          onOpenPanel={openPanel}
          onClosePanel={closePanel}
          actionsOpen={actionsOpen}
          onActionsOpenChange={setActionsOpen}
          onDelete={handleDelete}
        />

        <ActivityTimeline
          entries={activityLog}
          expanded={showActivity}
          onToggle={() => {
            setShowActivity(!showActivity);
            if (!showActivity && activityLog.length === 0) fetchActivity();
          }}
        />

        {dialogs}
    </div>
  );
}
