import { useState, useEffect, useCallback } from 'react';
import { useAdminHeaders } from './admin/AdminLayout';
import { apiFetch } from '../utils/api';
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const EDITOR_COLORS: Record<string, string> = {
  vscode: '#007ACC',
  cursor: '#00E5A0',
  windsurf: '#6C5CE7',
  antigravity: '#4285F4',
  sublime: '#FF9800',
  phpstorm: '#B845FC',
  webstorm: '#00CDD7',
  pycharm: '#21D789',
  intellij: '#FC801D',
  goland: '#00ACC1',
  rider: '#DD1265',
  clion: '#21D789',
  rubymine: '#FC801D',
  datagrip: '#22D88F',
  'android-studio': '#3DDC84',
  jetbrains: '#FC801D',
};
const chartTooltipStyle = {
  backgroundColor: 'rgba(255,255,255,0.95)',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  fontSize: '0.8rem',
};

// ── Breakdown Bar Component (WakaTime-style horizontal bars) ──

function BreakdownList({ items, label, colorMap }: { items: { name: string; seconds: number }[]; label: string; colorMap?: Record<string, string> }) {
  if (items.length === 0) return <div className="pd-empty">No {label.toLowerCase()} data</div>;
  const max = items[0]?.seconds || 1;
  const total = items.reduce((s, i) => s + i.seconds, 0) || 1;
  const getColor = (name: string, i: number) => colorMap?.[name.toLowerCase()] || COLORS[i % COLORS.length];
  return (
    <div className="pd-breakdown-list">
      {items.map((item, i) => (
        <div key={item.name} className="pd-breakdown-item">
          <div className="pd-breakdown-row">
            <span className="pd-breakdown-name">
              <span className="pd-breakdown-dot" style={{ backgroundColor: getColor(item.name, i) }} />
              {item.name}
            </span>
            <span className="pd-breakdown-time">{formatDuration(item.seconds)}</span>
            <span className="pd-breakdown-pct">{Math.round((item.seconds / total) * 100)}%</span>
          </div>
          <div className="pd-bar pd-bar-sm">
            <div
              className="pd-bar-fill"
              style={{ width: `${Math.round((item.seconds / max) * 100)}%`, backgroundColor: getColor(item.name, i) }}
            />
          </div>
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
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
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

  const fetchData = useCallback(async () => {
    try {
      const sourceParam = sourceFilter !== 'all' ? `&source=${sourceFilter}` : '';
      const today = new Date().toISOString().slice(0, 10);
      const startParam = `${today} 00:00:00`;
      const endParam = `${today} 23:59:59`;

      const [statsRes, dailyRes, hourlyRes, weekdayRes, screenRes, summaryRes, cloudRes, logsRes] = await Promise.all([
        apiFetch(`/api/productivity/stats/today${sourceParam ? '?' + sourceParam.slice(1) : ''}`, { headers }),
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

  const editorSeconds = todayStats?.bySource.find(s => s.source === 'editor')?.totalSeconds || 0;
  const wpSeconds = todayStats?.bySource.find(s => s.source === 'wordpress')?.totalSeconds || 0;
  const totalSourceSeconds = editorSeconds + wpSeconds || 1;

  const weeklyAvg = dailyTotals.length > 0
    ? Math.round(dailyTotals.reduce((sum, d) => sum + d.totalSeconds, 0) / dailyTotals.length)
    : 0;

  const activeProjects = todayStats?.byProject.filter(p => p.totalSeconds > 0).length || 0;

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
    return <div className="pd-loading"><div className="spinner" /></div>;
  }

  return (
    <div className="pd-page">
      {/* Header */}
      <div className="pd-header">
        <div className="pd-header-left">
          <h2 className="pd-title">Productivity</h2>
          {cloudConfig.cloud_url && (
            <span className="pd-cloud-badge">
              <span className="pd-live-dot" />
              Synced {cloudConfig.last_synced_at ? new Date(cloudConfig.last_synced_at).toLocaleString() : 'never'}
            </span>
          )}
        </div>
        <div className="pd-header-actions">
          <div className="pd-source-toggle">
            {['all', 'editor', 'wordpress'].map(s => (
              <button
                key={s}
                className={`pd-toggle-btn ${sourceFilter === s ? 'active' : ''}`}
                onClick={() => setSourceFilter(s)}
              >
                {s === 'all' ? 'All' : s === 'editor' ? 'Coding' : 'WordPress'}
              </button>
            ))}
          </div>
          <select className="pd-days-select" value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowIntegrations(!showIntegrations)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}>
              <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M15 2v2M15 20v2M2 15h2M20 15h2M9 2v2M9 20v2M2 9h2M20 9h2" />
            </svg>
            Integrations
          </button>
        </div>
      </div>

      {/* Integrations Panel */}
      {showIntegrations && (
        <div className="pd-integrations-panel">
          <div className="pd-integrations-header">
            <div>
              <h3 className="pd-section-title">Editor Integrations</h3>
              <p className="pd-integrations-desc">Install extensions to track coding time from your favorite editors. All data flows to your local WP Launcher dashboard.</p>
            </div>
            <button className="pd-close-btn" onClick={() => setShowIntegrations(false)}>&times;</button>
          </div>
          <div className="pd-integrations-grid">
            {INTEGRATIONS.map(ext => (
              <div key={ext.name} className={`pd-integration-card ${ext.status}`}>
                {ext.status === 'coming-soon' && (
                  <span className="pd-integration-badge">Soon</span>
                )}
                <div className="pd-integration-icon">
                  <img src={ext.icon} alt={ext.name} width="32" height="32" />
                </div>
                <div className="pd-integration-info">
                  <div className="pd-integration-name">{ext.name}</div>
                  <div className="pd-integration-desc">{ext.description}</div>
                </div>
                <div className="pd-integration-action">
                  {ext.status === 'available' && ext.installUrl && (
                    <a href={ext.installUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">Install</a>
                  )}
                  {ext.status === 'built-in' && (
                    <span className="badge badge-green">Built-in</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isCloudLinked && (
        <div className="pd-notice">
          <div className="pd-notice-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="pd-notice-content">
            <strong>Account not linked</strong>
            <p>Connect your WP Launcher cloud account to start tracking productivity. Heartbeats from editors and WordPress sites will not be recorded until an account is linked.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCloud(true)}>
            Connect Account
          </button>
        </div>
      )}

      {error && <div className="alert-error">{error}</div>}

      {/* Stats Grid — 5 cards */}
      <div className="pd-stats-grid">
        <div className="pd-stat-card">
          <div className="pd-stat-label">Today</div>
          <div className="pd-stat-value">{formatDuration(todaySeconds)}</div>
          <div className="pd-stat-sub">{todayStats?.heartbeatCount || 0} heartbeats</div>
        </div>

        <div className="pd-stat-card">
          <div className="pd-stat-label">
            Goal
            <button className="pd-goal-edit-btn" onClick={() => setEditingGoal(!editingGoal)}>
              {editingGoal ? 'cancel' : 'edit'}
            </button>
          </div>
          <div className="pd-stat-value">{goalPercent}%</div>
          <div className="pd-bar">
            <div className="pd-bar-fill" style={{ width: `${goalPercent}%`, backgroundColor: goalPercent >= 100 ? '#10b981' : '#3b82f6' }} />
          </div>
          <div className="pd-stat-sub">{formatDuration(todaySeconds)} / {formatDuration(goalSeconds)}</div>
          {editingGoal && (
            <div className="pd-goal-edit">
              <input type="number" min={1} max={24} value={goalHours} onChange={e => setGoalHours(Number(e.target.value))} className="pd-goal-input" />
              <span>hrs</span>
              <button className="btn btn-primary btn-sm" onClick={saveGoal}>Save</button>
            </div>
          )}
        </div>

        <div className="pd-stat-card">
          <div className="pd-stat-label">Daily Average</div>
          <div className="pd-stat-value">{formatDuration(weeklyAvg)}</div>
          <div className="pd-stat-sub">over {days} days</div>
        </div>

        <div className="pd-stat-card">
          <div className="pd-stat-label">Best Day</div>
          <div className="pd-stat-value">{summary?.bestDay.seconds ? formatDuration(summary.bestDay.seconds) : '—'}</div>
          <div className="pd-stat-sub">{summary?.bestDay.date ? formatShortDate(summary.bestDay.date) : '—'}</div>
        </div>

        <div className="pd-stat-card">
          <div className="pd-stat-label">Streak</div>
          <div className="pd-stat-value">{todayStats?.streak || 0}</div>
          <div className="pd-stat-sub">day{(todayStats?.streak || 0) !== 1 ? 's' : ''} in a row</div>
        </div>
      </div>

      {/* Time Split */}
      {sourceFilter === 'all' && (editorSeconds > 0 || wpSeconds > 0) && (
        <div className="pd-split-card">
          <div className="pd-split-bar">
            <div className="pd-split-segment pd-split-editor" style={{ width: `${(editorSeconds / totalSourceSeconds) * 100}%` }} />
            <div className="pd-split-segment pd-split-wordpress" style={{ width: `${(wpSeconds / totalSourceSeconds) * 100}%` }} />
          </div>
          <div className="pd-split-labels">
            <span className="pd-split-label">
              <span className="pd-dot" style={{ backgroundColor: '#3b82f6' }} />
              Coding: {formatDuration(editorSeconds)} ({Math.round((editorSeconds / totalSourceSeconds) * 100)}%)
            </span>
            <span className="pd-split-label">
              <span className="pd-dot" style={{ backgroundColor: '#f59e0b' }} />
              WordPress: {formatDuration(wpSeconds)} ({Math.round((wpSeconds / totalSourceSeconds) * 100)}%)
            </span>
          </div>
        </div>
      )}

      {/* Daily Activity Chart */}
      <div className="pd-chart-card">
        <h3 className="pd-chart-title">Daily Activity</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: 'min', position: 'insideTopLeft', offset: -5, style: { fontSize: 10, fill: '#9ca3af' } }} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(value: unknown) => `${value} min`} />
            <Legend />
            {sourceFilter !== 'wordpress' && (
              <Bar dataKey="editor" name="Coding" fill="#3b82f6" stackId="a" radius={[2, 2, 0, 0]} />
            )}
            {sourceFilter !== 'editor' && (
              <Bar dataKey="wordpress" name="WordPress" fill="#f59e0b" stackId="a" radius={[2, 2, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown Grid — WakaTime-style panels */}
      <div className="pd-breakdown-grid">
        {/* Projects / Sites */}
        <div className="pd-breakdown-card">
          <h3 className="pd-chart-title">
            {sourceFilter === 'wordpress' ? 'Sites' : sourceFilter === 'editor' ? 'Projects' : 'Projects & Sites'}
          </h3>
          <BreakdownList
            label="project"
            items={(todayStats?.byProject || []).map(p => ({ name: p.project, seconds: p.totalSeconds }))}
          />
        </div>

        {/* Categories (WordPress activities) */}
        <div className="pd-breakdown-card">
          <h3 className="pd-chart-title">
            {sourceFilter === 'editor' ? 'Languages' : sourceFilter === 'wordpress' ? 'Activities' : 'Categories'}
          </h3>
          {sourceFilter === 'editor' ? (
            <BreakdownList
              label="language"
              items={(todayStats?.byLanguage || []).map(l => ({ name: l.language, seconds: l.totalSeconds }))}
            />
          ) : sourceFilter === 'wordpress' ? (
            <BreakdownList
              label="activity"
              items={(todayStats?.byCategory || []).map(c => ({ name: c.category, seconds: c.totalSeconds }))}
            />
          ) : (
            <BreakdownList
              label="category"
              items={[
                ...(todayStats?.byCategory || []).map(c => ({ name: c.category, seconds: c.totalSeconds })),
                ...(todayStats?.byLanguage || []).map(l => ({ name: l.language, seconds: l.totalSeconds })),
              ].sort((a, b) => b.seconds - a.seconds)}
            />
          )}
        </div>

        {/* Editors */}
        <div className="pd-breakdown-card">
          <h3 className="pd-chart-title">Editors</h3>
          <BreakdownList
            label="editor"
            colorMap={EDITOR_COLORS}
            items={(todayStats?.byEditor || []).map(e => ({ name: e.editor, seconds: e.totalSeconds }))}
          />
        </div>

        {/* WP Screens */}
        <div className="pd-breakdown-card">
          <h3 className="pd-chart-title">WordPress Screens</h3>
          <BreakdownList
            label="screen"
            items={screenData.map(s => ({ name: s.screen, seconds: s.totalSeconds }))}
          />
        </div>
      </div>

      {/* Hourly Activity + Weekday Activity side by side */}
      <div className="pd-charts-grid">
        <div className="pd-chart-card">
          <h3 className="pd-chart-title">Activity by Hour</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyBarData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(value: unknown) => `${value} min`} />
              <Bar dataKey="minutes" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="pd-chart-card">
          <h3 className="pd-chart-title">Weekdays</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekdayData.map(d => ({ day: d.day.slice(0, 3), avg: Math.round(d.avgSeconds / 60) }))} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="day" tick={{ fontSize: 11 }} width={35} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(value: unknown) => `${value} min avg`} />
              <Bar dataKey="avg" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity Summary Card */}
      {summary && (
        <div className="pd-summary-row">
          <div className="pd-summary-item">
            <span className="pd-summary-num">{activeProjects}</span>
            <span className="pd-summary-label">Active Sites</span>
          </div>
          <div className="pd-summary-item">
            <span className="pd-summary-num">{summary.writeCount}</span>
            <span className="pd-summary-label">Saves / Publishes</span>
          </div>
          <div className="pd-summary-item">
            <span className="pd-summary-num">{summary.heartbeatCount}</span>
            <span className="pd-summary-label">Heartbeats Today</span>
          </div>
          <div className="pd-summary-item">
            <span className="pd-summary-num">{todayStats?.byCategory.length || 0}</span>
            <span className="pd-summary-label">Activity Types</span>
          </div>
          <div className="pd-summary-item">
            <span className="pd-summary-num">{screenData.length}</span>
            <span className="pd-summary-label">Screens Visited</span>
          </div>
        </div>
      )}

      {/* Cloud Connection */}
      <div className="pd-section">
        <div className="pd-section-header">
          <h3 className="pd-section-title">Cloud Sync</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCloud(!showCloud)}>
            {showCloud ? 'Hide' : 'Configure'}
          </button>
        </div>

        {showCloud && (
          <div className="pd-cloud-panel">
            {cloudConfig.cloud_url ? (
              <div className="pd-cloud-connected">
                <div className="pd-cloud-info">
                  <p><strong>Cloud URL:</strong> {cloudConfig.cloud_url}</p>
                  <p><strong>API Key:</strong> {cloudConfig.cloud_api_key}</p>
                  <p><strong>Last Synced:</strong> {cloudConfig.last_synced_at ? new Date(cloudConfig.last_synced_at).toLocaleString() : 'Never'}</p>
                  {cloudConfig.heartbeat_secret && (
                    <div className="pd-secret-row">
                      <p><strong>VS Code Secret:</strong></p>
                      <div className="pd-secret-copy">
                        <code className="pd-secret-value">{cloudConfig.heartbeat_secret}</code>
                        <button className="btn btn-sm" title="Copy secret" onClick={() => { navigator.clipboard.writeText(cloudConfig.heartbeat_secret!); }}>Copy</button>
                      </div>
                      <p className="pd-secret-hint">Paste this into VS Code Settings &gt; WP Launcher Productivity &gt; Heartbeat Secret</p>
                    </div>
                  )}
                </div>
                <div className="pd-cloud-actions">
                  <button className="btn btn-primary btn-sm" onClick={triggerSync} disabled={syncing}>
                    {syncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={disconnectCloud}>Disconnect</button>
                </div>
                {syncMsg && (
                  <div className={`pd-sync-msg ${syncMsg.includes('failed') ? 'pd-sync-error' : 'pd-sync-success'}`}>
                    {syncMsg}
                  </div>
                )}
                {syncLogs.length > 0 && (
                  <div className="pd-sync-log">
                    <h4>Recent Syncs</h4>
                    <table className="pd-table pd-table-sm">
                      <thead>
                        <tr><th>Time</th><th>Count</th><th>Status</th><th>Error</th></tr>
                      </thead>
                      <tbody>
                        {syncLogs.map(log => (
                          <tr key={log.id}>
                            <td>{new Date(log.completed_at + 'Z').toLocaleString()}</td>
                            <td>{log.heartbeats_count}</td>
                            <td><span className={`badge ${log.status === 'success' ? 'badge-green' : 'badge-red'}`}>{log.status}</span></td>
                            <td className="pd-error-cell">{log.error || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="pd-cloud-setup">
                <div className="form-group">
                  <label className="form-label">API Key</label>
                  <input className="form-input" placeholder="wpl_xxxxxxxxxx" value={cloudApiKey} onChange={e => setCloudApiKey(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Device Name (optional)</label>
                  <input className="form-input" placeholder="My Laptop" value={deviceName} onChange={e => setDeviceName(e.target.value)} />
                </div>
                {connectError && <div className="alert-error">{connectError}</div>}
                <button className="btn btn-primary" onClick={connectCloud} disabled={!cloudApiKey || connecting}>
                  {connecting ? 'Verifying...' : 'Connect'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
