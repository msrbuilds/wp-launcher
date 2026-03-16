import { useState, useEffect, useCallback } from 'react';
import { AdminSite, PaginatedResponse, PAGE_SIZE } from './shared';
import { useAdminHeaders } from './AdminLayout';
import Pagination from './Pagination';

export default function SitesTab() {
  const headers = useAdminHeaders();
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
                <td style={{ padding: '0.5rem' }}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.subdomain}</a> : s.subdomain}</td>
                <td style={{ padding: '0.5rem' }}>{s.productId}</td>
                <td style={{ padding: '0.5rem' }}><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                <td style={{ padding: '0.5rem' }}>{new Date(s.createdAt).toLocaleString()}</td>
                <td style={{ padding: '0.5rem' }}>
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
