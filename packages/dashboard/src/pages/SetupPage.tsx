import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function SetupPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [panelName, setPanelName] = useState('WP Launcher');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters');
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
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="su-wrap">
      <form className="su-card card" onSubmit={handleSubmit}>
        <h1 className="su-title">Set up your panel</h1>
        <p className="su-lead">This creates the owner account. It only happens once.</p>

        {error && <div className="alert-error">{error}</div>}

        <div className="form-group">
          <label className="form-label" htmlFor="su-panel">Panel name</label>
          <input id="su-panel" className="form-input" value={panelName}
                 onChange={(e) => setPanelName(e.target.value)} required />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="su-email">Your email</label>
          <input id="su-email" className="form-input" type="email" value={email}
                 onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="su-password">Password</label>
          <input id="su-password" className="form-input" type="password" value={password}
                 onChange={(e) => setPassword(e.target.value)} required minLength={12}
                 autoComplete="new-password" />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="su-confirm">Confirm password</label>
          <input id="su-confirm" className="form-input" type="password" value={confirm}
                 onChange={(e) => setConfirm(e.target.value)} required minLength={12}
                 autoComplete="new-password" />
        </div>

        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Creating owner…' : 'Create owner account'}
        </button>
      </form>
    </div>
  );
}
