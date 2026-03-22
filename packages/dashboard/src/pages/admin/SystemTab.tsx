import { useState, useEffect, useRef } from 'react';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';
import { apiFetch } from '../../utils/api';

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
  appMode: string;
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
  const isLocal = useIsLocalMode();
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

  function triggerUpdate() {
    if (!confirm('This will pull the latest code, rebuild containers, and restart services. Existing sites will remain accessible. Proceed?')) return;
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

  if (loading) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;
  if (!info) return <div className="card">Failed to load system info.</div>;

  return (
    <div>
      {/* Version Header */}
      <div className="card sys-version-card">
        <div>
          <h3 className="sys-version-title">
            WP Launcher
            <span className="sys-version-number">v{info.version}</span>
          </h3>
          {info.commitMessage && (
            <p className="sys-commit-msg">
              Latest: {info.commitMessage}
            </p>
          )}
        </div>
        <div className="sys-badges">
          <span className={`badge ${info.env === 'production' ? 'badge-running' : 'badge-expired'}`}>
            {info.env}
          </span>
          <span className="badge sys-badge-mode">
            {info.appMode}
          </span>
        </div>
      </div>

      {/* Update Notification (agency mode only) */}
      {!isLocal && update?.updateAvailable && (
        <div className="sys-update-banner">
          <div className="sys-update-info">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#b45309" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div>
              <strong className="sys-update-title">
                Update Available: v{update.latestVersion}
                {update.source === 'commit' && update.latestCommit && ` (${update.latestCommit})`}
              </strong>
              <p className="sys-update-desc">
                {update.source === 'commit' && update.message
                  ? `Latest: ${update.message}`
                  : `You are running v${update.currentVersion}. A newer version is available.`}
              </p>
            </div>
          </div>
          <div className="sys-update-actions">
            {update.releaseUrl && (
              <a
                href={update.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline sys-btn-font-sm"
              >
                Release Notes
              </a>
            )}
            <button className="btn btn-sm btn-primary" onClick={triggerUpdate} disabled={triggering}>
              {triggering ? <><span className="spinner spinner-sm" /> Updating...</> : 'Update Now'}
            </button>
          </div>
        </div>
      )}

      {!isLocal && update && !update.updateAvailable && !update.error && (
        <div className="sys-uptodate-banner">
          <div className="sys-uptodate-info">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="sys-uptodate-text">You are running the latest version.</span>
          </div>
          <button className="btn btn-sm btn-outline sys-btn-check" onClick={checkForUpdates} disabled={checking}>
            {checking ? 'Checking...' : 'Check Again'}
          </button>
        </div>
      )}

      {/* System Details Grid */}
      <div className="sys-details-grid">
        {/* Version Info */}
        <div className="card">
          <h4 className="sys-section-heading">Version Info</h4>
          <InfoRow label="Version" value={`v${info.version}`} />
          <InfoRow label="Branch" value={info.branch} />
          <InfoRow label="Commit" value={info.commit} mono />
          {info.commitDate && <InfoRow label="Commit Date" value={new Date(info.commitDate).toLocaleString()} />}
          {info.buildDate && <InfoRow label="Build Date" value={new Date(info.buildDate).toLocaleString()} />}
        </div>

        {/* Runtime Info */}
        <div className="card">
          <h4 className="sys-section-heading">Runtime</h4>
          <InfoRow label="Node.js" value={info.nodeVersion} />
          <InfoRow label="Platform" value={info.platform} />
          <InfoRow label="Uptime" value={info.uptimeFormatted} />
          <InfoRow label="Memory" value={`${info.memoryUsage} MB`} />
        </div>
      </div>

      {/* Update Progress / Log Viewer (agency mode only) */}
      {!isLocal && showLog && (
        <div className="card sys-card-spaced">
          <div className="sys-log-header">
            <h4 className="sys-section-heading--no-margin">
              Update Log
              {updateStatus?.status === 'in_progress' && <span className="spinner spinner-sm sys-spinner-inline" />}
            </h4>
            <div className="sys-log-actions">
              {updateStatus?.status === 'completed' && (
                <span className="badge badge-running sys-badge-font-sm">Completed</span>
              )}
              {updateStatus?.status === 'failed' && (
                <span className="badge badge-expired sys-badge-font-sm">Failed</span>
              )}
              {updateStatus?.status === 'in_progress' && (
                <span className="badge sys-badge-in-progress">In Progress</span>
              )}
              <button className="btn btn-sm btn-outline sys-btn-hide" onClick={() => setShowLog(false)}>
                Hide
              </button>
            </div>
          </div>

          {updateStatus?.status === 'completed' && (
            <div className="sys-status-success">
              Update completed successfully! {updateStatus.previousVersion && updateStatus.newVersion && (
                <>v{updateStatus.previousVersion} → v{updateStatus.newVersion}. </>
              )}
              <button className="btn btn-sm btn-primary sys-btn-font-xs sys-btn-inline" onClick={() => window.location.reload()}>
                Refresh Page
              </button>
            </div>
          )}

          {updateStatus?.status === 'failed' && (
            <div className="sys-status-failed">
              Update failed. {updateStatus.error && <span>{updateStatus.error}</span>}
              <div className="sys-retry-row">
                <button className="btn btn-sm btn-primary sys-btn-font-xs" onClick={triggerUpdate} disabled={triggering}>Retry</button>
              </div>
            </div>
          )}

          <pre
            ref={logRef}
            className="sys-log-terminal"
          >
            {updateLog || 'Waiting for output...'}
          </pre>
        </div>
      )}

      {/* Manual Update Instructions (agency mode only) */}
      {!isLocal && <div className="card">
        <h4 className="sys-section-heading">
          Manual Update (SSH)
        </h4>
        <p className="sys-manual-desc">
          You can also update manually via SSH:
        </p>
        <div className="sys-manual-code">
          <div><span className="sys-cmd-accent">wpl</span> update</div>
        </div>
      </div>}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="sys-info-row">
      <span className="sys-info-label">{label}</span>
      <span className={mono ? 'sys-info-value--mono' : 'sys-info-value'}>{value}</span>
    </div>
  );
}
