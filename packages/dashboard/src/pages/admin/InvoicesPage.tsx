import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { useAdminHeaders } from './AdminLayout';
import Pagination from './Pagination';
import { PAGE_SIZE, Invoice, InvoiceLineItem } from './shared';
import { apiFetch } from '../../utils/api';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const;
const STATUS_LABELS: Record<string, string> = { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled' };

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  sent: 'default',
  paid: 'default',
  overdue: 'destructive',
  cancelled: 'outline',
};

// Radix Select forbids an empty-string item value, so the "unset" choices are
// carried by these sentinels and mapped back to '' before reaching form state.
const NO_CLIENT = '__none_client__';
const NO_PROJECT = '__none_project__';

const emptyItem = (): InvoiceLineItem => ({ description: '', qty: 1, rate: 0, amount: 0 });

export default function InvoicesPage() {
  const headers = useAdminHeaders();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
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
      if (!res.ok) { toast.error(data.error || 'Failed'); return; }
      fetchInvoices();
    } catch { toast.error('Network error'); }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({
      title: 'Delete invoice?',
      description: 'This permanently deletes the invoice. This cannot be undone.',
      confirmText: 'Delete',
      variant: 'destructive',
    }))) return;
    try {
      const res = await apiFetch(`/api/projects/invoices/${id}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete'); return; }
      fetchInvoices();
    } catch { toast.error('Network error'); }
  }

  if (loading && invoices.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices...
      </div>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const printBase = '/invoices';

  return (
    <div>
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Invoices ({total})</h3>
          <Button size="sm" onClick={openCreate}>+ New Invoice</Button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            size="xs"
            variant={!statusFilter ? 'default' : 'secondary'}
            onClick={() => { setStatusFilter(''); setPage(0); }}
          >
            All
          </Button>
          {STATUS_OPTIONS.map(s => (
            <Button
              key={s}
              size="xs"
              variant={statusFilter === s ? 'default' : 'secondary'}
              onClick={() => { setStatusFilter(s); setPage(0); }}
            >
              {STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
        {invoices.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No invoices found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.clientName || '—'}</TableCell>
                  <TableCell>{inv.projectName || '—'}</TableCell>
                  <TableCell className="font-medium">{inv.currency} {inv.total.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[inv.status] || 'secondary'}>
                      {STATUS_LABELS[inv.status] || inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{inv.due_date ? new Date(inv.due_date + 'Z').toLocaleDateString() : '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="xs" onClick={() => navigate(`${printBase}/${inv.id}/print`)}>Print</Button>
                      {inv.status === 'draft' && <Button variant="secondary" size="xs" onClick={() => openEdit(inv)}>Edit</Button>}
                      {inv.status === 'draft' && <Button size="xs" onClick={() => changeStatus(inv.id, 'sent')}>Send</Button>}
                      {inv.status === 'sent' && <Button size="xs" onClick={() => changeStatus(inv.id, 'paid')}>Paid</Button>}
                      {inv.status === 'draft' && <Button variant="destructive" size="xs" onClick={() => handleDelete(inv.id)}>Delete</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Invoice' : 'New Invoice'}</DialogTitle>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-4">
            <div className="grid min-w-48 flex-1 gap-2">
              <Label htmlFor="invoice-client">Client *</Label>
              <Select
                value={form.client_id || NO_CLIENT}
                onValueChange={v => setForm({ ...form, client_id: v === NO_CLIENT ? '' : v })}
              >
                <SelectTrigger id="invoice-client" className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>— Select —</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-48 flex-1 gap-2">
              <Label htmlFor="invoice-project">Project</Label>
              <Select
                value={form.project_id || NO_PROJECT}
                onValueChange={v => setForm({ ...form, project_id: v === NO_PROJECT ? '' : v })}
              >
                <SelectTrigger id="invoice-project" className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PROJECT}>— None —</SelectItem>
                  {projects.filter(p => !form.client_id || p.client_id === form.client_id).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Line Items</Label>
            <div className="flex flex-col gap-2">
              {form.items.map((item, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-40 flex-[3] rounded-lg"
                    placeholder="Description"
                    value={item.description}
                    onChange={e => updateItem(i, 'description', e.target.value)}
                  />
                  <Input
                    className="w-20 rounded-lg"
                    type="number"
                    placeholder="Qty"
                    value={item.qty}
                    onChange={e => updateItem(i, 'qty', Number(e.target.value))}
                    min="0"
                    step="1"
                  />
                  <Input
                    className="w-24 rounded-lg"
                    type="number"
                    placeholder="Rate"
                    value={item.rate}
                    onChange={e => updateItem(i, 'rate', Number(e.target.value))}
                    min="0"
                    step="0.01"
                  />
                  <span className="w-20 text-right text-sm font-medium tabular-nums">
                    {(Number(item.qty) * Number(item.rate)).toFixed(2)}
                  </span>
                  {form.items.length > 1 && (
                    <Button variant="destructive" size="icon-xs" onClick={() => removeItem(i)} title="Remove">
                      <X />
                    </Button>
                  )}
                </div>
              ))}
              <div>
                <Button variant="secondary" size="xs" onClick={addItem}>+ Add Item</Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="grid min-w-32 flex-1 gap-2">
              <Label htmlFor="invoice-tax">Tax Rate (%)</Label>
              <Input id="invoice-tax" className="rounded-lg" type="number" value={form.tax_rate} onChange={e => setForm({ ...form, tax_rate: Number(e.target.value) })} min="0" step="0.1" />
            </div>
            <div className="grid min-w-32 flex-1 gap-2">
              <Label htmlFor="invoice-currency">Currency</Label>
              <Input id="invoice-currency" className="rounded-lg" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
            </div>
            <div className="grid min-w-32 flex-1 gap-2">
              <Label htmlFor="invoice-due">Due Date</Label>
              <Input id="invoice-due" className="rounded-lg" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
            <div>Subtotal: <strong className="font-medium text-foreground">{subtotal.toFixed(2)}</strong></div>
            <div>Tax ({form.tax_rate}%): <strong className="font-medium text-foreground">{taxAmount.toFixed(2)}</strong></div>
            <div className="text-base text-foreground">
              Total: <strong className="font-semibold">{form.currency} {formTotal.toFixed(2)}</strong>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="invoice-notes">Notes</Label>
            <Textarea id="invoice-notes" className="rounded-lg" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
