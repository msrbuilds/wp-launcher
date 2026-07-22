import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { SiteLog, PaginatedResponse, PAGE_SIZE } from './shared';
import { useAdminHeaders } from './AdminLayout';
import Pagination from './Pagination';
import { apiFetch } from '../../utils/api';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function LogsTab() {
  const headers = useAdminHeaders();
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
  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h3 className="mb-4 text-base font-semibold">Site Logs ({total})</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Blueprint</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
              <TableCell>
                <Badge variant={log.action === 'created' ? 'default' : 'secondary'}>{log.action}</Badge>
              </TableCell>
              <TableCell>{log.user_email || '—'}</TableCell>
              <TableCell>
                {log.site_url ? (
                  <a
                    href={log.site_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {log.subdomain}
                  </a>
                ) : (
                  log.subdomain
                )}
              </TableCell>
              <TableCell>{log.product_id}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
