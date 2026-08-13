/**
 * Docker operations are delegated to the provisioner service over HTTP.
 * The API no longer has direct Docker socket access.
 */

import { Readable } from 'node:stream';

const PROVISIONER_URL = process.env.PROVISIONER_URL || 'http://provisioner:4000';
const INTERNAL_KEY = process.env.PROVISIONER_INTERNAL_KEY || '';

/** Parse JSON from a provisioner response, throwing a clear error if the body isn't valid JSON (e.g. HTML error page). */
async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.slice(0, 120).replace(/\n/g, ' ');
    throw new Error(`Provisioner returned non-JSON response (HTTP ${res.status}): ${preview}`);
  }
}

export async function provisionerFetch(path: string, options: RequestInit = {}): Promise<Response> {
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
  /** Lock down the WordPress admin (restrictions mu-plugin + DISALLOW_FILE_MODS). */
  restrictCapabilities?: boolean;
  /** Resolved WordPress capabilities to strip. Empty means strip none. */
  blockedCapabilities?: string[];
  /** Top-level admin menu slugs to remove. */
  hiddenMenus?: string[];
  /** Whether to define DISALLOW_FILE_MODS / DISALLOW_FILE_EDIT. */
  disableFileMods?: boolean;
  /** Apply CPU/memory limits and upload/disk quotas to the container. */
  enforceResourceLimits?: boolean;
  heartbeatSecret?: string;
  /** Browser-reachable API base URL, for the productivity mu-plugin's client JS. */
  publicApiUrl?: string;
  directFileAccess?: boolean;
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

  const data = await parseJson<{ containerId: string }>(res);
  return data.containerId;
}

export async function getPhpConfig(containerId: string): Promise<Record<string, any>> {
  const res = await provisionerFetch(`/containers/${containerId}/php-config`);
  return await parseJson<Record<string, any>>(res);
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

export async function enableBindMounts(containerId: string, subdomain: string): Promise<string> {
  const res = await provisionerFetch(`/containers/${containerId}/enable-bind-mounts`, {
    method: 'POST',
    body: JSON.stringify({ subdomain }),
  });
  const data = await parseJson<{ containerId: string }>(res);
  return data.containerId;
}

export async function removeSiteContainer(containerId: string): Promise<void> {
  await provisionerFetch(`/containers/${containerId}`, {
    method: 'DELETE',
  });
}

export async function getContainerStatus(containerId: string): Promise<string> {
  const res = await provisionerFetch(`/containers/${containerId}/status`);
  const data = await parseJson<{ status: string }>(res);
  return data.status;
}

export interface ManagedContainerInfo {
  Id: string;
  Labels?: Record<string, string>;
}

export async function listManagedContainers(): Promise<ManagedContainerInfo[]> {
  const res = await provisionerFetch('/containers');
  return await parseJson<ManagedContainerInfo[]>(res);
}

export async function pruneImages(): Promise<{ pruned: number; spaceReclaimed: number }> {
  const res = await provisionerFetch('/images/prune', { method: 'POST' });
  return await parseJson<{ pruned: number; spaceReclaimed: number }>(res);
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
  return await parseJson<{ snapshotId: string; sizeBytes: number; dbEngine: string }>(res);
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
  return await parseJson<{ results: { command: string; output: string; exitCode: number }[] }>(res);
}

export async function exportAssets(containerId: string, plugins: string[], themes: string[], targetDir: string): Promise<{ exported: { type: string; slug: string; path: string }[] }> {
  const res = await provisionerFetch(`/containers/${containerId}/export-assets`, {
    method: 'POST',
    body: JSON.stringify({ plugins, themes, targetDir }),
  });
  return await parseJson<{ exported: { type: string; slug: string; path: string }[] }>(res);
}

// Container Stats (Health Monitoring)

export async function getContainerStats(containerId: string): Promise<any> {
  const res = await provisionerFetch(`/containers/${containerId}/stats`);
  return await parseJson<any>(res);
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
  return await parseJson<{ protected: boolean; scope: string | null }>(res);
}

// Export Site as ZIP

export async function exportSiteZip(containerId: string): Promise<{ exportId: string; path: string; sizeBytes: number; dbEngine: string }> {
  const res = await provisionerFetch(`/containers/${containerId}/export-zip`, {
    method: 'POST',
  });
  return await parseJson<{ exportId: string; path: string; sizeBytes: number; dbEngine: string }>(res);
}

// Database Credentials (Adminer)

export async function getDbCredentials(containerId: string): Promise<{ dbEngine: string; host: string; user: string; password: string; database: string }> {
  const res = await provisionerFetch(`/containers/${containerId}/db-credentials`);
  return await parseJson<{ dbEngine: string; host: string; user: string; password: string; database: string }>(res);
}

export function getExportDownloadUrl(exportId: string): string {
  return `${PROVISIONER_URL}/exports/${exportId}/download`;
}

// ─── Monitoring ────────────────────────────────────────────────────────────

export interface MonitoringContainer {
  id: string;
  idFull: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: number;
  labels: Record<string, string>;
  cpuPercent: number | null;
  memUsage: number | null;
  memLimit: number | null;
}

export interface MonitoringSystem {
  docker: {
    version: string;
    containersRunning: number;
    containersPaused: number;
    containersStopped: number;
    containersTotal: number;
    images: number;
  };
  host: {
    cpuModel: string;
    cpuCores: number;
    cpuPhysicalCores: number;
    loadAvg: number[];
    memTotal: number;
    memUsed: number;
    memFree: number;
    memPercent: number;
    disk: { fs: string; mount: string; size: number; used: number; available: number; usePercent: number }[];
  };
}

export interface MonitoringDisk {
  images: {
    count: number;
    totalSize: number;
    items: { id: string; repoTags: string[]; size: number; created: number }[];
  };
  volumes: {
    count: number;
    items: { name: string; driver: string }[];
  };
}

export async function getMonitoringContainers(): Promise<MonitoringContainer[]> {
  const res = await provisionerFetch('/monitoring/containers');
  return await parseJson<MonitoringContainer[]>(res);
}

export async function getMonitoringSystem(): Promise<MonitoringSystem> {
  const res = await provisionerFetch('/monitoring/system');
  return await parseJson<MonitoringSystem>(res);
}

export async function getMonitoringDisk(): Promise<MonitoringDisk> {
  const res = await provisionerFetch('/monitoring/disk');
  return await parseJson<MonitoringDisk>(res);
}

export async function pruneVolumes(): Promise<{ pruned: number; spaceReclaimed: number }> {
  const res = await provisionerFetch('/system/prune-volumes', { method: 'POST' });
  return await parseJson<{ pruned: number; spaceReclaimed: number }>(res);
}

export async function pruneBuildCache(): Promise<{ spaceReclaimed: number }> {
  const res = await provisionerFetch('/system/prune-buildcache', { method: 'POST' });
  return await parseJson<{ spaceReclaimed: number }>(res);
}

export interface WplImage { tag: string; id: string; size: number; created: number; }

/**
 * Stream a tar build context to the provisioner and relay the build output.
 * `onLine` receives each decoded output line. Resolves on success; rejects on a
 * build error. Uses a dedicated fetch (not provisionerFetch) so the tar body
 * streams up as application/x-tar and the ndjson build log streams back down.
 */
export async function buildImageStream(
  tar: Readable,
  tag: string,
  buildargs: Record<string, string>,
  onLine: (line: string) => void,
): Promise<void> {
  const url = `${PROVISIONER_URL}/images/build-stream?tag=${encodeURIComponent(tag)}` +
    `&buildargs=${encodeURIComponent(JSON.stringify(buildargs))}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-tar',
      ...(INTERNAL_KEY ? { 'x-internal-key': INTERNAL_KEY } : {}),
    },
    body: Readable.toWeb(tar) as any,
    // Node fetch requires duplex for a streamed request body.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Build failed to start: ${msg}`);
  }
  // The provisioner relays docker's build output as newline-delimited JSON.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let buildError: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const raw = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw);
        if (obj.stream) onLine(String(obj.stream).replace(/\n$/, ''));
        else if (obj.error) buildError = obj.error;
      } catch {
        onLine(raw);
      }
    }
  }
  if (buildError) throw new Error(buildError);
}

export async function removeImage(tag: string): Promise<void> {
  await provisionerFetch('/images/remove', { method: 'POST', body: JSON.stringify({ tag }) });
}

export async function listWplImages(): Promise<WplImage[]> {
  const res = await provisionerFetch('/images');
  return await parseJson<WplImage[]>(res);
}
