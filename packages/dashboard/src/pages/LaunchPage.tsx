import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings, useFeatures } from '../context/SettingsContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import CountdownTimer from '../components/CountdownTimer';
import { apiFetch } from '../utils/api';

interface Product {
  id: string;
  name: string;
  category?: string;
  tags?: string[];
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
  const { isAuthenticated, login } = useAuth();
  const { appMode, cardLayout, loading: settingsLoading } = useSettings();
  const isLocal = appMode === 'local';
  const canLaunch = isAuthenticated || isLocal;
  const [siteReady, setSiteReady] = useState(true);

  // Auth is handled via httpOnly cookies sent with credentials: 'include'
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [result, setResult] = useState<SiteResult | null>(null);
  const [error, setError] = useState('');
  const [provisionProgress, setProvisionProgress] = useState(0);
  const expiresIn = isLocal ? 'never' : '';

  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>(canLaunch ? 'launch' : 'email');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Scheduled launch
  const features = useFeatures();
  const canSchedule = features.scheduledLaunch && !isLocal;
  const [scheduleModal, setScheduleModal] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState('');

  async function handleSchedule(productId: string) {
    if (!scheduleDate || !scheduleTime) return;
    setScheduling(true);
    setScheduleMsg('');
    try {
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      const res = await apiFetch('/api/sites/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, scheduledAt }),
      });
      if (res.ok) {
        setScheduleMsg('Site scheduled successfully!');
        setTimeout(() => { setScheduleModal(null); setScheduleMsg(''); }, 2000);
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        setScheduleMsg(err.error || 'Failed to schedule');
      }
    } catch {
      setScheduleMsg('Failed to schedule');
    } finally {
      setScheduling(false);
    }
  }

  // Derive categories from products
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];
  const filteredProducts = products.filter(p => {
    if (filterCategory && p.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = p.branding?.description?.toLowerCase().includes(q);
      const matchTags = p.tags?.some(t => t.toLowerCase().includes(q));
      if (!matchName && !matchDesc && !matchTags) return false;
    }
    return true;
  });

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
    apiFetch(isLocal ? '/api/templates' : '/api/products')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => {
        setProducts([]);
        setFetchError('Failed to load products. Please refresh the page.');
      });
  }, [settingsLoading, isLocal]);

  async function handleEmailSubmit() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/register', {
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
      const res = await apiFetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      login(data.user);
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
      const res = await apiFetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, ...(expiresIn ? { expiresIn } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to create demo site (HTTP ${res.status})`);
      }
      const site = await res.json().catch(() => null);
      if (!site) throw new Error('Invalid response from server');
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
    const maxAttempts = 120; // 120 x 3s = 360s max (large plugin/theme installs need longer)
    const expectedAttempts = 15; // typical ready in ~45s
    setProvisionProgress(0);
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      // Progress: fast to 80%, then slow crawl to 95%
      const pct = i < expectedAttempts
        ? Math.min(80, ((i + 1) / expectedAttempts) * 80)
        : 80 + Math.min(15, (i - expectedAttempts) * 0.7);
      setProvisionProgress(Math.round(pct));
      try {
        const res = await apiFetch(`/api/sites/${siteId}/ready`);
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
        <p className="lp-stage-text">
          {stageText}
        </p>
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill-real"
            style={{ width: `${provisionProgress}%` }}
          />
        </div>
        <p className="lp-progress-pct">
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
            <div className="result-icon lp-result-icon-warning">&#9888;</div>
            <h3>Site is still setting up...</h3>
            <p className="lp-result-warning-text">
              WordPress is still installing plugins and themes. This can take a few minutes for larger setups. Please wait a moment before clicking login.
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

        <p className="lp-expires-text">
          Expires in: <CountdownTimer expiresAt={result.expiresAt} />
        </p>

        <div className="lp-result-actions">
          <button
            className="btn btn-primary btn-lg"
            onClick={async () => {
              try {
                const res = await apiFetch(`/api/sites/${result.id}/autologin`, { method: 'POST' });
                if (res.ok) {
                  const data = await res.json();
                  window.open(data.autoLoginUrl, '_blank');
                } else {
                  window.open(result.adminUrl, '_blank');
                }
              } catch {
                window.open(result.adminUrl, '_blank');
              }
            }}
          >
            One Click Login
          </button>
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
        <h2 className="lp-check-email-title">Check your email</h2>
        <p className="lp-check-email-desc">
          We've sent a verification link to <strong>{email}</strong>.
          <br />
          Click the link to verify your email and start your demo.
        </p>
        <div className="lp-check-email-actions">
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
          <div className="lp-fetch-error">
            {fetchError}
          </div>
        )}
        {/* Category filter + search (only show if there are categories or multiple products) */}
        {(categories.length > 0 || products.length > 3) && (
          <div className="lp-filter-bar">
            {products.length > 3 && (
              <input
                type="text"
                id="product-search"
                name="product-search"
                placeholder="Search products..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="lp-search-input"
              />
            )}
            {categories.length > 0 && (
              <>
                <button
                  className={`btn btn-xs ${!filterCategory ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setFilterCategory('')}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    className={`btn btn-xs ${filterCategory === cat ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
                  >
                    {cat}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <div className={`product-grid ${cardLayout === 'compact' ? 'product-grid-compact' : ''}`}>
          {filteredProducts.length === 0 && !fetchError && (
            <div className="card empty-state">
              <h3>No {isLocal ? 'templates' : 'products'} available</h3>
              <p>{isLocal
                ? 'Add template JSON files to the templates/ directory.'
                : 'Ask your administrator to configure products.'
              }</p>
            </div>
          )}
          {cardLayout === 'compact' ? (
            filteredProducts.map((product) => (
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
                <div className="lp-compact-actions">
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
                  {canSchedule && (
                    <button
                      className="btn btn-outline btn-sm lp-schedule-btn-compact"
                      title="Schedule for later"
                      onClick={() => { setScheduleModal(product.id); setScheduleDate(''); setScheduleTime(''); setScheduleMsg(''); }}
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            filteredProducts.map((product) => (
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
                      className="product-card-icon-overlay lp-icon-overlay"
                    />
                  )}
                </div>
                <div className="product-card-body">
                  <h3 className="product-card-title">{product.name}</h3>
                  {product.branding?.description && (
                    <p className="product-card-desc">{product.branding.description}</p>
                  )}
                  <div className="lp-card-btn-row">
                    <button
                      className="btn btn-primary lp-launch-btn-flex"
                      onClick={() => isLocal ? navigate(`/create?template=${product.id}`) : handleLaunch(product.id)}
                      disabled={!isLocal && launchingId !== null}
                    >
                      {launchingId === product.id ? (
                        <><span className="spinner" /> Launching...</>
                      ) : (
                        isLocal ? 'Create Site' : 'Launch Demo'
                      )}
                    </button>
                    {canSchedule && (
                      <button
                        className="btn btn-outline lp-schedule-btn-full"
                        title="Schedule for later"
                        onClick={() => { setScheduleModal(product.id); setScheduleDate(''); setScheduleTime(''); setScheduleMsg(''); }}
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Schedule Modal */}
        {scheduleModal && (
          <div className="lp-modal-overlay">
            <div className="card lp-modal-card">
              <h3 className="lp-modal-title">Schedule Launch</h3>
              <p className="lp-modal-desc">
                Schedule <strong>{products.find(p => p.id === scheduleModal)?.name || scheduleModal}</strong> to launch automatically at a future time.
              </p>
              <div className="lp-modal-datetime-row">
                <div className="lp-modal-field">
                  <label className="lp-modal-field-label">Date</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    max={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                    className="lp-modal-field-input"
                  />
                </div>
                <div className="lp-modal-field">
                  <label className="lp-modal-field-label">Time</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="lp-modal-field-input"
                  />
                </div>
              </div>
              <div className="lp-modal-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSchedule(scheduleModal)}
                  disabled={scheduling || !scheduleDate || !scheduleTime}
                >
                  {scheduling ? <><span className="spinner spinner-sm" /> Scheduling...</> : 'Schedule Launch'}
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => setScheduleModal(null)}>Cancel</button>
                {scheduleMsg && (
                  <span className="lp-schedule-msg" style={{ color: scheduleMsg.startsWith('Failed') || scheduleMsg.startsWith('Scheduled time') ? '#ef4444' : '#22c55e' }}>
                    {scheduleMsg}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step: Email (not authenticated)
  return (
    <div className="card auth-card lp-auth-card">
      <div className="lp-auth-header">
        <h2 className="lp-auth-title">
          {localStorage.getItem('pendingProductLaunch') ? 'Sign in to Launch' : 'Launch a Demo Site'}
        </h2>
        <p className="lp-auth-subtitle">
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
        className="btn btn-primary btn-lg lp-auth-submit"
        onClick={handleEmailSubmit}
        disabled={loading || !email}
      >
        {loading ? (
          <><span className="spinner" /> Sending...</>
        ) : (
          'Continue'
        )}
      </button>

      <p className="lp-auth-footer">
        Already have an account?{' '}
        <a href="/login">Log in</a>
      </p>
    </div>
  );
}
