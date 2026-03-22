import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';

export default function LoginPage() {
  const { login } = useAuth();
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
    <div className="card auth-card login-card">
      <div className="login-header">
        <h2 className="login-title">Welcome back</h2>
        <p className="login-subtitle">
          {localStorage.getItem('pendingProductLaunch')
            ? 'Log in to launch your demo site'
            : 'Log in to manage your demo sites'}
        </p>
      </div>

      <form onSubmit={handleLogin}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
          />
        </div>

        {error && <div className="alert-error">{error}</div>}

        <button className="btn btn-primary btn-lg login-submit" type="submit" disabled={loading}>
          {loading ? <><span className="spinner" /> Logging in...</> : 'Log In'}
        </button>
      </form>

      <p className="login-footer">
        Don't have an account?{' '}
        <a href="/">Sign up with email</a>
      </p>
    </div>
  );
}
