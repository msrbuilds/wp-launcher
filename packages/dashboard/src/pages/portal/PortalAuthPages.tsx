import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '../../utils/api';

/** Shared frame so both auth screens sit identically on the page. */
function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-card-foreground">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export function PortalLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        // Rendered verbatim: the API deliberately gives the same message for a
        // wrong password and an unknown address, and adding our own hint here
        // would undo that.
        setError((await res.json().catch(() => ({}))).error || 'Could not sign you in');
        return;
      }
      navigate('/portal/projects');
    } catch {
      setError('Could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Client portal" subtitle="Sign in to view your projects and invoices.">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1">
          <Label htmlFor="portal-email">Email</Label>
          <Input id="portal-email" type="email" autoComplete="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="portal-password">Password</Label>
          <Input id="portal-password" type="password" autoComplete="current-password" value={password}
                 onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</> : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}

export function PortalAcceptPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Those passwords do not match'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/portal/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || 'Could not set your password');
        return;
      }
      navigate('/portal/projects');
    } catch {
      setError('Could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Invitation link incomplete" subtitle="That link is missing its token.">
        <p className="text-sm text-muted-foreground">
          Open the link from your invitation email again, or ask for a new one.
        </p>
        <Link to="/portal" className="mt-4 block text-sm text-primary underline-offset-4 hover:underline">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set your password" subtitle="Choose a password to finish setting up your portal.">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1">
          <Label htmlFor="portal-new">New password</Label>
          <Input id="portal-new" type="password" autoComplete="new-password" value={password}
                 onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="portal-confirm">Confirm password</Label>
          <Input id="portal-confirm" type="password" autoComplete="new-password" value={confirm}
                 onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Set password and sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}
