import { useState, useEffect } from 'react';
import { AdminProduct } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';
import { apiFetch } from '../../utils/api';

interface BulkJob {
  id: string;
  productId: string;
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
  const isLocal = useIsLocalMode();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productId, setProductId] = useState('');
  const [count, setCount] = useState(5);
  const [expiresIn, setExpiresIn] = useState('24h');
  const [prefix, setPrefix] = useState('');
  const [activeJob, setActiveJob] = useState<BulkJob | null>(null);
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    apiFetch(isLocal ? '/api/templates' : '/api/products').then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) {
        setProducts(data);
        if (data.length > 0 && !productId) setProductId(data[0].id);
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
        body: JSON.stringify({ productId, count, expiresIn, subdomainPrefix: prefix || undefined }),
      });
      const data = await res.json();
      if (data.jobId) {
        const jobRes = await apiFetch(`/api/admin/bulk/${data.jobId}`, { headers });
        setActiveJob(await jobRes.json());
      }
    } catch {
      alert('Failed to start bulk job');
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
    <div>
      <div className="card bk-card-spaced">
        <h3 className="bk-heading">Bulk Site Launch</h3>
        <form onSubmit={handleStart}>
          <div className="bk-form-grid">
            <div className="form-group bk-form-group-inline">
              <label>{isLocal ? 'Template' : 'Product'}</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} className="bk-select">
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group bk-form-group-inline">
              <label>Count (1-50)</label>
              <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(parseInt(e.target.value) || 1)} />
            </div>
            {!isLocal && (
              <div className="form-group bk-form-group-inline">
                <label>Expires In</label>
                <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)} className="bk-select">
                  <option value="1h">1 hour</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                </select>
              </div>
            )}
            <div className="form-group bk-form-group-inline">
              <label>Prefix (optional)</label>
              <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. workshop" />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={starting || (activeJob?.status === 'running')}>
            {starting ? <><span className="spinner" /> Starting...</> : 'Start Bulk Launch'}
          </button>
        </form>
      </div>

      {activeJob && (
        <div className="card bk-card-spaced">
          <div className="bk-job-header">
            <h3 className="bk-job-title">
              Job: {activeJob.completed}/{activeJob.total}
              {activeJob.failed > 0 && <span className="bk-failed-count"> ({activeJob.failed} failed)</span>}
            </h3>
            <div className="bk-job-actions">
              <span className={`badge badge-${activeJob.status === 'running' ? 'running' : activeJob.status === 'completed' ? 'running' : 'expired'}`}>
                {activeJob.status}
              </span>
              {activeJob.status === 'running' && (
                <button className="btn btn-sm btn-danger" onClick={handleCancel}>Cancel</button>
              )}
              {activeJob.status !== 'running' && (
                <a href={`/api/admin/bulk/${activeJob.id}/export`} className="btn btn-sm btn-secondary" download>Download CSV</a>
              )}
            </div>
          </div>

          <div className="bk-progress-track">
            <div className="bk-progress-fill" style={{ width: `${progress}%` }} />
          </div>

          {activeJob.results.length > 0 && (
            <div className="bk-table-scroll">
              <table className="bk-table">
                <thead>
                  <tr className="bk-thead-row">
                    <th className="bk-th">#</th>
                    <th className="bk-th">Subdomain</th>
                    <th className="bk-th">URL</th>
                    <th className="bk-th">Password</th>
                    <th className="bk-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeJob.results.map((r) => (
                    <tr key={r.index} className="bk-tbody-row">
                      <td className="bk-td">{r.index}</td>
                      <td className="bk-td">{r.subdomain || '—'}</td>
                      <td className="bk-td">
                        {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">Open</a> : '—'}
                      </td>
                      <td className="bk-td"><code className="bk-code-sm">{r.password || '—'}</code></td>
                      <td className="bk-td">
                        {r.error
                          ? <span className="bk-error-text">{r.error}</span>
                          : <span className="badge badge-running">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {jobs.length > 0 && !activeJob && (
        <div className="card">
          <h3 className="bk-heading">Recent Jobs</h3>
          <div className="bk-recent-scroll">
            <table className="bk-recent-table">
              <thead>
                <tr className="bk-recent-thead-row">
                  <th className="bk-recent-th">Product</th>
                  <th className="bk-recent-th">Sites</th>
                  <th className="bk-recent-th">Status</th>
                  <th className="bk-recent-th">Created</th>
                  <th className="bk-recent-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j: any) => (
                  <tr key={j.id} className="bk-recent-tbody-row">
                    <td className="bk-recent-td">{j.product_id}</td>
                    <td className="bk-recent-td">{j.completed}/{j.total}{j.failed > 0 && ` (${j.failed} failed)`}</td>
                    <td className="bk-recent-td"><span className={`badge badge-${j.status === 'completed' ? 'running' : 'expired'}`}>{j.status}</span></td>
                    <td className="bk-recent-td">{new Date(j.created_at).toLocaleString()}</td>
                    <td className="bk-recent-td">
                      <button className="btn btn-sm btn-secondary" onClick={() => {
                        apiFetch(`/api/admin/bulk/${j.id}`, { headers }).then((r) => r.json()).then(setActiveJob).catch(() => {});
                      }}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
