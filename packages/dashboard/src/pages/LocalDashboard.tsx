import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileText, Globe, Package, Mail, Loader2 } from 'lucide-react';
import { useAdminHeaders } from './admin/AdminLayout';
import { useFeatures } from '../context/SettingsContext';
import { Stats, AdminSite, SiteLog } from './admin/shared';
import { apiFetch } from '../utils/api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="text-3xl font-semibold tracking-tight text-card-foreground">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/*
 * These tints are deliberate decoration, not semantic tokens — the coloured
 * shortcut tiles are a long-standing part of this dashboard's identity, so
 * each keeps its own hue rather than collapsing into uniform cards. They carry
 * explicit dark variants because a fixed palette colour cannot follow a theme
 * the way a token does.
 */
const SHORTCUTS = [
  { to: '/sites/new', label: 'New Site', icon: Plus, tint: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' },
  { to: '/blueprints/new', label: 'New Blueprint', icon: FileText, tint: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' },
  { to: '/sites', label: 'My Sites', icon: Globe, tint: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
  { to: '/blueprints', label: 'Blueprints', icon: Package, tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
];

const MAIL_SHORTCUT = {
  href: 'http://localhost:8025',
  label: 'Mailbox',
  icon: Mail,
  tint: 'bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400',
};

const SHORTCUT_CLASSES =
  'flex flex-col items-center justify-center gap-2 rounded-xl border border-border p-6 text-sm font-medium transition-opacity hover:opacity-80';

function statusDotClass(status: string) {
  if (status === 'running') return 'bg-primary';
  if (status === 'error') return 'bg-destructive';
  return 'bg-muted-foreground';
}

function statusBadgeVariant(status: string): 'default' | 'destructive' | 'secondary' {
  if (status === 'running') return 'default';
  if (status === 'error') return 'destructive';
  return 'secondary';
}

export default function LocalDashboard() {
  const headers = useAdminHeaders();
  const features = useFeatures();
  const [stats, setStats] = useState<Stats | null>(null);
  const [projectStats, setProjectStats] = useState<{ clients: number; projects: number; invoices: number } | null>(null);
  const [recentSites, setRecentSites] = useState<AdminSite[]>([]);
  const [recentLogs, setRecentLogs] = useState<SiteLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/stats', { headers }).then((r) => r.json()),
      apiFetch('/api/admin/sites?limit=5&offset=0', { headers }).then((r) => r.json()),
      apiFetch('/api/admin/logs?limit=10&offset=0', { headers }).then((r) => r.json()),
    ])
      .then(([statsData, sitesData, logsData]) => {
        setStats(statsData);
        setRecentSites(sitesData.data || []);
        setRecentLogs(logsData.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!features.projects) return;
    Promise.all([
      apiFetch('/api/projects/clients?limit=1&offset=0', { headers }).then(r => r.json()),
      apiFetch('/api/projects/list?limit=1&offset=0', { headers }).then(r => r.json()),
      apiFetch('/api/projects/invoices?limit=1&offset=0', { headers }).then(r => r.json()),
    ])
      .then(([c, p, i]) => setProjectStats({ clients: c.total || 0, projects: p.total || 0, invoices: i.total || 0 }))
      .catch(() => {});
  }, [features.projects]);

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

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Shortcut Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {SHORTCUTS.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.to} to={s.to} className={cn(SHORTCUT_CLASSES, s.tint)}>
              <Icon className="h-7 w-7" strokeWidth={1.5} />
              <span>{s.label}</span>
            </Link>
          );
        })}
        <a
          href={MAIL_SHORTCUT.href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(SHORTCUT_CLASSES, MAIL_SHORTCUT.tint)}
        >
          <MAIL_SHORTCUT.icon className="h-7 w-7" strokeWidth={1.5} />
          <span>{MAIL_SHORTCUT.label}</span>
        </a>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Active Sites" value={stats.activeSites} />
          <StatCard label="Total Created" value={stats.totalSitesCreated} />
          {features.projects && projectStats && <>
            <StatCard label="Clients" value={projectStats.clients} />
            <StatCard label="Projects" value={projectStats.projects} />
            <StatCard label="Invoices" value={projectStats.invoices} />
          </>}
        </div>
      )}

      {/* Recent Sites + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-card-foreground">Recent Sites</h3>
            <Link to="/sites" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {recentSites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sites yet.{' '}
              <Link to="/sites/new" className="text-primary hover:underline">Create one</Link>
            </p>
          ) : (
            <div className="divide-y divide-border">
              {recentSites.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDotClass(s.status))} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-card-foreground">
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {s.subdomain}
                          </a>
                        ) : (
                          s.subdomain
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{s.blueprintId}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant={statusBadgeVariant(s.status)}>{s.status}</Badge>
                    <div className="mt-1 text-xs text-muted-foreground">{timeAgo(s.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-sm font-semibold text-card-foreground">Recent Activity</h3>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge
                      variant={
                        log.action === 'created'
                          ? 'default'
                          : log.action === 'error'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {log.action}
                    </Badge>
                    <span className="truncate text-sm text-card-foreground">
                      {log.site_url ? (
                        <a href={log.site_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {log.subdomain}
                        </a>
                      ) : (
                        log.subdomain
                      )}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(log.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
