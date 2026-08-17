import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { Snapshot } from '../types';

interface Props {
  siteId: string;
  snapshots: SnapshotsController;
  variant?: 'full' | 'compact';
}

/** DB timestamps are UTC with no `Z`; without it the browser reads them as local. */
const utc = (ts: string) => new Date(`${ts}Z`);

/**
 * The snapshot most recently restored, or undefined if none ever was.
 *
 * Deliberately labelled "Last restored" rather than "Current": the site stops
 * matching the snapshot the moment anyone edits it, so a badge claiming the
 * site *is* this snapshot would usually be false — and false in the direction
 * that invites someone to restore over work they think is already saved.
 */
function lastRestoredId(list: Snapshot[]): string | undefined {
  let best: Snapshot | undefined;
  for (const s of list) {
    // Lexical compare is safe: 'YYYY-MM-DD HH:MM:SS' sorts chronologically.
    if (s.restored_at && (!best || s.restored_at > best.restored_at!)) best = s;
  }
  return best?.id;
}

export default function SnapshotsPanel({ siteId, snapshots, variant = 'full' }: Props) {
  const list = snapshots.bySite[siteId] || [];
  const busy = snapshots.busyId === siteId;
  const restoredId = lastRestoredId(list);

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
            <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
              <span className="truncate">
                {snap.name}{' '}
                <span className="text-xs text-muted-foreground">
                  ({utc(snap.created_at).toLocaleDateString()})
                </span>
              </span>
              {snap.id === restoredId && (
                <Badge className="shrink-0" title={`Restored ${utc(snap.restored_at!).toLocaleString()}`}>
                  Last restored
                </Badge>
              )}
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
              <TableCell className="font-medium">
                <span className="flex flex-wrap items-center gap-2">
                  {snap.name}
                  {snap.id === restoredId && (
                    <Badge>Last restored {utc(snap.restored_at!).toLocaleString()}</Badge>
                  )}
                </span>
              </TableCell>
              <TableCell>{snap.size_bytes ? `${(snap.size_bytes / 1024 / 1024).toFixed(1)} MB` : '—'}</TableCell>
              <TableCell>{utc(snap.created_at).toLocaleString()}</TableCell>
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
