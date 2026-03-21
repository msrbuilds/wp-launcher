import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminHeaders } from './AdminLayout';
import { useIsLocalMode } from '../../context/SettingsContext';

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  client_id: string | null;
  clientName: string | null;
  siteCount: number;
  created_at: string;
  sites: { id: string; subdomain: string; product_id: string; status: string; site_url: string; created_at: string; expires_at: string }[];
}

const STATUS_LABELS: Record<string, string> = { active: 'Active', completed: 'Completed', 'on-hold': 'On Hold', archived: 'Archived' };

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const headers = useAdminHeaders();
  const navigate = useNavigate();
  const isLocal = useIsLocalMode();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [userSites, setUserSites] = useState<{ id: string; subdomain: string; status: string }[]>([]);
  const [selectedSite, setSelectedSite] = useState('');

  const fetchProject = useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/list/${id}`, { headers, credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (data.error) setProject(null); else setProject(data); })
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [id, headers]);

  const fetchSites = useCallback(() => {
    fetch('/api/sites', { headers, credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const sites = (data.sites || []).filter((s: any) => s.status === 'running');
        setUserSites(sites);
      }).catch(() => {});
  }, [headers]);

  useEffect(() => { fetchProject(); fetchSites(); }, [fetchProject, fetchSites]);

  async function linkSite() {
    if (!selectedSite) return;
    try {
      const res = await fetch(`/api/projects/list/${id}/sites`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ siteId: selectedSite }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to link'); return; }
      setSelectedSite('');
      fetchProject();
    } catch { alert('Network error'); }
  }

  async function unlinkSite(siteId: string) {
    if (!confirm('Unlink this site from the project?')) return;
    try {
      const res = await fetch(`/api/projects/list/${id}/sites/${siteId}`, { method: 'DELETE', headers, credentials: 'include' });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Failed'); return; }
      fetchProject();
    } catch { alert('Network error'); }
  }

  if (loading) return <div className="card"><span className="spinner spinner-dark" /> Loading...</div>;
  if (!project) return <div className="card"><p>Project not found.</p><button className="btn btn-secondary btn-sm" onClick={() => navigate(isLocal ? '/projects' : '/admin/projects')}>Back</button></div>;

  const linkedSiteIds = new Set(project.sites.map(s => s.id));
  const availableSites = userSites.filter(s => !linkedSiteIds.has(s.id));

  return (
    <div className="pj-detail">
      <button className="btn btn-secondary btn-sm" onClick={() => navigate(isLocal ? '/projects' : '/admin/projects')} style={{ marginBottom: '1rem' }}>
        &larr; Back to Projects
      </button>
      <div className="card">
        <div className="pj-detail-header">
          <h3 className="pj-title">{project.name}</h3>
          <span className={`badge badge-${project.status}`}>{STATUS_LABELS[project.status] || project.status}</span>
        </div>
        {project.clientName && <p className="pj-detail-meta">Client: <strong>{project.clientName}</strong></p>}
        {project.description && <p className="pj-detail-desc">{project.description}</p>}
        <p className="pj-detail-meta">Created: {new Date(project.created_at + 'Z').toLocaleDateString()}</p>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="pj-header">
          <h4 className="pj-title">Linked Sites ({project.sites.length})</h4>
        </div>
        {availableSites.length > 0 && (
          <div className="pj-add-site">
            <select className="form-input" value={selectedSite} onChange={e => setSelectedSite(e.target.value)} style={{ flex: 1 }}>
              <option value="">— Select a site to link —</option>
              {availableSites.map(s => <option key={s.id} value={s.id}>{s.subdomain}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={linkSite} disabled={!selectedSite}>Link Site</button>
          </div>
        )}
        {project.sites.length === 0 ? (
          <p className="pj-empty">No sites linked to this project yet.</p>
        ) : (
          <div className="pj-table-wrap">
            <table className="pj-table">
              <thead><tr><th>Subdomain</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {project.sites.map(s => (
                  <tr key={s.id}>
                    <td>{s.site_url ? <a href={s.site_url} target="_blank" rel="noopener noreferrer">{s.subdomain}</a> : s.subdomain}</td>
                    <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                    <td>{new Date(s.created_at + 'Z').toLocaleDateString()}</td>
                    <td><button className="btn btn-danger btn-xs" onClick={() => unlinkSite(s.id)}>Unlink</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
