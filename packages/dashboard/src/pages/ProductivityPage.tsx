import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAdminHeaders } from './admin/AdminLayout';
import { apiFetch } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { AlertCircle, Blocks, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EDITOR_COLORS } from '@/lib/editor-colors';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';

// ── Interfaces ──

interface TodayStats {
  totalSeconds: number;
  bySource: { source: string; totalSeconds: number }[];
  byProject: { project: string; totalSeconds: number }[];
  byLanguage: { language: string; totalSeconds: number }[];
  byCategory: { category: string; totalSeconds: number }[];
  byEditor: { editor: string; totalSeconds: number }[];
  heartbeatCount: number;
  goal: number;
  streak: number;
}

interface DailyTotal {
  date: string;
  totalSeconds: number;
  editorSeconds: number;
  wordpressSeconds: number;
}

interface HourlyData {
  hour: number;
  totalSeconds: number;
}

interface WeekdayData {
  day: string;
  totalSeconds: number;
  avgSeconds: number;
}

interface ScreenData {
  screen: string;
  totalSeconds: number;
  count: number;
}

interface SummaryStats {
  totalSeconds: number;
  heartbeatCount: number;
  writeCount: number;
  bestDay: { date: string; seconds: number };
  goal: number;
  streak: number;
}

interface CloudConfig {
  cloud_url?: string;
  cloud_api_key?: string;
  heartbeat_secret?: string;
  last_synced_at?: string;
  device_name?: string;
}

interface SyncLog {
  id: number;
  heartbeats_count: number;
  status: string;
  error: string | null;
  started_at: string;
  completed_at: string;
}

// ── Helpers ──

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
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

// Token-only stand-in for the old per-item hex palette: successive rows step
// down in primary opacity so bars stay distinguishable in both themes.
const BAR_SHADES = [
  'bg-primary',
  'bg-primary/85',
  'bg-primary/70',
  'bg-primary/55',
  'bg-primary/40',
  'bg-primary/30',
];

// Written out in full so Tailwind's scanner sees every class literally.
const BAR_INDICATORS = [
  '[&>[data-slot=progress-indicator]]:bg-primary',
  '[&>[data-slot=progress-indicator]]:bg-primary/85',
  '[&>[data-slot=progress-indicator]]:bg-primary/70',
  '[&>[data-slot=progress-indicator]]:bg-primary/55',
  '[&>[data-slot=progress-indicator]]:bg-primary/40',
  '[&>[data-slot=progress-indicator]]:bg-primary/30',
];

const barShade = (i: number) => BAR_SHADES[i % BAR_SHADES.length];
const barIndicator = (i: number) => BAR_INDICATORS[i % BAR_INDICATORS.length];

// ── Breakdown Bar Component (WakaTime-style horizontal bars) ──

function BreakdownList({
  items,
  label,
  colorMap,
}: {
  items: { name: string; seconds: number }[];
  label: string;
  /** Optional brand colours (e.g. editors). Falls back to the token ramp. */
  colorMap?: Record<string, string>;
}) {
  if (items.length === 0) return <div className="py-4 text-sm text-muted-foreground">No {label.toLowerCase()} data</div>;
  const max = items[0]?.seconds || 1;
  const total = items.reduce((s, i) => s + i.seconds, 0) || 1;
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={item.name}>
          <div className="flex items-center gap-2 text-sm">
            <span className="flex min-w-0 flex-1 items-center gap-2 text-card-foreground">
              <span
              className={cn('h-2 w-2 shrink-0 rounded-full', !colorMap?.[item.name.toLowerCase()] && barShade(i))}
              // Brand colour when we have one — see lib/editor-colors.ts for why
              // these stay literal rather than becoming tokens.
              style={colorMap?.[item.name.toLowerCase()] ? { background: colorMap[item.name.toLowerCase()] } : undefined}
            />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatDuration(item.seconds)}</span>
            <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">{Math.round((item.seconds / total) * 100)}%</span>
          </div>
          <Progress
            className={cn('mt-1.5 h-1.5', barIndicator(i))}
            value={Math.round((item.seconds / max) * 100)}
          />
        </div>
      ))}
    </div>
  );
}

// ── Integrations Data ──

interface Integration {
  name: string;
  icon: string;
  status: 'available' | 'coming-soon' | 'built-in';
  installUrl?: string;
  description: string;
}

const INTEGRATIONS: Integration[] = [
  { name: 'VS Code', icon: '/int-icons/vs-code-128.png', status: 'available', installUrl: 'https://marketplace.visualstudio.com/items?itemName=msrbuilds.wpl-productivity', description: 'Track coding time in Visual Studio Code' },
  { name: 'WordPress', icon: '/int-icons/wordpress-128.png', status: 'built-in', description: 'Auto-tracks all wp-admin activity on launched sites' },
  { name: 'Cursor', icon: '/int-icons/cursor-128.png', status: 'available', installUrl: 'https://open-vsx.org/extension/msrbuilds/wpl-productivity-cursor', description: 'AI-powered code editor' },
  { name: 'Windsurf', icon: '/int-icons/windsurf-128.png', status: 'available', installUrl: 'https://open-vsx.org/extension/msrbuilds/wpl-productivity-windsurf', description: 'AI-first code editor' },
  { name: 'Antigravity', icon: '/int-icons/antigravity-128.png', status: 'available', installUrl: 'https://open-vsx.org/extension/msrbuilds/wpl-productivity-antigravity', description: 'Google AI-powered IDE' },
  { name: 'Claude Code', icon: '/int-icons/claude-code-128.png', status: 'coming-soon', description: 'AI coding assistant' },
  { name: 'Sublime Text', icon: '/int-icons/sublime-text-128.png', status: 'available', installUrl: 'https://github.com/msrbuilds/wp-launcher/tree/main/extensions/dist/sublime-text', description: 'Lightweight code editor' },
  { name: 'PhpStorm', icon: '/int-icons/phpstorm-128.png', status: 'available', installUrl: 'https://github.com/msrbuilds/wp-launcher/tree/main/extensions/dist', description: 'PHP IDE by JetBrains' },
  { name: 'WebStorm', icon: '/int-icons/webstorm-128.png', status: 'available', installUrl: 'https://github.com/msrbuilds/wp-launcher/tree/main/extensions/dist', description: 'JavaScript IDE by JetBrains' },
  { name: 'IntelliJ IDEA', icon: '/int-icons/intellij-idea-128.png', status: 'available', installUrl: 'https://github.com/msrbuilds/wp-launcher/tree/main/extensions/dist', description: 'Java & polyglot IDE' },
  { name: 'GoLand', icon: '/int-icons/goland-128.png', status: 'available', installUrl: 'https://github.com/msrbuilds/wp-launcher/tree/main/extensions/dist', description: 'Go IDE by JetBrains' },
  { name: 'RubyMine', icon: '/int-icons/rubymine-128.png', status: 'available', installUrl: 'https://github.com/msrbuilds/wp-launcher/tree/main/extensions/dist', description: 'Ruby IDE by JetBrains' },
  { name: 'RustRover', icon: '/int-icons/rustrover-128.png', status: 'available', installUrl: 'https://github.com/msrbuilds/wp-launcher/tree/main/extensions/dist', description: 'Rust IDE by JetBrains' },
  { name: 'Neovim', icon: '/int-icons/neovim-128.png', status: 'coming-soon', description: 'Terminal-based editor' },
  { name: 'Vim', icon: '/int-icons/vim-128.png', status: 'coming-soon', description: 'Classic terminal editor' },
  { name: 'Emacs', icon: '/int-icons/emacs-128.png', status: 'coming-soon', description: 'Extensible text editor' },
  { name: 'Nova', icon: '/int-icons/nova-128.png', status: 'coming-soon', description: 'macOS-native code editor' },
  { name: 'Brackets', icon: '/int-icons/brackets-128.png', status: 'coming-soon', description: 'Adobe web editor' },
  { name: 'Notepad++', icon: '/int-icons/notepad++-128.png', status: 'coming-soon', description: 'Windows text editor' },
  { name: 'Eclipse', icon: '/int-icons/eclipse-128.png', status: 'coming-soon', description: 'Java IDE' },
  { name: 'NetBeans', icon: '/int-icons/netbeans-128.png', status: 'coming-soon', description: 'Apache IDE' },
  { name: 'Xcode', icon: '/int-icons/xcode-128.png', status: 'coming-soon', description: 'Apple development IDE' },
  { name: 'Android Studio', icon: '/int-icons/android-studio-128.png', status: 'coming-soon', description: 'Android development IDE' },
  { name: 'Obsidian', icon: '/int-icons/obsidian-128.png', status: 'coming-soon', description: 'Knowledge base & notes' },
  { name: 'Coda', icon: '/int-icons/coda-128.png', status: 'coming-soon', description: 'macOS text editor' },
  { name: 'OpenCode', icon: '/int-icons/opencode-128.png', status: 'coming-soon', description: 'Open-source editor' },
  { name: 'Chrome', icon: '/int-icons/chrome-128.png', status: 'coming-soon', description: 'Track time on web-based tools' },
  { name: 'Firefox', icon: '/int-icons/firefox-128.png', status: 'coming-soon', description: 'Track time on web-based tools' },
  { name: 'Figma', icon: '/int-icons/figma-128.png', status: 'coming-soon', description: 'Design tool time tracking' },
  { name: 'Postman', icon: '/int-icons/postman-128.png', status: 'coming-soon', description: 'API testing tool' },
  { name: 'Terminal', icon: '/int-icons/terminal-128.png', status: 'coming-soon', description: 'CLI / shell time tracking' },
];

// ── Component ──

export default function ProductivityPage() {
  const headers = useAdminHeaders();
  const { resolved } = useTheme();
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [rangeStats, setRangeStats] = useState<TodayStats | null>(null);
  const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [weekdayData, setWeekdayData] = useState<WeekdayData[]>([]);
  const [screenData, setScreenData] = useState<ScreenData[]>([]);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Cloud state
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>({});
  const [cloudUrl] = useState('https://wplauncher.msrbuilds.com');
  const [cloudApiKey, setCloudApiKey] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [showCloud, setShowCloud] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [showIntegrations, setShowIntegrations] = useState(false);

  // Goal editing
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalHours, setGoalHours] = useState(6);

  const chart = useMemo(() => readChartTokens(), [resolved]);
  const chartTooltipStyle = useMemo(() => ({
    backgroundColor: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: '0.5rem',
    color: chart.tooltipText,
    fontSize: '0.8rem',
  }), [chart]);

  const fetchData = useCallback(async () => {
    try {
      const sourceParam = sourceFilter !== 'all' ? `&source=${sourceFilter}` : '';
      const today = new Date().toISOString().slice(0, 10);
      const rangeStart = new Date();
      rangeStart.setDate(rangeStart.getDate() - (days - 1));
      const startParam = `${rangeStart.toISOString().slice(0, 10)} 00:00:00`;
      const endParam = `${today} 23:59:59`;

      const [statsRes, rangeRes, dailyRes, hourlyRes, weekdayRes, screenRes, summaryRes, cloudRes, logsRes] = await Promise.all([
        apiFetch(`/api/productivity/stats/today${sourceParam ? '?' + sourceParam.slice(1) : ''}`, { headers }),
        apiFetch(`/api/productivity/stats/range?days=${days}${sourceParam}`, { headers }),
        apiFetch(`/api/productivity/stats/daily?days=${days}${sourceParam}`, { headers }),
        apiFetch(`/api/productivity/stats/hourly?date=${today}${sourceParam}`, { headers }),
        apiFetch(`/api/productivity/stats/weekdays?days=${days}${sourceParam}`, { headers }),
        apiFetch(`/api/productivity/stats/screens?start=${encodeURIComponent(startParam)}&end=${encodeURIComponent(endParam)}`, { headers }),
        apiFetch(`/api/productivity/stats/summary?days=${days}${sourceParam}`, { headers }),
        apiFetch('/api/productivity/cloud/config', { headers }),
        apiFetch('/api/productivity/cloud/sync-log?limit=10', { headers }),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setTodayStats(data);
        setGoalHours(Math.round((data.goal || 21600) / 3600));
      }
      if (rangeRes.ok) setRangeStats(await rangeRes.json());
      if (dailyRes.ok) setDailyTotals(await dailyRes.json());
      if (hourlyRes.ok) setHourlyData(await hourlyRes.json());
      if (weekdayRes.ok) setWeekdayData(await weekdayRes.json());
      if (screenRes.ok) setScreenData(await screenRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (cloudRes.ok) setCloudConfig(await cloudRes.json());
      if (logsRes.ok) setSyncLogs(await logsRes.json());

      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load productivity data');
    } finally {
      setLoading(false);
    }
  }, [headers, sourceFilter, days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Actions ──

  const saveGoal = async () => {
    const seconds = goalHours * 3600;
    await apiFetch('/api/productivity/goals', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyGoalSeconds: seconds }),
    });
    setEditingGoal(false);
    fetchData();
  };

  const connectCloud = async () => {
    if (!cloudUrl || !cloudApiKey) return;
    setConnecting(true);
    setConnectError('');
    try {
      const res = await apiFetch('/api/productivity/cloud/config', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloud_url: cloudUrl, cloud_api_key: cloudApiKey, device_name: deviceName }),
      });
      const data = await res.json();
      if (!res.ok) { setConnectError(data.error || 'Connection failed'); return; }
      setCloudApiKey('');
      setDeviceName('');
      fetchData();
    } catch (err: any) {
      setConnectError(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const disconnectCloud = async () => {
    await apiFetch('/api/productivity/cloud/config', { method: 'DELETE', headers });
    setCloudConfig({});
    fetchData();
  };

  const triggerSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await apiFetch('/api/productivity/cloud/sync', { method: 'POST', headers });
      const data = await res.json();
      if (data.status === 'success') {
        setSyncMsg(data.pushed > 0 ? `Synced ${data.pushed} heartbeats` : 'Sync complete — no new data to push');
      } else {
        setSyncMsg(`Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setSyncMsg(`Sync failed: ${err.message}`);
    }
    setSyncing(false);
    fetchData();
  };

  // ── Computed values ──

  const isCloudLinked = !!(cloudConfig.cloud_url && cloudConfig.cloud_api_key);
  const goalSeconds = todayStats?.goal || 21600;
  const todaySeconds = todayStats?.totalSeconds || 0;
  const goalPercent = Math.min(100, Math.round((todaySeconds / goalSeconds) * 100));

  const editorSeconds = rangeStats?.bySource.find(s => s.source === 'editor')?.totalSeconds || 0;
  const wpSeconds = rangeStats?.bySource.find(s => s.source === 'wordpress')?.totalSeconds || 0;
  const totalSourceSeconds = editorSeconds + wpSeconds || 1;

  const weeklyAvg = dailyTotals.length > 0
    ? Math.round(dailyTotals.reduce((sum, d) => sum + d.totalSeconds, 0) / dailyTotals.length)
    : 0;

  const activeProjects = rangeStats?.byProject.filter(p => p.totalSeconds > 0).length || 0;

  const barData = dailyTotals.map(d => ({
    date: formatShortDate(d.date),
    editor: Math.round(d.editorSeconds / 60),
    wordpress: Math.round(d.wordpressSeconds / 60),
    total: Math.round(d.totalSeconds / 60),
  }));

  const hourlyBarData = hourlyData.map(h => ({
    hour: formatHour(h.hour),
    minutes: Math.round(h.totalSeconds / 60),
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading...
      </div>
    );
  }

  const microLabel = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';
  const statCard = 'rounded-xl border border-border bg-card p-6';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-foreground">Productivity</h2>
          {cloudConfig.cloud_url && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Synced {cloudConfig.last_synced_at ? new Date(cloudConfig.last_synced_at).toLocaleString() : 'never'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {['all', 'editor', 'wordpress'].map(s => (
              <button
                key={s}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  sourceFilter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
                onClick={() => setSourceFilter(s)}
              >
                {s === 'all' ? 'All' : s === 'editor' ? 'Coding' : 'WordPress'}
              </button>
            ))}
          </div>
          <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
            <SelectTrigger size="sm" className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" size="sm" onClick={() => setShowIntegrations(!showIntegrations)}>
            <Blocks className="h-3.5 w-3.5" />
            Integrations
          </Button>
        </div>
      </div>

      {/* Integrations Panel */}
      {showIntegrations && (
        <div className={statCard}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-card-foreground">Editor Integrations</h3>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Install extensions to track coding time from your favorite editors. All data flows to your local WP Launcher dashboard.</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setShowIntegrations(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {INTEGRATIONS.map(ext => (
              <div
                key={ext.name}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg border border-border p-3',
                  ext.status === 'coming-soon' && 'opacity-60',
                )}
              >
                {ext.status === 'coming-soon' && (
                  <Badge variant="outline" className="absolute right-2 top-2 text-[10px]">Soon</Badge>
                )}
                <img src={ext.icon} alt={ext.name} width="32" height="32" className="h-8 w-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-card-foreground">{ext.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{ext.description}</div>
                </div>
                <div className="shrink-0">
                  {ext.status === 'available' && ext.installUrl && (
                    <Button asChild size="sm">
                      <a href={ext.installUrl} target="_blank" rel="noopener noreferrer">Install</a>
                    </Button>
                  )}
                  {ext.status === 'built-in' && <Badge variant="secondary">Built-in</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isCloudLinked && (
        <div className={cn(statCard, 'flex flex-wrap items-center gap-4')}>
          <AlertCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-[16rem] flex-1">
            <strong className="text-sm font-semibold text-card-foreground">Account not linked</strong>
            <p className="mt-1 text-sm text-muted-foreground">Connect your WP Launcher cloud account to start tracking productivity. Heartbeats from editors and WordPress sites will not be recorded until an account is linked.</p>
          </div>
          <Button size="sm" onClick={() => setShowCloud(true)}>
            Connect Account
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Grid — 5 cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className={statCard}>
          <div className={microLabel}>Today</div>
          <div className="mt-1 text-2xl font-semibold text-card-foreground">{formatDuration(todaySeconds)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{todayStats?.heartbeatCount || 0} heartbeats</div>
        </div>

        <div className={statCard}>
          <div className={cn(microLabel, 'flex items-center justify-between gap-2')}>
            Goal
            <button className="text-[11px] font-medium normal-case text-primary hover:underline" onClick={() => setEditingGoal(!editingGoal)}>
              {editingGoal ? 'cancel' : 'edit'}
            </button>
          </div>
          <div className="mt-1 text-2xl font-semibold text-card-foreground">{goalPercent}%</div>
          <Progress className="mt-2" value={goalPercent} />
          <div className="mt-1 text-xs text-muted-foreground">{formatDuration(todaySeconds)} / {formatDuration(goalSeconds)}</div>
          {editingGoal && (
            <div className="mt-3 flex items-center gap-2">
              <Input type="number" min={1} max={24} value={goalHours} onChange={e => setGoalHours(Number(e.target.value))} className="h-8 w-20" />
              <span className="text-xs text-muted-foreground">hrs</span>
              <Button size="sm" onClick={saveGoal}>Save</Button>
            </div>
          )}
        </div>

        <div className={statCard}>
          <div className={microLabel}>Daily Average</div>
          <div className="mt-1 text-2xl font-semibold text-card-foreground">{formatDuration(weeklyAvg)}</div>
          <div className="mt-1 text-xs text-muted-foreground">over {days} days</div>
        </div>

        <div className={statCard}>
          <div className={microLabel}>Best Day</div>
          <div className="mt-1 text-2xl font-semibold text-card-foreground">{summary?.bestDay.seconds ? formatDuration(summary.bestDay.seconds) : '—'}</div>
          <div className="mt-1 text-xs text-muted-foreground">{summary?.bestDay.date ? formatShortDate(summary.bestDay.date) : '—'}</div>
        </div>

        <div className={statCard}>
          <div className={microLabel}>Streak</div>
          <div className="mt-1 text-2xl font-semibold text-card-foreground">{todayStats?.streak || 0}</div>
          <div className="mt-1 text-xs text-muted-foreground">day{(todayStats?.streak || 0) !== 1 ? 's' : ''} in a row</div>
        </div>
      </div>

      {/* Time Split */}
      {sourceFilter === 'all' && (editorSeconds > 0 || wpSeconds > 0) && (
        <div className={statCard}>
          {/* Indicator = coding share, remaining track = WordPress share */}
          <Progress className="bg-primary/25" value={Math.round((editorSeconds / totalSourceSeconds) * 100)} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Coding: {formatDuration(editorSeconds)} ({Math.round((editorSeconds / totalSourceSeconds) * 100)}%)
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary/25" />
              WordPress: {formatDuration(wpSeconds)} ({Math.round((wpSeconds / totalSourceSeconds) * 100)}%)
            </span>
          </div>
        </div>
      )}

      {/* Daily Activity Chart */}
      <div className={statCard}>
        <h3 className="mb-3 text-sm font-semibold text-card-foreground">Daily Activity</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.grid} />
            <YAxis tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.grid} label={{ value: 'min', position: 'insideTopLeft', offset: -5, style: { fontSize: 10, fill: chart.axis } }} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(value: unknown) => `${value} min`} />
            <Legend wrapperStyle={{ fontSize: '0.75rem', color: chart.axis }} />
            {sourceFilter !== 'wordpress' && (
              <Bar dataKey="editor" name="Coding" fill={chart.series[0]} stackId="a" radius={[2, 2, 0, 0]} />
            )}
            {sourceFilter !== 'editor' && (
              <Bar dataKey="wordpress" name="WordPress" fill={chart.series[2]} stackId="a" radius={[2, 2, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown Grid — WakaTime-style panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Projects / Sites */}
        <div className={statCard}>
          <h3 className="mb-3 text-sm font-semibold text-card-foreground">
            {sourceFilter === 'wordpress' ? 'Sites' : sourceFilter === 'editor' ? 'Projects' : 'Projects & Sites'}
          </h3>
          <BreakdownList
            label="project"
            items={(rangeStats?.byProject || []).map(p => ({ name: p.project, seconds: p.totalSeconds }))}
          />
        </div>

        {/* Categories (WordPress activities) */}
        <div className={statCard}>
          <h3 className="mb-3 text-sm font-semibold text-card-foreground">
            {sourceFilter === 'editor' ? 'Languages' : sourceFilter === 'wordpress' ? 'Activities' : 'Categories'}
          </h3>
          {sourceFilter === 'editor' ? (
            <BreakdownList
              label="language"
              items={(rangeStats?.byLanguage || []).map(l => ({ name: l.language, seconds: l.totalSeconds }))}
            />
          ) : sourceFilter === 'wordpress' ? (
            <BreakdownList
              label="activity"
              items={(rangeStats?.byCategory || []).map(c => ({ name: c.category, seconds: c.totalSeconds }))}
            />
          ) : (
            <BreakdownList
              label="category"
              items={[
                ...(rangeStats?.byCategory || []).map(c => ({ name: c.category, seconds: c.totalSeconds })),
                ...(rangeStats?.byLanguage || []).map(l => ({ name: l.language, seconds: l.totalSeconds })),
              ].sort((a, b) => b.seconds - a.seconds)}
            />
          )}
        </div>

        {/* Editors */}
        <div className={statCard}>
          <h3 className="mb-3 text-sm font-semibold text-card-foreground">Editors</h3>
          <BreakdownList
            label="editor"
            colorMap={EDITOR_COLORS}
            items={(rangeStats?.byEditor || []).map(e => ({ name: e.editor, seconds: e.totalSeconds }))}
          />
        </div>

        {/* WP Screens */}
        <div className={statCard}>
          <h3 className="mb-3 text-sm font-semibold text-card-foreground">WordPress Screens</h3>
          <BreakdownList
            label="screen"
            items={screenData.map(s => ({ name: s.screen, seconds: s.totalSeconds }))}
          />
        </div>
      </div>

      {/* Hourly Activity + Weekday Activity side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={statCard}>
          <h3 className="mb-3 text-sm font-semibold text-card-foreground">Activity by Hour</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: chart.axis }} stroke={chart.grid} interval={2} />
              <YAxis tick={{ fontSize: 10, fill: chart.axis }} stroke={chart.grid} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(value: unknown) => `${value} min`} />
              <Bar dataKey="minutes" fill={chart.series[3]} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={statCard}>
          <h3 className="mb-3 text-sm font-semibold text-card-foreground">Weekdays</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekdayData.map(d => ({ day: d.day.slice(0, 3), avg: Math.round(d.avgSeconds / 60) }))} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis type="number" tick={{ fontSize: 10, fill: chart.axis }} stroke={chart.grid} />
              <YAxis type="category" dataKey="day" tick={{ fontSize: 11, fill: chart.axis }} stroke={chart.grid} width={35} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(value: unknown) => `${value} min avg`} />
              <Bar dataKey="avg" fill={chart.series[1]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity Summary Card */}
      {summary && (
        <div className={cn(statCard, 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5')}>
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-semibold text-card-foreground">{activeProjects}</span>
            <span className={microLabel}>Active Sites</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-semibold text-card-foreground">{summary.writeCount}</span>
            <span className={microLabel}>Saves / Publishes</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-semibold text-card-foreground">{rangeStats?.heartbeatCount || 0}</span>
            <span className={microLabel}>Heartbeats</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-semibold text-card-foreground">{rangeStats?.byCategory.length || 0}</span>
            <span className={microLabel}>Activity Types</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-semibold text-card-foreground">{screenData.length}</span>
            <span className={microLabel}>Screens Visited</span>
          </div>
        </div>
      )}

      {/* Cloud Connection */}
      <div className={statCard}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-card-foreground">Cloud Sync</h3>
          <Button variant="secondary" size="sm" onClick={() => setShowCloud(!showCloud)}>
            {showCloud ? 'Hide' : 'Configure'}
          </Button>
        </div>

        {showCloud && (
          <div className="mt-4">
            {cloudConfig.cloud_url ? (
              <div className="space-y-4">
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p><strong className="font-medium text-card-foreground">Cloud URL:</strong> {cloudConfig.cloud_url}</p>
                  <p><strong className="font-medium text-card-foreground">API Key:</strong> {cloudConfig.cloud_api_key}</p>
                  <p><strong className="font-medium text-card-foreground">Last Synced:</strong> {cloudConfig.last_synced_at ? new Date(cloudConfig.last_synced_at).toLocaleString() : 'Never'}</p>
                  {cloudConfig.heartbeat_secret && (
                    <div className="pt-2">
                      <p><strong className="font-medium text-card-foreground">VS Code Secret:</strong></p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <code className="rounded-lg bg-muted px-2 py-1 font-mono text-xs text-foreground">{cloudConfig.heartbeat_secret}</code>
                        <Button size="sm" variant="secondary" title="Copy secret" onClick={() => { navigator.clipboard.writeText(cloudConfig.heartbeat_secret!); }}>Copy</Button>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Paste this into VS Code Settings &gt; WP Launcher Productivity &gt; Heartbeat Secret</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={triggerSync} disabled={syncing}>
                    {syncing ? 'Syncing...' : 'Sync Now'}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={disconnectCloud}>Disconnect</Button>
                </div>
                {syncMsg && (
                  <div className={cn('text-sm', syncMsg.includes('failed') ? 'text-destructive' : 'text-muted-foreground')}>
                    {syncMsg}
                  </div>
                )}
                {syncLogs.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-card-foreground">Recent Syncs</h4>
                    <div className="mt-2 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Count</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Error</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {syncLogs.map(log => (
                            <TableRow key={log.id}>
                              <TableCell>{new Date(log.completed_at + 'Z').toLocaleString()}</TableCell>
                              <TableCell>{log.heartbeats_count}</TableCell>
                              <TableCell>
                                <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>{log.status}</Badge>
                              </TableCell>
                              <TableCell className="max-w-[16rem] truncate text-muted-foreground">{log.error || '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-md space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pd-cloud-key">API Key</Label>
                  <Input id="pd-cloud-key" placeholder="wpl_xxxxxxxxxx" value={cloudApiKey} onChange={e => setCloudApiKey(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pd-device-name">Device Name (optional)</Label>
                  <Input id="pd-device-name" placeholder="My Laptop" value={deviceName} onChange={e => setDeviceName(e.target.value)} />
                </div>
                {connectError && (
                  <Alert variant="destructive">
                    <AlertDescription>{connectError}</AlertDescription>
                  </Alert>
                )}
                <Button onClick={connectCloud} disabled={!cloudApiKey || connecting}>
                  {connecting ? 'Verifying...' : 'Connect'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
