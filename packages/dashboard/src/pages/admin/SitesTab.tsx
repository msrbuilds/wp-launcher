import { useState, useEffect, useCallback } from 'react';
import { AdminSite, PaginatedResponse, PAGE_SIZE } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';
import Pagination from './Pagination';

export default function SitesTab() {
  const headers = useAdminHeaders();
  const isLocal = useIsLocalMode();
  const [sites, setSites] = useState<AdminSite[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchSites = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/sites?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { headers, credentials: 'include' })
      .then((r) => r.json())
      .then((data: PaginatedResponse<AdminSite>) => { setSites(data.data || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  async function handleDelete(id: string) {
    if (!confirm('Force delete this site?')) return;
    await fetch(`/api/admin/sites/${id}`, { method: 'DELETE', headers, credentials: 'include' });
    fetchSites();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (loading && sites.length === 0) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div className="card">
      <h3 className="st-title">All Sites ({total})</h3>
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th>Subdomain</th>
              <th>{isLocal ? 'Template' : 'Product'}</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id}>
                <td>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.subdomain}</a> : s.subdomain}</td>
                <td>{s.productId}</td>
                <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                <td>{new Date(s.createdAt).toLocaleString()}</td>
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
