import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function VerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);

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

        login(data.token, data.user);
        setTempPassword(data.tempPassword || null);
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setError(err.message);
      });
  }, []);

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

  return (
    <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
      <h3 style={{ color: '#166534', marginBottom: '1rem' }}>Email Verified!</h3>

      {tempPassword && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
          padding: '1rem', margin: '1rem auto', maxWidth: '320px', textAlign: 'left',
        }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Your temporary password:</p>
          <code style={{ background: '#fef3c7', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '1.1rem' }}>
            {tempPassword}
          </code>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#92400e' }}>
            Save this! You can change it in Account settings.
          </p>
        </div>
      )}

      <p style={{ color: '#64748b', marginBottom: '1rem' }}>
        You're now logged in and can launch your demo site.
      </p>

      <button className="btn btn-primary" onClick={() => navigate('/')}>
        Launch Demo Site
      </button>
    </div>
  );
}
