import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch } from '../../utils/api';

interface Project { id: string; name: string; description: string | null; status: string; created_at: string }
interface Card { id: string; title: string; description: string | null; due_date: string | null; labels: string }
interface Column { id: string; name: string; cards: Card[] }

function parseLabels(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l === 'string') : [];
  } catch {
    return [];
  }
}

function ProjectBoard({ id, onBack }: { id: string; onBack: () => void }) {
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/portal/projects/${id}`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        setName(data.project.name);
        setColumns(data.columns);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading...
    </p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{name}</h1>
        <Button variant="secondary" size="sm" onClick={onBack}>Back to projects</Button>
      </div>
      {columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          There is nothing to show on this project yet.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((column) => (
            <div key={column.id} className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
              <h2 className="text-sm font-medium">{column.name}</h2>
              {column.cards.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing here.</p>
              ) : column.cards.map((card) => (
                <div key={card.id} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-sm">{card.title}</p>
                  {card.description && <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>}
                  {(parseLabels(card.labels).length > 0 || card.due_date) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {parseLabels(card.labels).map((label) => (
                        <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
                      ))}
                      {card.due_date && (
                        <span className="text-xs text-muted-foreground">
                          due {new Date(`${card.due_date}T00:00:00Z`).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PortalProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/portal/projects')
      .then(async (res) => { if (res.ok) setProjects(await res.json()); })
      .finally(() => setLoading(false));
  }, []);

  if (openId) return <ProjectBoard id={openId} onBack={() => setOpenId(null)} />;

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading...
    </p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Your projects</h1>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => setOpenId(project.id)}
                className="w-full rounded-xl border border-border bg-card p-4 text-left text-card-foreground hover:border-primary"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{project.name}</span>
                  <Badge variant="secondary">{project.status}</Badge>
                </div>
                {project.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
