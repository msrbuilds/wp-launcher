import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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

    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error);

        if (data.needsPassword) {
          // New user — show password-set form
          setPasswordSetToken(data.passwordSetToken);
          setStatus('set-password');
        } else {
          // Returning user — logged in via magic link
          login(data.token, data.user);
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
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwordSetToken, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      login(data.token, data.user);
      setStatus('success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSettingPassword(false);
    }
  };

  if (status === 'verifying') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <span className="spinner" /> Verifying your email...
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <h3 style={{ color: '#dc2626', marginBottom: '1rem' }}>Verification Failed</h3>
        <p style={{ color: '#64748b' }}>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>
          Try Again
        </button>
      </div>
    );
  }

  if (status === 'set-password') {
    return (
      <div className="card" style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
        <h3 style={{ color: '#166534', marginBottom: '0.5rem', textAlign: 'center' }}>Email Verified!</h3>
        <p style={{ color: '#64748b', marginBottom: '1.5rem', textAlign: 'center' }}>
          Set a password to complete your account setup.
        </p>

        <form onSubmit={handleSetPassword}>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="confirmPassword" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              required
              minLength={8}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
            />
          </div>

          {error && (
            <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={settingPassword}
            style={{ width: '100%' }}
          >
            {settingPassword ? 'Setting password...' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
      <h3 style={{ color: '#166534', marginBottom: '1rem' }}>You're all set!</h3>

      <p style={{ color: '#64748b', marginBottom: '1rem' }}>
        You're now logged in and can launch your demo site.
      </p>

      <button className="btn btn-primary" onClick={() => navigate('/')} >
        {localStorage.getItem('pendingProductLaunch') ? 'Continue to Launch' : 'Launch Demo Site'}
      </button>
    </div>
  );
}
