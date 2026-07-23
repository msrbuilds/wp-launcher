import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Package, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '../context/SettingsContext';
import { apiFetch } from '../utils/api';

interface PublicBlueprint {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
}

export default function DemoPortalPage() {
  const { branding, loading: settingsLoading } = useSettings();
  const navigate = useNavigate();
  const [blueprints, setBlueprints] = useState<PublicBlueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    apiFetch('/api/public/blueprints')
      .then(async (res) => {
        if (res.status === 404) { setDisabled(true); return; }
        const data = await res.json();
        setBlueprints(data.blueprints || []);
      })
      .catch(() => setDisabled(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading || settingsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold text-card-foreground">Demos aren’t available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This panel isn’t offering public demo sites right now.
          </p>
          <Button asChild className="mt-4 w-full">
            <Link to="/login">Go to login</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center gap-3 border-b border-border px-6">
        {branding.logoUrl
          ? <img src={branding.logoUrl} alt="" className="h-6 w-6 rounded" />
          : <div className="h-6 w-6 rounded bg-primary" />}
        <span className="text-sm font-semibold text-foreground">{branding.siteTitle}</span>
        <div className="ml-auto">
          <Button asChild variant="outline" size="sm">
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground">Try a live WordPress demo</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Pick a setup below and we’ll spin up a private WordPress site for you. Verify your email
            and it’s yours to explore.
          </p>
        </div>

        {blueprints.length === 0 ? (
          <div className="mt-10 rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No demos have been published yet.
          </div>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {blueprints.map((b) => (
              <div key={b.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex h-32 items-center justify-center bg-muted/40">
                  {b.imageUrl
                    ? <img src={b.imageUrl} alt="" className="h-full w-full object-cover" />
                    : <Package className="h-9 w-9 text-muted-foreground" strokeWidth={1.5} />}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <h2 className="text-sm font-semibold text-card-foreground">{b.name}</h2>
                  <p className="flex-1 text-sm text-muted-foreground">
                    {b.description || 'A ready-to-explore WordPress site.'}
                  </p>
                  <Button className="mt-2 w-full" onClick={() => navigate(`/signup?blueprint=${encodeURIComponent(b.id)}`)}>
                    <Rocket className="h-4 w-4" />
                    Launch demo
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
