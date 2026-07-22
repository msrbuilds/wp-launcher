import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';

const WRAP = 'flex min-h-screen items-center justify-center bg-background p-6';
const CARD = 'w-full max-w-sm rounded-xl border border-border bg-card p-6';

export default function VerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'set-password' | 'success' | 'error'>('verifying');
  const [error, setError] = useState('');
  const [passwordSetToken, setPasswordSetToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setError('No verification token provided');
      return;
    }

    apiFetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error);

        if (data.needsPassword) {
          setPasswordSetToken(data.passwordSetToken);
          setStatus('set-password');
        } else {
          login(data.user);
          setStatus('success');
        }
      })
      .catch((err) => {
        setStatus('error');
        setError(err.message);
      });
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSettingPassword(true);
    setError('');

    try {
      const res = await apiFetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordSetToken, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      login(data.user);
      setStatus('success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSettingPassword(false);
    }
  };

  if (status === 'verifying') {
    return (
      <div className={WRAP}>
        <div className={`${CARD} flex items-center justify-center gap-2 text-sm text-muted-foreground`}>
          <Loader2 className="h-4 w-4 animate-spin" /> Verifying your email...
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={WRAP}>
        <div className={`${CARD} text-center`}>
          <h3 className="text-lg font-semibold text-destructive">Verification Failed</h3>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4 w-full" onClick={() => navigate('/')}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'set-password') {
    return (
      <div className={WRAP}>
        <div className={CARD}>
          <h3 className="text-lg font-semibold text-card-foreground">Email Verified!</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Set a password to complete your account setup.
          </p>

          <form onSubmit={handleSetPassword} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                required
                minLength={8}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={settingPassword}>
              {settingPassword ? 'Setting password...' : 'Set Password & Continue'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={WRAP}>
      <div className={`${CARD} text-center`}>
        <h3 className="text-lg font-semibold text-card-foreground">You're all set!</h3>

        <p className="mt-2 text-sm text-muted-foreground">
          You're now logged in and can launch your demo site.
        </p>

        <Button className="mt-4 w-full" onClick={() => navigate('/')}>
          {localStorage.getItem('pendingProductLaunch') ? 'Continue to Launch' : 'Launch Demo Site'}
        </Button>
      </div>
    </div>
  );
}
