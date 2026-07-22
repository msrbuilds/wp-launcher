import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAdminHeaders } from './AdminLayout';
import { apiFetch } from '../../utils/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

const PROJECT_STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  completed: 'secondary',
  'on-hold': 'outline',
  archived: 'outline',
};

const SITE_STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  running: 'default',
  creating: 'outline',
  expired: 'secondary',
  error: 'destructive',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const headers = useAdminHeaders();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [userSites, setUserSites] = useState<{ id: string; subdomain: string; status: string }[]>([]);
  const [selectedSite, setSelectedSite] = useState('');

  const fetchProject = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/projects/list/${id}`, { headers })
      .then(r => r.json())
      .then(data => { if (data.error) setProject(null); else setProject(data); })
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [id, headers]);

  const fetchSites = useCallback(() => {
    apiFetch('/api/sites', { headers })
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
      const res = await apiFetch(`/api/projects/list/${id}/sites`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
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
      const res = await apiFetch(`/api/projects/list/${id}/sites/${siteId}`, { method: 'DELETE', headers });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Failed'); return; }
      fetchProject();
    } catch { alert('Network error'); }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <p className="mb-4 text-sm text-muted-foreground">Project not found.</p>
        <Button variant="secondary" size="sm" onClick={() => navigate('/projects')}>Back</Button>
      </div>
    );
  }

  const linkedSiteIds = new Set(project.sites.map(s => s.id));
  const availableSites = userSites.filter(s => !linkedSiteIds.has(s.id));

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        className="mb-4"
        onClick={() => navigate('/projects')}
      >
        <ArrowLeft /> Back to Projects
      </Button>

      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">{project.name}</h3>
          <Badge variant={PROJECT_STATUS_VARIANTS[project.status] || 'secondary'}>
            {STATUS_LABELS[project.status] || project.status}
          </Badge>
        </div>
        {project.clientName && (
          <p className="text-sm text-muted-foreground">
            Client: <strong className="font-medium text-card-foreground">{project.clientName}</strong>
          </p>
        )}
        {project.description && <p className="mt-2 text-sm">{project.description}</p>}
        <p className="mt-2 text-sm text-muted-foreground">
          Created: {new Date(project.created_at + 'Z').toLocaleDateString()}
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-6 text-card-foreground">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-base font-semibold">Linked Sites ({project.sites.length})</h4>
        </div>
        {availableSites.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger className="min-w-0 flex-1 rounded-lg">
                <SelectValue placeholder="— Select a site to link —" />
              </SelectTrigger>
              <SelectContent>
                {availableSites.map(s => <SelectItem key={s.id} value={s.id}>{s.subdomain}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={linkSite} disabled={!selectedSite}>Link Site</Button>
          </div>
        )}
        {project.sites.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sites linked to this project yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subdomain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.sites.map(s => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.site_url ? (
                      <a
                        href={s.site_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {s.subdomain}
                      </a>
                    ) : s.subdomain}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SITE_STATUS_VARIANTS[s.status] || 'secondary'}>{s.status}</Badge>
                  </TableCell>
                  <TableCell>{new Date(s.created_at + 'Z').toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button variant="destructive" size="xs" onClick={() => unlinkSite(s.id)}>Unlink</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
