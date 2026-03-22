import { useState, useEffect, useCallback } from 'react';
import { useAdminHeaders } from './AdminLayout';
import Pagination from './Pagination';
import { PAGE_SIZE, Client } from './shared';
import { apiFetch } from '../../utils/api';

export default function ClientsPage() {
  const headers = useAdminHeaders();
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchClients = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (search) params.set('search', search);
    apiFetch(`/api/projects/clients?${params}`, { headers })
      .then(r => r.json())
      .then(data => { setClients(data.data || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, search, headers]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', company: '', notes: '' });
    setError('');
    setShowModal(true);
  }

  function openEdit(client: Client) {
    setEditing(client);
    setForm({ name: client.name, email: client.email || '', phone: client.phone || '', company: client.company || '', notes: client.notes || '' });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const url = editing ? `/api/projects/clients/${editing.id}` : '/api/projects/clients';
      const method = editing ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save'); return; }
      setShowModal(false);
      fetchClients();
    } catch { setError('Network error'); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this client?')) return;
    try {
      const res = await apiFetch(`/api/projects/clients/${id}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to delete'); return; }
      fetchClients();
    } catch { alert('Network error'); }
  }

  if (loading && clients.length === 0) {
    return <div className="card"><span className="spinner spinner-dark" /> Loading clients...</div>;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="cl-page">
      <div className="card">
        <div className="cl-header">
          <h3 className="cl-title">Clients ({total})</h3>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ New Client</button>
        </div>
        <div className="cl-search-wrap">
          <input className="form-input cl-search" placeholder="Search clients..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        {clients.length === 0 ? (
          <p className="cl-empty">No clients found. Create your first client to get started.</p>
        ) : (
          <div className="cl-table-wrap">
            <table className="cl-table">
              <thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Phone</th><th>Projects</th><th>Actions</th></tr></thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id}>
                    <td className="cl-name-cell">{c.name}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.company || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td><span className="badge">{c.projectCount || 0}</span></td>
                    <td className="cl-actions">
                      <button className="btn btn-secondary btn-xs" onClick={() => openEdit(c)}>Edit</button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(c.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      {showModal && (
        <div className="lp-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="lp-modal-card" onClick={e => e.stopPropagation()}>
            <h3 className="lp-modal-title">{editing ? 'Edit Client' : 'New Client'}</h3>
            {error && <div className="alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            <div className="form-group">
              <label>Name *</label>
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input className="form-input" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="lp-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
