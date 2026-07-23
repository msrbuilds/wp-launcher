import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAdminHeaders } from '../pages/admin/AdminLayout';
import { useTheme } from '../context/ThemeContext';
import { apiFetch } from '../utils/api';

interface SystemInfo {
  docker: {
    version: string;
    containersRunning: number;
    containersTotal: number;
    images: number;
  };
  host: {
    cpuModel: string;
    cpuCores: number;
    loadAvg: number[];
    memTotal: number;
    memUsed: number;
    memPercent: number;
    disk: { fs: string; mount: string; size: number; used: number; available: number; usePercent: number }[];
  };
}

interface ChartPoint {
  time: string;
  ts: number;
  cpuUser: number;
  cpuSystem: number;
  memPercent: number;
  diskPercent: number;
}

const MAX_POINTS = 60; // 10 minutes at 10s intervals

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
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

/**
 * Live server-resource cards (CPU / Memory / Docker / Disk) and their usage
 * charts. Self-contained: polls /monitoring/system every 10s and follows the
 * theme. Shown on both the Overview dashboard and the Monitoring page.
 *
 * The endpoint needs admin/owner rights; for anyone else (or when monitoring is
 * unavailable) it renders nothing unless `showErrorAlert` is set.
 */
export function ServerResources({ showErrorAlert = false }: { showErrorAlert?: boolean }) {
  const headers = useAdminHeaders();
  const { resolved } = useTheme();
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [error, setError] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const chart = useMemo(() => readChartTokens(), [resolved]);
  const chartTooltipStyle = useMemo(() => ({
    backgroundColor: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: '0.5rem',
    color: chart.tooltipText,
    fontSize: '0.8rem',
  }), [chart]);

  // Stable poller: headers come from context and don't change per render, so we
  // deliberately keep the dependency array empty (matching MonitoringPage).
  const fetchSystem = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/monitoring/system', { headers });
      if (!res.ok) { setError(true); return; }
      const data = await res.json() as SystemInfo;
      if (!data?.host) { setError(true); return; }
      setError(false);
      setSystem(data);
      const mainDisk = data.host.disk?.find(d => d.mount === '/' || d.mount === 'C:');
      const now = Date.now();
      const point: ChartPoint = {
        time: formatTime(now),
        ts: now,
        cpuUser: data.host.loadAvg?.[1] ?? 0,
        cpuSystem: data.host.loadAvg?.[2] ?? 0,
        memPercent: data.host.memPercent ?? 0,
        diskPercent: mainDisk?.usePercent ?? 0,
      };
      setChartData(prev => [...prev.slice(-(MAX_POINTS - 1)), point]);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchSystem();
    pollRef.current = setInterval(fetchSystem, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchSystem]);

  if (!system?.host) {
    if (showErrorAlert && error) {
      return (
        <Alert variant="destructive">
          <AlertDescription>
            System monitoring data unavailable. The provisioner may need to be rebuilt:
            <code className="mt-2 block rounded-lg bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              docker compose build provisioner &amp;&amp; docker compose up -d provisioner
            </code>
          </AlertDescription>
        </Alert>
      );
    }
    return null;
  }

  const mainDisk = system.host.disk?.find(d => d.mount === '/' || d.mount === 'C:');

  return (
    <div className="space-y-4">
      {/* System Resource Cards */}
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

      {/* Usage Charts */}
      {chartData.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-3">
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
    </div>
  );
}
