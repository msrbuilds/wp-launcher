/**
 * Docker operations are delegated to the provisioner service over HTTP.
 * The API no longer has direct Docker socket access.
 */

const PROVISIONER_URL = process.env.PROVISIONER_URL || 'http://provisioner:4000';
const INTERNAL_KEY = process.env.PROVISIONER_INTERNAL_KEY || '';

async function provisionerFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(INTERNAL_KEY ? { 'x-internal-key': INTERNAL_KEY } : {}),
  };

  const res = await fetch(`${PROVISIONER_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => ({ error: 'Unknown provisioner error' }));
    throw new Error((body as any).error || `Provisioner error: ${res.status}`);
  }

  return res;
}

export interface CreateContainerOptions {
  subdomain: string;
  image: string;
  expiresAt: string;
  siteUrl: string;
  adminUser: string;
  adminPassword: string;
  adminEmail: string;
  siteTitle: string;
  installActivatePlugins?: string;
  installPlugins?: string;
  activatePlugins?: string;
  removePlugins?: string;
  installThemes?: string;
  activeTheme?: string;
  landingPage?: string;
  dbEngine?: 'sqlite' | 'mysql' | 'mariadb';
  autoLoginToken?: string;
  localMode?: boolean;
  phpConfig?: {
    memoryLimit?: string;
    uploadMaxFilesize?: string;
    postMaxSize?: string;
    maxExecutionTime?: string;
    maxInputVars?: string;
    displayErrors?: string;
    extensions?: string;
  };
}

export async function createSiteContainer(opts: CreateContainerOptions): Promise<string> {
  const res = await provisionerFetch('/containers', {
    method: 'POST',
    body: JSON.stringify(opts),
  });

  const data = await res.json() as { containerId: string };
  return data.containerId;
}

export async function getPhpConfig(containerId: string): Promise<Record<string, any>> {
  const res = await provisionerFetch(`/containers/${containerId}/php-config`);
  return await res.json() as Record<string, any>;
}

export async function updatePhpConfig(containerId: string, phpConfig: Record<string, any>): Promise<void> {
  await provisionerFetch(`/containers/${containerId}/php-config`, {
    method: 'PATCH',
    body: JSON.stringify(phpConfig),
  });
}

export async function updateAutoLoginToken(containerId: string, token: string): Promise<void> {
  await provisionerFetch(`/containers/${containerId}/autologin-token`, {
    method: 'PATCH',
    body: JSON.stringify({ token }),
  });
}

export async function removeSiteContainer(containerId: string): Promise<void> {
  await provisionerFetch(`/containers/${containerId}`, {
    method: 'DELETE',
  });
}

export async function getContainerStatus(containerId: string): Promise<string> {
  const res = await provisionerFetch(`/containers/${containerId}/status`);
  const data = await res.json() as { status: string };
  return data.status;
}

export interface ManagedContainerInfo {
  Id: string;
  Labels?: Record<string, string>;
}

export async function listManagedContainers(): Promise<ManagedContainerInfo[]> {
  const res = await provisionerFetch('/containers');
  return await res.json() as ManagedContainerInfo[];
}

export async function buildImage(contextPath: string, tag: string): Promise<void> {
  await provisionerFetch('/images/build', {
    method: 'POST',
    body: JSON.stringify({ contextPath, tag }),
  });
}

// Snapshot & Restore

export async function createSnapshot(containerId: string, snapshotId: string): Promise<{ snapshotId: string; sizeBytes: number; dbEngine: string }> {
  const res = await provisionerFetch(`/containers/${containerId}/snapshot`, {
    method: 'POST',
    body: JSON.stringify({ snapshotId }),
  });
  return await res.json() as { snapshotId: string; sizeBytes: number; dbEngine: string };
}

export async function restoreSnapshot(containerId: string, snapshotId: string, newSiteUrl?: string): Promise<void> {
  await provisionerFetch(`/containers/${containerId}/restore`, {
    method: 'POST',
    body: JSON.stringify({ snapshotId, newSiteUrl }),
  });
}

// WP-CLI execution (for template export)

export async function execWpCommands(containerId: string, commands: string[]): Promise<{ results: { command: string; output: string; exitCode: number }[] }> {
  const res = await provisionerFetch(`/containers/${containerId}/exec-wp`, {
    method: 'POST',
    body: JSON.stringify({ commands }),
  });
  return await res.json() as { results: { command: string; output: string; exitCode: number }[] };
}

export async function exportAssets(containerId: string, plugins: string[], themes: string[], targetDir: string): Promise<{ exported: { type: string; slug: string; path: string }[] }> {
  const res = await provisionerFetch(`/containers/${containerId}/export-assets`, {
    method: 'POST',
    body: JSON.stringify({ plugins, themes, targetDir }),
  });
  return await res.json() as { exported: { type: string; slug: string; path: string }[] };
}

// Container Stats (Health Monitoring)

export async function getContainerStats(containerId: string): Promise<any> {
  const res = await provisionerFetch(`/containers/${containerId}/stats`);
  return await res.json();
}

// Site Password Protection

export async function setSitePassword(containerId: string, password: string | null, scope?: string): Promise<void> {
  await provisionerFetch(`/containers/${containerId}/site-password`, {
    method: 'PATCH',
    body: JSON.stringify({ password: password || '', scope: scope || 'frontend' }),
  });
}

export async function getSitePasswordStatus(containerId: string): Promise<{ protected: boolean; scope: string | null }> {
  const res = await provisionerFetch(`/containers/${containerId}/site-password`);
  return await res.json() as { protected: boolean; scope: string | null };
}

// Export Site as ZIP

export async function exportSiteZip(containerId: string): Promise<{ exportId: string; path: string; sizeBytes: number; dbEngine: string }> {
  const res = await provisionerFetch(`/containers/${containerId}/export-zip`, {
    method: 'POST',
  });
  return await res.json() as { exportId: string; path: string; sizeBytes: number; dbEngine: string };
}

// Database Credentials (Adminer)

export async function getDbCredentials(containerId: string): Promise<{ dbEngine: string; host: string; user: string; password: string; database: string }> {
  const res = await provisionerFetch(`/containers/${containerId}/db-credentials`);
  return await res.json() as { dbEngine: string; host: string; user: string; password: string; database: string };
}

export function getExportDownloadUrl(exportId: string): string {
  return `${PROVISIONER_URL}/exports/${exportId}/download`;
}
