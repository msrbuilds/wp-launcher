import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileText, Globe, Package, Mail, Loader2 } from 'lucide-react';
import { useAdminHeaders } from './admin/AdminLayout';
import { useFeatures } from '../context/SettingsContext';
import { Stats } from './admin/shared';
import { apiFetch } from '../utils/api';
import { ServerResources } from '../components/ServerResources';
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

export default function LocalDashboard() {
  const headers = useAdminHeaders();
  const features = useFeatures();
  const [stats, setStats] = useState<Stats | null>(null);
  const [projectStats, setProjectStats] = useState<{ clients: number; projects: number; invoices: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/admin/stats', { headers })
      .then((r) => r.json())
      .then((statsData) => setStats(statsData))
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

      {/* Live server resources (CPU / Memory / Docker / Disk) + usage charts */}
      <ServerResources />
    </div>
  );
}
