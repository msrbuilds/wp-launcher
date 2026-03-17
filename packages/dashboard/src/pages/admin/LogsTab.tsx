import { useState, useEffect, useCallback } from 'react';
import { SiteLog, PaginatedResponse, PAGE_SIZE } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';
import Pagination from './Pagination';

export default function LogsTab() {
  const headers = useAdminHeaders();
  const isLocal = useIsLocalMode();
  const [logs, setLogs] = useState<SiteLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/logs?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { headers, credentials: 'include' })
      .then((r) => r.json())
      .then((data: PaginatedResponse<SiteLog>) => { setLogs(data.data || []); setTotal(data.total || 0); })
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
              {!isLocal && <th style={{ padding: '0.5rem' }}>User</th>}
              <th style={{ padding: '0.5rem' }}>Site</th>
              <th style={{ padding: '0.5rem' }}>{isLocal ? 'Template' : 'Product'}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.5rem' }}>{new Date(log.created_at).toLocaleString()}</td>
                <td style={{ padding: '0.5rem' }}>
                  <span className={`badge ${log.action === 'created' ? 'badge-running' : 'badge-expired'}`}>{log.action}</span>
                </td>
                {!isLocal && <td style={{ padding: '0.5rem' }}>{log.user_email || '—'}</td>}
                <td style={{ padding: '0.5rem' }}>
                  {log.site_url ? <a href={log.site_url} target="_blank" rel="noopener noreferrer">{log.subdomain}</a> : log.subdomain}
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
