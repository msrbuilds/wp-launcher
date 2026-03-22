import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';
import Pagination from './Pagination';
import { PAGE_SIZE, Invoice, InvoiceLineItem } from './shared';
import { apiFetch } from '../../utils/api';

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const;
const STATUS_LABELS: Record<string, string> = { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled' };

const emptyItem = (): InvoiceLineItem => ({ description: '', qty: 1, rate: 0, amount: 0 });

export default function InvoicesPage() {
  const headers = useAdminHeaders();
  const navigate = useNavigate();
  const isLocal = useIsLocalMode();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; client_id: string | null }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [form, setForm] = useState({ client_id: '', project_id: '', items: [emptyItem()], tax_rate: 0, due_date: '', notes: '', currency: 'USD' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchInvoices = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (statusFilter) params.set('status', statusFilter);
    apiFetch(`/api/projects/invoices?${params}`, { headers })
      .then(r => r.json())
      .then(data => {
        const list = (data.data || []).map((inv: any) => ({
          ...inv,
          items: typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items,
        }));
        setInvoices(list);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter, headers]);

  const fetchDropdowns = useCallback(() => {
    apiFetch('/api/projects/dropdown/clients', { headers }).then(r => r.json()).then(setClients).catch(() => {});
    apiFetch('/api/projects/dropdown/projects', { headers }).then(r => r.json()).then(setProjects).catch(() => {});
  }, [headers]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);

  function openCreate() {
    setEditing(null);
    setForm({ client_id: '', project_id: '', items: [emptyItem()], tax_rate: 0, due_date: '', notes: '', currency: 'USD' });
    setError('');
    setShowModal(true);
  }

  function openEdit(inv: Invoice) {
    setEditing(inv);
    setForm({
      client_id: inv.client_id, project_id: inv.project_id || '',
      items: inv.items.length ? inv.items : [emptyItem()],
      tax_rate: inv.tax_rate, due_date: inv.due_date || '', notes: inv.notes || '', currency: inv.currency,
    });
    setError('');
    setShowModal(true);
  }

  function updateItem(idx: number, field: keyof InvoiceLineItem, value: string | number) {
    const items = [...form.items];
    (items[idx] as any)[field] = value;
    if (field === 'qty' || field === 'rate') {
      items[idx].amount = Math.round(Number(items[idx].qty) * Number(items[idx].rate) * 100) / 100;
    }
    setForm({ ...form, items });
  }

  function addItem() { setForm({ ...form, items: [...form.items, emptyItem()] }); }
  function removeItem(idx: number) { if (form.items.length > 1) setForm({ ...form, items: form.items.filter((_, i) => i !== idx) }); }

  const subtotal = form.items.reduce((s, item) => s + Number(item.qty) * Number(item.rate), 0);
  const taxAmount = subtotal * (Number(form.tax_rate) / 100);
  const formTotal = Math.round((subtotal + taxAmount) * 100) / 100;

  async function handleSave() {
    if (!form.client_id) { setError('Client is required'); return; }
    if (form.items.some(i => !i.description.trim())) { setError('All items need a description'); return; }
    setSaving(true);
    setError('');
    try {
      const url = editing ? `/api/projects/invoices/${editing.id}` : '/api/projects/invoices';
      const method = editing ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save'); return; }
      setShowModal(false);
      fetchInvoices();
    } catch { setError('Network error'); } finally { setSaving(false); }
  }

  async function changeStatus(id: string, status: string) {
    try {
      const res = await apiFetch(`/api/projects/invoices/${id}/status`, {
        method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed'); return; }
      fetchInvoices();
    } catch { alert('Network error'); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this invoice?')) return;
    try {
      const res = await apiFetch(`/api/projects/invoices/${id}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to delete'); return; }
      fetchInvoices();
    } catch { alert('Network error'); }
  }

  if (loading && invoices.length === 0) {
    return <div className="card"><span className="spinner spinner-dark" /> Loading invoices...</div>;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const printBase = isLocal ? '/invoices' : '/admin/invoices';

  return (
    <div className="iv-page">
      <div className="card">
        <div className="iv-header">
          <h3 className="iv-title">Invoices ({total})</h3>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ New Invoice</button>
        </div>
        <div className="iv-status-filters">
          <button className={`btn btn-xs ${!statusFilter ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setStatusFilter(''); setPage(0); }}>All</button>
          {STATUS_OPTIONS.map(s => (
            <button key={s} className={`btn btn-xs ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setStatusFilter(s); setPage(0); }}>{STATUS_LABELS[s]}</button>
          ))}
        </div>
        {invoices.length === 0 ? (
          <p className="iv-empty">No invoices found.</p>
        ) : (
          <div className="iv-table-wrap">
            <table className="iv-table">
              <thead><tr><th>Invoice #</th><th>Client</th><th>Project</th><th>Total</th><th>Status</th><th>Due Date</th><th>Actions</th></tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="iv-number">{inv.invoice_number}</td>
                    <td>{inv.clientName || '—'}</td>
                    <td>{inv.projectName || '—'}</td>
                    <td className="iv-total">{inv.currency} {inv.total.toFixed(2)}</td>
                    <td><span className={`badge badge-${inv.status}`}>{STATUS_LABELS[inv.status] || inv.status}</span></td>
                    <td>{inv.due_date ? new Date(inv.due_date + 'Z').toLocaleDateString() : '—'}</td>
                    <td className="iv-actions">
                      <button className="btn btn-secondary btn-xs" onClick={() => navigate(`${printBase}/${inv.id}/print`)}>Print</button>
                      {inv.status === 'draft' && <button className="btn btn-secondary btn-xs" onClick={() => openEdit(inv)}>Edit</button>}
                      {inv.status === 'draft' && <button className="btn btn-primary btn-xs" onClick={() => changeStatus(inv.id, 'sent')}>Send</button>}
                      {inv.status === 'sent' && <button className="btn btn-primary btn-xs" onClick={() => changeStatus(inv.id, 'paid')}>Paid</button>}
                      {inv.status === 'draft' && <button className="btn btn-danger btn-xs" onClick={() => handleDelete(inv.id)}>Delete</button>}
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
          <div className="iv-modal-card" onClick={e => e.stopPropagation()}>
            <h3 className="lp-modal-title">{editing ? 'Edit Invoice' : 'New Invoice'}</h3>
            {error && <div className="alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            <div className="iv-form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Client *</label>
                <select className="form-input" value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">— Select —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Project</label>
                <select className="form-input" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}>
                  <option value="">— None —</option>
                  {projects.filter(p => !form.client_id || p.client_id === form.client_id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <label className="iv-items-label">Line Items</label>
            <div className="iv-line-items">
              {form.items.map((item, i) => (
                <div key={i} className="iv-line-item-row">
                  <input className="form-input" placeholder="Description" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} style={{ flex: 3 }} />
                  <input className="form-input" type="number" placeholder="Qty" value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} style={{ width: '70px' }} min="0" step="1" />
                  <input className="form-input" type="number" placeholder="Rate" value={item.rate} onChange={e => updateItem(i, 'rate', Number(e.target.value))} style={{ width: '90px' }} min="0" step="0.01" />
                  <span className="iv-item-amount">{(Number(item.qty) * Number(item.rate)).toFixed(2)}</span>
                  {form.items.length > 1 && <button className="btn btn-danger btn-xs" onClick={() => removeItem(i)} title="Remove">&times;</button>}
                </div>
              ))}
              <button className="btn btn-secondary btn-xs" onClick={addItem}>+ Add Item</button>
            </div>

            <div className="iv-form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Tax Rate (%)</label>
                <input className="form-input" type="number" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: Number(e.target.value) })} min="0" step="0.1" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Currency</label>
                <input className="form-input" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Due Date</label>
                <input className="form-input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>

            <div className="iv-totals">
              <div>Subtotal: <strong>{subtotal.toFixed(2)}</strong></div>
              <div>Tax ({form.tax_rate}%): <strong>{taxAmount.toFixed(2)}</strong></div>
              <div className="iv-grand-total">Total: <strong>{form.currency} {formTotal.toFixed(2)}</strong></div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
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
