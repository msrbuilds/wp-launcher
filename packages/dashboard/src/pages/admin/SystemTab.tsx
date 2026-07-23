import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';
import { useConfirm } from '../../components/ConfirmDialog';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface SystemInfo {
  version: string;
  commit: string;
  commitFull: string;
  branch: string;
  buildDate: string | null;
  commitDate: string | null;
  commitMessage: string;
  nodeVersion: string;
  platform: string;
  uptime: number;
  uptimeFormatted: string;
  memoryUsage: number;
  env: string;
}

interface UpdateCheck {
  currentVersion: string;
  latestVersion: string;
  latestCommit?: string;
  currentCommit?: string;
  updateAvailable: boolean;
  releaseUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
  message?: string;
  source?: string;
  error?: string;
}

export default function SystemTab() {
  const headers = useAdminHeaders();
  const confirm = useConfirm();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    apiFetch('/api/admin/system/info', { headers })
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {})
      .finally(() => setLoading(false));

    // Auto-check for updates
    checkForUpdates();
  }, []);

  const [updateStatus, setUpdateStatus] = useState<{ status: string; previousVersion?: string; newVersion?: string; error?: string | null; startedAt?: string; completedAt?: string } | null>(null);
  const [updateLog, setUpdateLog] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<number | null>(null);

  function checkForUpdates() {
    setChecking(true);
    apiFetch('/api/admin/system/update-check', { headers })
      .then((r) => r.json())
      .then(setUpdate)
      .catch(() => {})
      .finally(() => setChecking(false));
  }

  async function triggerUpdate() {
    if (!(await confirm({
      title: 'Update the panel?',
      description: 'This pulls the latest code, rebuilds containers, and restarts services. Existing sites stay accessible.',
      confirmText: 'Update now',
    }))) return;
    setTriggering(true);
    setShowLog(true);
    setUpdateLog('Triggering update...\n');
    apiFetch('/api/admin/system/update', { method: 'POST', headers })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setUpdateLog(prev => prev + `Error: ${data.error}\n`);
          setTriggering(false);
        } else {
          setUpdateLog(prev => prev + `Update queued (ID: ${data.triggerId}). Waiting for watcher...\n`);
          startPolling();
        }
      })
      .catch(() => {
        setUpdateLog(prev => prev + 'Failed to trigger update.\n');
        setTriggering(false);
      });
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(() => {
      // Poll status
      apiFetch('/api/admin/system/update-status', { headers })
        .then(r => r.json())
        .then(status => {
          setUpdateStatus(status);
          if (status.status === 'completed' || status.status === 'failed') {
            stopPolling();
            setTriggering(false);
          }
        })
        .catch(() => {});
      // Poll log
      apiFetch('/api/admin/system/update-log', { headers })
        .then(r => r.text())
        .then(log => {
          setUpdateLog(log);
          if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
          }
        })
        .catch(() => {});
    }, 3000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Check if there's an in-progress update on mount
  useEffect(() => {
    apiFetch('/api/admin/system/update-status', { headers })
      .then(r => r.json())
      .then(status => {
        setUpdateStatus(status);
        if (status.status === 'in_progress') {
          setShowLog(true);
          setTriggering(true);
          startPolling();
        }
      })
      .catch(() => {});
    return () => stopPolling();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }
  if (!info) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-card-foreground">
        Failed to load system info.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Version Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground">
        <div>
          <h3 className="flex flex-wrap items-baseline gap-2 text-base font-semibold">
            WP Launcher
            <span className="text-sm font-normal text-muted-foreground">v{info.version}</span>
          </h3>
          {info.commitMessage && (
            <p className="mt-1 text-sm text-muted-foreground">
              Latest: {info.commitMessage}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={info.env === 'production' ? 'default' : 'secondary'}>
            {info.env}
          </Badge>
        </div>
      </div>

      {/* Update Notification */}
      {update?.updateAvailable && (
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-muted p-6 text-foreground">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" />
            <div>
              <strong className="text-sm font-semibold">
                Update Available: v{update.latestVersion}
                {update.source === 'commit' && update.latestCommit && ` (${update.latestCommit})`}
              </strong>
              <p className="mt-1 text-sm text-muted-foreground">
                {update.source === 'commit' && update.message
                  ? `Latest: ${update.message}`
                  : `You are running v${update.currentVersion}. A newer version is available.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {update.releaseUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={update.releaseUrl} target="_blank" rel="noopener noreferrer">
                  Release Notes
                </a>
              </Button>
            )}
            <Button size="sm" onClick={triggerUpdate} disabled={triggering}>
              {triggering ? <><Loader2 className="h-3 w-3 animate-spin" /> Updating...</> : 'Update Now'}
            </Button>
          </div>
        </div>
      )}

      {update && !update.updateAvailable && !update.error && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-[18px] w-[18px] text-muted-foreground" />
            <span className="text-sm text-muted-foreground">You are running the latest version.</span>
          </div>
          <Button size="sm" variant="outline" onClick={checkForUpdates} disabled={checking}>
            {checking ? 'Checking...' : 'Check Again'}
          </Button>
        </div>
      )}

      {/* System Details Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Version Info */}
        <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
          <h4 className="mb-3 text-sm font-semibold">Version Info</h4>
          <InfoRow label="Version" value={`v${info.version}`} />
          <InfoRow label="Branch" value={info.branch} />
          <InfoRow label="Commit" value={info.commit} mono />
          {info.commitDate && <InfoRow label="Commit Date" value={new Date(info.commitDate).toLocaleString()} />}
          {info.buildDate && <InfoRow label="Build Date" value={new Date(info.buildDate).toLocaleString()} />}
        </div>

        {/* Runtime Info */}
        <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
          <h4 className="mb-3 text-sm font-semibold">Runtime</h4>
          <InfoRow label="Node.js" value={info.nodeVersion} />
          <InfoRow label="Platform" value={info.platform} />
          <InfoRow label="Uptime" value={info.uptimeFormatted} />
          <InfoRow label="Memory" value={`${info.memoryUsage} MB`} />
        </div>
      </div>

      {/* Update Progress / Log Viewer */}
      {showLog && (
        <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              Update Log
              {updateStatus?.status === 'in_progress' && <Loader2 className="h-3 w-3 animate-spin" />}
            </h4>
            <div className="flex items-center gap-2">
              {updateStatus?.status === 'completed' && (
                <Badge variant="default">Completed</Badge>
              )}
              {updateStatus?.status === 'failed' && (
                <Badge variant="destructive">Failed</Badge>
              )}
              {updateStatus?.status === 'in_progress' && (
                <Badge variant="secondary">In Progress</Badge>
              )}
              <Button size="sm" variant="outline" onClick={() => setShowLog(false)}>
                Hide
              </Button>
            </div>
          </div>

          {updateStatus?.status === 'completed' && (
            <div className="mb-3 rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
              Update completed successfully! {updateStatus.previousVersion && updateStatus.newVersion && (
                <>v{updateStatus.previousVersion} → v{updateStatus.newVersion}. </>
              )}
              <Button size="xs" className="ml-2" onClick={() => window.location.reload()}>
                Refresh Page
              </Button>
            </div>
          )}

          {updateStatus?.status === 'failed' && (
            <div className="mb-3 rounded-lg border border-border bg-muted p-4 text-sm text-destructive">
              Update failed. {updateStatus.error && <span>{updateStatus.error}</span>}
              <div className="mt-2">
                <Button size="xs" onClick={triggerUpdate} disabled={triggering}>Retry</Button>
              </div>
            </div>
          )}

          <pre
            ref={logRef}
            className="max-h-96 overflow-auto rounded-lg border border-border bg-muted p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground"
          >
            {updateLog || 'Waiting for output...'}
          </pre>
        </div>
      )}

      {/* Manual Update Instructions */}
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <h4 className="text-sm font-semibold">
          Manual Update (SSH)
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">
          You can also update manually via SSH:
        </p>
        <div className="mt-3 rounded-lg border border-border bg-muted p-4 font-mono text-sm text-muted-foreground">
          <div><span className="text-primary">wpl</span> update</div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm text-foreground', mono && 'font-mono')}>{value}</span>
    </div>
  );
}
