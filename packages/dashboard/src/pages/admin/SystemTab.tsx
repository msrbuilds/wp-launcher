import { useState, useEffect, useRef } from 'react';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';

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
    fetch('/api/admin/system/info', { headers, credentials: 'include' })
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
    fetch('/api/admin/system/update-check', { headers, credentials: 'include' })
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
    fetch('/api/admin/system/update', { method: 'POST', headers, credentials: 'include' })
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
      fetch('/api/admin/system/update-status', { headers, credentials: 'include' })
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
      fetch('/api/admin/system/update-log', { headers, credentials: 'include' })
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
    fetch('/api/admin/system/update-status', { headers, credentials: 'include' })
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
      <div className="card" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
            WP Launcher
            <span style={{ marginLeft: '0.5rem', fontSize: '1.1rem', color: 'var(--orange)', fontWeight: 700 }}>v{info.version}</span>
          </h3>
          {info.commitMessage && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
              Latest: {info.commitMessage}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className={`badge ${info.env === 'production' ? 'badge-running' : 'badge-expired'}`}>
            {info.env}
          </span>
          <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>
            {info.appMode}
          </span>
        </div>
      </div>

      {/* Update Notification (agency mode only) */}
      {!isLocal && update?.updateAvailable && (
        <div style={{
          marginBottom: '1rem', padding: '1rem 1.25rem', borderRadius: '8px',
          background: 'linear-gradient(135deg, #fefce8, #fef9c3)', border: '1px solid #fde68a',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#b45309" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div>
              <strong style={{ color: '#92400e', fontSize: '0.9rem' }}>
                Update Available: v{update.latestVersion}
                {update.source === 'commit' && update.latestCommit && ` (${update.latestCommit})`}
              </strong>
              <p style={{ color: '#a16207', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>
                {update.source === 'commit' && update.message
                  ? `Latest: ${update.message}`
                  : `You are running v${update.currentVersion}. A newer version is available.`}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {update.releaseUrl && (
              <a
                href={update.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline"
                style={{ fontSize: '0.78rem' }}
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
        <div style={{
          marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '8px',
          background: '#f0fdf4', border: '1px solid #bbf7d0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span style={{ color: '#166534', fontSize: '0.82rem' }}>You are running the latest version.</span>
          </div>
          <button className="btn btn-sm btn-outline" onClick={checkForUpdates} disabled={checking} style={{ fontSize: '0.75rem' }}>
            {checking ? 'Checking...' : 'Check Again'}
          </button>
        </div>
      )}

      {/* System Details Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        {/* Version Info */}
        <div className="card">
          <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontFamily: 'Poppins, sans-serif' }}>Version Info</h4>
          <InfoRow label="Version" value={`v${info.version}`} />
          <InfoRow label="Branch" value={info.branch} />
          <InfoRow label="Commit" value={info.commit} mono />
          {info.commitDate && <InfoRow label="Commit Date" value={new Date(info.commitDate).toLocaleString()} />}
          {info.buildDate && <InfoRow label="Build Date" value={new Date(info.buildDate).toLocaleString()} />}
        </div>

        {/* Runtime Info */}
        <div className="card">
          <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontFamily: 'Poppins, sans-serif' }}>Runtime</h4>
          <InfoRow label="Node.js" value={info.nodeVersion} />
          <InfoRow label="Platform" value={info.platform} />
          <InfoRow label="Uptime" value={info.uptimeFormatted} />
          <InfoRow label="Memory" value={`${info.memoryUsage} MB`} />
        </div>
      </div>

      {/* Update Progress / Log Viewer (agency mode only) */}
      {!isLocal && showLog && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', margin: 0, fontFamily: 'Poppins, sans-serif' }}>
              Update Log
              {updateStatus?.status === 'in_progress' && <span className="spinner spinner-sm" style={{ marginLeft: '0.5rem' }} />}
            </h4>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {updateStatus?.status === 'completed' && (
                <span className="badge badge-running" style={{ fontSize: '0.7rem' }}>Completed</span>
              )}
              {updateStatus?.status === 'failed' && (
                <span className="badge badge-expired" style={{ fontSize: '0.7rem' }}>Failed</span>
              )}
              {updateStatus?.status === 'in_progress' && (
                <span className="badge" style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '0.7rem' }}>In Progress</span>
              )}
              <button className="btn btn-sm btn-outline" onClick={() => setShowLog(false)} style={{ fontSize: '0.7rem' }}>
                Hide
              </button>
            </div>
          </div>

          {updateStatus?.status === 'completed' && (
            <div style={{ padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.82rem', color: '#166534' }}>
              Update completed successfully! {updateStatus.previousVersion && updateStatus.newVersion && (
                <>v{updateStatus.previousVersion} → v{updateStatus.newVersion}. </>
              )}
              <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()} style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                Refresh Page
              </button>
            </div>
          )}

          {updateStatus?.status === 'failed' && (
            <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.82rem', color: '#991b1b' }}>
              Update failed. {updateStatus.error && <span>{updateStatus.error}</span>}
              <div style={{ marginTop: '0.5rem' }}>
                <button className="btn btn-sm btn-primary" onClick={triggerUpdate} disabled={triggering} style={{ fontSize: '0.75rem' }}>Retry</button>
              </div>
            </div>
          )}

          <pre
            ref={logRef}
            style={{
              background: '#0f172a', color: '#e2e8f0', padding: '1rem', borderRadius: '6px',
              fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: 1.6,
              maxHeight: '400px', overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}
          >
            {updateLog || 'Waiting for output...'}
          </pre>
        </div>
      )}

      {/* Manual Update Instructions (agency mode only) */}
      {!isLocal && <div className="card">
        <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.75rem', fontFamily: 'Poppins, sans-serif' }}>
          Manual Update (SSH)
        </h4>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          You can also update manually via SSH:
        </p>
        <div style={{ background: '#1e293b', color: '#e2e8f0', padding: '0.75rem 1rem', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.8 }}>
          <div><span style={{ color: '#fb8500' }}>wpl</span> update</div>
        </div>
      </div>}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.82rem', fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}
