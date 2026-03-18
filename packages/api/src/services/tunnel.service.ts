import { provisionerFetch } from './docker.service';

export interface TunnelStatus {
  active: boolean;
  method?: string;
  url?: string | null;
  containerId?: string;
  status?: string;
}

export async function createTunnel(
  subdomain: string,
  method: 'lan' | 'cloudflare' | 'ngrok',
  ngrokAuthToken?: string,
): Promise<{ containerId: string; method: string }> {
  const res = await provisionerFetch('/shares', {
    method: 'POST',
    body: JSON.stringify({ subdomain, method, ngrokAuthToken }),
  });
  return (await res.json()) as { containerId: string; method: string };
}

export async function getTunnelStatus(subdomain: string): Promise<TunnelStatus> {
  const res = await provisionerFetch(`/shares/${subdomain}`);
  return (await res.json()) as TunnelStatus;
}

export async function removeTunnel(subdomain: string): Promise<void> {
  await provisionerFetch(`/shares/${subdomain}`, { method: 'DELETE' });
}
