import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSettings } from '../context/SettingsContext';
import { apiFetch } from '../utils/api';

const WRAP = 'flex min-h-screen items-center justify-center bg-background p-6';
const CARD = 'w-full max-w-sm rounded-xl border border-border bg-card p-6';

export default function SignupPage() {
  const { panel, loading } = useSettings();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Arriving from the demo portal: remember which blueprint to launch once the
  // account exists. VerifyPage hands off to the launcher after sign-in.
  useEffect(() => {
    const blueprint = searchParams.get('blueprint');
    if (blueprint) localStorage.setItem('pendingProductLaunch', blueprint);
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign-up failed');
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (loading) return null;

  if (panel['panel.publicRegistration'] !== 'true') {
    return (
      <div className={WRAP}>
        <div className={`${CARD} text-center`}>
          <h1 className="text-lg font-semibold text-card-foreground">Sign-ups are closed</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This panel is invite-only. Ask an administrator to send you an invitation.
          </p>
          <Button asChild className="mt-4 w-full">
            <Link to="/login">Back to login</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className={WRAP}>
        <div className={`${CARD} text-center`}>
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <MailCheck className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-card-foreground">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a verification link to <strong className="font-medium text-foreground">{email}</strong>.
            Open it to set a password and finish creating your account.
          </p>
          <Button asChild variant="outline" className="mt-4 w-full">
            <Link to="/login">Back to login</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={WRAP}>
      <div className={CARD}>
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-card-foreground">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {localStorage.getItem('pendingProductLaunch')
              ? 'Verify your email and your demo site will be ready to launch'
              : 'We’ll email you a link to verify and set a password'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="signup-email">Email</Label>
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" size="lg" type="submit" disabled={sending || !email.trim()}>
            {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</> : 'Continue'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
