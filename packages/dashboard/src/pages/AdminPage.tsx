import { useState, useEffect, useCallback } from 'react';

const PAGE_SIZE = 20;

interface Stats {
  totalSitesCreated: number;
  activeSites: number;
  totalUsers: number;
  verifiedUsers: number;
}

interface User {
  id: string;
  email: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SiteLog {
  id: number;
  site_id: string;
  user_id: string | null;
  user_email: string | null;
  product_id: string;
  subdomain: string;
  site_url: string | null;
  action: string;
  created_at: string;
}

interface AdminSite {
  id: string;
  subdomain: string;
  productId: string;
  userId: string | null;
  url: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
  deletedAt: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

interface AdminProduct {
  id: string;
  name: string;
  database?: string;
  branding?: { description?: string };
}

type Tab = 'overview' | 'products' | 'users' | 'sites' | 'logs';

export function useAdminAuth() {
  const [apiKey] = useState(() => sessionStorage.getItem('adminApiKey') || '');
  return { isAdmin: !!apiKey };
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  const buttons: (number | '...')[] = [];
  for (let i = 0; i < totalPages; i++) {
    if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) {
      buttons.push(i);
    } else if (buttons[buttons.length - 1] !== '...') {
      buttons.push('...');
    }
  }

  return (
    <div className="pagination">
      <span className="pagination-info">
        {start}–{end} of {total}
      </span>
      <div className="pagination-controls">
        <button disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          ‹
        </button>
        {buttons.map((b, i) =>
          b === '...' ? (
            <span key={`ellipsis-${i}`} style={{ padding: '0 0.25rem', color: '#94a3b8' }}>…</span>
          ) : (
            <button
              key={b}
              className={b === page ? 'active' : ''}
              onClick={() => onPageChange(b)}
            >
              {b + 1}
            </button>
          ),
        )}
        <button disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>
          ›
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('adminApiKey') || '');
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (apiKey) {
      fetch('/api/admin/stats', { headers: { 'X-API-Key': apiKey } })
        .then((r) => {
          if (r.ok) setAuthenticated(true);
          else sessionStorage.removeItem('adminApiKey');
        })
        .catch(() => {});
    }
  }, []);

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    fetch('/api/admin/stats', { headers: { 'X-API-Key': apiKey } })
      .then((r) => {
        if (r.ok) {
          sessionStorage.setItem('adminApiKey', apiKey);
          setAuthenticated(true);
        } else {
          setAuthError('Invalid API key');
          sessionStorage.removeItem('adminApiKey');
        }
      })
      .catch(() => setAuthError('Connection error'));
  }

  function handleLogout() {
    sessionStorage.removeItem('adminApiKey');
    setAuthenticated(false);
    setApiKey('');
  }

  if (!authenticated) {
    return (
      <div className="card auth-card" style={{ padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.375rem' }}>Admin Login</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Enter your API key to access the admin panel.</p>
        </div>
        <form onSubmit={handleAuth}>
          <div className="form-group">
            <label htmlFor="apiKey">API Key</label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter admin API key"
              required
            />
          </div>
          {authError && <div className="alert-error">{authError}</div>}
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} type="submit">Login</button>
        </form>
      </div>
    );
  }

  const headers = { 'X-API-Key': apiKey };

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {(['overview', 'products', 'users', 'sites', 'logs'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          <button
            className="btn btn-sm btn-danger"
            style={{ marginLeft: 'auto' }}
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>

      {tab === 'overview' && <OverviewTab headers={headers} />}
      {tab === 'products' && <ProductsTab headers={headers} />}
      {tab === 'users' && <UsersTab headers={headers} />}
      {tab === 'sites' && <SitesTab headers={headers} />}
      {tab === 'logs' && <LogsTab headers={headers} />}
    </div>
  );
}

function OverviewTab({ headers }: { headers: Record<string, string> }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats', { headers })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
      <StatCard label="Total Sites Created" value={stats.totalSitesCreated} />
      <StatCard label="Active Sites" value={stats.activeSites} />
      <StatCard label="Total Users" value={stats.totalUsers} />
      <StatCard label="Verified Users" value={stats.verifiedUsers} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#2563eb' }}>{value}</div>
      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{label}</div>
    </div>
  );
}

function UsersTab({ headers }: { headers: Record<string, string> }) {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/users?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { headers })
      .then((r) => r.json())
      .then((data: PaginatedResponse<User>) => {
        setUsers(data.data || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this user?')) return;
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers });
    fetchUsers();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading && users.length === 0) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>Users ({total})</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Email</th>
              <th style={{ padding: '0.5rem' }}>Verified</th>
              <th style={{ padding: '0.5rem' }}>Created</th>
              <th style={{ padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.5rem' }}>{u.email}</td>
                <td style={{ padding: '0.5rem' }}>
                  <span className={`badge ${u.verified ? 'badge-running' : 'badge-error'}`}>
                    {u.verified ? 'Yes' : 'No'}
                  </span>
                </td>
                <td style={{ padding: '0.5rem' }}>{new Date(u.createdAt).toLocaleString()}</td>
                <td style={{ padding: '0.5rem' }}>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}

function SitesTab({ headers }: { headers: Record<string, string> }) {
  const [sites, setSites] = useState<AdminSite[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchSites = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/sites?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { headers })
      .then((r) => r.json())
      .then((data: PaginatedResponse<AdminSite>) => {
        setSites(data.data || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  async function handleDelete(id: string) {
    if (!confirm('Force delete this site?')) return;
    await fetch(`/api/admin/sites/${id}`, { method: 'DELETE', headers });
    fetchSites();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading && sites.length === 0) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>All Sites ({total})</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Subdomain</th>
              <th style={{ padding: '0.5rem' }}>Product</th>
              <th style={{ padding: '0.5rem' }}>Status</th>
              <th style={{ padding: '0.5rem' }}>Created</th>
              <th style={{ padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.5rem' }}>
                  {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.subdomain}</a> : s.subdomain}
                </td>
                <td style={{ padding: '0.5rem' }}>{s.productId}</td>
                <td style={{ padding: '0.5rem' }}>
                  <span className={`badge badge-${s.status}`}>{s.status}</span>
                </td>
                <td style={{ padding: '0.5rem' }}>{new Date(s.createdAt).toLocaleString()}</td>
                <td style={{ padding: '0.5rem' }}>
                  {s.status === 'running' && (
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}

function ProductsTab({ headers }: { headers: Record<string, string> }) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchProducts = useCallback(() => {
    setLoading(true);
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete product "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE', headers });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to delete product');
      }
    } catch {
      alert('Failed to delete product');
    } finally {
      setDeleting(null);
      fetchProducts();
    }
  }

  if (loading && products.length === 0) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>Products ({products.length})</h3>
      {products.length === 0 ? (
        <p style={{ color: '#64748b' }}>No products configured.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>ID</th>
                <th style={{ padding: '0.5rem' }}>Name</th>
                <th style={{ padding: '0.5rem' }}>Database</th>
                <th style={{ padding: '0.5rem' }}>Description</th>
                <th style={{ padding: '0.5rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.5rem' }}><code>{p.id}</code></td>
                  <td style={{ padding: '0.5rem' }}>{p.name}</td>
                  <td style={{ padding: '0.5rem' }}>{p.database || 'sqlite'}</td>
                  <td style={{ padding: '0.5rem', color: '#64748b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.branding?.description || '—'}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(p.id, p.name)}
                      disabled={deleting === p.id}
                    >
                      {deleting === p.id ? <><span className="spinner" /> Deleting...</> : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LogsTab({ headers }: { headers: Record<string, string> }) {
  const [logs, setLogs] = useState<SiteLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/logs?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { headers })
      .then((r) => r.json())
      .then((data: PaginatedResponse<SiteLog>) => {
        setLogs(data.data || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading && logs.length === 0) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>Site Logs ({total})</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Time</th>
              <th style={{ padding: '0.5rem' }}>Action</th>
              <th style={{ padding: '0.5rem' }}>User</th>
              <th style={{ padding: '0.5rem' }}>Site</th>
              <th style={{ padding: '0.5rem' }}>Product</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.5rem' }}>{new Date(log.created_at).toLocaleString()}</td>
                <td style={{ padding: '0.5rem' }}>
                  <span className={`badge ${log.action === 'created' ? 'badge-running' : 'badge-expired'}`}>
                    {log.action}
                  </span>
                </td>
                <td style={{ padding: '0.5rem' }}>{log.user_email || '—'}</td>
                <td style={{ padding: '0.5rem' }}>
                  {log.site_url
                    ? <a href={log.site_url} target="_blank" rel="noopener noreferrer">{log.subdomain}</a>
                    : log.subdomain}
                </td>
                <td style={{ padding: '0.5rem' }}>{log.product_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
