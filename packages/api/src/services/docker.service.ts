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
  activatePlugins?: string;
  removePlugins?: string;
  activeTheme?: string;
  landingPage?: string;
  dbEngine?: 'sqlite' | 'mysql' | 'mariadb';
  autoLoginToken?: string;
}

export async function createSiteContainer(opts: CreateContainerOptions): Promise<string> {
  const res = await provisionerFetch('/containers', {
    method: 'POST',
    body: JSON.stringify(opts),
  });

  const data = await res.json() as { containerId: string };
  return data.containerId;
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
