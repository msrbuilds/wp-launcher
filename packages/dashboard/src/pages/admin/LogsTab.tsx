import { useState, useEffect, useCallback } from 'react';
import { SiteLog, PaginatedResponse, PAGE_SIZE } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';
import Pagination from './Pagination';
import { apiFetch } from '../../utils/api';

export default function LogsTab() {
  const headers = useAdminHeaders();
  const isLocal = useIsLocalMode();
  const [logs, setLogs] = useState<SiteLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/admin/logs?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { headers })
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
      <h3 className="lg-title">Site Logs ({total})</h3>
      <div className="lg-table-wrap">
        <table className="lg-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              {!isLocal && <th>User</th>}
              <th>Site</th>
              <th>{isLocal ? 'Template' : 'Product'}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString()}</td>
                <td>
                  <span className={`badge ${log.action === 'created' ? 'badge-running' : 'badge-expired'}`}>{log.action}</span>
                </td>
                {!isLocal && <td>{log.user_email || '—'}</td>}
                <td>
                  {log.site_url ? <a href={log.site_url} target="_blank" rel="noopener noreferrer">{log.subdomain}</a> : log.subdomain}
                </td>
                <td>{log.product_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
