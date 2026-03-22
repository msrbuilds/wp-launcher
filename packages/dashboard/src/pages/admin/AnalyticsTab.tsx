import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card an-stat-center">
      <div className="an-stat-value">{value}</div>
      <div className="an-stat-label">{label}</div>
    </div>
  );
}

export default function AnalyticsTab() {
  const headers = useAdminHeaders();
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [launches, setLaunches] = useState<{ date: string; count: number }[]>([]);
  const [products, setProducts] = useState<{ productId: string; launches: number }[]>([]);
  const [registrations, setRegistrations] = useState<{ date: string; count: number }[]>([]);
  const [summary, setSummary] = useState<{
    avgLifetimeHours: number | null;
    peakHour: number | null;
    sitesToday: number;
    sitesThisWeek: number;
    sitesThisMonth: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="card"><span className="spinner spinner-dark" /> Loading analytics...</div>;

  const formatDate = (d: string) => {
    const date = new Date(d + 'T00:00:00');
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div>
      {summary && (
        <div className="an-summary-grid">
          <StatCard label="Sites Today" value={summary.sitesToday} />
          <StatCard label="This Week" value={summary.sitesThisWeek} />
          <StatCard label="This Month" value={summary.sitesThisMonth} />
          <StatCard label="Avg Lifetime" value={summary.avgLifetimeHours != null ? `${summary.avgLifetimeHours}h` : '—'} />
          <StatCard label="Peak Hour" value={summary.peakHour != null ? `${summary.peakHour}:00` : '—'} />
        </div>
      )}

      <div className="card an-range-bar">
        {([7, 30, 90] as const).map((d) => (
          <button key={d} className={`btn btn-sm ${range === d ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRange(d)}>{d}d</button>
        ))}
      </div>

      <div className="card an-chart-card">
        <h3 className="an-chart-title">Site Launches</h3>
        {launches.length === 0 ? (
          <p className="an-no-data">No data for this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={launches}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip labelFormatter={(l) => `Date: ${l}`} />
              <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card an-chart-card">
        <h3 className="an-chart-title">Product Popularity</h3>
        {products.length === 0 ? (
          <p className="an-no-data">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(150, products.length * 40)}>
            <BarChart data={products} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis dataKey="productId" type="category" width={120} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="launches" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h3 className="an-chart-title">User Registrations</h3>
        {registrations.length === 0 ? (
          <p className="an-no-data">No data for this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={registrations}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip labelFormatter={(l) => `Date: ${l}`} />
              <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
