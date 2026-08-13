import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { AdminProduct } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function BlueprintsTab() {
  const headers = useAdminHeaders();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const noun = 'blueprint';
  const Noun = 'Blueprint';
  const apiBase = '/api/blueprints';

  const fetchProducts = useCallback(() => {
    setLoading(true);
    apiFetch(apiBase)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setProducts(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  async function handleDelete(id: string, name: string) {
    if (!(await confirm({
      title: `Delete ${noun}?`,
      description: <>Delete the {noun} <strong>{name}</strong>? This cannot be undone.</>,
      confirmText: 'Delete',
      variant: 'destructive',
    }))) return;
    setDeleting(id);
    try {
      const res = await apiFetch(`${apiBase}/${id}`, { method: 'DELETE', headers });
      if (!res.ok) { const data = await res.json(); toast.error(data.error || `Failed to delete ${noun}`); }
    } catch { toast.error(`Failed to delete ${noun}`); }
    finally { setDeleting(null); fetchProducts(); }
  }

  if (loading && products.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{Noun}s ({products.length})</h3>
        <Button size="sm" onClick={() => navigate('/blueprints/new')}>
          <Plus />
          New {Noun}
        </Button>
      </div>

      {products.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No {noun}s configured.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Database</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {p.id}
                  </code>
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-muted-foreground">{p.database || 'sqlite'}</TableCell>
                <TableCell className="max-w-xs truncate whitespace-normal text-muted-foreground">
                  {p.branding?.description || '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mr-2"
                    onClick={() => navigate(`/blueprints/${p.id}/edit`)}
                  >
                    <Pencil />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(p.id, p.name)}
                    disabled={deleting === p.id}
                  >
                    {deleting === p.id ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      'Delete'
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
