import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp, Copy, Loader2 } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { apiFetch } from '../utils/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  { label: 'PHP 7.4 (legacy — WP 6.1)', value: '7.4' },
];

const MEMORY_LIMIT_OPTIONS = [
  { label: '128 MB', value: '128M' },
  { label: '256 MB', value: '256M' },
  { label: '512 MB', value: '512M' },
  { label: '1 GB', value: '1G' },
  { label: '2 GB', value: '2G' },
  { label: 'Unlimited', value: '-1' },
];

const UPLOAD_MAX_OPTIONS = [
  { label: '2 MB', value: '2M' },
  { label: '16 MB', value: '16M' },
  { label: '64 MB', value: '64M' },
  { label: '128 MB', value: '128M' },
  { label: '256 MB', value: '256M' },
  { label: '512 MB', value: '512M' },
  { label: '1 GB', value: '1G' },
  { label: '2 GB', value: '2G' },
  { label: 'Unlimited', value: '0' },
];

const POST_MAX_OPTIONS = [
  { label: '8 MB', value: '8M' },
  { label: '16 MB', value: '16M' },
  { label: '64 MB', value: '64M' },
  { label: '128 MB', value: '128M' },
  { label: '256 MB', value: '256M' },
  { label: '512 MB', value: '512M' },
  { label: '1 GB', value: '1G' },
  { label: '2 GB', value: '2G' },
  { label: 'Unlimited', value: '0' },
];

const EXEC_TIME_OPTIONS = [
  { label: '30s', value: '30' },
  { label: '60s', value: '60' },
  { label: '120s', value: '120' },
  { label: '300s', value: '300' },
  { label: '600s', value: '600' },
  { label: 'Unlimited', value: '0' },
];

const INPUT_VARS_OPTIONS = [
  { label: '1,000', value: '1000' },
  { label: '3,000', value: '3000' },
  { label: '5,000', value: '5000' },
  { label: '10,000', value: '10000' },
];

const DISPLAY_ERRORS_OPTIONS = [
  { label: 'On', value: 'On' },
  { label: 'Off', value: 'Off' },
];

export default function LocalLaunchPage() {
  const { loading: settingsLoading, sitesHostPath } = useSettings();
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

  const [directFileAccess, setDirectFileAccess] = useState(false);

  const [step, setStep] = useState<Step>('configure');
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<SiteResult | null>(null);
  const [error, setError] = useState('');
  const [provisionProgress, setProvisionProgress] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (settingsLoading) return;
    apiFetch('/api/blueprints')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTemplates(data);
          // A blueprint chosen on the public demo portal is parked in
          // localStorage until the visitor has an account; consume it here.
          const pending = localStorage.getItem('pendingProductLaunch');
          const templateParam = searchParams.get('template') || pending;
          const match = templateParam && data.find((t: Template) => t.id === templateParam);
          if (pending) localStorage.removeItem('pendingProductLaunch');
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
      const res = await apiFetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprintId: selectedTemplate,
          expiresIn: 'never',
          siteTitle,
          dbEngine,
          phpVersion,
          adminUser,
          adminPassword,
          adminEmail,
          directFileAccess,
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
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to create site (HTTP ${res.status})`);
      }
      const site = await res.json().catch(() => null);
      if (!site) throw new Error('Invalid response from server');
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
    const maxAttempts = 120;
    const expectedAttempts = 12;
    setProvisionProgress(0);
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pct = i < expectedAttempts
        ? Math.min(80, ((i + 1) / expectedAttempts) * 80)
        : 80 + Math.min(15, (i - expectedAttempts) * 2);
      setProvisionProgress(Math.round(pct));
      try {
        const res = await apiFetch(`/api/sites/${siteId}/ready`);
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

  function copyToClipboard(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
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
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
        <h3 className="mt-4 text-lg font-semibold text-card-foreground">Setting up your site...</h3>
        <p className="mt-1 text-sm text-muted-foreground">{stageText}</p>
        <Progress value={provisionProgress} className="mt-6" />
        <p className="mt-2 text-xs font-medium text-muted-foreground">{provisionProgress}%</p>
      </div>
    );
  }

  // Result step
  if (step === 'result' && result) {
    const rows: { key: string; label: string; value: string; link?: boolean }[] = [
      { key: 'url', label: 'Site URL', value: result.url, link: true },
      { key: 'adminUrl', label: 'Admin URL', value: result.adminUrl, link: true },
      { key: 'username', label: 'Username', value: result.credentials.username },
      { key: 'password', label: 'Password', value: result.credentials.password },
    ];

    return (
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-card-foreground">Your site is ready!</h3>

        <div className="mt-6 divide-y divide-border rounded-lg border border-border text-left">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-3 px-4 py-3">
              <span className="w-24 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {row.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-card-foreground">
                {row.link ? (
                  <a
                    href={row.value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {row.value}
                  </a>
                ) : (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {row.value}
                  </code>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Copy"
                onClick={() => copyToClipboard(row.key, row.value)}
              >
                {copiedKey === row.key ? <Check /> : <Copy />}
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button
            size="lg"
            onClick={async () => {
              try {
                const res = await apiFetch(`/api/sites/${result.id}/autologin`, {
                  method: 'POST',
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
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => { setResult(null); setStep('configure'); }}
          >
            Create Another
          </Button>
        </div>
      </div>
    );
  }

  // Configure step (main form)
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold text-card-foreground">Create a WordPress Site</h3>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="siteTitle">Site Title</Label>
              <Input
                id="siteTitle"
                type="text"
                value={siteTitle}
                onChange={(e) => setSiteTitle(e.target.value)}
                placeholder="My WordPress Site"
                className="rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template">Template</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger id="template" className="w-full rounded-lg">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dbEngine">Database</Label>
              <Select value={dbEngine} onValueChange={setDbEngine}>
                <SelectTrigger id="dbEngine" className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DB_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phpVersion">PHP Version</Label>
              <Select value={phpVersion} onValueChange={setPhpVersion}>
                <SelectTrigger id="phpVersion" className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminUser">Username</Label>
              <Input
                id="adminUser"
                type="text"
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                placeholder="admin"
                className="rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPassword">Password</Label>
              <Input
                id="adminPassword"
                type="text"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="admin"
                className="rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminEmail">Admin Email</Label>
              <Input
                id="adminEmail"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@localhost.test"
                className="rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subdomain">
                Subdomain <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="subdomain"
                type="text"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-site (auto-generated if empty)"
                className="rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Direct File Access toggle (only when SITES_HOST_PATH is configured) */}
        {sitesHostPath && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-border p-4">
            <Switch
              id="directFileAccess"
              checked={directFileAccess}
              onCheckedChange={setDirectFileAccess}
              className="mt-0.5"
            />
            <div className="grid gap-1">
              <Label htmlFor="directFileAccess">Direct File Access</Label>
              <span className="text-xs text-muted-foreground">
                Sync plugins &amp; themes to host for editing in VS Code
              </span>
            </div>
          </div>
        )}

        {/* PHP Configuration (collapsible) */}
        <div className="mt-6 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setShowPhpConfig(!showPhpConfig)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm font-medium text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <span>PHP Configuration</span>
            {showPhpConfig
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showPhpConfig && (
            <div className="space-y-4 border-t border-border p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="phpMemoryLimit">Memory Limit</Label>
                  <Select value={phpMemoryLimit} onValueChange={setPhpMemoryLimit}>
                    <SelectTrigger id="phpMemoryLimit" className="w-full rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEMORY_LIMIT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phpUploadMaxFilesize">Upload Max Filesize</Label>
                  <Select value={phpUploadMaxFilesize} onValueChange={setPhpUploadMaxFilesize}>
                    <SelectTrigger id="phpUploadMaxFilesize" className="w-full rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UPLOAD_MAX_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phpPostMaxSize">Post Max Size</Label>
                  <Select value={phpPostMaxSize} onValueChange={setPhpPostMaxSize}>
                    <SelectTrigger id="phpPostMaxSize" className="w-full rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POST_MAX_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="phpMaxExecutionTime">Max Execution Time</Label>
                  <Select value={phpMaxExecutionTime} onValueChange={setPhpMaxExecutionTime}>
                    <SelectTrigger id="phpMaxExecutionTime" className="w-full rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXEC_TIME_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phpMaxInputVars">Max Input Vars</Label>
                  <Select value={phpMaxInputVars} onValueChange={setPhpMaxInputVars}>
                    <SelectTrigger id="phpMaxInputVars" className="w-full rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INPUT_VARS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phpDisplayErrors">Display Errors</Label>
                  <Select value={phpDisplayErrors} onValueChange={setPhpDisplayErrors}>
                    <SelectTrigger id="phpDisplayErrors" className="w-full rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISPLAY_ERRORS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  PHP Extensions{' '}
                  <span className="font-normal text-muted-foreground">(click to toggle)</span>
                </Label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_EXTENSIONS.map((ext) => {
                    const active = phpExtensions.includes(ext.value);
                    return (
                      <Button
                        key={ext.value}
                        type="button"
                        size="sm"
                        variant={active ? 'default' : 'outline'}
                        className="rounded-lg"
                        onClick={() => setPhpExtensions(
                          active ? phpExtensions.filter((e) => e !== ext.value) : [...phpExtensions, ext.value]
                        )}
                      >
                        {ext.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          size="lg"
          className="mt-6 w-full rounded-lg"
          onClick={handleCreate}
          disabled={creating || !selectedTemplate}
        >
          {creating ? (
            <><Loader2 className="animate-spin" /> Creating...</>
          ) : (
            'Create Site'
          )}
        </Button>
      </div>
    </div>
  );
}
