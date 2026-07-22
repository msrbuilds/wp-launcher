import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAdminHeaders } from './AdminLayout';
import Pagination from './Pagination';
import { PAGE_SIZE, Project } from './shared';
import { apiFetch } from '../../utils/api';
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

const STATUS_OPTIONS = ['active', 'completed', 'on-hold', 'archived'] as const;
const STATUS_LABELS: Record<string, string> = { active: 'Active', completed: 'Completed', 'on-hold': 'On Hold', archived: 'Archived' };

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  completed: 'secondary',
  'on-hold': 'outline',
  archived: 'outline',
};

// Radix Select forbids an empty-string item value, so the "no client" choice is
// carried by this sentinel and mapped back to '' before it reaches form state.
const NO_CLIENT = '__none__';

export default function ProjectsPage() {
  const headers = useAdminHeaders();
  const navigate = useNavigate();
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
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading projects...
      </div>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const detailBase = '/projects';

  return (
    <div>
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Projects ({total})</h3>
          <Button size="sm" onClick={openCreate}>+ New Project</Button>
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
        {projects.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No projects found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sites</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map(p => (
                <TableRow key={p.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => navigate(`${detailBase}/${p.id}`)}
                    >
                      {p.name}
                    </button>
                  </TableCell>
                  <TableCell>{p.clientName || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[p.status] || 'secondary'}>
                      {STATUS_LABELS[p.status] || p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.siteCount || 0}</TableCell>
                  <TableCell>{new Date(p.created_at + 'Z').toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="xs" onClick={() => openEdit(p)}>Edit</Button>
                      <Button variant="destructive" size="xs" onClick={() => handleDelete(p.id)}>Delete</Button>
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
            <DialogTitle>{editing ? 'Edit Project' : 'New Project'}</DialogTitle>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Name *</Label>
              <Input id="project-name" className="rounded-lg" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-client">Client</Label>
              <Select
                value={form.client_id || NO_CLIENT}
                onValueChange={v => setForm({ ...form, client_id: v === NO_CLIENT ? '' : v })}
              >
                <SelectTrigger id="project-client" className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>— No Client —</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea id="project-description" className="rounded-lg" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-status">Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger id="project-status" className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
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
