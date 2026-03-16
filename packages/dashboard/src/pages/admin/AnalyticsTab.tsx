import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAdminHeaders } from './AdminLayout';

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#2563eb' }}>{value}</div>
      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{label}</div>
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
      fetch(`/api/admin/analytics/launches?days=${range}`, { headers, credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/analytics/products', { headers, credentials: 'include' }).then((r) => r.json()),
      fetch(`/api/admin/analytics/registrations?days=${range}`, { headers, credentials: 'include' }).then((r) => r.json()),
      fetch('/api/admin/analytics/summary', { headers, credentials: 'include' }).then((r) => r.json()),
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          <StatCard label="Sites Today" value={summary.sitesToday} />
          <StatCard label="This Week" value={summary.sitesThisWeek} />
          <StatCard label="This Month" value={summary.sitesThisMonth} />
          <StatCard label="Avg Lifetime" value={summary.avgLifetimeHours != null ? `${summary.avgLifetimeHours}h` : '—'} />
          <StatCard label="Peak Hour" value={summary.peakHour != null ? `${summary.peakHour}:00` : '—'} />
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        {([7, 30, 90] as const).map((d) => (
          <button key={d} className={`btn btn-sm ${range === d ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRange(d)}>{d}d</button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>Site Launches</h3>
        {launches.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No data for this period.</p>
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

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>Product Popularity</h3>
        {products.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No data yet.</p>
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
        <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>User Registrations</h3>
        {registrations.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No data for this period.</p>
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
