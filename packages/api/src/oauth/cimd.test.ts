import { describe, expect, it, vi } from 'vitest';
import { fetchClientMetadata, type CimdDeps } from './cimd';

const URL_ = 'https://client.example/oauth/client.json';
const goodDoc = { client_id: URL_, client_name: 'Example', redirect_uris: ['https://client.example/cb'] };

function deps(overrides: Partial<{ addresses: string[]; status: number; headers: Record<string, string>; body: string }> = {}): CimdDeps & { request: ReturnType<typeof vi.fn> } {
  const request = vi.fn().mockResolvedValue({
    status: overrides.status ?? 200,
    headers: overrides.headers ?? { 'content-type': 'application/json' },
    body: overrides.body ?? JSON.stringify(goodDoc),
  });
  return { resolve: vi.fn().mockResolvedValue(overrides.addresses ?? ['93.184.216.34']), request };
}

describe('fetchClientMetadata refuses', () => {
  it('a non-https URL', async () => {
    await expect(fetchClientMetadata('http://client.example/x.json', deps())).rejects.toThrow(/https/i);
  });
  it('a non-443 port', async () => {
    await expect(fetchClientMetadata('https://client.example:8443/x.json', deps())).rejects.toThrow(/port/i);
  });
  it('a root path', async () => {
    await expect(fetchClientMetadata('https://client.example/', deps())).rejects.toThrow(/path/i);
  });
  it.each(['127.0.0.1', '10.1.2.3', '169.254.169.254', '100.64.0.1', 'fd00::1'])('a host resolving to %s', async (ip) => {
    await expect(fetchClientMetadata(URL_, deps({ addresses: ['93.184.216.34', ip] }))).rejects.toThrow(/private|reserved/i);
  });
  it('a host that does not resolve', async () => {
    await expect(fetchClientMetadata(URL_, deps({ addresses: [] }))).rejects.toThrow(/resolve/i);
  });
  it('a redirect', async () => {
    await expect(fetchClientMetadata(URL_, deps({ status: 302 }))).rejects.toThrow(/redirect/i);
  });
  it('an error status', async () => {
    await expect(fetchClientMetadata(URL_, deps({ status: 404 }))).rejects.toThrow(/status/i);
  });
  it('an oversize body', async () => {
    await expect(fetchClientMetadata(URL_, deps({ body: 'x'.repeat(70_000) }))).rejects.toThrow(/large/i);
  });
  it('a non-JSON content type', async () => {
    await expect(fetchClientMetadata(URL_, deps({ headers: { 'content-type': 'text/html' } }))).rejects.toThrow(/json/i);
  });
  it('malformed JSON', async () => {
    await expect(fetchClientMetadata(URL_, deps({ body: '{nope' }))).rejects.toThrow(/json/i);
  });
  it('a client_id that is not the URL', async () => {
    await expect(fetchClientMetadata(URL_, deps({ body: JSON.stringify({ ...goodDoc, client_id: 'https://other.example/x.json' }) }))).rejects.toThrow(/client_id/i);
  });
  it('unacceptable redirect URIs', async () => {
    await expect(fetchClientMetadata(URL_, deps({ body: JSON.stringify({ ...goodDoc, redirect_uris: ['http://evil/cb'] }) }))).rejects.toThrow(/redirect/i);
  });
});

describe('fetchClientMetadata accepts', () => {
  it('a well-formed document, connecting to the address it validated', async () => {
    const d = deps();
    const client = await fetchClientMetadata(URL_, d);
    expect(client).toMatchObject({ client_id: URL_, kind: 'cimd', client_name: 'Example', redirect_uris: ['https://client.example/cb'] });
    expect(d.request).toHaveBeenCalledWith(new URL(URL_), '93.184.216.34', { timeoutMs: 5000, maxBytes: 65_536 });
  });

  it('clamps max-age into [300, 86400] and defaults to 3600', async () => {
    const at = async (cc?: string) => (await fetchClientMetadata(URL_, deps({ headers: { 'content-type': 'application/json', ...(cc ? { 'cache-control': cc } : {}) } }))).cacheSeconds;
    expect(await at('max-age=60')).toBe(300);
    expect(await at('public, max-age=999999')).toBe(86_400);
    expect(await at('max-age=7200')).toBe(7200);
    expect(await at()).toBe(3600);
  });
});
