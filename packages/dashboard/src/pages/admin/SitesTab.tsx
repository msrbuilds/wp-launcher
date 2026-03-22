import { useState, useEffect, useCallback } from 'react';
import { AdminSite, PaginatedResponse, PAGE_SIZE } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';
import Pagination from './Pagination';
import { apiFetch } from '../../utils/api';

const FILTERS = [
  { value: 'running', label: 'Active' },
  { value: '', label: 'All' },
  { value: 'expired', label: 'Expired' },
  { value: 'error', label: 'Error' },
  { value: 'creating', label: 'Creating' },
];

export default function SitesTab() {
  const headers = useAdminHeaders();
  const isLocal = useIsLocalMode();
  const [sites, setSites] = useState<AdminSite[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('running');

  const fetchSites = useCallback(() => {
    setLoading(true);
    const statusParam = statusFilter ? `&status=${statusFilter}` : '';
    apiFetch(`/api/admin/sites?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}${statusParam}`, { headers })
      .then((r) => r.json())
      .then((data: PaginatedResponse<AdminSite>) => { setSites(data.data || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  function handleFilterChange(value: string) {
    setStatusFilter(value);
    setPage(0);
  }

  async function handleDelete(id: string) {
    if (!confirm('Force delete this site?')) return;
    await apiFetch(`/api/admin/sites/${id}`, { method: 'DELETE', headers });
    fetchSites();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (loading && sites.length === 0) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div className="card">
      <div className="st-header">
        <h3 className="st-title">Sites ({total})</h3>
        <div className="st-filters">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`btn btn-sm ${statusFilter === f.value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleFilterChange(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th>Subdomain</th>
              <th>{isLocal ? 'Template' : 'Product'}</th>
              <th>Status</th>
              <th>Created</th>
              {statusFilter === 'running' && <th>Expires</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sites.length === 0 ? (
              <tr><td colSpan={statusFilter === 'running' ? 6 : 5} className="st-empty">No {statusFilter || ''} sites found.</td></tr>
            ) : sites.map((s) => (
              <tr key={s.id}>
                <td>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.subdomain}</a> : s.subdomain}</td>
                <td>{s.productId}</td>
                <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                <td>{new Date(s.createdAt + 'Z').toLocaleString()}</td>
                {statusFilter === 'running' && <td>{s.expiresAt ? new Date(s.expiresAt + 'Z').toLocaleString() : '—'}</td>}
                <td>
                  {s.status === 'running' && <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>Delete</button>}
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
