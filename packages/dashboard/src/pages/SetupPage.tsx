import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordStrengthMeter } from '../components/PasswordStrengthMeter';
import { evaluatePassword } from '@/lib/password-strength';
import { apiFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const REDIRECT_DELAY_MS = 2500;
// The owner account is the panel's root of authority, so hold it to a higher
// bar than member passwords.
const MIN_OWNER_PASSWORD = 12;

export default function SetupPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { refresh } = useSettings();
  const [done, setDone] = useState(false);
  const [panelName, setPanelName] = useState('WP Launcher');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;
  const matches = confirm.length > 0 && confirm === password;
  // One minimum, passed to the meter too, so a password the button rejects can
  // never render as "Strong".
  const strongEnough = evaluatePassword(password, MIN_OWNER_PASSWORD).ok;
  const canSubmit = strongEnough && matches && email.length > 0 && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < MIN_OWNER_PASSWORD) {
      setError(`Password must be at least ${MIN_OWNER_PASSWORD} characters`);
      return;
    }
    if (!evaluatePassword(password).ok) {
      setError('Choose a stronger password');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, panelName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');
      login(data.user);
      // The gate in AppRoutes reads setupRequired from settings; without this
      // it still says "setup needed" and bounces straight back here.
      refresh();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => navigate('/', { replace: true }), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [done, navigate]);

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <Check className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-card-foreground">Your panel is ready</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are signed in as <strong className="font-medium text-foreground">{email}</strong>.
            Any sites that already existed on this install now belong to you.
          </p>
          <Button className="mt-4 w-full" onClick={() => navigate('/', { replace: true })}>
            Go to dashboard
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">Taking you there automatically…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <form
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6"
        onSubmit={handleSubmit}
      >
        <div>
          <h1 className="text-lg font-semibold text-card-foreground">Set up your panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This creates the owner account. It only happens once.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-2">
          <Label htmlFor="su-panel">Panel name</Label>
          <Input
            id="su-panel"
            value={panelName}
            onChange={(e) => setPanelName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="su-email">Your email</Label>
          <Input
            id="su-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="su-password">Password</Label>
          <Input
            id="su-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_OWNER_PASSWORD}
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={password} minLength={MIN_OWNER_PASSWORD} />
          <p className="text-xs text-muted-foreground">At least {MIN_OWNER_PASSWORD} characters.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="su-confirm">Confirm password</Label>
          <Input
            id="su-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={MIN_OWNER_PASSWORD}
            autoComplete="new-password"
            aria-invalid={mismatch}
          />
          {mismatch && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <X className="h-3.5 w-3.5" /> Passwords don't match
            </span>
          )}
          {matches && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="h-3.5 w-3.5" /> Passwords match
            </span>
          )}
        </div>

        <Button className="w-full" type="submit" disabled={!canSubmit}>
          {saving ? 'Creating owner…' : 'Create owner account'}
        </Button>
      </form>
    </div>
  );
}
