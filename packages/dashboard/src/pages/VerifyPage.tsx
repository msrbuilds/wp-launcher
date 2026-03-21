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
      credentials: 'include',
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
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        credentials: 'include',
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
      <div className="card verify-card">
        <span className="spinner" /> Verifying your email...
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card verify-card">
        <h3 className="verify-error-title">Verification Failed</h3>
        <p className="verify-error-text">{error}</p>
        <button className="btn btn-primary verify-error-btn" onClick={() => navigate('/')}>
          Try Again
        </button>
      </div>
    );
  }

  if (status === 'set-password') {
    return (
      <div className="card verify-password-card">
        <h3 className="verify-success-title">Email Verified!</h3>
        <p className="verify-success-text">
          Set a password to complete your account setup.
        </p>

        <form onSubmit={handleSetPassword}>
          <div className="verify-form-group">
            <label htmlFor="password" className="verify-form-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="verify-form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
          </div>
          <div className="verify-form-group">
            <label htmlFor="confirmPassword" className="verify-form-label">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              className="verify-form-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              required
              minLength={8}
            />
          </div>

          {error && (
            <p className="verify-form-error">{error}</p>
          )}

          <button
            type="submit"
            className="btn btn-primary verify-form-submit"
            disabled={settingPassword}
          >
            {settingPassword ? 'Setting password...' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="card verify-card">
      <h3 className="verify-done-title">You're all set!</h3>

      <p className="verify-done-text">
        You're now logged in and can launch your demo site.
      </p>

      <button className="btn btn-primary" onClick={() => navigate('/')} >
        {localStorage.getItem('pendingProductLaunch') ? 'Continue to Launch' : 'Launch Demo Site'}
      </button>
    </div>
  );
}
