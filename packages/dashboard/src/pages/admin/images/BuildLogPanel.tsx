import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../../utils/api';
import { useToast } from '../../../components/Toast';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface BuildJob {
  id: string;
  tag: string;
  kind: string;
  status: 'queued' | 'building' | 'success' | 'failed';
  log: string;
  error: string | null;
}

/** Coloured pill for a build's status, reused by the Builds list. */
export function BuildStatusBadge({ status }: { status: string }) {
  if (status === 'success') return <Badge className="border-transparent bg-success text-success-foreground">success</Badge>;
  if (status === 'failed') return <Badge variant="destructive">failed</Badge>;
  if (status === 'building') return <Badge className="border-transparent bg-primary text-primary-foreground">building</Badge>;
  return <Badge variant="secondary">{status}</Badge>; // queued
}

/**
 * Streams a build's log by polling the job row every 1.5s until it reaches a
 * terminal status, then fires a single toast and calls onDone so the parent can
 * refresh. Mirrors the trigger-then-poll pattern the System update log uses.
 */
export function BuildLogPanel({ jobId, onDone }: { jobId: string; onDone?: (status: string) => void }) {
  const toast = useToast();
  const [job, setJob] = useState<BuildJob | null>(null);
  const notified = useRef(false);

  useEffect(() => {
    notified.current = false;
    setJob(null);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await apiFetch(`/api/admin/images/builds/${jobId}`);
        if (!res.ok) { if (active) timer = setTimeout(poll, 1500); return; }
        const data = (await res.json()) as BuildJob;
        if (!active) return;
        setJob(data);
        if (data.status === 'success' || data.status === 'failed') {
          if (!notified.current) {
            notified.current = true;
            if (data.status === 'success') toast.success(`Image ${data.tag} built`);
            else toast.error(`Build failed: ${data.error || 'see log'}`);
            onDone?.(data.status);
          }
          return; // terminal — stop polling
        }
      } catch { /* transient — keep polling */ }
      if (active) timer = setTimeout(poll, 1500);
    }

    poll();
    return () => { active = false; clearTimeout(timer); };
    // Only re-run when the watched job changes; toast/onDone are stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">Build log</span>
        {job ? <BuildStatusBadge status={job.status} /> : <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {job && <span className="truncate font-mono text-xs text-muted-foreground">{job.tag}</span>}
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs text-foreground">
        {job?.log?.trim() || 'Starting build…'}
      </pre>
    </div>
  );
}
