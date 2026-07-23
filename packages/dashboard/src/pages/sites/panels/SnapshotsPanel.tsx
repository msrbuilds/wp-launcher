import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SnapshotsController } from '../hooks/useSnapshots';

interface Props {
  siteId: string;
  snapshots: SnapshotsController;
  variant?: 'full' | 'compact';
}

export default function SnapshotsPanel({ siteId, snapshots, variant = 'full' }: Props) {
  const list = snapshots.bySite[siteId] || [];
  const busy = snapshots.busyId === siteId;

  if (list.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {variant === 'full'
          ? 'No snapshots yet. Take one to save the current state.'
          : 'No snapshots yet'}
      </p>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex flex-col gap-2">
        {list.map((snap) => (
          <div
            key={snap.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
          >
            <span className="truncate text-sm text-foreground">
              {snap.name}{' '}
              <span className="text-xs text-muted-foreground">
                ({new Date(snap.created_at).toLocaleDateString()})
              </span>
            </span>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="xs" onClick={() => snapshots.restore(siteId, snap.id)} disabled={busy}>
                Restore
              </Button>
              <Button variant="destructive" size="xs" onClick={() => snapshots.remove(siteId, snap.id)} disabled={busy}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((snap) => (
            <TableRow key={snap.id}>
              <TableCell className="font-medium">{snap.name}</TableCell>
              <TableCell>{snap.size_bytes ? `${(snap.size_bytes / 1024 / 1024).toFixed(1)} MB` : '—'}</TableCell>
              <TableCell>{new Date(snap.created_at).toLocaleString()}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="xs" onClick={() => snapshots.restore(siteId, snap.id)} disabled={busy}>
                    Restore
                  </Button>
                  <Button variant="destructive" size="xs" onClick={() => snapshots.remove(siteId, snap.id)}>
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SnapshotsPanelHeaderButton({ siteId, snapshots, label }: Props & { label: string }) {
  return (
    <Button size="xs" onClick={() => snapshots.take(siteId)} disabled={snapshots.busyId === siteId}>
      {snapshots.busyId === siteId
        ? <><Loader2 className="h-3 w-3 animate-spin" /> Working...</>
        : label}
    </Button>
  );
}
