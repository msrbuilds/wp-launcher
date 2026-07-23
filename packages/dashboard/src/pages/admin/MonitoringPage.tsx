import { useState, useEffect, useCallback } from 'react';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';
import { useConfirm } from '../../components/ConfirmDialog';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { ServerResources } from '../../components/ServerResources';

interface ContainerInfo {
  id: string;
  idFull: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: number;
  labels: Record<string, string>;
  siteId: string;
  dbStatus: string | null;
  expiresAt: string | null;
  flag: 'normal' | 'stale' | 'orphaned' | 'leftover';
  cpuPercent: number | null;
  memUsage: number | null;
  memLimit: number | null;
}

interface DiskInfo {
  images: { count: number; totalSize: number; items: { id: string; repoTags: string[]; size: number; created: number }[] };
  volumes: { count: number; items: { name: string; driver: string }[] };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatUptime(created: number): string {
  const diff = Math.floor(Date.now() / 1000 - created);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  return `${Math.floor(diff / 86400)}d ${Math.floor((diff % 86400) / 3600)}h`;
}

const flagVariant: Record<ContainerInfo['flag'], 'secondary' | 'outline' | 'destructive'> = {
  normal: 'secondary',
  stale: 'outline',
  orphaned: 'destructive',
  leftover: 'outline',
};

export default function MonitoringPage() {
  const headers = useAdminHeaders();
  const confirm = useConfirm();
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [counts, setCounts] = useState({ normal: 0, stale: 0, orphaned: 0, leftover: 0 });
  const [disk, setDisk] = useState<DiskInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // System resources + usage charts live in <ServerResources />, which polls on
  // its own. This page owns the container list, docker disk usage and actions.
  const fetchAll = useCallback(async () => {
    try {
      const [cRes, dRes] = await Promise.all([
        apiFetch('/api/admin/monitoring/containers', { headers }),
        apiFetch('/api/admin/monitoring/disk', { headers }),
      ]);
      const cData = cRes.ok ? await cRes.json() : { containers: [], counts: null };
      const dData = dRes.ok ? await dRes.json() : null;
      setContainers(cData.containers || []);
      setCounts(cData.counts || { normal: 0, stale: 0, orphaned: 0, leftover: 0 });
      if (dData?.images) setDisk(dData);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const doAction = async (url: string, label: string) => {
    if (!(await confirm({
      title: 'Confirm action',
      description: <>Are you sure you want to <strong>{label}</strong>?</>,
      confirmText: 'Proceed',
      variant: 'destructive',
    }))) return;
    setActionLoading(label);
    setActionMsg(null);
    try {
      const res = await apiFetch(url, { method: 'POST', headers });
      const data = await res.json();
      const msg = data.message || (data.spaceReclaimed !== undefined
        ? `Reclaimed ${formatBytes(data.spaceReclaimed)}`
        : data.pruned !== undefined
          ? `Pruned ${data.pruned} item(s), reclaimed ${formatBytes(data.spaceReclaimed || 0)}`
          : 'Done');
      setActionMsg(msg);
      await fetchAll();
    } catch {
      setActionMsg('Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const forceRemove = async (containerId: string, name: string) => {
    if (!(await confirm({
      title: 'Force remove container?',
      description: <>Force-remove <strong>{name}</strong>? Any unsaved state in it is lost.</>,
      confirmText: 'Force remove',
      variant: 'destructive',
    }))) return;
    setActionLoading(containerId);
    try {
      await apiFetch(`/api/admin/monitoring/containers/${containerId}/force-remove`, { method: 'POST', headers });
      await fetchAll();
    } catch { /* silent */ }
    finally { setActionLoading(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading monitoring data...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">Server Monitoring</h2>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-xs text-muted-foreground">Live (10s)</span>
          <Button size="sm" variant="secondary" onClick={() => { setLoading(true); fetchAll(); }}>Refresh</Button>
        </div>
      </div>

      {actionMsg && (
        <Alert>
          <AlertDescription>{actionMsg}</AlertDescription>
        </Alert>
      )}

      {/* System resource cards + usage charts (self-polling) */}
      <ServerResources showErrorAlert />

      {/* Docker Containers */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-card-foreground">
            Docker Containers ({containers.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {counts.stale > 0 && (
              <Button size="sm" variant="destructive" disabled={actionLoading !== null}
                onClick={() => doAction('/api/admin/monitoring/cleanup/stale', 'cleanup stale containers')}>
                Cleanup Stale ({counts.stale})
              </Button>
            )}
            {counts.orphaned > 0 && (
              <Button size="sm" variant="destructive" disabled={actionLoading !== null}
                onClick={() => doAction('/api/admin/monitoring/cleanup/orphans', 'cleanup orphaned containers')}>
                Cleanup Orphans ({counts.orphaned})
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{counts.normal} normal</Badge>
          {counts.stale > 0 && <Badge variant="outline">{counts.stale} stale</Badge>}
          {counts.orphaned > 0 && <Badge variant="destructive">{counts.orphaned} orphaned</Badge>}
          {counts.leftover > 0 && <Badge variant="outline">{counts.leftover} leftover</Badge>}
        </div>

        {containers.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No managed containers found.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>Memory</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium text-card-foreground">
                        {c.siteId || c.name}
                        {c.labels['wp-launcher.role'] && (
                          <Badge variant="outline" className="text-[10px]">{c.labels['wp-launcher.role']}</Badge>
                        )}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">{c.id}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.state === 'running' ? 'default' : 'secondary'}>{c.state}</Badge>
                    </TableCell>
                    <TableCell><Badge variant={flagVariant[c.flag]}>{c.flag}</Badge></TableCell>
                    <TableCell>{c.cpuPercent !== null ? `${c.cpuPercent}%` : '—'}</TableCell>
                    <TableCell>{c.memUsage !== null ? `${formatBytes(c.memUsage)} / ${formatBytes(c.memLimit || 0)}` : '—'}</TableCell>
                    <TableCell>{formatUptime(c.created)}</TableCell>
                    <TableCell className="text-muted-foreground">{c.image.split(':')[0].split('/').pop()}</TableCell>
                    <TableCell>
                      <Button size="xs" variant="destructive" disabled={actionLoading === c.idFull}
                        onClick={() => forceRemove(c.idFull, c.siteId || c.name)}>
                        {actionLoading === c.idFull ? '...' : 'Remove'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Disk Usage + Quick Actions */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Docker Disk */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-card-foreground">Docker Disk Usage</h3>
          {disk?.images && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Images ({disk.images.count})</span>
                <span className="font-medium text-card-foreground">{formatBytes(disk.images.totalSize)}</span>
              </div>
              {disk.volumes && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Volumes ({disk.volumes.count})</span>
                </div>
              )}
              {disk.images.items?.length > 0 && (
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm text-muted-foreground">Image details</summary>
                  <div className="mt-2 space-y-1">
                    {disk.images.items.map((img, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-muted-foreground">{img.repoTags?.[0] || img.id}</span>
                        <span className="shrink-0 text-card-foreground">{formatBytes(img.size)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-card-foreground">Quick Actions</h3>
          <div className="mt-3 flex flex-col gap-2">
            <Button variant="secondary" className="justify-start" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/prune/images', 'prune unused images')}>
              {actionLoading === 'prune unused images' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Prune Images
            </Button>
            <Button variant="secondary" className="justify-start" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/prune/volumes', 'prune unused volumes')}>
              {actionLoading === 'prune unused volumes' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Prune Volumes
            </Button>
            <Button variant="secondary" className="justify-start" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/prune/buildcache', 'prune build cache')}>
              {actionLoading === 'prune build cache' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Prune Build Cache
            </Button>
            <Button variant="secondary" className="justify-start" disabled={actionLoading !== null}
              onClick={() => doAction('/api/admin/monitoring/cleanup/orphans', 'cleanup orphaned containers')}>
              {actionLoading === 'cleanup orphaned containers' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Cleanup Orphans
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
