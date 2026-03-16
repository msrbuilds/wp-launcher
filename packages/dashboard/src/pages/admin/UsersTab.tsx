import { useState, useEffect, useCallback } from 'react';
import { User, PaginatedResponse, PAGE_SIZE } from './shared';
import { useAdminHeaders } from './AdminLayout';
import Pagination from './Pagination';

export default function UsersTab() {
  const headers = useAdminHeaders();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/users?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, { headers, credentials: 'include' })
      .then((r) => r.json())
      .then((data: PaginatedResponse<User>) => { setUsers(data.data || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this user?')) return;
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers, credentials: 'include' });
    fetchUsers();
  }

  async function handleRoleChange(id: string, newRole: 'admin' | 'user') {
    const action = newRole === 'admin' ? 'promote to admin' : 'demote to user';
    if (!confirm(`Are you sure you want to ${action}?`)) return;

    setRoleUpdating(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/role`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        credentials: 'include',
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
      <h3 style={{ marginBottom: '1rem' }}>Users ({total})</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Email</th>
              <th style={{ padding: '0.5rem' }}>Role</th>
              <th style={{ padding: '0.5rem' }}>Verified</th>
              <th style={{ padding: '0.5rem' }}>Created</th>
              <th style={{ padding: '0.5rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSystem = u.id === 'admin' || u.id === 'local-user';
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.5rem' }}>
                    {u.email}
                    {isSystem && <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '0.5rem' }}>(system)</span>}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <span className={`badge ${u.role === 'admin' ? 'badge-running' : ''}`} style={u.role === 'admin' ? {} : { background: '#f1f5f9', color: '#64748b' }}>
                      {u.role || 'user'}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <span className={`badge ${u.verified ? 'badge-running' : 'badge-error'}`}>{u.verified ? 'Yes' : 'No'}</span>
                  </td>
                  <td style={{ padding: '0.5rem' }}>{new Date(u.createdAt).toLocaleString()}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      {!isSystem && (
                        <>
                          {u.role === 'admin' ? (
                            <button
                              className="btn btn-sm"
                              style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}
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
