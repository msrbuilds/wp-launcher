import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import CountdownTimer from '../components/CountdownTimer';

interface Product {
  id: string;
  name: string;
  branding?: {
    description?: string;
    image_url?: string;
    logo_url?: string;
  };
}

interface SiteResult {
  id: string;
  url: string;
  adminUrl: string;
  credentials: { username: string; password: string };
  expiresAt: string;
  status: string;
}

type Step = 'email' | 'check-email' | 'launch' | 'provisioning' | 'result';

export default function LaunchPage() {
  const { isAuthenticated, token, login } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [result, setResult] = useState<SiteResult | null>(null);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>(isAuthenticated ? 'launch' : 'email');

  useEffect(() => {
    const verifyToken = searchParams.get('token');
    if (verifyToken) {
      handleVerify(verifyToken);
      setSearchParams({}, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && (step === 'email' || step === 'check-email')) {
      setStep('launch');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => setProducts([]));
  }, []);

  async function handleEmailSubmit() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep('check-email');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(verifyToken: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      login(data.token, data.user);
      setStep('launch');
    } catch (err: any) {
      setError(err.message);
      setStep('email');
    } finally {
      setLoading(false);
    }
  }

  async function handleLaunch(productId: string) {
    setLaunchingId(productId);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create demo site');
      }
      const site = await res.json();
      setResult(site);
      setStep('provisioning');
      pollUntilReady(site.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLaunchingId(null);
    }
  }

  async function pollUntilReady(siteId: string) {
    const maxAttempts = 30; // 30 x 2s = 60s max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/sites/${siteId}/ready`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ready) {
          setStep('result');
          return;
        }
      } catch {
        // ignore fetch errors, keep polling
      }
    }
    // After max attempts, show result anyway
    setStep('result');
  }

  // Step: Provisioning
  if (step === 'provisioning' && result) {
    return (
      <div className="card site-result">
        <div className="result-icon" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}>
          <span className="spinner" style={{ width: '1.5rem', height: '1.5rem' }} />
        </div>
        <h3>Setting up your demo site...</h3>
        <p style={{ color: '#64748b', margin: '1rem 0', fontSize: '0.95rem' }}>
          WordPress is being installed and configured. This usually takes 10–15 seconds.
        </p>
        <div className="progress-bar-track">
          <div className="progress-bar-fill" />
        </div>
      </div>
    );
  }

  // Step: Result
  if (step === 'result' && result) {
    return (
      <div className="card site-result">
        <div className="result-icon">&#10003;</div>
        <h3>Your demo site is ready!</h3>

        <div className="url-box">
          <a href={result.url} target="_blank" rel="noopener noreferrer">
            {result.url}
          </a>
        </div>

        <div className="credentials">
          <strong>Admin Login:</strong>{' '}
          <a href={result.adminUrl} target="_blank" rel="noopener noreferrer">
            {result.adminUrl}
          </a>
          <br />
          Username: <code>{result.credentials.username}</code> &bull; Password:{' '}
          <code>{result.credentials.password}</code>
        </div>

        <p style={{ margin: '1.25rem 0', fontSize: '0.875rem', color: '#64748b' }}>
          Expires in: <CountdownTimer expiresAt={result.expiresAt} />
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <a
            href={result.adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-lg"
          >
            Open WP Admin
          </a>
          <button className="btn btn-secondary btn-lg" onClick={() => { setResult(null); setStep('launch'); }}>
            Back to Products
          </button>
        </div>
      </div>
    );
  }

  // Step: Check email
  if (step === 'check-email') {
    return (
      <div className="card check-email">
        <div className="check-email-icon">&#9993;</div>
        <h2 style={{ marginBottom: '0.5rem', fontSize: '1.35rem', fontWeight: 700 }}>Check your email</h2>
        <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          We've sent a verification link to <strong>{email}</strong>.
          <br />
          Click the link to verify your email and start your demo.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={() => { setStep('email'); setError(''); }}
          >
            Use a different email
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleEmailSubmit}
            disabled={loading}
          >
            Resend email
          </button>
        </div>
      </div>
    );
  }

  // Step: Launch (authenticated)
  if (step === 'launch' && isAuthenticated) {
    return (
      <div>
        <div className="hero">
          <h2>Launch a Demo Site</h2>
          <p>Spin up a fully configured WordPress instance in seconds. Pick a product below to get started.</p>
        </div>

        {error && <div className="alert-error">{error}</div>}

        <div className="product-grid">
          {products.length === 0 && (
            <div className="card empty-state">
              <h3>No products available</h3>
              <p>Ask your administrator to configure products.</p>
            </div>
          )}
          {products.map((product) => (
            <div key={product.id} className="product-card card">
              <div className="product-card-image">
                {product.branding?.image_url ? (
                  <img src={product.branding.image_url} alt={product.name} />
                ) : (
                  <div className="product-card-placeholder">
                    {product.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="product-card-body">
                <h3 className="product-card-title">{product.name}</h3>
                {product.branding?.description && (
                  <p className="product-card-desc">{product.branding.description}</p>
                )}
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => handleLaunch(product.id)}
                  disabled={launchingId !== null}
                >
                  {launchingId === product.id ? (
                    <><span className="spinner" /> Launching...</>
                  ) : (
                    'Launch Demo'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Step: Email (not authenticated)
  return (
    <div className="card auth-card" style={{ padding: '2rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.375rem' }}>Launch a Demo Site</h2>
        <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
          Enter your email to get started. We'll send you a verification link.
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="email">Email Address</label>
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && email && handleEmailSubmit()}
        />
      </div>

      {error && <div className="alert-error">{error}</div>}

      <button
        className="btn btn-primary btn-lg"
        style={{ width: '100%' }}
        onClick={handleEmailSubmit}
        disabled={loading || !email}
      >
        {loading ? (
          <><span className="spinner" /> Sending...</>
        ) : (
          'Continue'
        )}
      </button>

      <p style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>
        Already have an account?{' '}
        <a href="/login">Log in</a>
      </p>
    </div>
  );
}
