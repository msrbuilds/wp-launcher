import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

interface Template {
  id: string;
  name: string;
  database?: string;
  branding?: {
    description?: string;
    image_url?: string;
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

type Step = 'configure' | 'provisioning' | 'result';

const DB_OPTIONS = [
  { label: 'MySQL', value: 'mysql' },
  { label: 'MariaDB', value: 'mariadb' },
  { label: 'SQLite', value: 'sqlite' },
];

const PHP_OPTIONS = [
  { label: 'PHP 8.3 (Default)', value: '8.3' },
  { label: 'PHP 8.2', value: '8.2' },
  { label: 'PHP 8.1', value: '8.1' },
];

export default function LocalLaunchPage() {
  const { token } = useAuth();
  const { loading: settingsLoading } = useSettings();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [siteTitle, setSiteTitle] = useState('My WordPress Site');
  const [dbEngine, setDbEngine] = useState('mysql');
  const [phpVersion, setPhpVersion] = useState('8.3');
  const [adminUser, setAdminUser] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('admin');
  const [adminEmail, setAdminEmail] = useState('admin@localhost');

  const [step, setStep] = useState<Step>('configure');
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<SiteResult | null>(null);
  const [error, setError] = useState('');
  const [provisionProgress, setProvisionProgress] = useState(0);

  useEffect(() => {
    if (settingsLoading) return;
    fetch('/api/templates')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTemplates(data);
          if (data.length > 0) setSelectedTemplate(data[0].id);
        }
      })
      .catch(() => setTemplates([]));
  }, [settingsLoading]);

  // Sync DB engine when template changes
  useEffect(() => {
    const tmpl = templates.find((t) => t.id === selectedTemplate);
    if (tmpl?.database) {
      setDbEngine(tmpl.database);
    }
  }, [selectedTemplate, templates]);

  async function handleCreate() {
    setCreating(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: selectedTemplate,
          expiresIn: 'never',
          siteTitle,
          dbEngine,
          phpVersion,
          adminUser,
          adminPassword,
          adminEmail,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create site');
      }
      const site = await res.json();
      setResult(site);
      setStep('provisioning');
      pollUntilReady(site.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function pollUntilReady(siteId: string) {
    const maxAttempts = 30;
    const expectedAttempts = 8;
    setProvisionProgress(0);
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const pct = i < expectedAttempts
        ? Math.min(80, ((i + 1) / expectedAttempts) * 80)
        : 80 + Math.min(15, (i - expectedAttempts) * 2);
      setProvisionProgress(Math.round(pct));
      try {
        const res = await fetch(`/api/sites/${siteId}/ready`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ready) {
          setProvisionProgress(100);
          await new Promise((r) => setTimeout(r, 400));
          setStep('result');
          return;
        }
      } catch {
        // keep polling
      }
    }
    setProvisionProgress(100);
    setStep('result');
  }

  // Provisioning step
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
        <h3>Setting up your site...</h3>
        <p style={{ color: '#64748b', margin: '0.5rem 0 0.25rem', fontSize: '0.95rem' }}>
          {stageText}
        </p>
        <div className="progress-bar-track">
          <div className="progress-bar-fill-real" style={{ width: `${provisionProgress}%` }} />
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          {provisionProgress}%
        </p>
      </div>
    );
  }

  // Result step
  if (step === 'result' && result) {
    function copyToClipboard(text: string, e: React.MouseEvent) {
      navigator.clipboard.writeText(text);
      const btn = e.currentTarget as HTMLButtonElement;
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    }

    return (
      <div className="card site-result">
        <div className="result-icon">&#10003;</div>
        <h3>Your site is ready!</h3>

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

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.25rem' }}>
          <a
            href={result.autoLoginUrl || result.adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-lg"
          >
            One Click Login
          </a>
          <button className="btn btn-secondary btn-lg" onClick={() => { setResult(null); setStep('configure'); }}>
            Create Another
          </button>
        </div>
      </div>
    );
  }

  // Configure step (main form)
  return (
    <div className="local-launch-form">
      <div className="card" style={{ padding: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 700 }}>Create a WordPress Site</h3>
        <div className="form-columns">
          <div className="form-col">
            <div className="form-group">
              <label htmlFor="siteTitle">Site Title</label>
              <input
                id="siteTitle"
                type="text"
                value={siteTitle}
                onChange={(e) => setSiteTitle(e.target.value)}
                placeholder="My WordPress Site"
              />
            </div>
            <div className="form-group">
              <label htmlFor="template">Template</label>
              <select
                id="template"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="dbEngine">Database</label>
              <select
                id="dbEngine"
                value={dbEngine}
                onChange={(e) => setDbEngine(e.target.value)}
              >
                {DB_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="phpVersion">PHP Version</label>
              <select
                id="phpVersion"
                value={phpVersion}
                onChange={(e) => setPhpVersion(e.target.value)}
              >
                {PHP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-col">
            <div className="form-group">
              <label htmlFor="adminUser">Username</label>
              <input
                id="adminUser"
                type="text"
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div className="form-group">
              <label htmlFor="adminPassword">Password</label>
              <input
                id="adminPassword"
                type="text"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div className="form-group">
              <label htmlFor="adminEmail">Admin Email</label>
              <input
                id="adminEmail"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@localhost"
              />
            </div>
            {error && <div className="alert-error">{error}</div>}
            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 'auto' }}
              onClick={handleCreate}
              disabled={creating || !selectedTemplate}
            >
              {creating ? (
                <><span className="spinner" /> Creating...</>
              ) : (
                'Create Site'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
