import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '@/components/ui/button';

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

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <div className="text-2xl font-semibold text-card-foreground">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

export default function AnalyticsTab() {
  const headers = useAdminHeaders();
  const { resolved } = useTheme();
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [launches, setLaunches] = useState<{ date: string; count: number }[]>([]);
  const [products, setProducts] = useState<{ blueprintId: string; launches: number }[]>([]);
  const [registrations, setRegistrations] = useState<{ date: string; count: number }[]>([]);
  const [summary, setSummary] = useState<{
    avgLifetimeHours: number | null;
    peakHour: number | null;
    sitesToday: number;
    sitesThisWeek: number;
    sitesThisMonth: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const chart = useMemo(() => readChartTokens(), [resolved]);
  const tooltipStyle = useMemo(() => ({
    backgroundColor: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: '0.5rem',
    color: chart.tooltipText,
    fontSize: '0.8rem',
  }), [chart]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`/api/admin/analytics/launches?days=${range}`, { headers }).then((r) => r.json()),
      apiFetch('/api/admin/analytics/products', { headers }).then((r) => r.json()),
      apiFetch(`/api/admin/analytics/registrations?days=${range}`, { headers }).then((r) => r.json()),
      apiFetch('/api/admin/analytics/summary', { headers }).then((r) => r.json()),
    ])
      .then(([launchData, prodData, regData, summaryData]) => {
        setLaunches(launchData.data || []);
        setProducts(prodData.data || []);
        setRegistrations(regData.data || []);
        setSummary(summaryData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics...
      </div>
    );
  }

  const formatDate = (d: string) => {
    const date = new Date(d + 'T00:00:00');
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="space-y-5">
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Sites Today" value={summary.sitesToday} />
          <StatCard label="This Week" value={summary.sitesThisWeek} />
          <StatCard label="This Month" value={summary.sitesThisMonth} />
          <StatCard label="Avg Lifetime" value={summary.avgLifetimeHours != null ? `${summary.avgLifetimeHours}h` : '—'} />
          <StatCard label="Peak Hour" value={summary.peakHour != null ? `${summary.peakHour}:00` : '—'} />
        </div>
      )}

      <div className="flex gap-2 rounded-xl border border-border bg-card p-4">
        {([7, 30, 90] as const).map((d) => (
          <Button key={d} size="sm" variant={range === d ? 'default' : 'secondary'} onClick={() => setRange(d)}>
            {d}d
          </Button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold text-card-foreground">Site Launches</h3>
        {launches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={launches}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12, fill: chart.axis }} stroke={chart.grid} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: chart.axis }} stroke={chart.grid} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `Date: ${l}`} />
              <Line type="monotone" dataKey="count" stroke={chart.series[0]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold text-card-foreground">Product Popularity</h3>
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(150, products.length * 40)}>
            <BarChart data={products} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: chart.axis }} stroke={chart.grid} />
              <YAxis dataKey="blueprintId" type="category" width={120} tick={{ fontSize: 12, fill: chart.axis }} stroke={chart.grid} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="launches" fill={chart.series[1]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold text-card-foreground">User Registrations</h3>
        {registrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={registrations}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12, fill: chart.axis }} stroke={chart.grid} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: chart.axis }} stroke={chart.grid} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `Date: ${l}`} />
              <Line type="monotone" dataKey="count" stroke={chart.series[2]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
