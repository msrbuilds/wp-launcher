import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';
import Pagination from './Pagination';
import { PAGE_SIZE, Project } from './shared';
import { apiFetch } from '../../utils/api';

const STATUS_OPTIONS = ['active', 'completed', 'on-hold', 'archived'] as const;
const STATUS_LABELS: Record<string, string> = { active: 'Active', completed: 'Completed', 'on-hold': 'On Hold', archived: 'Archived' };

export default function ProjectsPage() {
  const headers = useAdminHeaders();
  const navigate = useNavigate();
  const isLocal = useIsLocalMode();
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState({ name: '', client_id: '', description: '', status: 'active' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchProjects = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (statusFilter) params.set('status', statusFilter);
    apiFetch(`/api/projects/list?${params}`, { headers })
      .then(r => r.json())
      .then(data => { setProjects(data.data || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter, headers]);

  const fetchClients = useCallback(() => {
    apiFetch('/api/projects/dropdown/clients', { headers })
      .then(r => r.json()).then(setClients).catch(() => {});
  }, [headers]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchClients(); }, [fetchClients]);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', client_id: '', description: '', status: 'active' });
    setError('');
    setShowModal(true);
  }

  function openEdit(p: Project) {
    setEditing(p);
    setForm({ name: p.name, client_id: p.client_id || '', description: p.description || '', status: p.status });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const url = editing ? `/api/projects/list/${editing.id}` : '/api/projects/list';
      const method = editing ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save'); return; }
      setShowModal(false);
      fetchProjects();
    } catch { setError('Network error'); } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this project?')) return;
    try {
      const res = await apiFetch(`/api/projects/list/${id}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to delete'); return; }
      fetchProjects();
    } catch { alert('Network error'); }
  }

  if (loading && projects.length === 0) {
    return <div className="card"><span className="spinner spinner-dark" /> Loading projects...</div>;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const detailBase = isLocal ? '/projects' : '/admin/projects';

  return (
    <div className="pj-page">
      <div className="card">
        <div className="pj-header">
          <h3 className="pj-title">Projects ({total})</h3>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ New Project</button>
        </div>
        <div className="pj-status-filters">
          <button className={`btn btn-xs ${!statusFilter ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setStatusFilter(''); setPage(0); }}>All</button>
          {STATUS_OPTIONS.map(s => (
            <button key={s} className={`btn btn-xs ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setStatusFilter(s); setPage(0); }}>{STATUS_LABELS[s]}</button>
          ))}
        </div>
        {projects.length === 0 ? (
          <p className="pj-empty">No projects found.</p>
        ) : (
          <div className="pj-table-wrap">
            <table className="pj-table">
              <thead><tr><th>Name</th><th>Client</th><th>Status</th><th>Sites</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id}>
                    <td><a className="pj-link" onClick={() => navigate(`${detailBase}/${p.id}`)}>{p.name}</a></td>
                    <td>{p.clientName || '—'}</td>
                    <td><span className={`badge badge-${p.status}`}>{STATUS_LABELS[p.status] || p.status}</span></td>
                    <td>{p.siteCount || 0}</td>
                    <td>{new Date(p.created_at + 'Z').toLocaleDateString()}</td>
                    <td className="pj-actions">
                      <button className="btn btn-secondary btn-xs" onClick={() => openEdit(p)}>Edit</button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(p.id)}>Delete</button>
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
            <h3 className="lp-modal-title">{editing ? 'Edit Project' : 'New Project'}</h3>
            {error && <div className="alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            <div className="form-group">
              <label>Name *</label>
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Client</label>
              <select className="form-input" value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                <option value="">— No Client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="form-input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
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
