import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminProduct } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';
import { useToast } from '../../components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface BulkJob {
  id: string;
  blueprintId: string;
  total: number;
  completed: number;
  failed: number;
  status: string;
  results: { index: number; subdomain?: string; url?: string; adminUrl?: string; autoLoginUrl?: string; username?: string; password?: string; error?: string }[];
  createdAt: string;
  completedAt: string | null;
}

export default function BulkTab() {
  const headers = useAdminHeaders();
  const toast = useToast();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [blueprintId, setBlueprintId] = useState('');
  const [count, setCount] = useState(5);
  const [expiresIn, setExpiresIn] = useState('24h');
  const [prefix, setPrefix] = useState('');
  const [activeJob, setActiveJob] = useState<BulkJob | null>(null);
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    apiFetch('/api/blueprints').then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) {
        setProducts(data);
        if (data.length > 0 && !blueprintId) setBlueprintId(data[0].id);
      }
    }).catch(() => {});
    apiFetch('/api/admin/bulk', { headers }).then((r) => r.json()).then((data) => {
      setJobs(data.data || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeJob || activeJob.status === 'completed' || activeJob.status === 'cancelled' || activeJob.status === 'failed') return;
    const interval = setInterval(() => {
      apiFetch(`/api/admin/bulk/${activeJob.id}`, { headers })
        .then((r) => r.json())
        .then((job: BulkJob) => {
          setActiveJob(job);
          if (job.status !== 'running') clearInterval(interval);
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status]);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setStarting(true);
    try {
      const res = await apiFetch('/api/admin/bulk', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId, count, expiresIn, subdomainPrefix: prefix || undefined }),
      });
      const data = await res.json();
      if (data.jobId) {
        const jobRes = await apiFetch(`/api/admin/bulk/${data.jobId}`, { headers });
        setActiveJob(await jobRes.json());
      }
    } catch {
      toast.error('Failed to start bulk job');
    } finally {
      setStarting(false);
    }
  }

  async function handleCancel() {
    if (!activeJob) return;
    await apiFetch(`/api/admin/bulk/${activeJob.id}`, { method: 'DELETE', headers });
  }

  const progress = activeJob ? Math.round((activeJob.completed / activeJob.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <h3 className="mb-4 text-base font-semibold">Bulk Site Launch</h3>
        <form onSubmit={handleStart}>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bulk-blueprint">Blueprint</Label>
              <Select value={blueprintId} onValueChange={setBlueprintId}>
                <SelectTrigger id="bulk-blueprint" className="w-full">
                  <SelectValue placeholder="Select a blueprint" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="bulk-count">Count (1-50)</Label>
              <Input
                id="bulk-count"
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              />
            </div>
            {(
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulk-expires">Expires In</Label>
                <Select value={expiresIn} onValueChange={setExpiresIn}>
                  <SelectTrigger id="bulk-expires" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">1 hour</SelectItem>
                    <SelectItem value="24h">24 hours</SelectItem>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="bulk-prefix">Prefix (optional)</Label>
              <Input
                id="bulk-prefix"
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="e.g. workshop"
              />
            </div>
          </div>
          <Button type="submit" disabled={starting || (activeJob?.status === 'running')}>
            {starting ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting...</> : 'Start Bulk Launch'}
          </Button>
        </form>
      </div>

      {activeJob && (
        <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold">
              Job: {activeJob.completed}/{activeJob.total}
              {activeJob.failed > 0 && <span className="font-normal text-destructive"> ({activeJob.failed} failed)</span>}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant={activeJob.status === 'running' || activeJob.status === 'completed' ? 'default' : 'secondary'}>
                {activeJob.status}
              </Badge>
              {activeJob.status === 'running' && (
                <Button size="sm" variant="destructive" onClick={handleCancel}>Cancel</Button>
              )}
              {activeJob.status !== 'running' && (
                <Button asChild size="sm" variant="secondary">
                  <a href={`/api/admin/bulk/${activeJob.id}/export`} download>Download CSV</a>
                </Button>
              )}
            </div>
          </div>

          <Progress value={progress} className="mb-4" />

          {activeJob.results.length > 0 && (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Subdomain</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Password</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeJob.results.map((r) => (
                    <TableRow key={r.index}>
                      <TableCell>{r.index}</TableCell>
                      <TableCell>{r.subdomain || '—'}</TableCell>
                      <TableCell>
                        {r.url ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            Open
                          </a>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{r.password || '—'}</code>
                      </TableCell>
                      <TableCell>
                        {r.error
                          ? <span className="text-xs text-destructive">{r.error}</span>
                          : <Badge>OK</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {jobs.length > 0 && !activeJob && (
        <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
          <h3 className="mb-4 text-base font-semibold">Recent Jobs</h3>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Sites</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j: any) => (
                  <TableRow key={j.id}>
                    <TableCell>{j.product_id}</TableCell>
                    <TableCell>{j.completed}/{j.total}{j.failed > 0 && ` (${j.failed} failed)`}</TableCell>
                    <TableCell>
                      <Badge variant={j.status === 'completed' ? 'default' : 'secondary'}>{j.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(j.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="secondary" onClick={() => {
                        apiFetch(`/api/admin/bulk/${j.id}`, { headers }).then((r) => r.json()).then(setActiveJob).catch(() => {});
                      }}>View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
