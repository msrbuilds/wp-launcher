import { useState, useEffect } from 'react';
import { AdminProduct } from './shared';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';

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
    fetch(isLocal ? '/api/templates' : '/api/products', { credentials: 'include' }).then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) {
        setProducts(data);
        if (data.length > 0 && !productId) setProductId(data[0].id);
      }
    }).catch(() => {});
    fetch('/api/admin/bulk', { headers, credentials: 'include' }).then((r) => r.json()).then((data) => {
      setJobs(data.data || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeJob || activeJob.status === 'completed' || activeJob.status === 'cancelled' || activeJob.status === 'failed') return;
    const interval = setInterval(() => {
      fetch(`/api/admin/bulk/${activeJob.id}`, { headers, credentials: 'include' })
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
      const res = await fetch('/api/admin/bulk', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId, count, expiresIn, subdomainPrefix: prefix || undefined }),
      });
      const data = await res.json();
      if (data.jobId) {
        const jobRes = await fetch(`/api/admin/bulk/${data.jobId}`, { headers, credentials: 'include' });
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
    await fetch(`/api/admin/bulk/${activeJob.id}`, { method: 'DELETE', headers, credentials: 'include' });
  }

  const progress = activeJob ? Math.round((activeJob.completed / activeJob.total) * 100) : 0;

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>Bulk Site Launch</h3>
        <form onSubmit={handleStart}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>{isLocal ? 'Template' : 'Product'}</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} style={{ width: '100%', padding: '0.625rem 1rem', border: '1px solid var(--border)', fontSize: '0.95rem', background: 'var(--white)', color: 'var(--prussian-blue)' }}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Count (1-50)</label>
              <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(parseInt(e.target.value) || 1)} />
            </div>
            {!isLocal && (
              <div className="form-group" style={{ margin: 0 }}>
                <label>Expires In</label>
                <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)} style={{ width: '100%', padding: '0.625rem 1rem', border: '1px solid var(--border)', fontSize: '0.95rem', background: 'var(--white)', color: 'var(--prussian-blue)' }}>
                  <option value="1h">1 hour</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                </select>
              </div>
            )}
            <div className="form-group" style={{ margin: 0 }}>
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
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', margin: 0 }}>
              Job: {activeJob.completed}/{activeJob.total}
              {activeJob.failed > 0 && <span style={{ color: '#ef4444' }}> ({activeJob.failed} failed)</span>}
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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

          <div style={{ background: '#e2e8f0', borderRadius: '4px', height: '8px', marginBottom: '0.75rem' }}>
            <div style={{ background: '#2563eb', width: `${progress}%`, height: '100%', borderRadius: '4px', transition: 'width 0.3s' }} />
          </div>

          {activeJob.results.length > 0 && (
            <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '0.375rem' }}>#</th>
                    <th style={{ padding: '0.375rem' }}>Subdomain</th>
                    <th style={{ padding: '0.375rem' }}>URL</th>
                    <th style={{ padding: '0.375rem' }}>Password</th>
                    <th style={{ padding: '0.375rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeJob.results.map((r) => (
                    <tr key={r.index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.375rem' }}>{r.index}</td>
                      <td style={{ padding: '0.375rem' }}>{r.subdomain || '—'}</td>
                      <td style={{ padding: '0.375rem' }}>
                        {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">Open</a> : '—'}
                      </td>
                      <td style={{ padding: '0.375rem' }}><code style={{ fontSize: '0.75rem' }}>{r.password || '—'}</code></td>
                      <td style={{ padding: '0.375rem' }}>
                        {r.error
                          ? <span style={{ color: '#ef4444' }}>{r.error}</span>
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
          <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>Recent Jobs</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Product</th>
                  <th style={{ padding: '0.5rem' }}>Sites</th>
                  <th style={{ padding: '0.5rem' }}>Status</th>
                  <th style={{ padding: '0.5rem' }}>Created</th>
                  <th style={{ padding: '0.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j: any) => (
                  <tr key={j.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.5rem' }}>{j.product_id}</td>
                    <td style={{ padding: '0.5rem' }}>{j.completed}/{j.total}{j.failed > 0 && ` (${j.failed} failed)`}</td>
                    <td style={{ padding: '0.5rem' }}><span className={`badge badge-${j.status === 'completed' ? 'running' : 'expired'}`}>{j.status}</span></td>
                    <td style={{ padding: '0.5rem' }}>{new Date(j.created_at).toLocaleString()}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => {
                        fetch(`/api/admin/bulk/${j.id}`, { headers, credentials: 'include' }).then((r) => r.json()).then(setActiveJob).catch(() => {});
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
