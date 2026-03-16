import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  const { loading: settingsLoading } = useSettings();
  const [searchParams] = useSearchParams();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [siteTitle, setSiteTitle] = useState('My WordPress Site');
  const [dbEngine, setDbEngine] = useState('mysql');
  const [phpVersion, setPhpVersion] = useState('8.3');
  const [adminUser, setAdminUser] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('admin');
  const [adminEmail, setAdminEmail] = useState('admin@localhost.test');

  // PHP configuration
  const [showPhpConfig, setShowPhpConfig] = useState(false);
  const [phpMemoryLimit, setPhpMemoryLimit] = useState('256M');
  const [phpUploadMaxFilesize, setPhpUploadMaxFilesize] = useState('64M');
  const [phpPostMaxSize, setPhpPostMaxSize] = useState('64M');
  const [phpMaxExecutionTime, setPhpMaxExecutionTime] = useState('300');
  const [phpMaxInputVars, setPhpMaxInputVars] = useState('3000');
  const [phpDisplayErrors, setPhpDisplayErrors] = useState('On');
  const [phpExtensions, setPhpExtensions] = useState<string[]>([]);

  const AVAILABLE_EXTENSIONS = [
    { value: 'redis', label: 'Redis' },
    { value: 'xdebug', label: 'Xdebug' },
    { value: 'sockets', label: 'Sockets' },
    { value: 'calendar', label: 'Calendar' },
    { value: 'pcntl', label: 'PCNTL' },
    { value: 'ldap', label: 'LDAP' },
    { value: 'gettext', label: 'Gettext' },
  ];

  const [step, setStep] = useState<Step>('configure');
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<SiteResult | null>(null);
  const [error, setError] = useState('');
  const [provisionProgress, setProvisionProgress] = useState(0);

  useEffect(() => {
    if (settingsLoading) return;
    fetch('/api/templates', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTemplates(data);
          const templateParam = searchParams.get('template');
          const match = templateParam && data.find((t: Template) => t.id === templateParam);
          setSelectedTemplate(match ? match.id : data.length > 0 ? data[0].id : '');
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
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedTemplate,
          expiresIn: 'never',
          siteTitle,
          dbEngine,
          phpVersion,
          adminUser,
          adminPassword,
          adminEmail,
          ...(subdomain.trim() ? { subdomain: subdomain.trim().toLowerCase() } : {}),
          phpConfig: {
            memoryLimit: phpMemoryLimit,
            uploadMaxFilesize: phpUploadMaxFilesize,
            postMaxSize: phpPostMaxSize,
            maxExecutionTime: phpMaxExecutionTime,
            maxInputVars: phpMaxInputVars,
            displayErrors: phpDisplayErrors,
            ...(phpExtensions.length > 0 ? { extensions: phpExtensions.join(',') } : {}),
          },
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
          credentials: 'include',
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
          <button
            className="btn btn-primary btn-lg"
            onClick={async () => {
              try {
                const res = await fetch(`/api/sites/${result.id}/autologin`, {
                  method: 'POST',
                  credentials: 'include',
                });
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
                placeholder="admin@localhost.test"
              />
            </div>
            <div className="form-group">
              <label htmlFor="subdomain">Subdomain <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.8rem' }}>(optional)</span></label>
              <input
                id="subdomain"
                type="text"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-site (auto-generated if empty)"
              />
            </div>
          </div>
        </div>

        {/* PHP Configuration (collapsible) */}
        <div style={{ marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setShowPhpConfig(!showPhpConfig)}
            style={{
              background: 'none',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '0.5rem 1rem',
              width: '100%',
              textAlign: 'left',
              fontSize: '0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>PHP Configuration</span>
            <span style={{ fontSize: '0.7rem' }}>{showPhpConfig ? '\u25B2' : '\u25BC'}</span>
          </button>
          {showPhpConfig && (
            <div style={{ marginTop: '0.75rem', padding: '1rem', background: '#0f172a', borderRadius: '0.5rem', border: '1px solid #1e293b' }}>
              <div className="form-row">
                <div className="form-group">
                  <label>Memory Limit</label>
                  <select value={phpMemoryLimit} onChange={(e) => setPhpMemoryLimit(e.target.value)}>
                    <option value="128M">128 MB</option>
                    <option value="256M">256 MB</option>
                    <option value="512M">512 MB</option>
                    <option value="1G">1 GB</option>
                    <option value="2G">2 GB</option>
                    <option value="-1">Unlimited</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Upload Max Filesize</label>
                  <select value={phpUploadMaxFilesize} onChange={(e) => setPhpUploadMaxFilesize(e.target.value)}>
                    <option value="2M">2 MB</option>
                    <option value="16M">16 MB</option>
                    <option value="64M">64 MB</option>
                    <option value="128M">128 MB</option>
                    <option value="256M">256 MB</option>
                    <option value="512M">512 MB</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Post Max Size</label>
                  <select value={phpPostMaxSize} onChange={(e) => setPhpPostMaxSize(e.target.value)}>
                    <option value="8M">8 MB</option>
                    <option value="16M">16 MB</option>
                    <option value="64M">64 MB</option>
                    <option value="128M">128 MB</option>
                    <option value="256M">256 MB</option>
                    <option value="512M">512 MB</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Max Execution Time</label>
                  <select value={phpMaxExecutionTime} onChange={(e) => setPhpMaxExecutionTime(e.target.value)}>
                    <option value="30">30s</option>
                    <option value="60">60s</option>
                    <option value="120">120s</option>
                    <option value="300">300s</option>
                    <option value="600">600s</option>
                    <option value="0">Unlimited</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Max Input Vars</label>
                  <select value={phpMaxInputVars} onChange={(e) => setPhpMaxInputVars(e.target.value)}>
                    <option value="1000">1,000</option>
                    <option value="3000">3,000</option>
                    <option value="5000">5,000</option>
                    <option value="10000">10,000</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Display Errors</label>
                  <select value={phpDisplayErrors} onChange={(e) => setPhpDisplayErrors(e.target.value)}>
                    <option value="On">On</option>
                    <option value="Off">Off</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginTop: '0.5rem' }}>
                <label>PHP Extensions <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.75rem' }}>(click to toggle)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.35rem' }}>
                  {AVAILABLE_EXTENSIONS.map((ext) => {
                    const active = phpExtensions.includes(ext.value);
                    return (
                      <button
                        key={ext.value}
                        type="button"
                        onClick={() => setPhpExtensions(
                          active ? phpExtensions.filter((e) => e !== ext.value) : [...phpExtensions, ext.value]
                        )}
                        style={{
                          padding: '0.3rem 0.7rem',
                          borderRadius: '0.35rem',
                          border: active ? '1px solid #fb8500' : '1px solid #334155',
                          background: active ? 'rgba(251, 133, 0, 0.15)' : 'transparent',
                          color: active ? '#fb8500' : '#94a3b8',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          transition: 'all 0.15s',
                        }}
                      >
                        {ext.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <div className="alert-error" style={{ marginTop: '1rem' }}>{error}</div>}
        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%', marginTop: '1.5rem' }}
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
  );
}
