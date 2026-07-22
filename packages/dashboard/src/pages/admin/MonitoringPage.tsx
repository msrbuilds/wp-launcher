import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';

interface ContainerInfo {
  id: string;
  idFull: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: number;
  labels: Record<string, string>;
  siteId: string;
  dbStatus: string | null;
  expiresAt: string | null;
  flag: 'normal' | 'stale' | 'orphaned' | 'leftover';
  cpuPercent: number | null;
  memUsage: number | null;
  memLimit: number | null;
}

interface SystemInfo {
  docker: {
    version: string;
    containersRunning: number;
    containersPaused: number;
    containersStopped: number;
    containersTotal: number;
    images: number;
  };
  host: {
    cpuModel: string;
    cpuCores: number;
    cpuPhysicalCores: number;
    loadAvg: number[];
    memTotal: number;
    memUsed: number;
    memFree: number;
    memPercent: number;
    disk: { fs: string; mount: string; size: number; used: number; available: number; usePercent: number }[];
  };
}

interface DiskInfo {
  images: { count: number; totalSize: number; items: { id: string; repoTags: string[]; size: number; created: number }[] };
  volumes: { count: number; items: { name: string; driver: string }[] };
}

interface ChartPoint {
  time: string;
  ts: number;
  cpuUser: number;
  cpuSystem: number;
  memPercent: number;
  memUsedGB: number;
  diskPercent: number;
}

const MAX_POINTS = 60; // 10 minutes at 10s intervals

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatUptime(created: number): string {
  const diff = Math.floor(Date.now() / 1000 - created);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  return `${Math.floor(diff / 86400)}d ${Math.floor((diff % 86400) / 3600)}h`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

/**
 * Recharts takes colours as props, so they cannot come from Tailwind classes.
 * Read the resolved design tokens off the document instead, and recompute them
 * whenever the theme flips so the charts follow light/dark.
 */
function readChartTokens() {
  if (typeof window === 'undefined') {
    return { grid: '', axis: '', tooltipBg: '', tooltipBorder: '', tooltipText: '', series: [] as string[] };
  }
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const primary = v('--primary');
  // Derive a small categorical palette by rotating the hue of the primary token
  // rather than hardcoding colour literals.
  const match = primary.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i);
  const series = match
    ? Array.from({ length: 6 }, (_, i) => `oklch(${match[1]} ${match[2]} ${(Number(match[3]) + i * 47) % 360})`)
    : Array.from({ length: 6 }, () => primary);
  return {
    grid: v('--border'),
    axis: v('--muted-foreground'),
    tooltipBg: v('--popover'),
    tooltipBorder: v('--border'),
    tooltipText: v('--popover-foreground'),
    series,
  };
}

const flagVariant: Record<ContainerInfo['flag'], 'secondary' | 'outline' | 'destructive'> = {
  normal: 'secondary',
  stale: 'outline',
  orphaned: 'destructive',
  leftover: 'outline',
};

export default function MonitoringPage() {
  const headers = useAdminHeaders();
  const { resolved } = useTheme();
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [counts, setCounts] = useState({ normal: 0, stale: 0, orphaned: 0, leftover: 0 });
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [disk, setDisk] = useState<DiskInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [systemError, setSystemError] = useState(false);
  const chartPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const chart = useMemo(() => readChartTokens(), [resolved]);
  const chartTooltipStyle = useMemo(() => ({
    backgroundColor: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: '0.5rem',
    color: chart.tooltipText,
    fontSize: '0.8rem',
  }), [chart]);

  const fetchAll = useCallback(async () => {
    try {
      const [cRes, sRes, dRes] = await Promise.all([
        apiFetch('/api/admin/monitoring/containers', { headers }),
        apiFetch('/api/admin/monitoring/system', { headers }),
        apiFetch('/api/admin/monitoring/disk', { headers }),
      ]);
      const cData = cRes.ok ? await cRes.json() : { containers: [], counts: null };
      const sData = sRes.ok ? await sRes.json() : null;
      const dData = dRes.ok ? await dRes.json() : null;
      setContainers(cData.containers || []);
      setCounts(cData.counts || { normal: 0, stale: 0, orphaned: 0, leftover: 0 });
      if (sData?.host) { setSystem(sData); setSystemError(false); }
      else setSystemError(true);
      if (dData?.images) setDisk(dData);
      return sData as SystemInfo;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSystemForChart = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/monitoring/system', { headers });
      if (!res.ok) return;
      const data = await res.json() as SystemInfo;
      if (!data?.host) return;
      const mainDisk = data.host.disk?.find((d: any) => d.mount === '/' || d.mount === 'C:');
      const now = Date.now();
      const point: ChartPoint = {
        time: formatTime(now),
        ts: now,
        cpuUser: data.host.loadAvg?.[1] ?? 0,
        cpuSystem: data.host.loadAvg?.[2] ?? 0,
        memPercent: data.host.memPercent ?? 0,
        memUsedGB: Math.round(((data.host.memUsed || 0) / (1024 * 1024 * 1024)) * 100) / 100,
        diskPercent: mainDisk?.usePercent ?? 0,
      };
      setChartData(prev => [...prev.slice(-(MAX_POINTS - 1)), point]);
      setSystem(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchAll().then(sData => {
      if (sData?.host) {
        const mainDisk = sData.host.disk?.find(d => d.mount === '/' || d.mount === 'C:');
        const now = Date.now();
        setChartData([{
          time: formatTime(now),
          ts: now,
          cpuUser: sData.host.loadAvg?.[1] ?? 0,
          cpuSystem: sData.host.loadAvg?.[2] ?? 0,
          memPercent: sData.host.memPercent ?? 0,
          memUsedGB: Math.round(((sData.host.memUsed || 0) / (1024 * 1024 * 1024)) * 100) / 100,
          diskPercent: mainDisk?.usePercent ?? 0,
        }]);
      }
    });
    // Start chart polling (every 10s)
    chartPollRef.current = setInterval(fetchSystemForChart, 10000);
    return () => { if (chartPollRef.current) clearInterval(chartPollRef.current); };
  }, [fetchAll, fetchSystemForChart]);

  const doAction = async (url: string, label: string) => {
    if (!confirm(`Are you sure you want to ${label}?`)) return;
    setActionLoading(label);
    setActionMsg(null);
    try {
      const res = await apiFetch(url, { method: 'POST', headers });
      const data = await res.json();
      const msg = data.message || (data.spaceReclaimed !== undefined
        ? `Reclaimed ${formatBytes(data.spaceReclaimed)}`
        : data.pruned !== undefined
          ? `Pruned ${data.pruned} item(s), reclaimed ${formatBytes(data.spaceReclaimed || 0)}`
          : 'Done');
      setActionMsg(msg);
      await fetchAll();
    } catch {
      setActionMsg('Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const forceRemove = async (containerId: string, name: string) => {
    if (!confirm(`Force remove container "${name}"?`)) return;
    setActionLoading(containerId);
    try {
      await apiFetch(`/api/admin/monitoring/containers/${containerId}/force-remove`, { method: 'POST', headers });
      await fetchAll();
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading monitoring data...
      </div>
    );
  }

  const mainDisk = system?.host?.disk?.find(d => d.mount === '/' || d.mount === 'C:');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">Server Monitoring</h2>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-xs text-muted-foreground">Live (10s)</span>
          <Button size="sm" variant="secondary" onClick={() => { setLoading(true); fetchAll(); }}>Refresh</Button>
        </div>
      </div>

      {actionMsg && (
        <Alert>
          <AlertDescription>{actionMsg}</AlertDescription>
        </Alert>
      )}

      {systemError && !system && (
        <Alert variant="destructive">
          <AlertDescription>
            System monitoring data unavailable. The provisioner may need to be rebuilt:
            <code className="mt-2 block rounded-lg bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              docker compose build provisioner &amp;&amp; docker compose up -d provisioner
            </code>
          </AlertDescription>
        </Alert>
      )}

      {/* System Resources Cards */}
      {system?.host && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">CPU Load</div>
            <div className="mt-1 text-2xl font-semibold text-card-foreground">{system.host.loadAvg?.[0] ?? 0}%</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{system.host.cpuCores} cores &middot; {system.host.cpuModel}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Memory</div>
            <div className="mt-1 text-2xl font-semibold text-card-foreground">{system.host.memPercent ?? 0}%</div>
            <div className="mt-1 text-xs text-muted-foreground">{formatBytes(system.host.memUsed || 0)} / {formatBytes(system.host.memTotal || 0)}</div>
            <Progress
              className={cn(
                'mt-3',
                (system.host.memPercent ?? 0) > 85 && 'bg-destructive/20 [&>[data-slot=progress-indicator]]:bg-destructive',
              )}
              value={Math.min(system.host.memPercent ?? 0, 100)}
            />
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Docker Engine</div>
            <div className="mt-1 text-2xl font-semibold text-card-foreground">{system.docker.containersRunning} running</div>
            <div className="mt-1 text-xs text-muted-foreground">v{system.docker.version} &middot; {system.docker.images} images &middot; {system.docker.containersTotal} total</div>
          </div>
          {mainDisk && (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Disk ({mainDisk.mount})</div>
              <div className="mt-1 text-2xl font-semibold text-card-foreground">{mainDisk.usePercent}%</div>
              <div className="mt-1 text-xs text-muted-foreground">{formatBytes(mainDisk.used)} / {formatBytes(mainDisk.size)}</div>
              <Progress
                className={cn(
                  'mt-3',
                  mainDisk.usePercent > 85 && 'bg-destructive/20 [&>[data-slot=progress-indicator]]:bg-destructive',
                )}
                value={Math.min(mainDisk.usePercent, 100)}
              />
            </div>
          )}
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-3">
          {/* CPU Usage Chart */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-3 text-sm font-semibold text-card-foreground">CPU Usage</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.grid} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.grid} domain={[0, 'auto']} unit="%" />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)}%`]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem', color: chart.axis }} />
                <Area type="monotone" dataKey="cpuUser" name="user" stroke={chart.series[0]} fill={chart.series[0]} fillOpacity={0.15} strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="cpuSystem" name="system" stroke={chart.series[2]} fill={chart.series[2]} fillOpacity={0.1} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Memory Usage Chart */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-3 text-sm font-semibold text-card-foreground">Memory Usage</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.grid} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.grid} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)}%`]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem', color: chart.axis }} />
                <Area type="monotone" dataKey="memPercent" name="usage %" stroke={chart.series[1]} fill={chart.series[1]} fillOpacity={0.15} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Disk Usage Chart */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-3 text-sm font-semibold text-card-foreground">Disk Usage</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.grid} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.grid} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)}%`]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem', color: chart.axis }} />
                <Area type="monotone" dataKey="diskPercent" name="disk usage" stroke={chart.series[3]} fill={chart.series[3]} fillOpacity={0.15} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Docker Containers */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-card-foreground">
            Docker Containers ({containers.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {counts.stale > 0 && (
              <Button size="sm" variant="destructive" disabled={actionLoading !== null}
                onClick={() => doAction('/api/admin/monitoring/cleanup/stale', 'cleanup stale containers')}>
                Cleanup Stale ({counts.stale})
              </Button>
            )}
            {counts.orphaned > 0 && (
              <Button size="sm" variant="destructive" disabled={actionLoading !== null}
                onClick={() => doAction('/api/admin/monitoring/cleanup/orphans', 'cleanup orphaned containers')}>
                Cleanup Orphans ({counts.orphaned})
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{counts.normal} normal</Badge>
          {counts.stale > 0 && <Badge variant="outline">{counts.stale} stale</Badge>}
          {counts.orphaned > 0 && <Badge variant="destructive">{counts.orphaned} orphaned</Badge>}
          {counts.leftover > 0 && <Badge variant="outline">{counts.leftover} leftover</Badge>}
        </div>

        {containers.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No managed containers found.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>Memory</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium text-card-foreground">
                        {c.siteId || c.name}
                        {c.labels['wp-launcher.role'] && (
                          <Badge variant="outline" className="text-[10px]">{c.labels['wp-launcher.role']}</Badge>
                        )}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">{c.id}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.state === 'running' ? 'default' : 'secondary'}>{c.state}</Badge>
                    </TableCell>
                    <TableCell><Badge variant={flagVariant[c.flag]}>{c.flag}</Badge></TableCell>
                    <TableCell>{c.cpuPercent !== null ? `${c.cpuPercent}%` : '—'}</TableCell>
                    <TableCell>{c.memUsage !== null ? `${formatBytes(c.memUsage)} / ${formatBytes(c.memLimit || 0)}` : '—'}</TableCell>
                    <TableCell>{formatUptime(c.created)}</TableCell>
                    <TableCell className="text-muted-foreground">{c.image.split(':')[0].split('/').pop()}</TableCell>
                    <TableCell>
                      <Button size="xs" variant="destructive" disabled={actionLoading === c.idFull}
                        onClick={() => forceRemove(c.idFull, c.siteId || c.name)}>
                        {actionLoading === c.idFull ? '...' : 'Remove'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Disk Usage + Quick Actions */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Docker Disk */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-card-foreground">Docker Disk Usage</h3>
          {disk?.images && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Images ({disk.images.count})</span>
                <span className="font-medium text-card-foreground">{formatBytes(disk.images.totalSize)}</span>
              </div>
              {disk.volumes && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Volumes ({disk.volumes.count})</span>
                </div>
              )}
              {disk.images.items?.length > 0 && (
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm text-muted-foreground">Image details</summary>
                  <div className="mt-2 space-y-1">
                    {disk.images.items.map((img, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-muted-foreground">{img.repoTags?.[0] || img.id}</span>
                        <span className="shrink-0 text-card-foreground">{formatBytes(img.size)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-card-foreground">Quick Actions</h3>
          <div className="mt-3 flex flex-col gap-2">
            <Button variant="secondary" className="justify-start" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/prune/images', 'prune unused images')}>
              {actionLoading === 'prune unused images' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Prune Images
            </Button>
            <Button variant="secondary" className="justify-start" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/prune/volumes', 'prune unused volumes')}>
              {actionLoading === 'prune unused volumes' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Prune Volumes
            </Button>
            <Button variant="secondary" className="justify-start" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/prune/buildcache', 'prune build cache')}>
              {actionLoading === 'prune build cache' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Prune Build Cache
            </Button>
            <Button variant="secondary" className="justify-start" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/cleanup/orphans', 'cleanup orphaned containers')}>
              {actionLoading === 'cleanup orphaned containers' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Cleanup Orphans
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
