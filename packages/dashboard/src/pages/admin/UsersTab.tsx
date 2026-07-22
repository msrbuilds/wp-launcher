import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { User, PaginatedResponse, PAGE_SIZE } from './shared';
import { useAdminHeaders } from './AdminLayout';
import Pagination from './Pagination';
import { apiFetch } from '../../utils/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function UsersTab() {
  const headers = useAdminHeaders();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/admin/users?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { headers })
      .then((r) => r.json())
      .then((data: PaginatedResponse<User>) => { setUsers(data.data || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this user?')) return;
    await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE', headers });
    fetchUsers();
  }

  async function handleRoleChange(id: string, newRole: 'admin' | 'user') {
    const action = newRole === 'admin' ? 'promote to admin' : 'demote to user';
    if (!confirm(`Are you sure you want to ${action}?`)) return;

    setRoleUpdating(id);
    try {
      const res = await apiFetch(`/api/admin/users/${id}/role`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to update role');
      } else {
        fetchUsers();
      }
    } catch {
      alert('Failed to update role');
    } finally {
      setRoleUpdating(null);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (loading && users.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h3 className="mb-4 text-base font-semibold">Users ({total})</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Verified</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const isSystem = u.id === 'admin' || u.id === 'local-user';
            return (
              <TableRow key={u.id}>
                <TableCell>
                  {u.email}
                  {isSystem && <span className="ml-2 text-xs text-muted-foreground">(system)</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                    {u.role || 'user'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.verified ? 'default' : 'destructive'}>
                    {u.verified ? 'Yes' : 'No'}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(u.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {!isSystem && (
                      <>
                        {u.role === 'admin' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRoleChange(u.id, 'user')}
                            disabled={roleUpdating === u.id}
                          >
                            {roleUpdating === u.id ? '...' : 'Demote'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleRoleChange(u.id, 'admin')}
                            disabled={roleUpdating === u.id}
                          >
                            {roleUpdating === u.id ? '...' : 'Promote'}
                          </Button>
                        )}
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(u.id)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
