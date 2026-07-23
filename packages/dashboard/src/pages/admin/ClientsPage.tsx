import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useAdminHeaders } from './AdminLayout';
import Pagination from './Pagination';
import { PAGE_SIZE, Client } from './shared';
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

export default function ClientsPage() {
  const headers = useAdminHeaders();
  const toast = useToast();
  const confirm = useConfirm();
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
    if (!(await confirm({
      title: 'Delete client?',
      description: 'This removes the client. Projects and invoices linked to them are not deleted.',
      confirmText: 'Delete',
      variant: 'destructive',
    }))) return;
    try {
      const res = await apiFetch(`/api/projects/clients/${id}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete'); return; }
      fetchClients();
    } catch { toast.error('Network error'); }
  }

  if (loading && clients.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading clients...
      </div>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Clients ({total})</h3>
          <Button size="sm" onClick={openCreate}>+ New Client</Button>
        </div>
        <div className="mb-4">
          <Input
            className="max-w-sm rounded-lg"
            placeholder="Search clients..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        {clients.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No clients found. Create your first client to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.email || '—'}</TableCell>
                  <TableCell>{c.company || '—'}</TableCell>
                  <TableCell>{c.phone || '—'}</TableCell>
                  <TableCell><Badge variant="secondary">{c.projectCount || 0}</Badge></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="xs" onClick={() => openEdit(c)}>Edit</Button>
                      <Button variant="destructive" size="xs" onClick={() => handleDelete(c.id)}>Delete</Button>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Client' : 'New Client'}</DialogTitle>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="client-name">Name *</Label>
              <Input id="client-name" className="rounded-lg" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-email">Email</Label>
              <Input id="client-email" className="rounded-lg" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-company">Company</Label>
              <Input id="client-company" className="rounded-lg" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-phone">Phone</Label>
              <Input id="client-phone" className="rounded-lg" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-notes">Notes</Label>
              <Textarea id="client-notes" className="rounded-lg" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
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
