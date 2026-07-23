import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { apiFetch } from '../utils/api';

export default function LoginPage() {
  const { login } = useAuth();
  const { panel } = useSettings();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      login(data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <div className="mb-6 text-center">
          <h2 className="text-lg font-semibold text-card-foreground">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {localStorage.getItem('pendingProductLaunch')
              ? 'Log in to launch your demo site'
              : 'Log in to manage your demo sites'}
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" size="lg" type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Logging in...
              </>
            ) : (
              'Log In'
            )}
          </Button>
        </form>

        {/* Only offered when the install actually accepts sign-ups; otherwise
            accounts arrive by invitation and this would be a dead end. */}
        {panel['panel.publicRegistration'] === 'true' && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
              Sign up with email
            </Link>
          </p>
        )}

        {panel['panel.demoPortalEnabled'] === 'true' && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Just looking?{' '}
            <Link to="/demo" className="font-medium text-primary underline-offset-4 hover:underline">
              Try a demo site
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
