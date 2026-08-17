export interface Site {
  id: string;
  subdomain: string;
  blueprintId: string;
  url: string;
  adminUrl: string;
  autoLoginUrl?: string;
  credentials?: { username: string; password: string };
  status: string;
  createdAt: string;
  expiresAt: string;
  hostPath?: string;
}

export interface PhpConfig {
  memoryLimit: string;
  uploadMaxFilesize: string;
  postMaxSize: string;
  maxExecutionTime: string;
  maxInputVars: string;
  displayErrors: string;
  extensions: string[];
}

export interface Snapshot {
  id: string;
  name: string;
  size_bytes: number | null;
  created_at: string;
  /** When this snapshot was last restored onto the site; null if never. */
  restored_at: string | null;
}

export interface DomainInfo {
  domain: string | null;
  status: string;
  dns?: { baseDomain?: string; serverIp?: string };
}

export interface TunnelInfo {
  active: boolean;
  method?: string;
  url?: string | null;
  status?: string;
}

export interface ActivityEntry {
  action: string;
  subdomain: string;
  product_id: string;
  created_at: string;
  site_url: string | null;
}

export type PanelKind = 'php' | 'snapshots' | 'domain' | 'health' | 'share' | 'tunnel';

export type TunnelMethod = 'lan' | 'cloudflare' | 'ngrok';

export type PasswordScope = 'frontend' | 'admin' | 'all';

export type ShareRole = 'viewer' | 'admin';

export const DEFAULT_PHP_CONFIG: PhpConfig = {
  memoryLimit: '256M',
  uploadMaxFilesize: '64M',
  postMaxSize: '64M',
  maxExecutionTime: '300',
  maxInputVars: '3000',
  displayErrors: 'On',
  extensions: [],
};

export const AVAILABLE_EXTENSIONS = [
  { value: 'redis', label: 'Redis' },
  { value: 'xdebug', label: 'Xdebug' },
  { value: 'sockets', label: 'Sockets' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'pcntl', label: 'PCNTL' },
  { value: 'ldap', label: 'LDAP' },
  { value: 'gettext', label: 'Gettext' },
];

export const EXTEND_OPTIONS = [
  { label: '30 minutes', value: '30m' },
  { label: '1 hour', value: '1h' },
  { label: '2 hours', value: '2h' },
  { label: '6 hours', value: '6h' },
  { label: '1 day', value: '1d' },
];

export const PASSWORD_SCOPES: { value: PasswordScope; label: string; desc: string }[] = [
  { value: 'frontend', label: 'Frontend Only', desc: 'Visitors need password, admin stays open' },
  { value: 'admin', label: 'Admin Only', desc: 'wp-admin needs password, site stays open' },
  { value: 'all', label: 'Entire Site', desc: 'Password required everywhere' },
];

/** Dynamic status colours expressed as token-friendly utility classes. */
export function statusDotClass(status: string): string {
  switch (status) {
    case 'running':
      return 'bg-emerald-500';
    case 'creating':
      return 'bg-amber-500';
    case 'error':
      return 'bg-destructive';
    case 'expired':
      return 'bg-muted-foreground';
    default:
      return 'bg-muted-foreground';
  }
}

/** Threshold colouring for resource meters. */
export function meterTextClass(percent: number): string {
  return percent > 80 ? 'text-destructive' : 'text-emerald-600';
}

export function meterBarClass(percent: number): string {
  return percent > 80 ? 'bg-destructive' : 'bg-emerald-500';
}

export function activityDotClass(action: string): string {
  switch (action) {
    case 'created':
      return 'bg-emerald-500';
    case 'deleted':
      return 'bg-destructive';
    case 'extended':
      return 'bg-blue-500';
    default:
      return 'bg-amber-500';
  }
}

export function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
