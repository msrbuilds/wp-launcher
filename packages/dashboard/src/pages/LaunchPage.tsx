import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import CountdownTimer from '../components/CountdownTimer';

interface Product {
  id: string;
  name: string;
  branding?: {
    description?: string;
    image_url?: string;
    logo_url?: string;
    icon_url?: string;
  };
}

interface SiteResult {
  id: string;
  url: string;
  adminUrl: string;
  autoLoginUrl?: string;
  credentials: { username: string; password: string };
  expiresAt: string;
  status: string;
}

type Step = 'email' | 'check-email' | 'launch' | 'provisioning' | 'result';

export default function LaunchPage() {
  const { isAuthenticated, token, login } = useAuth();
  const { appMode, loading: settingsLoading } = useSettings();
  const isLocal = appMode === 'local';
  const adminApiKey = sessionStorage.getItem('adminApiKey');
  const isAdmin = !!adminApiKey;
  const canLaunch = isAuthenticated || isLocal || isAdmin;
  const [siteReady, setSiteReady] = useState(true);

  function authHeaders(): Record<string, string> {
    if (token) return { Authorization: `Bearer ${token}` };
    if (adminApiKey) return { 'X-API-Key': adminApiKey };
    return {};
  }
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [cardLayout, setCardLayout] = useState<'full' | 'compact'>('full');
  const [loading, setLoading] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [result, setResult] = useState<SiteResult | null>(null);
  const [error, setError] = useState('');
  const [provisionProgress, setProvisionProgress] = useState(0);
  const expiresIn = isLocal ? 'never' : '';

  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>(canLaunch ? 'launch' : 'email');

  useEffect(() => {
    const verifyToken = searchParams.get('token');
    if (verifyToken) {
      handleVerify(verifyToken);
      setSearchParams({}, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (canLaunch && (step === 'email' || step === 'check-email')) {
      setStep('launch');
    }
  }, [canLaunch]);

  // Auto-launch pending product (from /launch/:productId URL)
  useEffect(() => {
    if (!canLaunch || step !== 'launch' || launchingId || result) return;
    if (products.length === 0) return; // wait for products to load
    const pending = localStorage.getItem('pendingProductLaunch');
    if (!pending) return;
    localStorage.removeItem('pendingProductLaunch');
    const found = products.find((p) => p.id === pending);
    if (found) handleLaunch(found.id);
  }, [isAuthenticated, step, products, launchingId, result]);

  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (settingsLoading) return;
    setFetchError('');
    fetch(isLocal ? '/api/templates' : '/api/products')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => {
        setProducts([]);
        setFetchError('Failed to load products. Please refresh the page.');
      });
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.cardLayout) setCardLayout(data.cardLayout);
      })
      .catch(() => {});
  }, [settingsLoading, isLocal]);

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
    setSiteReady(true);
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ productId, ...(expiresIn ? { expiresIn } : {}) }),
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
    const maxAttempts = 60; // 60 x 2s = 120s max (MySQL sites need longer)
    const expectedAttempts = 10; // typical ready in ~20s
    setProvisionProgress(0);
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      // Progress: fast to 80%, then slow crawl to 95%
      const pct = i < expectedAttempts
        ? Math.min(80, ((i + 1) / expectedAttempts) * 80)
        : 80 + Math.min(15, (i - expectedAttempts) * 0.7);
      setProvisionProgress(Math.round(pct));
      try {
        const res = await fetch(`/api/sites/${siteId}/ready`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        if (data.ready) {
          setProvisionProgress(100);
          await new Promise((r) => setTimeout(r, 400)); // brief pause at 100%
          setSiteReady(true);
          setStep('result');
          return;
        }
      } catch {
        // ignore fetch errors, keep polling
      }
    }
    // Timed out — show result but with warning
    setProvisionProgress(100);
    setSiteReady(false);
    setStep('result');
  }

  // Step: Provisioning
  if (step === 'provisioning' && result) {
    const stageText = provisionProgress < 20
      ? 'Starting container...'
      : provisionProgress < 50
      ? 'Installing WordPress...'
      : provisionProgress < 80
      ? 'Configuring plugins & themes...'
      : provisionProgress < 100
      ? 'Almost ready...'
      : 'Done!';

    return (
      <div className="card site-result">
        <span className="spinner spinner-hero" />
        <h3>Setting up your demo site...</h3>
        <p style={{ color: '#64748b', margin: '0.5rem 0 0.25rem', fontSize: '0.95rem' }}>
          {stageText}
        </p>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill-real"
            style={{ width: `${provisionProgress}%` }}
          />
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          {provisionProgress}%
        </p>
      </div>
    );
  }

  // Step: Result
  if (step === 'result' && result) {
    function copyToClipboard(text: string, e: React.MouseEvent) {
      navigator.clipboard.writeText(text);
      const btn = e.currentTarget as HTMLButtonElement;
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    }

    return (
      <div className="card site-result">
        {siteReady ? (
          <>
            <div className="result-icon">&#10003;</div>
            <h3>Your demo site is ready!</h3>
          </>
        ) : (
          <>
            <div className="result-icon" style={{ background: '#fef3c7', color: '#d97706' }}>&#9888;</div>
            <h3>Site is still setting up...</h3>
            <p style={{ color: '#92400e', fontSize: '0.875rem', margin: '0 0 1rem' }}>
              WordPress is still installing. This can take up to 2 minutes for MySQL sites. Please wait a moment before clicking login.
            </p>
          </>
        )}

        <div className="cred-rows">
          <div className="cred-row">
            <span className="cred-label">Site URL</span>
            <span className="cred-value">
              <a href={result.url} target="_blank" rel="noopener noreferrer">{result.url}</a>
            </span>
            <button className="cred-copy" onClick={(e) => copyToClipboard(result.url, e)} title="Copy">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </div>
          <div className="cred-row">
            <span className="cred-label">Admin URL</span>
            <span className="cred-value">
              <a href={result.adminUrl} target="_blank" rel="noopener noreferrer">{result.adminUrl}</a>
            </span>
            <button className="cred-copy" onClick={(e) => copyToClipboard(result.adminUrl, e)} title="Copy">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </div>
          <div className="cred-row">
            <span className="cred-label">Username</span>
            <span className="cred-value"><code>{result.credentials.username}</code></span>
            <button className="cred-copy" onClick={(e) => copyToClipboard(result.credentials.username, e)} title="Copy">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </div>
          <div className="cred-row">
            <span className="cred-label">Password</span>
            <span className="cred-value"><code>{result.credentials.password}</code></span>
            <button className="cred-copy" onClick={(e) => copyToClipboard(result.credentials.password, e)} title="Copy">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </div>
        </div>

        <p style={{ margin: '1.25rem 0', fontSize: '0.875rem', color: '#64748b' }}>
          Expires in: <CountdownTimer expiresAt={result.expiresAt} />
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <a
            href={result.autoLoginUrl || result.adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-lg"
          >
            One Click Login
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

  // Step: Launch (authenticated or admin)
  if (step === 'launch' && canLaunch) {
    return (
      <div>
        <div className="hero">
          <h2>{isLocal ? 'Create a WordPress Site' : 'Launch a Demo Site'}</h2>
          <p>{isLocal
            ? 'Spin up a fully functional WordPress instance from a template.'
            : 'Spin up a fully configured WordPress instance in seconds. Pick a product below to get started.'
          }</p>
        </div>


        {error && <div className="alert-error">{error}</div>}

        {fetchError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem' }}>
            {fetchError}
          </div>
        )}
        <div className={`product-grid ${cardLayout === 'compact' ? 'product-grid-compact' : ''}`}>
          {products.length === 0 && !fetchError && (
            <div className="card empty-state">
              <h3>No {isLocal ? 'templates' : 'products'} available</h3>
              <p>{isLocal
                ? 'Add template JSON files to the templates/ directory.'
                : 'Ask your administrator to configure products.'
              }</p>
            </div>
          )}
          {cardLayout === 'compact' ? (
            products.map((product) => (
              <div key={product.id} className="product-card-compact card">
                <div className="product-compact-icon">
                  {(product.branding?.logo_url || product.branding?.image_url) ? (
                    <img src={product.branding?.logo_url || product.branding?.image_url} alt={product.name} />
                  ) : (
                    <div className="product-compact-placeholder">
                      {product.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="product-compact-info">
                  <h3 className="product-compact-name">{product.name}</h3>
                  {product.branding?.description && (
                    <p className="product-compact-desc">{product.branding.description}</p>
                  )}
                </div>
                <button
                  className="btn btn-primary btn-compact-launch"
                  onClick={() => isLocal ? navigate(`/create?template=${product.id}`) : handleLaunch(product.id)}
                  disabled={!isLocal && launchingId !== null}
                >
                  {launchingId === product.id ? (
                    <><span className="spinner" /> Launching...</>
                  ) : (
                    isLocal ? 'Create Site' : 'Launch Demo'
                  )}
                </button>
              </div>
            ))
          ) : (
            products.map((product) => (
              <div key={product.id} className="product-card card">
                <div className="product-card-image">
                  {product.branding?.image_url ? (
                    <img src={product.branding.image_url} alt={product.name} />
                  ) : product.branding?.logo_url ? (
                    <img src={product.branding.logo_url} alt={product.name} />
                  ) : (
                    <div className="product-card-placeholder">
                      {product.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {product.branding?.image_url && product.branding?.logo_url && (
                    <img
                      src={product.branding.logo_url}
                      alt=""
                      className="product-card-icon-overlay"
                      style={{ position: 'absolute', bottom: '8px', right: '8px', width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', background: '#fff' }}
                    />
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
                    onClick={() => isLocal ? navigate(`/create?template=${product.id}`) : handleLaunch(product.id)}
                    disabled={!isLocal && launchingId !== null}
                  >
                    {launchingId === product.id ? (
                      <><span className="spinner" /> Launching...</>
                    ) : (
                      isLocal ? 'Create Site' : 'Launch Demo'
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // Step: Email (not authenticated)
  return (
    <div className="card auth-card" style={{ padding: '2rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.375rem' }}>
          {localStorage.getItem('pendingProductLaunch') ? 'Sign in to Launch' : 'Launch a Demo Site'}
        </h2>
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
