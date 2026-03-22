import { useState, useEffect, useCallback } from 'react';
import { User, PaginatedResponse, PAGE_SIZE } from './shared';
import { useAdminHeaders } from './AdminLayout';
import Pagination from './Pagination';
import { apiFetch } from '../../utils/api';

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
  if (loading && users.length === 0) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;

  return (
    <div className="card">
      <h3 className="ut-title">Users ({total})</h3>
      <div className="ut-table-wrap">
        <table className="ut-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Verified</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSystem = u.id === 'admin' || u.id === 'local-user';
              return (
                <tr key={u.id}>
                  <td>
                    {u.email}
                    {isSystem && <span className="ut-system-label">(system)</span>}
                  </td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-running' : 'ut-badge-user'}`}>
                      {u.role || 'user'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.verified ? 'badge-running' : 'badge-error'}`}>{u.verified ? 'Yes' : 'No'}</span>
                  </td>
                  <td>{new Date(u.createdAt).toLocaleString()}</td>
                  <td>
                    <div className="ut-actions">
                      {!isSystem && (
                        <>
                          {u.role === 'admin' ? (
                            <button
                              className="btn btn-sm ut-btn-demote"
                              onClick={() => handleRoleChange(u.id, 'user')}
                              disabled={roleUpdating === u.id}
                            >
                              {roleUpdating === u.id ? '...' : 'Demote'}
                            </button>
                          ) : (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleRoleChange(u.id, 'admin')}
                              disabled={roleUpdating === u.id}
                            >
                              {roleUpdating === u.id ? '...' : 'Promote'}
                            </button>
                          )}
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id)}>Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
