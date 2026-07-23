import { useCallback, useEffect, useState } from 'react';
import { Boxes, Hammer, Trash2 } from 'lucide-react';
import { apiFetch } from '../../utils/api';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { BuildImageDialog } from './images/BuildImageDialog';
import { BuildLogPanel, BuildStatusBadge } from './images/BuildLogPanel';

interface WplImage { tag: string; id: string; size: number; created: number; usedByBlueprints: string[]; }
interface BuildMeta { id: string; tag: string; kind: string; status: string; created_at: string; }

function formatBytes(n: number): string {
  if (!n) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let x = n; let i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x.toFixed(x < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function ImagesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [images, setImages] = useState<WplImage[]>([]);
  const [builds, setBuilds] = useState<BuildMeta[]>([]);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [imgRes, bRes] = await Promise.all([
        apiFetch('/api/admin/images'),
        apiFetch('/api/admin/images/builds'),
      ]);
      if (imgRes.ok) setImages(await imgRes.json());
      if (bRes.ok) setBuilds(await bRes.json());
    } catch { /* ignore — panel stays usable */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function removeImage(img: WplImage) {
    const inUse = img.usedByBlueprints.length > 0;
    const ok = await confirm({
      title: `Delete ${img.tag}?`,
      description: inUse
        ? `Used by blueprint(s): ${img.usedByBlueprints.join(', ')}. Deleting may break their launches.`
        : 'This removes the Docker image from the host.',
      variant: 'destructive',
      confirmText: 'Delete',
    });
    if (!ok) return;

    // Send the tag raw so the route's wildcard captures the slash in the path.
    let res = await apiFetch(`/api/admin/images/${img.tag}`, { method: 'DELETE' });
    if (res.status === 409) {
      const forced = await confirm({
        title: 'Force delete?',
        description: 'A blueprint still references this image. Remove it anyway?',
        variant: 'destructive',
        confirmText: 'Force delete',
      });
      if (!forced) return;
      res = await apiFetch(`/api/admin/images/${img.tag}?force=true`, { method: 'DELETE' });
    }
    if (res.ok) { toast.success('Image deleted'); load(); }
    else { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Failed to delete image'); }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Boxes className="size-6 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold text-foreground">Images</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Base WordPress runtimes (PHP + WordPress version) that sites launch from. Plugins and themes live in blueprints.
            </p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Hammer />
          Build base image
        </Button>
      </div>

      {/* ── Base images ── */}
      <Card>
        <CardHeader>
          <CardTitle>Base images</CardTitle>
          <CardDescription>Built runtimes on this host. A blueprint's Docker Image field selects one.</CardDescription>
        </CardHeader>
        <CardContent>
          {images.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No images yet. Use “Build base image” to create one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Used by</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {images.map((img) => (
                  <TableRow key={img.tag}>
                    <TableCell className="font-mono text-xs">{img.tag}</TableCell>
                    <TableCell className="text-muted-foreground">{formatBytes(img.size)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {img.usedByBlueprints.length
                        ? img.usedByBlueprints.join(', ')
                        : <span className="text-muted-foreground/60">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeImage(img)}
                        title="Delete image"
                      >
                        <Trash2 />
                        <span className="sr-only">Delete image</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Builds ── */}
      <Card>
        <CardHeader>
          <CardTitle>Builds</CardTitle>
          <CardDescription>Recent build jobs. Click one to view its log.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {builds.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No builds yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {builds.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setActiveJob(b.id)}
                  className="flex items-center justify-between gap-3 py-2 text-left hover:opacity-80"
                >
                  <span className="truncate font-mono text-xs text-foreground">{b.tag}</span>
                  <BuildStatusBadge status={b.status} />
                </button>
              ))}
            </div>
          )}

          {activeJob && <BuildLogPanel jobId={activeJob} onDone={() => load()} />}
        </CardContent>
      </Card>

      <BuildImageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onStarted={(jobId) => { setActiveJob(jobId); load(); }}
      />
    </div>
  );
}
